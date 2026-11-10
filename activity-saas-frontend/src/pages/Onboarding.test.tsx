import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import Onboarding from './Onboarding';

const draft = {
  id: 'application-1',
  tenantId: 'tenant-1',
  status: 'DRAFT',
  currentStep: 1,
  startedAt: null,
  phoneVerifiedAt: null,
  firstName: '',
  lastName: '',
  contactNumber: '',
  businessDisplayName: '',
  legalBusinessName: '',
  panNumber: '',
  gstStatus: null,
  gstin: '',
  gstDeclarationAccepted: false,
  addressLine: '',
  city: '',
  state: '',
  pinCode: '',
  latitude: null,
  longitude: null,
  accountHolderName: '',
  bankName: '',
  bankAccountMasked: null,
  ifscCode: '',
  accountType: '',
  bankOwnershipConfirmed: false,
  agreementAcceptedAt: null,
  authorizedBusinessName: '',
  authorizedRepresentative: '',
  hasSignature: false,
  agreementVersion: null,
  submittedAt: null,
  reviewedAt: null,
  reviewReason: null,
  documents: [],
  updatedAt: new Date().toISOString(),
};

afterEach(() => vi.restoreAllMocks());

describe('Vendor onboarding', () => {
  it('does not show the temporary vendor placeholder as business data', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), currentStep: 1, businessDisplayName: 'Vendor pending onboarding', legalBusinessName: 'Vendor pending onboarding' } as never);

    render(<Onboarding />);

    expect(await screen.findByText('Brand / trade name')).toBeInTheDocument();
    expect(screen.getByText('Business profile & verification')).toBeInTheDocument();
    expect(screen.getByText(/Signed up/)).toBeInTheDocument();
    expect(screen.getByText('Approved · selling')).toBeInTheDocument();
    expect(screen.getByText('Sections complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'North Goa' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Add operating city' }), { target: { value: 'Panaji' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add city' }));
    expect(screen.getByRole('button', { name: 'Panaji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day tours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Own website' })).toBeInTheDocument();
    expect(screen.queryByText('Search location')).not.toBeInTheDocument();
    expect(screen.queryByText('First name *')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Vendor pending onboarding')).not.toBeInTheDocument();
  });

  it('loads the welcome state and starts a saved application', async () => {
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(draft as never)
      .mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString() } as never);

    render(<Onboarding />);

    expect(await screen.findByText('Build your partner profile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start onboarding/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText('Your draft is saved automatically as you move through the application.')).toBeInTheDocument();
  });

  it('allows prototype-style step navigation and selects the agreement for each supplier type', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), supplementalData: { supplierType: 'Direct operator' } } as never);
    render(<Onboarding />);

    expect(await screen.findByText('Brand / trade name')).toBeInTheDocument();
    const commercialStep = screen.getByRole('button', { name: /6\s*Commercial terms/ });
    expect(commercialStep).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Government body/ }));
    fireEvent.click(commercialStep);
    expect(screen.getByText('Activity Vendor Agreement (Govt annexure)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Business profile/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aggregator \/ DMC/ }));
    fireEvent.click(commercialStep);
    expect(screen.getByText('Booking Facilitation Agreement')).toBeInTheDocument();
  });

  it('keeps the entered names after OTP verification reloads the application', async () => {
    const started = { ...draft, mobileVerificationEnabled: true, startedAt: new Date().toISOString(), currentStep: 2, supplementalData: { contacts: [{ role: 'Primary operations', name: '', designation: '', mobile: '', email: '', hours: '07:00–21:00' }, { role: 'Emergency contact', name: '', designation: '', mobile: '', email: '', hours: '24 × 7' }] } };
    const verified = { ...started, contactNumber: '+919876543210', phoneVerifiedAt: new Date().toISOString(), supplementalData: { ...started.supplementalData, contacts: [{ ...started.supplementalData.contacts[0], name: 'Kiran Kumar', mobile: '9876543210' }, ...started.supplementalData.contacts.slice(1)] } };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ demoOtp: '123456' } as never)
      .mockResolvedValueOnce({ verified: true } as never)
      .mockResolvedValueOnce(verified as never);

    render(<Onboarding />);

    const primaryName = await screen.findByLabelText('Owner / authorised signatory name');
    fireEvent.change(primaryName, { target: { value: 'Kiran Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('9876543210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    const otp = await screen.findByLabelText('Six digit OTP');
    fireEvent.change(otp, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByText('Contact number verified.')).toBeInTheDocument());
    expect(primaryName).toHaveValue('Kiran Kumar');
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/verify', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps KYC values after a PAN upload reloads the application', async () => {
    const started = { ...draft, startedAt: new Date().toISOString(), currentStep: 3 };
    const uploaded = { ...started, panNumber: '', documents: [{ type: 'PAN', currentStatus: 'PENDING', latestVersion: { status: 'PENDING', fileAsset: { originalName: 'sample.pdf' } } }] };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ uploaded: true } as never)
      .mockResolvedValueOnce(uploaded as never);

    render(<Onboarding />);

    const panNumber = await screen.findByLabelText('PAN number *');
    fireEvent.change(panNumber, { target: { value: 'ABCDE1234F' } });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] } });

    await waitFor(() => expect(screen.getByText('PAN uploaded and pending review.')).toBeInTheDocument());
    expect(panNumber).toHaveValue('ABCDE1234F');
    expect(request).toHaveBeenCalledWith('/vendor/documents/pan', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
  });

  it('renders the prototype licence rows and persists licence metadata through onboarding save', async () => {
    const started = {
      ...draft,
      startedAt: new Date().toISOString(),
      currentStep: 4,
      state: 'Kerala',
      supplementalData: {
        licences: [
          {
            key: 'tourismRegistration',
            label: 'Tourism trade registration',
            neededFor: 'All tours in selected destinations',
            validTill: '',
            documentType: 'TOURISM_REGISTRATION',
            uploadKey: 'tourismRegistration',
          },
        ],
      },
    };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ ...started, supplementalData: { ...started.supplementalData, licences: [{ ...started.supplementalData.licences[0], neededFor: 'All Goa tours' }] } } as never);

    render(<Onboarding />);

    const neededFor = await screen.findByLabelText('Kerala Tourism trade registration needed for');
    expect(screen.getByText('Tourist vehicle permits')).toBeInTheDocument();
    expect(screen.getByText('Public liability insurance')).toBeInTheDocument();
    expect(screen.getByText('Boat licence / Captain of Ports registration')).toBeInTheDocument();
    fireEvent.change(neededFor, { target: { value: 'All Goa tours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding', expect.objectContaining({ method: 'PATCH' })));
    expect((request.mock.calls[1][1] as { body: string }).body).toContain('All Goa tours');
  });

  it('matches the prototype Bank & tax fields and persists the IFSC-derived bank name', async () => {
    const started = {
      ...draft,
      startedAt: new Date().toISOString(),
      currentStep: 5,
      accountHolderName: 'Blue Mountain Adventures Pvt. Ltd.',
      bankName: '',
      ifscCode: '',
      accountType: 'CURRENT',
      bankOwnershipConfirmed: true,
      bankAccountMasked: '•••• 6789',
      documents: [{ type: 'BANK_PROOF', currentStatus: 'VERIFIED', latestVersion: { status: 'VERIFIED', fileAsset: { originalName: 'bank-proof.pdf' } } }],
    };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ bankName: 'HDFC Bank', branch: 'Calangute', city: 'Goa', state: 'Goa' } as never)
      .mockResolvedValueOnce({ ...started, bankName: 'HDFC Bank', ifscCode: 'HDFC0001234' } as never);

    render(<Onboarding />);

    expect(await screen.findByRole('heading', { name: 'Bank & tax' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Bank name *')).not.toBeInTheDocument();
    const ifsc = document.getElementById('vendor-bank-ifsc')!;
    fireEvent.change(ifsc, { target: { value: 'HDFC0001234' } });
    fireEvent.blur(ifsc);

    await waitFor(() => expect(screen.getByText('HDFC Bank · Calangute branch')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding', expect.objectContaining({ method: 'PATCH' })));
    expect((request.mock.calls[2][1] as { body: string }).body).toContain('HDFC Bank');
    expect((request.mock.calls[2][1] as { body: string }).body).toContain('HDFC0001234');
  });

  it('matches the prototype commercial terms and keeps the read-only terms backend-backed', async () => {
    const started = { ...draft, startedAt: new Date().toISOString(), currentStep: 6, supplementalData: {} };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ ...started, supplementalData: { commercialModel: 'Commission on sell price', commission: '18%', settlementCycle: 'Weekly T+7 after activity date', contractTerm: "12 months auto-renews · 90 days' notice", accountManager: 'Jatin M.' } } as never);

    render(<Onboarding />);

    expect(await screen.findByRole('heading', { name: 'Your commercial terms' })).toBeInTheDocument();
    expect(screen.getByText('🔒 Read-only')).toBeInTheDocument();
    expect(screen.getByText('18%', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('+ GST', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Weekly', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('T+7 after activity date', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('12 months', { exact: true })).toBeInTheDocument();
    expect(screen.getByText("auto-renews · 90 days' notice", { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Jatin M.')).toBeInTheDocument();
    expect(screen.getByText('YOU AGREE TO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message account manager' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding', expect.objectContaining({ method: 'PATCH' })));
    expect((request.mock.calls[1][1] as { body: string }).body).toContain('Jatin M.');
  });

  it('prefills agreement business and representative details from earlier onboarding steps', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), currentStep: 7, firstName: 'Binu', lastName: 'Mathew', businessDisplayName: 'Voya Adventures', legalBusinessName: 'Voya Adventures Private Limited' } as never);

    render(<Onboarding />);

    expect(await screen.findByDisplayValue('Voya Adventures Private Limited')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Binu Mathew')).toBeInTheDocument();
    expect(screen.getByText('Authorized representative *')).toBeInTheDocument();
  });

  it('persists agreement review state and downloads the generated PDF', async () => {
    const started = {
      ...draft,
      startedAt: new Date().toISOString(),
      currentStep: 7,
      firstName: 'Binu',
      lastName: 'Mathew',
      contactNumber: '+919876543210',
      contactEmail: 'vendor@example.com',
      businessDisplayName: 'Voya Adventures',
      legalBusinessName: 'Voya Adventures Private Limited',
      addressLine: 'Calangute',
      city: 'Calangute',
      state: 'Goa',
      pinCode: '403516',
      supplementalData: { commission: '18%', signingMethod: 'Aadhaar eSign (OTP)' },
    };
    const sent = { ...started, agreementSentAt: new Date().toISOString() };
    const opened = { ...sent, agreementOpenedAt: new Date().toISOString() };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce(sent as never)
      .mockResolvedValueOnce(opened as never);
    const blob = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:agreement') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<Onboarding />);

    expect(await screen.findByRole('heading', { name: 'Agreement & e-sign' })).toBeInTheDocument();
    expect(screen.getByText('Calangute, Calangute, Goa, 403516')).toBeInTheDocument();
    expect(screen.getByText(/vendor@example.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review & e-sign' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding/agreement/opened', expect.objectContaining({ method: 'POST' })));
    expect((request.mock.calls[1][1] as { body: string }).body).toContain('signingMethod');
    expect(screen.getByText('Agreement opened for review. Add your signature below.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(blob).toHaveBeenCalledWith('/vendor/onboarding/agreement.pdf'));
  });

  it('downloads an uploaded KYC document through the authenticated file endpoint', async () => {
    const started = {
      ...draft,
      startedAt: new Date().toISOString(),
      currentStep: 3,
      panNumber: 'ABCDE1234F',
      documents: [{ type: 'PAN', currentStatus: 'VERIFIED', latestVersion: { status: 'VERIFIED', fileAsset: { id: 'asset-pan', originalName: 'pan.pdf' } } }],
    };
    vi.spyOn(api, 'request').mockResolvedValueOnce(started as never);
    const blob = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:pan') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<Onboarding />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download PAN document' }));
    await waitFor(() => expect(blob).toHaveBeenCalledWith('/files/asset-pan/content'));
  });
});
