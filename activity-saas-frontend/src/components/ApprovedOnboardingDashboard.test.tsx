import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import ApprovedOnboardingDashboard from './ApprovedOnboardingDashboard';

afterEach(() => vi.restoreAllMocks());

describe('ApprovedOnboardingDashboard document renewal', () => {
  it('uploads a replacement document with its expiry and reloads the persisted status', async () => {
    const initialApplication: any = {
      id: 'application-1', status: 'APPROVED', currentStep: 8, gstStatus: 'NOT_REGISTERED', hasSignature: true,
      documents: [{ id: 'document-1', type: 'PUBLIC_LIABILITY_INSURANCE', currentStatus: 'VERIFIED', latestVersion: { id: 'version-1', versionNumber: 1, status: 'VERIFIED', expiresAt: '2026-12-01T23:59:59.999Z', fileAsset: { id: 'asset-1', originalName: 'policy.pdf', mimeType: 'application/pdf', sizeBytes: 10, visibility: 'PRIVATE' } } }],
    };
    const renewedApplication = { ...initialApplication, documents: [{ ...initialApplication.documents[0], currentStatus: 'PENDING', latestVersion: { ...initialApplication.documents[0].latestVersion, id: 'version-2', versionNumber: 2, status: 'PENDING', expiresAt: '2027-12-01T23:59:59.999Z' } }] };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/profile') return { id: 'profile-1', legalBusinessName: 'Blue Mountain Adventures', operatingCity: 'Munnar', operatingRegion: 'Kerala', verificationStatus: 'VERIFIED', readinessScore: 90 } as never;
      if (path === '/dashboard/summary') return { readinessScore: 90, liveListings: 1, listings: 1 } as never;
      if (path === '/products/listing?page=1&limit=100') return { items: [], summary: { live: 1, review: 0, draft: 0 } } as never;
      if (path === '/vendor/documents/publicLiabilityInsurance') return { id: 'version-2' } as never;
      if (path === '/onboarding') return renewedApplication as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<ApprovedOnboardingDashboard application={initialApplication} onNavigate={vi.fn()} />);

    const expiry = await screen.findByLabelText('Public liability insurance new expiry date');
    const row = expiry.closest('tr')!;
    fireEvent.change(expiry, { target: { value: '2027-12-01' } });
    fireEvent.change(screen.getByLabelText('Public liability insurance renewal file'), { target: { files: [new File(['policy'], 'renewed-policy.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(within(row).getByRole('button', { name: 'Upload renewal' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('uploaded and pending verification'));
    const uploadCall = request.mock.calls.find(([path]) => path === '/vendor/documents/publicLiabilityInsurance');
    const body = uploadCall?.[1]?.body as FormData;
    expect(body.get('expiresAt')).toBe('2027-12-01');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(request).toHaveBeenCalledWith('/onboarding');
    expect(within(row).getByText('Pending')).toBeInTheDocument();
  });
});
