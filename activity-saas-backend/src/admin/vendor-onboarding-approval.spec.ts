import { assertVendorOnboardingDocumentsApproved } from './vendor-onboarding-approval';

const documents = (status = 'VERIFIED') => ['PAN', 'BANK_PROOF'].map((type) => ({ type, currentStatus: status, versions: [{ versionNumber: 1, status }] }));
describe('Onboarding approval remains an authorization gate', () => {
  function client(status: string, docs = documents()) {
    return { vendorOnboardingApplication: { findUnique: jest.fn().mockResolvedValue({ status, gstStatus: 'NOT_REGISTERED', supplementalData: {}, tenant: { vendorDocuments: docs } }) } } as any;
  }
  it('still rejects an already-approved application when used as an approval gate', async () => {
    await expect(assertVendorOnboardingDocumentsApproved(client('APPROVED'), 'tenant')).rejects.toThrow('resubmit');
  });
  it('still rejects pending documents on a submitted application', async () => {
    await expect(assertVendorOnboardingDocumentsApproved(client('SUBMITTED', documents('PENDING')), 'tenant')).rejects.toThrow('pending');
  });
  it('accepts verified required documents only after submission', async () => {
    await expect(assertVendorOnboardingDocumentsApproved(client('SUBMITTED'), 'tenant')).resolves.toBeUndefined();
  });
});
