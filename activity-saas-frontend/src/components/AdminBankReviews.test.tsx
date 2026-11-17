import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminBankReviews from './AdminBankReviews';

afterEach(() => vi.restoreAllMocks());

it('requires evidence and a review note before verifying an account', async () => {
  const request = vi.spyOn(api, 'request').mockResolvedValue([{ id: 'bank-x', bankName: 'Illustrative Bank', accountHolder: 'ABC', accountNumberMasked: '•••• 0111', ifsc: 'HDFC0001234', proofDocumentId: 'proof', tenant: { name: 'ABC Adventures' } }] as never);
  render(<AdminBankReviews />);
  const verify = await screen.findByRole('button', { name: 'Verify account' });
  expect(verify).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Bank review note for •••• 0111'), { target: { value: 'Evidence checked by admin' } });
  expect(verify).toBeEnabled(); fireEvent.click(verify);
  await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/admin/bank-accounts/bank-x/review', expect.objectContaining({ method: 'POST', body: JSON.stringify({ status: 'VERIFIED', note: 'Evidence checked by admin' }) })));
});
