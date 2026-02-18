const PROVIDER_CIPHER = 'AES-256-GCM';

export type ProviderKeyring = {
  currentKeyVersion: string;
  keys: Record<string, string>;
};

export type ProviderSecretEnvelope = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
  algorithm: string;
};

function decodeBase64(input: string): Uint8Array {
  const raw = atob(input);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function encodeBase64(input: Uint8Array): string {
  let binary = '';
  input.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function normalizeKeyMaterial(value: string): Uint8Array {
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

  throw new Error(
    'Invalid encryption key material. Each entry in ENCRYPTION_KEYS_JSON must be a 32-byte value (raw text or base64).',
  );
}

async function importAesKey(raw: string): Promise<CryptoKey> {
  const keyMaterial = normalizeKeyMaterial(raw);
  return crypto.subtle.importKey('raw', keyMaterial.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function loadProviderKeyringFromEnv(env: Record<string, string | undefined> = Deno.env.toObject()): ProviderKeyring {
  const currentKeyVersion = env.CURRENT_KEY_VERSION;
  if (!currentKeyVersion) {
    throw new Error('CURRENT_KEY_VERSION is required. Set it to the active provider encryption key version, e.g. "2026-01".');
  }

  const rawJson = env.ENCRYPTION_KEYS_JSON;
  if (!rawJson) {
    throw new Error('ENCRYPTION_KEYS_JSON is required. Provide a JSON object mapping key versions to 32-byte keys.');
  }

  let keys: Record<string, string>;
  try {
    keys = JSON.parse(rawJson) as Record<string, string>;
  } catch {
    throw new Error('ENCRYPTION_KEYS_JSON must be valid JSON (example: {"2026-01":"<base64-key>"}).');
  }

  if (!keys[currentKeyVersion]) {
    throw new Error(
      `CURRENT_KEY_VERSION (${currentKeyVersion}) is not present in ENCRYPTION_KEYS_JSON. Add the key before deploying.`,
    );
  }

  return { currentKeyVersion, keys };
}

export async function encryptProviderSecret(plaintext: string, keyring: ProviderKeyring): Promise<ProviderSecretEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyring.keys[keyring.currentKeyVersion]);
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);

  return {
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    tag: encodeBase64(tag),
    keyVersion: keyring.currentKeyVersion,
    algorithm: PROVIDER_CIPHER,
  };
}

export async function decryptProviderSecret(
  envelope: ProviderSecretEnvelope,
  keyring: ProviderKeyring,
): Promise<string> {
  const rawKey = keyring.keys[envelope.keyVersion];
  if (!rawKey) {
    throw new Error(
      `Provider key version "${envelope.keyVersion}" is unavailable. Restore it in ENCRYPTION_KEYS_JSON to decrypt existing provider rows, then re-run key rotation.`,
    );
  }

  const key = await importAesKey(rawKey);
  const iv = decodeBase64(envelope.iv);
  const ciphertext = decodeBase64(envelope.ciphertext);
  const tag = decodeBase64(envelope.tag);

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, combined.buffer as ArrayBuffer);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(
      `Failed to decrypt provider secret with key version "${envelope.keyVersion}". Verify ENCRYPTION_KEYS_JSON contains the exact historical key and that provider metadata was not corrupted.`,
    );
  }
}
