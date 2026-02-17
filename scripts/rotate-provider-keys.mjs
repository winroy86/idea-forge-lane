#!/usr/bin/env node
import process from 'node:process';
import { webcrypto } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const cryptoApi = webcrypto;

function decodeBase64(input) {
  return Uint8Array.from(Buffer.from(input, 'base64'));
}

function encodeBase64(input) {
  return Buffer.from(input).toString('base64');
}

function normalizeKeyMaterial(value) {
  const fromB64 = (() => {
    try {
      return decodeBase64(value);
    } catch {
      return null;
    }
  })();

  if (fromB64 && fromB64.length === 32) return fromB64;

  const fromText = new TextEncoder().encode(value);
  if (fromText.length === 32) return fromText;

  throw new Error('Invalid key entry: values in ENCRYPTION_KEYS_JSON must be 32 bytes (raw or base64).');
}

async function importAesKey(raw) {
  return cryptoApi.subtle.importKey('raw', normalizeKeyMaterial(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function loadConfig() {
  const currentKeyVersion = process.env.CURRENT_KEY_VERSION;
  const keysJson = process.env.ENCRYPTION_KEYS_JSON;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!currentKeyVersion) throw new Error('CURRENT_KEY_VERSION is required.');
  if (!keysJson) throw new Error('ENCRYPTION_KEYS_JSON is required.');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

  const keys = JSON.parse(keysJson);
  if (!keys[currentKeyVersion]) {
    throw new Error(`CURRENT_KEY_VERSION (${currentKeyVersion}) is missing from ENCRYPTION_KEYS_JSON.`);
  }

  return { currentKeyVersion, keys, supabaseUrl, serviceRoleKey };
}

async function encrypt(plaintext, keyVersion, keys) {
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keys[keyVersion]);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);

  return {
    api_key_encrypted: encodeBase64(ciphertext),
    api_key_iv: encodeBase64(iv),
    api_key_tag: encodeBase64(tag),
    key_version: keyVersion,
    encryption_algorithm: 'AES-256-GCM',
    encrypted_at: new Date().toISOString(),
  };
}

async function decrypt(row, keys) {
  const keyVersion = row.key_version;
  const rawKey = keys[keyVersion];
  if (!rawKey) {
    throw new Error(
      `Cannot rotate provider row ${row.id}: key version "${keyVersion}" is not available in ENCRYPTION_KEYS_JSON. Restore the old key, then retry rotation.`,
    );
  }

  const key = await importAesKey(rawKey);
  const iv = decodeBase64(row.api_key_iv);
  const ciphertext = decodeBase64(row.api_key_encrypted);
  const tag = decodeBase64(row.api_key_tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  try {
    const plaintext = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(
      `Cannot rotate provider row ${row.id}: decryption failed with key version "${keyVersion}". Check stored metadata and key correctness.`,
    );
  }
}

async function main() {
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from('providers')
    .select('id, api_key_encrypted, api_key_iv, api_key_tag, key_version')
    .not('api_key_encrypted', 'is', null);

  if (error) throw new Error(`Failed to load providers for rotation: ${error.message}`);

  let rotated = 0;
  for (const row of rows) {
    if (row.key_version === config.currentKeyVersion) continue;

    const plaintext = await decrypt(row, config.keys);
    const next = await encrypt(plaintext, config.currentKeyVersion, config.keys);

    const { error: updateError } = await supabase.from('providers').update(next).eq('id', row.id);
    if (updateError) throw new Error(`Failed to update provider row ${row.id}: ${updateError.message}`);

    rotated += 1;
  }

  console.log(`Rotation complete. Updated ${rotated} provider row(s) to key version ${config.currentKeyVersion}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
