import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Product, type ProductReadiness, type ProductRevision } from '../../api';
import ExperienceWizardModal, { activityContentSettingsPath, productBuilderStatus, productSetupProgress, selectProductRevision, shouldPersistBeforeStepChange } from './ExperienceWizardModal';
import { BEFORE_OUTLET_CHANGE } from './outletNavigation';

const revision = (id: string, status: string) => ({ id, status } as ProductRevision);

afterEach(() => { cleanup(); vi.restoreAllMocks(); api.setActiveOutletId(null); });

describe('pricing save coordination', () => {
  it('keeps the selected outlet on the stable edit route after creating a full-page draft',async()=>{
    api.setActiveOutletId('fort-kochi');
    const draft={...revision('new-draft','DRAFT'),productName:'Waterfront discovery',type:'ACTIVITY',subType:'EXPERIENCE'} as ProductRevision;
    const product:Product={id:'new-product',tenantId:'vendor',productCode:'PRD-NEW',currency:'INR',status:'DRAFT',revisions:[draft],variants:[]};
    vi.spyOn(api,'request').mockImplementation(async path=>path==='/products/drafts'||path==='/products/new-product'?product as never:path.endsWith('/activity-content-settings')?{terms:[],howToRedeem:[],bookingQuestions:[]} as never:path.endsWith('/booking-questions')||path.endsWith('/activity-categories')?[] as never:{} as never);
    const replace=vi.spyOn(window.history,'replaceState').mockImplementation(()=>undefined);
    render(<ExperienceWizardModal fullPage onDone={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Product title/),{target:{value:'Waterfront discovery'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Activity sub-type *'}),{target:{value:'EXPERIENCE'}});
    fireEvent.click(screen.getAllByRole('button',{name:'Save draft'})[0]);
    await waitFor(()=>expect(replace).toHaveBeenCalledWith({},'',expect.stringMatching(/\/vendor\/products\/new-product\/edit\?outletId=fort-kochi$/)));
    expect(await screen.findByText('Draft saved successfully.')).toBeInTheDocument();
  });

  it('previews unsaved content without saving, publishing or changing the selected section',async()=>{
    const draft={...revision('preview-draft','DRAFT'),productName:'A walk through Kochi',type:'ACTIVITY',subType:'WALK',shortDescription:'Local stories by the harbour.'} as ProductRevision;
    const product:Product={id:'preview-product',tenantId:'preview-vendor',productCode:'PREVIEW-ONLY',currency:'USD',status:'DRAFT',revisions:[draft],variants:[]};
    const request=vi.spyOn(api,'request').mockImplementation(async path=>path==='/products/preview-product'?product as never:path.endsWith('/activity-content-settings')?{terms:[],howToRedeem:[],bookingQuestions:[]} as never:path.endsWith('/booking-questions')||path.endsWith('/activity-categories')?[] as never:{} as never);
    render(<ExperienceWizardModal product={product} fullPage onDone={vi.fn()} onChanged={vi.fn()} />);
    const title=await screen.findByLabelText(/Product title/);
    fireEvent.change(title,{target:{value:'Kochi with a local storyteller'}});
    fireEvent.click(screen.getByRole('button',{name:'Preview listing'}));
    const preview=screen.getByRole('complementary',{name:'Your experience preview'});
    expect(within(preview).getByRole('heading',{name:'Kochi with a local storyteller'})).toBeInTheDocument();
    expect(within(preview).getByText('Working draft')).toBeInTheDocument();
    expect(screen.getByRole('combobox',{name:'Go to activity section'})).toHaveValue('1');
    expect(request.mock.calls.some(([,options])=>['POST','PATCH','DELETE'].includes(String(options?.method)))).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Hide preview'}));
    expect(screen.queryByRole('complementary',{name:'Your experience preview'})).not.toBeInTheDocument();
    expect(title).toHaveValue('Kochi with a local storyteller');
  });

  it.each([false, true])('locks wizard navigation until pricing finishes and preserves the unload warning on failure (%s)', async fail => {
    const draft = { ...revision('draft-lock', 'DRAFT'), productName: 'Harbour pricing', type: 'ACTIVITY', subType: 'WALK', meetingModel: 'FIXED_MEETING_POINT' } as ProductRevision;
    const option: any = { id: 'variant-lock', productId: 'product-lock', name: 'Harbour walk', variantCode: 'WALK', status: 'ACTIVE', version: 1 };
    const product: Product = { id: 'product-lock', tenantId: 'vendor-lock', productCode: 'ACT-LOCK', currency: 'INR', status: 'DRAFT', revisions: [draft], variants: [option] };
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const request = vi.spyOn(api, 'request').mockImplementation(async path => {
      if (path === '/products/product-lock') return product as never;
      if (path.endsWith('/booking-questions')) return [] as never;
      if (path === '/vendor/activity-content-settings') return { terms: [], howToRedeem: [], bookingQuestions: [] } as never;
      if (path.endsWith('/prices-availability')) return { options: [{ variantId: option.id, ratePlans: [{ editable: true, currency: 'INR', versions: [{ status: 'DRAFT', versionNumber: 1, pricingUnit: 'PER_PERSON', effectiveFrom: '2026-12-01', effectiveTo: '2027-03-01', travellerPrices: [{ travellerType: 'ADULT', amount: '1800' }] }] }] }] } as never;
      if (path.endsWith('/preview')) return { valid: true, errors: [] } as never;
      if (path.endsWith('/apply')) { await gate; if (fail) throw new Error('Interrupted pricing save'); return {} as never; }
      return {} as never;
    });
    render(<ExperienceWizardModal product={product} initialStep={5} fullPage onDone={vi.fn()} onChanged={vi.fn()} />);
    const price = await screen.findByLabelText('Harbour walk adult or base price');
    await waitFor(() => expect(price).toHaveValue(1800));
    fireEvent.change(price, { target: { value: '1952' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    expect(price).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Go to activity section' })).toBeDisabled();
    for (const button of within(screen.getByRole('navigation', { name: 'Experience setup steps' })).getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.queryByText('Draft saved successfully.')).not.toBeInTheDocument();
    const pending = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(pending); expect(pending.defaultPrevented).toBe(true);
    const outletChange = new Event(BEFORE_OUTLET_CHANGE, { cancelable: true }); window.dispatchEvent(outletChange); expect(outletChange.defaultPrevented).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(price).toBeEnabled());
    const completed = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(completed); expect(completed.defaultPrevented).toBe(fail);
    if (fail) expect(screen.getByText(/Not saved.*Interrupted pricing save/)).toBeInTheDocument();
    else expect(screen.getByText('Draft saved successfully. Pricing and availability saved.')).toBeInTheDocument();
  });
});

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
    expect(screen.getByLabelText('Setup progress 89 percent')).toBeInTheDocument();
    expect(screen.getByText('Fulfilment needs attention in final review')).toBeInTheDocument();
  });
});

describe('product setup progress', () => {
  it('reserves full completion for all content sections plus verified fulfilment readiness', () => {
    const content = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(productSetupProgress(content, false)).toBe(89);
    expect(productSetupProgress(content, null)).toBe(89);
    expect(productSetupProgress(content, true)).toBe(100);
    expect(productSetupProgress(new Set([...content, 9]), false)).toBe(89);
    expect(productSetupProgress(new Set([1, 2]), false)).toBe(22);
  });
});

describe('unsaved product outlet guard', () => {
  it('keeps entered details when an outlet change is cancelled and permits an explicit discard', async () => {
    vi.spyOn(api, 'request').mockImplementation(async path => path.endsWith('/activity-categories') ? [] as never : { terms: [], howToRedeem: [], bookingQuestions: [] } as never);
    render(<ExperienceWizardModal fullPage onDone={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Product title/), { target: { value: 'Unfinished coastal walk' } });
    const proceed = vi.fn();
    const cancelled = new CustomEvent(BEFORE_OUTLET_CHANGE, { cancelable: true, detail: { proceed } });
    act(() => { window.dispatchEvent(cancelled); });
    expect(cancelled.defaultPrevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved product changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText(/Product title/)).toHaveValue('Unfinished coastal walk');
    expect(proceed).not.toHaveBeenCalled();
    const approved = new CustomEvent(BEFORE_OUTLET_CHANGE, { cancelable: true, detail: { proceed } });
    act(() => { window.dispatchEvent(approved); });
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and change outlet' }));
    expect(proceed).toHaveBeenCalledOnce();
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
