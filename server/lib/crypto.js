import crypto from 'node:crypto';

function getProviderKey() {
  const keySource = process.env.PROVIDER_KEY_SECRET || '';
  if (!keySource) {
    throw new Error('Missing PROVIDER_KEY_SECRET for provider key decryption.');
  }
  return crypto.createHash('sha256').update(keySource).digest();
}

export function encryptText(plaintext) {
  if (!plaintext) return '';

  const key = getProviderKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptText(ciphertext) {
  if (!ciphertext) return '';

  const key = getProviderKey();
  const [ivHex, encrypted] = ciphertext.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted text format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
