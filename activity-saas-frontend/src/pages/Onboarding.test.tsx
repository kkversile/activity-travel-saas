import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('keeps an edited business name while section guidance changes and saves through the existing draft API',async()=>{
    const application={...draft,startedAt:new Date().toISOString(),businessDisplayName:'Coastal Journeys',legalBusinessName:'Coastal Journeys'};
    const request=vi.spyOn(api,'request').mockImplementation(async (_path,options)=>options?.method==='PATCH'?{...application,...JSON.parse(String(options.body))} as never:application as never);
    render(<Onboarding />);
    const name=await screen.findByLabelText(/Brand \/ trade name/);
    fireEvent.change(name,{target:{value:'Coastal Journeys and local stories'}});
    fireEvent.click(screen.getByRole('button',{name:'3. KYC documents'}));
    fireEvent.click(screen.getByText('Help with this section'));
    expect(screen.getByText('Make verification straightforward')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'1. Business profile'}));
    expect(screen.getByLabelText(/Brand \/ trade name/)).toHaveValue('Coastal Journeys and local stories');
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await waitFor(()=>expect(request.mock.calls.some(([,options])=>options?.method==='PATCH')).toBe(true));
    const body=JSON.parse(String(request.mock.calls.find(([,options])=>options?.method==='PATCH')?.[1]?.body));
    expect(body.businessDisplayName).toBe('Coastal Journeys and local stories');
    expect(request.mock.calls.filter(([,options])=>options?.method==='PATCH')).toHaveLength(1);
  });

  it('does not show the temporary vendor placeholder as business data', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), currentStep: 1, businessDisplayName: 'Vendor pending onboarding', legalBusinessName: 'Vendor pending onboarding' } as never);

    render(<Onboarding />);

    expect(await screen.findByText('Brand / trade name *')).toBeInTheDocument();
    expect(screen.getByText('Business profile & verification')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/Signed up/)).toBeInTheDocument();
    expect(screen.getByText('Details in progress')).toBeInTheDocument();
    expect(screen.getByText('Starts after you submit')).toBeInTheDocument();
    expect(screen.getByText('Available in step 7')).toBeInTheDocument();
    expect(screen.getByText('Approved · selling')).toBeInTheDocument();
    expect(screen.getByText('Setup sections complete')).toBeInTheDocument();
    expect(screen.getByText(/\d+\s*\/\s*7/)).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Onboarding steps' })).getByText('Step 1 of 8')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Add operating city' }), { target: { value: 'Panaji' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add city' }));
    expect(screen.getByRole('button', { name: 'Panaji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Day tours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Own website' })).toBeInTheDocument();
    expect(screen.queryByText('Search location')).not.toBeInTheDocument();
    expect(screen.queryByText('First name *')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Vendor pending onboarding')).not.toBeInTheDocument();
  });

  it('retains entered data and reports a failed draft save', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString() } as never).mockRejectedValueOnce(new Error('Connection lost'));
    render(<Onboarding />);
    const name = await screen.findByRole('textbox', { name: /Brand \/ trade name/ });
    fireEvent.change(name, { target: { value: 'Mountain Trails' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your changes were not saved');
    expect(name).toHaveValue('Mountain Trails');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('clears a stale city when the state changes and supports a city outside the suggestions', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), state: 'Kerala', city: 'Munnar' } as never);
    render(<Onboarding />);
    const state = await screen.findByRole('combobox', { name: 'State / region *' });
    fireEvent.change(state, { target: { value: 'Tamil Nadu' } });
    const city = screen.getByRole('combobox', { name: /City/ });
    expect(city).toHaveValue('');
    expect(document.querySelector('#onboarding-cities option[value="Madurai"]')).toBeTruthy();
    fireEvent.change(city, { target: { value: 'A vendor-entered town' } });
    expect(city).toHaveValue('A vendor-entered town');
  });

  it('reuses primary contact details while preserving the target role and hours', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), currentStep: 2, firstName: 'Binu', lastName: 'Mathew', contactNumber: '+919876543210' } as never);
    render(<Onboarding />);
    await screen.findByRole('heading', { name: 'Key contacts' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Use primary contact details' })[0]);
    expect(screen.getByLabelText('Reservations & operations name')).toHaveValue('Binu Mathew');
    expect(screen.getByLabelText('Reservations & operations mobile')).toHaveValue('+919876543210');
    expect(screen.getByLabelText('Reservations & operations hours')).toHaveValue('07:00–22:00 daily');
  });

  it('links validation errors to editable fields and makes no save request for an invalid step', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString() } as never);
    render(<Onboarding />);
    await screen.findByText('Business identity');
    fireEvent.click(screen.getByRole('button', { name: 'Save & continue →' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Complete the business profile');
    expect(screen.getByRole('link', { name: 'Enter a 6-digit PIN code.' })).toHaveAttribute('href', '#onboarding-pinCode');
    expect(screen.getByLabelText(/PIN code/)).toHaveAttribute('aria-invalid', 'true');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retains the review form when the server refuses submission', async () => {
    const started = { ...draft, startedAt: new Date().toISOString(), currentStep: 8 };
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce(started as never).mockResolvedValueOnce(started as never).mockRejectedValueOnce(new Error('Complete bank details, ownership confirmation, and bank proof'));
    render(<Onboarding />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for verification' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete bank details');
    expect(screen.getByRole('heading', { name: 'Review & submit' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/submit', { method: 'POST' });
  });

  it('uses the server submission response to show the read-only review state', async () => {
    const started = { ...draft, startedAt: new Date().toISOString(), currentStep: 8 };
    vi.spyOn(api, 'request').mockResolvedValueOnce(started as never).mockResolvedValueOnce(started as never).mockResolvedValueOnce({ ...started, status: 'SUBMITTED' } as never);
    render(<Onboarding />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for verification' }));
    expect(await screen.findByRole('heading', { name: 'Application under review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });

  it('shows conditional KYC documents only when the selected entity type requires them', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({
      ...draft,
      startedAt: new Date().toISOString(),
      supplementalData: { entityType: 'SOLE_PROPRIETOR' },
    } as never);

    render(<Onboarding />);
    await screen.findByText('Brand / trade name *');
    fireEvent.click(screen.getByRole('button', { name: /3\.\s*KYC documents/ }));

    expect(await screen.findByRole('group', { name: 'GST registration status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload LLP agreement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload LLPIN certificate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload authorisation letter' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Optional').length).toBeGreaterThan(0);
    expect(screen.queryByText('GST registration and declaration')).not.toBeInTheDocument();
  });

  it('renders a single GSTIN control and certificate action for GST-registered vendors', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({
      ...draft,
      startedAt: new Date().toISOString(),
      gstStatus: 'REGISTERED',
      gstin: '30AAQFG4821K1Z5',
      supplementalData: { entityType: 'SOLE_PROPRIETOR' },
    } as never);

    render(<Onboarding />);
    await screen.findByText('Brand / trade name *');
    fireEvent.click(screen.getByRole('button', { name: /3\.\s*KYC documents/ }));

    expect(await screen.findByRole('textbox', { name: 'GSTIN *' })).toHaveValue('30AAQFG4821K1Z5');
    expect(screen.getAllByRole('textbox', { name: 'GSTIN *' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Upload GST certificate' })).toHaveLength(1);
  });

  it('loads the welcome state and starts a saved application', async () => {
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(draft as never)
      .mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString() } as never);

    render(<Onboarding />);

    expect(await screen.findByText('Build your partner profile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start onboarding/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/onboarding', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText('Your draft is started. Use Save draft or Save & continue to keep your changes.')).toBeInTheDocument();
  });

  it('allows prototype-style step navigation and selects the agreement for each supplier type', async () => {
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), supplementalData: { supplierType: 'Direct operator' } } as never);
    render(<Onboarding />);

    expect(await screen.findByText('Brand / trade name *')).toBeInTheDocument();
    const commercialStep = screen.getByRole('button', { name: /6\.\s*Commercial terms/ });
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
    expect(screen.getByLabelText(/Bank name \*/)).toBeInTheDocument();
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
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('18%', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('+ GST', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Weekly', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('T+7 after activity date', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('12 months', { exact: true })).toBeInTheDocument();
    expect(screen.getByText("auto-renews · 90 days' notice", { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Jatin M.')).toBeInTheDocument();
    expect(screen.getByText('YOU AGREE TO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message account manager' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
