import {
  decryptProviderSecret,
  encryptProviderSecret,
  loadProviderKeyringFromEnv,
  type ProviderSecretEnvelope,
} from './provider-secrets.ts';

export type ProviderRow = {
  id: string;
  api_key_encrypted: string;
  api_key_iv: string;
  api_key_tag: string;
  key_version: string;
  encryption_algorithm: string;
};

export async function buildEncryptedProviderPatch(apiKey: string) {
  const keyring = loadProviderKeyringFromEnv();
  const envelope = await encryptProviderSecret(apiKey, keyring);

  return {
    api_key_encrypted: envelope.ciphertext,
    api_key_iv: envelope.iv,
    api_key_tag: envelope.tag,
    key_version: envelope.keyVersion,
    encryption_algorithm: envelope.algorithm,
    encrypted_at: new Date().toISOString(),
  };
}

export async function decryptProviderApiKey(row: ProviderRow): Promise<string> {
  const keyring = loadProviderKeyringFromEnv();
  const envelope: ProviderSecretEnvelope = {
    ciphertext: row.api_key_encrypted,
    iv: row.api_key_iv,
    tag: row.api_key_tag,
    keyVersion: row.key_version,
    algorithm: row.encryption_algorithm,
  };

  return decryptProviderSecret(envelope, keyring);
}
