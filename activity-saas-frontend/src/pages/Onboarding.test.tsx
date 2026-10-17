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
    vi.spyOn(api, 'request').mockResolvedValueOnce({ ...draft, startedAt: new Date().toISOString(), currentStep: 2, businessDisplayName: 'Vendor pending onboarding', legalBusinessName: 'Vendor pending onboarding' } as never);

    render(<Onboarding />);

    expect(await screen.findByLabelText('Business display name *')).toHaveValue('');
    expect(screen.getByLabelText('Legal business name *')).toHaveValue('');
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

  it('keeps the entered names after OTP verification reloads the application', async () => {
    const started = { ...draft, startedAt: new Date().toISOString() };
    const verified = { ...started, contactNumber: '+919876543210', phoneVerifiedAt: new Date().toISOString() };
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce(started as never)
      .mockResolvedValueOnce({ demoOtp: '123456' } as never)
      .mockResolvedValueOnce({ verified: true } as never)
      .mockResolvedValueOnce(verified as never);

    render(<Onboarding />);

    const firstName = await screen.findByLabelText('First name *');
    const lastName = screen.getByLabelText('Last name *');
    fireEvent.change(firstName, { target: { value: 'Kiran' } });
    fireEvent.change(lastName, { target: { value: 'Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('9876543210'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    const otp = await screen.findByLabelText('Six digit OTP');
    fireEvent.change(otp, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByText('Contact number verified.')).toBeInTheDocument());
    expect(firstName).toHaveValue('Kiran');
    expect(lastName).toHaveValue('Kumar');
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/verify', expect.objectContaining({ method: 'POST' }));
  });
});
