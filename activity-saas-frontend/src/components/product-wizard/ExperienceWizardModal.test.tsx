import { describe, expect, it } from 'vitest';
import type { Product, ProductRevision } from '../../api';
import { activityContentSettingsPath, productBuilderStatus, selectProductRevision, shouldPersistBeforeStepChange } from './ExperienceWizardModal';

const revision = (id: string, status: string) => ({ id, status } as ProductRevision);

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
