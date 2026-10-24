import { useEffect, useMemo, useState } from 'react';
import { api, type ProductListingResponse, type VendorOnboardingApplication, type VendorProfile } from '../api';
import { Badge, ErrorBox, Loading } from './Ui';

type DashboardSummary = {
  readinessScore: number;
  liveListings: number;
  listings: number;
};

type Props = {
  application: VendorOnboardingApplication;
  onNavigate: (page: 'products') => void;
};

type LoadState = {
  profile: VendorProfile | null;
  summary: DashboardSummary | null;
  listings: ProductListingResponse | null;
};

const documentLabels: Record<string, string> = {
  PAN: 'PAN document',
  GSTIN: 'GST certificate',
  BANK_PROOF: 'Bank proof',
};

function humanStatus(value?: string | null) {
  if (!value) return 'Not uploaded';
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function documentStatus(application: VendorOnboardingApplication, type: 'PAN' | 'GSTIN' | 'BANK_PROOF') {
  const document = application.documents.find((item) => item.type === type);
  return document?.latestVersion?.status || document?.currentStatus || null;
}

function checklistStatus(status?: string | null) {
  if (status === 'VERIFIED') return { label: 'Verified', tone: 'success' };
  if (status === 'REJECTED' || status === 'EXPIRED') return { label: humanStatus(status), tone: 'danger' };
  if (status === 'PENDING') return { label: 'Pending review', tone: 'warning' };
  return { label: 'Not uploaded', tone: 'warning' };
}

export default function ApprovedOnboardingDashboard({ application, onNavigate }: Props) {
  const [data, setData] = useState<LoadState>({ profile: null, summary: null, listings: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([
      api.request<VendorProfile>('/vendor/profile'),
      api.request<DashboardSummary>('/dashboard/summary'),
      api.request<ProductListingResponse>('/products/listing?page=1&limit=100'),
    ]).then(([profileResult, summaryResult, listingResult]) => {
      if (!active) return;
      setData({
        profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
        summary: summaryResult.status === 'fulfilled' ? summaryResult.value : null,
        listings: listingResult.status === 'fulfilled' ? listingResult.value : null,
      });
      const failures = [profileResult, summaryResult, listingResult].filter((result) => result.status === 'rejected');
      if (failures.length === 3) setError('Readiness data could not be loaded. Refresh and try again.');
      else setError('');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [application.id]);

  const requiredDocumentTypes = useMemo(() => [
    'PAN' as const,
    ...(application.gstStatus === 'REGISTERED' ? ['GSTIN' as const] : []),
    'BANK_PROOF' as const,
  ], [application.gstStatus]);

  const documentHealth = useMemo(() => {
    const current = requiredDocumentTypes.filter((type) => documentStatus(application, type) === 'VERIFIED').length;
    return { current, total: requiredDocumentTypes.length };
  }, [application, requiredDocumentTypes]);

  const liveProducts = data.listings?.summary.live ?? data.summary?.liveListings ?? 0;
  const reviewProducts = data.listings?.summary.review ?? 0;
  const draftProducts = data.listings?.summary.draft ?? 0;
  const readinessScore = data.summary?.readinessScore ?? data.profile?.readinessScore ?? 0;
  const products = data.listings?.items ?? [];
  const bookableProducts = products.filter((item) => item.bookability.status === 'BOOKABLE').length;
  const blockers = [
    { label: 'Vendor approved', complete: application.status === 'APPROVED' },
    { label: 'At least 1 live product', complete: liveProducts > 0 },
    { label: 'Active rate plan and future inventory', complete: bookableProducts > 0 },
  ];
  const actionsRemaining = blockers.filter((item) => !item.complete).length + products.filter((item) => item.action === 'FIX').length;

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const profileComplete = Boolean(application.firstName && application.lastName && application.phoneVerifiedAt && application.businessDisplayName && application.legalBusinessName && application.addressLine && application.city && application.state && application.pinCode);
  const agreementComplete = Boolean(application.agreementAcceptedAt && application.hasSignature);
  const panStatus = checklistStatus(documentStatus(application, 'PAN'));
  const bankStatus = checklistStatus(documentStatus(application, 'BANK_PROOF'));
  const gstStatus = application.gstStatus === 'NOT_REGISTERED' ? { label: 'Not applicable', tone: 'success' } : checklistStatus(documentStatus(application, 'GSTIN'));
  const agreementStatus = agreementComplete ? { label: 'Signed', tone: 'success' } : { label: 'Incomplete', tone: 'warning' };
  const attentionProducts = products.filter((item) => item.action === 'FIX').slice(0, 3);

  return <div className="approved-onboarding">
    <div className="approved-onboarding-heading">
      <div><div className="onboarding-eyebrow">VOYA PARTNER WORKSPACE</div><h2>Onboarding &amp; Readiness</h2><p>Keep your legal profile, payout account and marketplace readiness healthy.</p></div>
      <Badge value="VERIFIED VENDOR" />
    </div>

    <div className="approved-kpi-grid">
      <div className="approved-kpi-card"><div className="approved-kpi-top"><Badge value="VERIFIED" /><span>Business identity &amp; compliance</span></div><strong>Vendor verification</strong><div className="approved-progress"><i style={{ width: `${application.status === 'APPROVED' ? 100 : 0}%` }} /></div><b>{application.status === 'APPROVED' ? '100% complete' : 'Needs attention'}</b></div>
      <div className="approved-kpi-card"><div className="approved-kpi-top"><Badge value={`${readinessScore}%`} /><span>Products, rates, policies &amp; inventory</span></div><strong>Marketplace readiness</strong><div className="approved-progress"><i style={{ width: `${Math.min(100, Math.max(0, readinessScore))}%` }} /></div><b>{actionsRemaining ? `${actionsRemaining} action${actionsRemaining === 1 ? '' : 's'} remaining` : 'Ready for marketplace'}</b></div>
      <div className="approved-kpi-card"><div className="approved-kpi-top"><Badge value={documentHealth.current === documentHealth.total ? 'CURRENT' : 'ATTENTION'} /><span>{documentHealth.current} / {documentHealth.total} current</span></div><strong>Document health</strong><div className="approved-progress"><i style={{ width: `${documentHealth.total ? (documentHealth.current / documentHealth.total) * 100 : 0}%` }} /></div><b>{documentHealth.current === documentHealth.total ? 'All required documents current' : 'Review document status below'}</b></div>
    </div>

    <div className="approved-content-grid">
      <section className="approved-panel"><div className="approved-panel-head"><h3>Verification checklist</h3><span>{application.legalBusinessName || application.businessDisplayName || data.profile?.legalBusinessName || 'Vendor account'}</span></div><div className="approved-checklist">
        <div className="approved-check-row"><b>Business profile</b><span className="approved-check-status success">{profileComplete ? 'Verified' : 'Incomplete'}</span><span>—</span></div>
        <div className="approved-check-row"><b>GST / PAN</b><span className={`approved-check-status ${panStatus.tone}`}>{panStatus.label}</span><span>{application.gstStatus === 'NOT_REGISTERED' ? 'GST not applicable' : `${documentLabels.GSTIN}: ${gstStatus.label}`}</span></div>
        <div className="approved-check-row"><b>Bank proof</b><span className={`approved-check-status ${bankStatus.tone}`}>{bankStatus.label}</span><span>{application.bankVerificationStatus?.replaceAll('_', ' ') || 'Pending verification'}</span></div>
        <div className="approved-check-row"><b>Partner agreement</b><span className={`approved-check-status ${agreementStatus.tone}`}>{agreementStatus.label}</span><span>{application.authorizedRepresentative || 'Authorized representative'}</span></div>
      </div></section>
      <section className="approved-panel"><div className="approved-panel-head"><h3>What blocks go-live?</h3><span>{actionsRemaining ? `${actionsRemaining} action${actionsRemaining === 1 ? '' : 's'}` : 'Ready'}</span></div><div className="approved-blockers">
        {blockers.map((item) => <div className="approved-blocker" key={item.label}><i className={item.complete ? 'complete' : 'attention'}>{item.complete ? '✓' : '!'}</i><span>{item.label}</span></div>)}
        {attentionProducts.map((item) => <div className="approved-blocker" key={item.id}><i className="attention">!</i><span>{item.experienceName}: needs attention</span></div>)}
        {!attentionProducts.length && !actionsRemaining && <div className="approved-blocker"><i className="complete">✓</i><span>Your account is ready for marketplace operations.</span></div>}
      </div><div className="approved-product-summary"><span>{liveProducts} live</span><span>{reviewProducts} in review</span><span>{draftProducts} drafts</span><button className="btn small" onClick={() => onNavigate('products')}>Manage products</button></div></section>
    </div>

    <section className="approved-panel approved-documents-panel"><div className="approved-panel-head"><div><h3>Account summary</h3><span>Live information from your Voya account</span></div><button className="btn small" onClick={() => onNavigate('products')}>Continue to Products</button></div><div className="approved-summary-grid"><div><small>Business</small><b>{application.legalBusinessName || data.profile?.legalBusinessName || '—'}</b><span>{application.city || data.profile?.operatingCity || '—'}, {application.state || data.profile?.operatingRegion || '—'}</span></div><div><small>Contact</small><b>{[application.firstName, application.lastName].filter(Boolean).join(' ') || '—'}</b><span>{application.contactNumber || '—'}</span></div><div><small>Documents</small><b>{documentHealth.current} / {documentHealth.total} current</b><span>{requiredDocumentTypes.map((type) => documentLabels[type]).join(' · ')}</span></div></div></section>
  </div>;
}
