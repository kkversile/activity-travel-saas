import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function key() {
  const configured = process.env.ONBOARDING_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !process.env.ONBOARDING_ENCRYPTION_KEY) {
    throw new Error('ONBOARDING_ENCRYPTION_KEY must be configured in production');
  }
  return createHash('sha256').update(configured || 'voya-local-onboarding-key').digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function maskAccountNumber(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  return `•••• ${normalized.slice(-4)}`;
}

export function hashOtp(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function decryptSecret(value: string): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, 'base64url')), decipher.final()]).toString('utf8');
}
