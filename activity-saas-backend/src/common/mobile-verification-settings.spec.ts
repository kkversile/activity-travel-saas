import { defaultVendorVerificationSettings, normalizeVendorVerificationSettings } from './mobile-verification-settings';

describe('vendor verification settings', () => {
  it('defaults email verification on and mobile verification off', () => {
    expect(defaultVendorVerificationSettings).toEqual({ emailVerificationEnabled: true, mobileVerificationEnabled: false });
    expect(normalizeVendorVerificationSettings(null)).toEqual(defaultVendorVerificationSettings);
  });

  it('preserves the email default when an older setting only contains mobile verification', () => {
    expect(normalizeVendorVerificationSettings({ mobileVerificationEnabled: true })).toEqual({ emailVerificationEnabled: true, mobileVerificationEnabled: true });
  });

  it('allows the platform administrator to explicitly disable either check', () => {
    expect(normalizeVendorVerificationSettings({ emailVerificationEnabled: false, mobileVerificationEnabled: false })).toEqual({ emailVerificationEnabled: false, mobileVerificationEnabled: false });
  });
});
