import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import ExperienceWizardModal from '../components/product-wizard/ExperienceWizardModal';
import AdminApprovals from './AdminApprovals';

vi.mock('../components/product-wizard/ExperienceWizardModal', () => ({
  default: vi.fn((props: ComponentProps<typeof ExperienceWizardModal>) => (
    <div role="dialog" aria-label="Activity review wizard">
      <button onClick={props.reviewActions?.onPublish}>Publish</button>
      <button onClick={props.reviewActions?.onReject}>Reject</button>
      <button onClick={props.onDone}>Close review</button>
    </div>
  )),
}));

const activityApproval = {
  id: 'revision-submitted-8',
  type: 'PRODUCT',
  title: 'Munnar Sunrise Walk',
  status: 'UNDER_REVIEW',
  ownerId: 'vendor-42',
  ownerName: 'Munnar Adventures',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const otherApproval = {
  ...activityApproval,
  id: 'revision-other-3',
  title: 'Goa Kayak Tour',
};
const selectedRevision = { id: activityApproval.id, productId: 'product-73' };
const reviewQueue = [
  { id: 'revision-older-7', productId: selectedRevision.productId },
  { id: otherApproval.id, productId: 'product-other' },
  selectedRevision,
];

function mockReviewRequests(loadQueue = async () => reviewQueue) {
  return vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === '/admin/approvals') return [activityApproval, otherApproval] as never;
    if (path === '/admin/product-revisions/review') return await loadQueue() as never;
    throw new Error(`Unexpected request: ${path}`);
  });
}

async function openActivityReview() {
  const row = await screen.findByRole('row', { name: new RegExp(activityApproval.title) });
  fireEvent.click(within(row).getByRole('button', { name: 'Review' }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Admin approvals activity review', () => {
  it('opens the exact submitted product revision in-place with read-only admin decision actions', async () => {
    const request = mockReviewRequests();
    const onNavigate = vi.fn();
    render(<AdminApprovals onNavigate={onNavigate} />);

    await openActivityReview();

    await screen.findByRole('dialog', { name: 'Activity review wizard' });
    expect(request.mock.calls).toEqual([
      ['/admin/approvals'],
      ['/admin/product-revisions/review'],
    ]);
    const wizardCalls = vi.mocked(ExperienceWizardModal).mock.calls;
    expect(wizardCalls[wizardCalls.length - 1][0]).toEqual(expect.objectContaining({
      product: { id: selectedRevision.productId },
      preferredRevisionId: activityApproval.id,
      viewOnly: true,
      adminContext: true,
      vendorNameOverride: activityApproval.ownerName,
      reviewActions: {
        onPublish: expect.any(Function),
        onReject: expect.any(Function),
      },
      onDone: expect.any(Function),
      onChanged: expect.any(Function),
    }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'] as const)('%s from the review dialog decides only the selected revision and clears its row and dialog', async (decision) => {
    let decided = false;
    const endpoint = `/admin/product-revisions/${activityApproval.id}/${decision === 'approve' ? 'publish' : 'reject'}`;
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/admin/approvals') return (decided ? [otherApproval] : [activityApproval, otherApproval]) as never;
      if (path === '/admin/product-revisions/review') return reviewQueue as never;
      if (path === endpoint && options?.method === 'POST') {
        decided = true;
        return {} as never;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('  Please correct the meeting point.  ');
    const onNavigate = vi.fn();
    render(<AdminApprovals onNavigate={onNavigate} />);
    await openActivityReview();

    const dialog = await screen.findByRole('dialog', { name: 'Activity review wizard' });
    fireEvent.click(within(dialog).getByRole('button', { name: decision === 'approve' ? 'Publish' : 'Reject' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      ...(decision === 'reject' ? { body: JSON.stringify({ reason: 'Please correct the meeting point.' }) } : {}),
    }));
    await screen.findByText('1 items waiting');
    expect(screen.queryByText(activityApproval.title)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(otherApproval.title)).toBeInTheDocument();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    expect(request.mock.calls.filter(([path]) => path === '/admin/approvals')).toHaveLength(2);
    if (decision === 'reject') expect(prompt).toHaveBeenCalledWith(`Reason for rejecting ${activityApproval.title}`);
    else expect(prompt).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: 'empty review queue', queue: [] },
    { scenario: 'only another revision of the same product', queue: [reviewQueue[0]] },
    { scenario: 'only an unrelated product revision', queue: [reviewQueue[1]] },
  ])('shows a recoverable error for $scenario and retries the exact revision', async ({ queue }) => {
    const loadQueue = vi.fn<() => Promise<typeof reviewQueue>>()
      .mockResolvedValueOnce(queue)
      .mockResolvedValueOnce(reviewQueue);
    const request = mockReviewRequests(loadQueue);
    const onNavigate = vi.fn();
    render(<AdminApprovals onNavigate={onNavigate} />);

    await openActivityReview();

    const dialog = await screen.findByRole('dialog', { name: activityApproval.title });
    expect(await within(dialog).findByText('This revision is no longer awaiting review. Refresh the approval queue.')).toBeInTheDocument();
    expect(ExperienceWizardModal).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry activity review' }));

    await screen.findByRole('dialog', { name: 'Activity review wizard' });
    expect(screen.queryByText('This revision is no longer awaiting review. Refresh the approval queue.')).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([path]) => path === '/admin/product-revisions/review')).toHaveLength(2);
    const wizardCalls = vi.mocked(ExperienceWizardModal).mock.calls;
    expect(wizardCalls[wizardCalls.length - 1][0]).toMatchObject({
      product: { id: selectedRevision.productId },
      preferredRevisionId: activityApproval.id,
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('recovers from a failed review lookup using Retry without navigating', async () => {
    const loadQueue = vi.fn<() => Promise<typeof reviewQueue>>()
      .mockRejectedValueOnce(new Error('Review queue temporarily unavailable'))
      .mockResolvedValueOnce(reviewQueue);
    mockReviewRequests(loadQueue);
    const onNavigate = vi.fn();
    render(<AdminApprovals onNavigate={onNavigate} />);

    await openActivityReview();

    const dialog = await screen.findByRole('dialog', { name: activityApproval.title });
    expect(await within(dialog).findByText('Review queue temporarily unavailable')).toBeInTheDocument();
    expect(ExperienceWizardModal).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry activity review' }));

    await screen.findByRole('dialog', { name: 'Activity review wizard' });
    expect(screen.queryByText('Review queue temporarily unavailable')).not.toBeInTheDocument();
    expect(loadQueue).toHaveBeenCalledTimes(2);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('closes the in-place review without deciding or removing the approval', async () => {
    const request = mockReviewRequests();
    const onNavigate = vi.fn();
    render(<AdminApprovals onNavigate={onNavigate} />);
    await openActivityReview();

    const dialog = await screen.findByRole('dialog', { name: 'Activity review wizard' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close review' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(activityApproval.title)).toBeInTheDocument();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
