import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Product, type ProductReadiness, type ProductRevision } from '../../api';
import ExperienceWizardModal, { activityContentSettingsPath, productBuilderStatus, selectProductRevision, shouldPersistBeforeStepChange } from './ExperienceWizardModal';

const revision = (id: string, status: string) => ({ id, status } as ProductRevision);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ExperienceWizardModal readiness mapping', () => {
  it('keeps saved Photos complete when the only media/fulfilment blocker is FULFILMENT_POLICY_MISSING', async () => {
    const draft: ProductRevision = {
      ...revision('draft-42', 'DRAFT'), productName: 'Saved experience',
      media: [{ id: 'media-42', kind: 'IMAGE', fileAssetId: 'image-42', rank: 0 }],
    };
    const product: Product = { id: 'product-42', tenantId: 'vendor-42', productCode: 'ACT-42', status: 'DRAFT', revisions: [draft], variants: [] };
    const ready = () => ({ ready: true, reasonCodes: [] });
    const readiness: ProductReadiness = {
      productId: product.id, revisionId: draft.id, ready: false, reasonCodes: ['FULFILMENT_POLICY_MISSING'], evaluatedAt: '2026-11-14T12:00:00Z', distributionReady: true, distributionReasonCodes: [],
      sections: {
        basicInfo: ready(), experience: ready(), options: ready(), rates: ready(), availability: ready(), policies: ready(), voucher: ready(), distribution: ready(),
        mediaFulfilment: { ready: false, reasonCodes: ['FULFILMENT_POLICY_MISSING'] },
      },
    };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/products/product-42') return product as never;
      if (path === '/product-revisions/draft-42/booking-questions') return [] as never;
      if (path === '/products/product-42/readiness') return readiness as never;
      if (path === '/vendor/activity-content-settings') return { terms: [], howToRedeem: [], bookingQuestions: [] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<ExperienceWizardModal product={product} initialStep={9} onDone={vi.fn()} onChanged={vi.fn()} />);

    const navigation = await screen.findByRole('navigation', { name: 'Experience setup steps' });
    const photos = within(navigation).getByRole('button', { name: /Photos/ });
    expect(photos).toHaveClass('completed');
    expect(within(photos).getByText('✓')).toBeInTheDocument();
    expect(screen.queryByText('Loading experience…')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/products/product-42/readiness');
    // The remaining fulfilment issue still appears in final review.
    expect(await screen.findByText('Fulfilment policy is missing')).toBeInTheDocument();
    expect(screen.getByText('Items need attention before submission.')).toBeInTheDocument();
  });
});

describe('selectProductRevision', () => {
  it('uses the revision selected by the Admin products list, including rejected revisions', () => {
    const published = revision('published', 'PUBLISHED');
    const rejected = revision('rejected', 'REJECTED');
    const product = { currentRevision: published, revisions: [rejected, published] } as Product;

    expect(selectProductRevision(product, 'rejected')?.id).toBe('rejected');
  });

  it('keeps the Vendor workflow on its newest editable revision by default', () => {
    const published = revision('published', 'PUBLISHED');
    const draft = revision('draft', 'DRAFT');
    const product = { currentRevision: published, revisions: [draft, published] } as Product;

    expect(selectProductRevision(product)?.id).toBe('draft');
  });
});

describe('activityContentSettingsPath', () => {
  it('uses the Admin-readable persisted settings endpoint in the Admin wizard', () => {
    expect(activityContentSettingsPath(true)).toBe('/admin/activity-content-settings');
    expect(activityContentSettingsPath(false)).toBe('/vendor/activity-content-settings');
  });
});

describe('productBuilderStatus', () => {
  it('shows both the live listing and draft revision while changes are prepared', () => {
    expect(productBuilderStatus('LIVE', 'DRAFT')).toMatchObject({ label: 'Live · draft edits', live: true, draftEdit: true, description: 'Your current listing stays live while you prepare these edits for review.' });
  });

  it('keeps the published listing state visible while a revision is under review', () => {
    expect(productBuilderStatus('LIVE', 'PUBLISHED')).toMatchObject({ label: 'Live · published revision', live: true });
    expect(productBuilderStatus('LIVE', 'UNDER_REVIEW')).toMatchObject({ label: 'Live · edits in QC', live: true, description: expect.stringContaining('current live listing remains available') });
  });

  it('does not present suspended or archived products as live', () => {
    expect(productBuilderStatus('SUSPENDED', 'PUBLISHED')).toMatchObject({ label: 'Paused · published revision', live: false });
    expect(productBuilderStatus('SUSPENDED', 'DRAFT')).toMatchObject({ label: 'Paused · draft edits', live: false, draftEdit: true });
    expect(productBuilderStatus('ARCHIVED', 'PUBLISHED')).toMatchObject({ label: 'Archived', live: false });
  });
});

describe('shouldPersistBeforeStepChange', () => {
  it('does not resave an unchanged existing product when opening a later step', () => {
    expect(shouldPersistBeforeStepChange(true, false)).toBe(false);
  });

  it('saves pending edits before leaving an existing product step', () => {
    expect(shouldPersistBeforeStepChange(true, true)).toBe(true);
  });

  it('creates the first draft before opening later steps for a new product', () => {
    expect(shouldPersistBeforeStepChange(false, false)).toBe(true);
  });
});
