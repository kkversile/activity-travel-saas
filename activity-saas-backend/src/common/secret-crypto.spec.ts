import { decryptSecret, encryptSecret, hashOtp, maskAccountNumber } from './secret-crypto';

describe('onboarding secret helpers', () => {
  it('encrypts and decrypts bank values without returning the plaintext ciphertext', () => {
    const plaintext = '123456789012';
    const ciphertext = encryptSecret(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it('masks account numbers and hashes OTPs deterministically', () => {
    expect(maskAccountNumber('1234 5678 9012')).toBe('•••• 9012');
    expect(hashOtp('123456')).toBe(hashOtp('123456'));
    expect(hashOtp('123456')).not.toBe(hashOtp('654321'));
  });
});
