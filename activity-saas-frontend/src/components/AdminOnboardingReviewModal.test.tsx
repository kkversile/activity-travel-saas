import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VendorOnboardingApplication } from '../api';
import AdminOnboardingReviewModal from './AdminOnboardingReviewModal';

const application = { id: 'app', status: 'APPROVED', currentStep: 8, documents: [], supplementalData: {}, approvalBlockers: ['Vendor must resubmit the corrected onboarding before approval'] } as unknown as VendorOnboardingApplication;
const props = { vendorName: 'Harbour Trails', onClose: vi.fn(), onReview: vi.fn(), onReopen: vi.fn() };
describe('Admin onboarding approval state', () => {
  it('hides obsolete approval blockers for an approved application and keeps actions disabled', () => {
    render(<AdminOnboardingReviewModal {...props} application={application} />);
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.queryByText(/Approval is blocked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/must resubmit/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve application' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
  it('keeps read-only approval actions disabled after approval', () => {
    render(<AdminOnboardingReviewModal {...props} application={application} readOnly reviewActions={{ onApprove: vi.fn(), onReject: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
  it('retains required-document blockers for a submitted application', () => {
    render(<AdminOnboardingReviewModal {...props} application={{ ...application, status: 'SUBMITTED', approvalBlockers: ['PAN document is pending'] }} />);
    expect(screen.getByText('PAN document is pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve application' })).toBeDisabled();
  });
  it('allows a ready submitted application to be reviewed', () => {
    render(<AdminOnboardingReviewModal {...props} application={{ ...application, status: 'SUBMITTED', approvalBlockers: [] }} />);
    expect(screen.queryByText(/Approval is blocked/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve application' })).toBeEnabled();
  });
});
