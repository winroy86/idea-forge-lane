import crypto from 'node:crypto';

export function decryptText(ciphertext) {
  if (!ciphertext) return '';

  const keySource = process.env.PROVIDER_KEY_SECRET || '';
  if (!keySource) {
    throw new Error('Missing PROVIDER_KEY_SECRET for provider key decryption.');
  }

  const key = crypto.createHash('sha256').update(keySource).digest();
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
