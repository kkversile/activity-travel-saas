export const VENDOR_VERIFICATION_SETTINGS_KEY = 'admin.vendor-verification';

export type VendorVerificationSettings = {
  emailVerificationEnabled: boolean;
  mobileVerificationEnabled: boolean;
};

export const defaultVendorVerificationSettings: VendorVerificationSettings = {
  emailVerificationEnabled: true,
  mobileVerificationEnabled: false,
};

export function normalizeVendorVerificationSettings(value: unknown): VendorVerificationSettings {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    emailVerificationEnabled: candidate.emailVerificationEnabled !== false,
    mobileVerificationEnabled: candidate.mobileVerificationEnabled === true,
  };
}
