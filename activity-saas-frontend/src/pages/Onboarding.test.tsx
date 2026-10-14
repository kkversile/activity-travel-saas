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
});
