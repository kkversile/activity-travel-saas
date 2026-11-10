import { useEffect, useState, type FormEvent } from 'react';
import { api, distributionReasonLabel, type ImpersonationTarget } from '../api';
import AdminOnboardingReviewModal from '../components/AdminOnboardingReviewModal';

type ReasonModal = { kind: 'onboarding'; status: 'CHANGES_REQUESTED' | 'REJECTED' } | { kind: 'suspend' } | { kind: 'document'; versionId: string } | { kind: 'commercial'; requestId: string };

export default function AdminVendors({ canImpersonate = false, canCreateVendor = false, currentUserId, onViewProducts, onCreateActivity }: { canImpersonate?: boolean; canCreateVendor?: boolean; currentUserId?: string; onViewProducts?: (vendorId: string) => void; onCreateActivity?: (vendorId: string) => void }) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [viewing, setViewing] = useState<{ fileName: string; url: string; mimeType: string } | null>(null);
  const [reasonModal, setReasonModal] = useState<ReasonModal | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonBusy, setReasonBusy] = useState(false);
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'VERIFY' | 'SUSPENDED'>('ALL');
  const [error, setError] = useState('');
  const [documentActionError, setDocumentActionError] = useState('');
  const [verifyingDocumentId, setVerifyingDocumentId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ vendorName: '', ownerName: '', cityName: '', mobile: '', supplierType: 'DIRECT_OPERATOR', email: '', commercialModel: 'COMMISSIONABLE', commissionPercent: '18', accountManagerName: '' });
  const [createdInvite, setCreatedInvite] = useState<{ vendorName: string; email: string; sent: boolean } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetVendorOpen, setResetVendorOpen] = useState(false);
  const [resetVendorPassword, setResetVendorPassword] = useState('');
  const [resetVendorBusy, setResetVendorBusy] = useState(false);
  const [resettingVendorId, setResettingVendorId] = useState<string | null>(null);
  const [onboardingReviewOpen, setOnboardingReviewOpen] = useState(false);
  const [commercialEdit, setCommercialEdit] = useState(false);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialForm, setCommercialForm] = useState({ supplierModel: 'COMMISSIONABLE', commissionPercent: '18', reason: '' });
  const load = () => api.request<any[]>('/admin/vendors').then(setVendors).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function open(id: string) { try { const [vendor, application] = await Promise.all([api.request<any>('/admin/vendors/' + id), api.request<any>('/admin/vendors/' + id + '/onboarding')]); setSelected(vendor); setOnboarding(application.vendorOnboarding); } catch (e) { setError((e as Error).message); } }
  async function update(path: string, body: any) { try { await api.request(path, { method: 'PATCH', body: JSON.stringify(body) }); if (selected) await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function verifyDocument(versionId: string) {
    if (!selected || verifyingDocumentId) return;
    setError('');
    setDocumentActionError('');
    setVerifyingDocumentId(versionId);
    try {
      await api.request(`/admin/vendors/${selected.id}/documents/versions/${versionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'VERIFIED' }) });
      await open(selected.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setDocumentActionError((e as Error).message);
    } finally {
      setVerifyingDocumentId(null);
    }
  }
  async function rejectOnboardingDocument(versionId: string, reason: string): Promise<boolean> {
    if (!selected || verifyingDocumentId) return false;
    setDocumentActionError('');
    setVerifyingDocumentId(versionId);
    try {
      await api.request(`/admin/vendors/${selected.id}/documents/versions/${versionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', reason }) });
      await open(selected.id);
      await load();
      return true;
    } catch (e) {
      setDocumentActionError((e as Error).message);
      return false;
    } finally {
      setVerifyingDocumentId(null);
    }
  }
  function startCommercialEdit() { const model = selected?.commercialTerms?.model || selected?.vendorProfile?.defaultSupplierModel || 'COMMISSIONABLE'; setCommercialForm({ supplierModel: model === 'NET_RATE' ? 'NET_RATE' : 'COMMISSIONABLE', commissionPercent: selected?.commercialTerms?.commissionPercent == null ? String(selected?.ratePlanTerms?.commissionValues?.[0] ?? 18) : String(selected.commercialTerms.commissionPercent), reason: '' }); setCommercialEdit(true); }
  async function submitCommercialChange(event: FormEvent) { event.preventDefault(); if (!selected) return; setCommercialBusy(true); setError(''); try { await api.request(`/admin/vendors/${selected.id}/commercials`, { method: 'PATCH', body: JSON.stringify({ supplierModel: commercialForm.supplierModel, commissionPercent: commercialForm.supplierModel === 'COMMISSIONABLE' ? Number(commercialForm.commissionPercent) : undefined, reason: commercialForm.reason }) }); setCommercialEdit(false); await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } finally { setCommercialBusy(false); } }
  async function approveCommercialChange(requestId: string) { if (!selected) return; setCommercialBusy(true); setError(''); try { await api.request(`/admin/vendors/${selected.id}/commercials/${requestId}/approve`, { method: 'POST', body: JSON.stringify({}) }); await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } finally { setCommercialBusy(false); } }
  async function activateForAgents(productId: string) { try { await api.request(`/admin/distribution/products/${productId}/activate-agent`, { method: 'POST' }); if (selected) await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function reviewOnboarding(status: 'UNDER_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') { if (!selected) return; if (status === 'CHANGES_REQUESTED' || status === 'REJECTED') { setOnboardingReviewOpen(false); openReasonModal({ kind: 'onboarding', status }); return; } try { await api.request('/admin/vendors/' + selected.id + '/onboarding/review', { method: 'POST', body: JSON.stringify({ status, reason: '' }) }); setOnboardingReviewOpen(false); await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function reopenOnboarding() { if (!selected) return; try { await api.request('/admin/vendors/' + selected.id + '/onboarding/reopen', { method: 'POST' }); await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function loginAsVendor(vendor: any) {
    const target = vendor.users?.find((item: any) => item.active && item.id) as ImpersonationTarget | undefined;
    if (!target || !api.token) return;
    try {
      sessionStorage.setItem('voya_impersonation_original_token', api.token);
      const result = await api.request<{ accessToken: string }>('/auth/impersonation/start', { method: 'POST', body: JSON.stringify({ targetUserId: target.id, reason: 'Support session started from Vendors' }) });
      api.setToken(result.accessToken);
      window.location.assign(import.meta.env.BASE_URL);
    } catch (e) {
      sessionStorage.removeItem('voya_impersonation_original_token');
      setError((e as Error).message);
    }
  }
  async function createVendor(e: FormEvent) {
    e.preventDefault();
    setCreating(true); setError(''); setCreatedInvite(null);
    try {
      const result = await api.request<{ vendorName: string; email: string; inviteRequired: boolean }>('/admin/vendors', { method: 'POST', body: JSON.stringify({ ...createForm, commissionPercent: createForm.commercialModel === 'COMMISSIONABLE' ? Number(createForm.commissionPercent) : undefined }) });
      setCreatedInvite({ vendorName: result.vendorName, email: result.email, sent: false }); setCreateForm({ vendorName: '', ownerName: '', cityName: '', mobile: '', supplierType: 'DIRECT_OPERATOR', email: '', commercialModel: 'COMMISSIONABLE', commissionPercent: '18', accountManagerName: '' }); await load();
      try { await api.requestVendorEmailCode(result.email); setCreatedInvite({ vendorName: result.vendorName, email: result.email, sent: true }); }
      catch (inviteError) { setError(`Vendor created, but the activation email could not be sent: ${(inviteError as Error).message}`); }
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  }
  async function resendVendorInvite() {
    if (!createdInvite) return;
    setInviteBusy(true); setError('');
    try { await api.requestVendorEmailCode(createdInvite.email); setCreatedInvite({ ...createdInvite, sent: true }); }
    catch (e) { setError(`Vendor exists, but the activation email could not be sent: ${(e as Error).message}`); }
    finally { setInviteBusy(false); }
  }
  async function resetVendorPasswordForUser(e: FormEvent, userId: string) {
    e.preventDefault();
    setResetVendorBusy(true); setError('');
    try { await api.request(`/admin/users/${userId}/password`, { method: 'PATCH', body: JSON.stringify({ password: resetVendorPassword }) }); setResetVendorOpen(false); setResettingVendorId(null); setResetVendorPassword(''); }
    catch (error) { setError((error as Error).message); }
    finally { setResetVendorBusy(false); }
  }
  function openReasonModal(modal: ReasonModal) { setReasonText(''); setReasonModal(modal); }
  function closeReasonModal() { if (reasonBusy) return; setReasonModal(null); setReasonText(''); }
  function closeVendorDetail() { setSelected(null); setOnboarding(null); }
  async function submitReason() {
    if (!reasonModal || !reasonText.trim()) return;
    setReasonBusy(true); setError('');
    try {
      if (reasonModal.kind === 'onboarding' && selected) {
        await api.request('/admin/vendors/' + selected.id + '/onboarding/review', { method: 'POST', body: JSON.stringify({ status: reasonModal.status, reason: reasonText.trim() }) });
        await open(selected.id); await load();
      } else if (reasonModal.kind === 'suspend' && selected) {
        await api.request('/admin/vendors/' + selected.id + '/verification', { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED', reason: reasonText.trim() }) });
        await open(selected.id); await load();
      } else if (reasonModal.kind === 'document' && selected) {
        await api.request('/admin/vendors/' + selected.id + '/documents/versions/' + reasonModal.versionId, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', reason: reasonText.trim() }) });
        await open(selected.id); await load();
      } else if (reasonModal.kind === 'commercial' && selected) {
        await api.request(`/admin/vendors/${selected.id}/commercials/${reasonModal.requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason: reasonText.trim() }) });
        await open(selected.id); await load();
      }
      setReasonModal(null); setReasonText('');
    } catch (e) { setError((e as Error).message); } finally { setReasonBusy(false); }
  }
  function closeCreate() { setCreateOpen(false); setCreatedInvite(null); setCreateForm({ vendorName: '', ownerName: '', cityName: '', mobile: '', supplierType: 'DIRECT_OPERATOR', email: '', commercialModel: 'COMMISSIONABLE', commissionPercent: '18', accountManagerName: '' }); }
  async function preview(version: any) { try { const blob = await api.blob(`/files/${version.fileAsset.id}/content`); if (viewing) URL.revokeObjectURL(viewing.url); setViewing({ fileName: version.fileAsset.originalName, url: URL.createObjectURL(blob), mimeType: version.fileAsset.mimeType }); } catch (e) { setError((e as Error).message); } }
  function closePreview() { if (viewing) URL.revokeObjectURL(viewing.url); setViewing(null); }
  const normalizedQuery = q.trim().toLowerCase();
  const filtered = vendors.filter((v) => {
    const status = v.vendorProfile?.verificationStatus || 'PENDING';
    const statusMatches = statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && status === 'VERIFIED') ||
      (statusFilter === 'VERIFY' && status === 'PENDING') ||
      (statusFilter === 'SUSPENDED' && status === 'SUSPENDED');
    const searchText = [v.name, v.vendorProfile?.legalBusinessName, v.vendorProfile?.operatingCity, v.publicCode, v.slug, v.users?.[0]?.email]
      .filter(Boolean).join(' ').toLowerCase();
    return statusMatches && (!normalizedQuery || searchText.includes(normalizedQuery));
  });
  return <>
    <div className="admin-hero"><div><h2>Vendors</h2><p className="muted">Every supplier on the platform. Open one to verify KYC, set commercial terms, or act on their behalf.</p></div><div className="admin-toolbar"><button className="btn primary" onClick={() => { setError(''); setCreatedInvite(null); setCreateOpen(true); }}>Create vendor</button><button className="btn small" onClick={() => void load()}>Refresh</button></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="row admin-vendor-filters"><input className="search" style={{ maxWidth: 300 }} aria-label="Search vendor, city or ID" placeholder="Search vendor, city or ID" value={q} onChange={(e) => setQ(e.target.value)} /><div className="chips" aria-label="Vendor status">{([['ALL', 'All'], ['ACTIVE', 'Active'], ['VERIFY', 'In verification'], ['SUSPENDED', 'Suspended']] as const).map(([value, label]) => <button key={value} className={`chip ${statusFilter === value ? 'active' : ''}`} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>)}</div></div>
    <div className="panel admin-vendors-table"><div className="panel-head"><h3>{filtered.length} vendors</h3><span className="muted">Supplier verification, commercial readiness and live activity coverage</span></div><div className="table-wrap"><table><thead><tr><th>Vendor</th><th>City</th><th>Model</th><th className="right">Commission</th><th className="right">Live activities</th><th>KYC</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((vendor) => { const status = vendor.vendorProfile?.verificationStatus || 'PENDING'; const score = Number(vendor.vendorProfile?.readinessScore || 0); const modelLabel = vendor.commercialModel === 'MIXED' ? 'Mixed by rate plan' : vendor.commercialModel === 'COMMISSIONABLE' ? 'Commission' : vendor.commercialModel === 'NET_RATE' ? 'Net rate' : vendor.vendorProfile?.category || 'Not configured'; return <tr key={vendor.id}><td><strong>{vendor.vendorProfile?.legalBusinessName || vendor.name}</strong><small className="mono">{vendor.publicCode || vendor.slug}</small></td><td>{vendor.vendorProfile?.operatingCity || '—'}</td><td>{modelLabel}</td><td className="right">{vendor.commissionVaries ? 'Varies' : vendor.commissionPercent == null ? (vendor.commercialModel === 'NET_RATE' ? '—' : 'Not set') : `${Number(vendor.commissionPercent).toFixed(2)}%`}</td><td className="right">{vendor._count?.products || 0}</td><td>{status === 'VERIFIED' ? 'Verified' : `${score}% ready`}</td><td><span className={'badge ' + status.toLowerCase()}>{status}</span></td><td className="right"><button className="btn small" onClick={() => void open(vendor.id)}>Open</button><button className="btn small" onClick={() => onViewProducts?.(vendor.id)}>Products</button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty">No vendors match these filters.</div>}</div></div>
    {selected && <div className="modal-backdrop admin-vendor-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVendorDetail(); }}><div className="panel admin-detail admin-vendor-detail-modal" role="dialog" aria-modal="true" aria-labelledby="admin-vendor-detail-title"><div className="panel-head"><h3 id="admin-vendor-detail-title">{selected.vendorProfile?.legalBusinessName || selected.name}</h3><div className="status-actions"><span className="badge">{selected.vendorProfile?.verificationStatus}</span>{onCreateActivity && <button className="btn small primary" onClick={() => onCreateActivity(selected.id)}>Create activity for them</button>}<button type="button" className="btn small" onClick={closeVendorDetail}>Close</button></div></div><div className="panel-body"><p className="muted">{selected.vendorProfile?.operatingCity || 'City not set'} · {selected.users?.[0]?.email}</p><dl className="admin-agreement-fields"><div><dt>Supplier type</dt><dd>{(selected.vendorProfile?.supplierType || '—').replaceAll('_', ' ')}</dd></div><div><dt>Voucher prefix</dt><dd className="mono">{selected.vendorProfile?.voucherShortCode || '—'}</dd></div><div><dt>Owner</dt><dd>{selected.users?.find((item: any) => item.active)?.fullName || '—'}</dd></div><div><dt>Mobile</dt><dd>{selected.vendorProfile?.registrationMobile || '—'}</dd></div><div><dt>Account manager</dt><dd>{selected.vendorProfile?.accountManagerName || '—'}</dd></div></dl><div className="status-actions"><button className="btn small" onClick={() => void update(`/admin/vendors/${selected.id}/verification`, { status: 'PENDING', reason: 'Admin requested reverification' })}>Unverify vendor</button><button className="btn small primary" onClick={() => void update(`/admin/vendors/${selected.id}/verification`, { status: 'VERIFIED' })}>Approve vendor</button><button className="btn small" onClick={() => openReasonModal({ kind: 'suspend' })}>Suspend</button>{canImpersonate && selected.users?.find((item: any) => item.active && item.id) && <button className="btn small" onClick={() => void loginAsVendor(selected)}>Login as vendor</button>}</div>
        <h4>Last 30 days</h4><div className="form-grid five admin-vendor-metrics"><div><small className="muted">Bookings</small><strong>{selected.metrics?.bookings ?? '—'}</strong></div><div><small className="muted">GMV</small><strong>{selected.metrics?.gmv == null ? '—' : `₹${Number(selected.metrics.gmv).toLocaleString('en-IN')}`}</strong></div><div><small className="muted">Acceptance rate (on-request)</small><strong>{selected.metrics?.acceptanceRate == null ? '—' : `${selected.metrics.acceptanceRate}%`}</strong></div><div><small className="muted">Cancellations by vendor</small><strong>{selected.metrics?.cancellationsByVendor == null ? '—' : `${selected.metrics.cancellationsByVendor}%`}</strong><small className="muted">{selected.metrics?.cancellationsByVendorCount ?? 0} in period</small></div><div><small className="muted">Rating</small><strong>{selected.metrics?.rating == null ? '—' : selected.metrics.rating}</strong><small className="muted">{selected.metrics?.ratingAvailable ? `${selected.metrics.ratingCount} reviews` : 'No review records'}</small></div></div><div className="panel-head"><h4>Commercial terms</h4><button className="btn small" onClick={startCommercialEdit}>Request change</button></div><div className="admin-agreement-fields"><div><dt>Model</dt><dd>{selected.commercialTerms?.model === 'MIXED' ? 'Varies by rate plan' : selected.commercialTerms?.model === 'COMMISSIONABLE' ? 'Commission on sell price' : selected.commercialTerms?.model === 'NET_RATE' ? 'Net rate' : 'Not configured'}</dd></div><div><dt>Commission</dt><dd>{selected.commercialTerms?.commissionPercent != null ? `${selected.commercialTerms.commissionPercent}%` : selected.commercialTerms?.commissionVaries ? 'Varies by rate plan' : selected.commercialTerms?.model === 'NET_RATE' ? 'Not applicable' : 'Not configured'}</dd></div><div><dt>Source</dt><dd>{selected.commercialTerms?.source || '—'}</dd></div></div>
        {selected.ratePlanTerms && <><h5>Effective active rate-plan terms</h5><div className="admin-agreement-fields"><div><dt>Models</dt><dd>{selected.ratePlanTerms.model === 'MIXED' ? 'Mixed by rate plan' : selected.ratePlanTerms.model === 'COMMISSIONABLE' ? 'Commission on sell price' : selected.ratePlanTerms.model === 'NET_RATE' ? 'Net rate' : 'Not specified'}</dd></div><div><dt>Commission</dt><dd>{selected.ratePlanTerms.commissionPercent != null ? `${selected.ratePlanTerms.commissionPercent}%` : selected.ratePlanTerms.commissionVaries ? 'Varies by rate plan' : selected.ratePlanTerms.model === 'NET_RATE' ? 'Not applicable' : 'Not specified'}</dd></div><div><dt>Source</dt><dd>{selected.ratePlanTerms.source}</dd></div></div></>}
        {commercialEdit && <form className="panel-body" onSubmit={(event) => void submitCommercialChange(event)}><div className="form-grid three"><label className="field"><span>Supplier model</span><select value={commercialForm.supplierModel} onChange={(event) => setCommercialForm((current) => ({ ...current, supplierModel: event.target.value }))}><option value="COMMISSIONABLE">Commissionable</option><option value="NET_RATE">Net rate</option></select></label><label className="field"><span>Commission %</span><input type="number" min="0" max="100" step="0.01" required={commercialForm.supplierModel === 'COMMISSIONABLE'} disabled={commercialForm.supplierModel === 'NET_RATE'} value={commercialForm.commissionPercent} onChange={(event) => setCommercialForm((current) => ({ ...current, commissionPercent: event.target.value }))} /></label><label className="field"><span>Reason for change *</span><input required minLength={5} value={commercialForm.reason} onChange={(event) => setCommercialForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Contract renewal, negotiated rate…" /></label></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setCommercialEdit(false)} disabled={commercialBusy}>Cancel</button><button className="btn primary" disabled={commercialBusy}>{commercialBusy ? 'Submitting…' : 'Submit for review'}</button></div></form>}
        {!!selected.vendorCommercialChangeRequests?.length && <><h4>Pending commercial review</h4>{selected.vendorCommercialChangeRequests.map((request: any) => { const isMaker = request.createdById === currentUserId; return <div className="admin-listing" key={request.id}><div><b>{request.proposedSupplierModel.replaceAll('_', ' ')}{request.proposedCommissionPercent == null ? '' : ` · ${Number(request.proposedCommissionPercent)}%`}</b><small>{request.requestReason}</small><small>Requested by {request.createdBy?.fullName || request.createdBy?.email || 'Admin'} · {new Date(request.createdAt).toLocaleString()}</small>{isMaker && <small className="muted">You submitted this request and cannot review it.</small>}</div><div className="status-actions"><button className="btn small primary" disabled={commercialBusy || isMaker} onClick={() => void approveCommercialChange(request.id)}>Approve</button><button className="btn small" disabled={commercialBusy || isMaker} onClick={() => openReasonModal({ kind: 'commercial', requestId: request.id })}>Reject</button></div></div>; })}</>}
        <h4>Onboarding application</h4>{onboarding ? <><div className="onboarding-admin-summary"><span className="badge">{onboarding.status.replaceAll('_', ' ')}</span><small>Step {onboarding.currentStep || 1} of 8 · Last updated {new Date(onboarding.updatedAt).toLocaleString()}</small>{onboarding.reviewReason && <small>Review note: {onboarding.reviewReason}</small>}</div><div className="status-actions"><button className="btn small primary" onClick={() => setOnboardingReviewOpen(true)}>Review full onboarding</button></div></> : <p className="muted">No onboarding application has been started.</p>}{canCreateVendor && selected.users?.find((item: any) => item.active && item.id) && <div className="admin-password-reset"><h4>Vendor access</h4><button className="btn small" onClick={() => { setResetVendorOpen(!resetVendorOpen); setResetVendorPassword(''); }}>{resetVendorOpen ? 'Cancel reset' : 'Reset password'}</button>{resetVendorOpen && <form className="form-grid three" onSubmit={(event) => { const target = selected.users?.find((item: any) => item.active && item.id); if (target) void resetVendorPasswordForUser(event, target.id); }}><label className="field"><span>New password</span><input required minLength={8} type="password" value={resetVendorPassword} onChange={(event) => setResetVendorPassword(event.target.value)} /></label><button className="btn primary" disabled={resetVendorBusy}>{resetVendorBusy ? 'Saving…' : 'Set new password'}</button></form>}</div>}
        <h4>Products ({selected.products?.length || 0})</h4>{selected.products?.map((p: any) => <div className="admin-listing" key={p.id}><div><b>{p.currentRevision?.productName || p.productCode}</b><span className="mono muted">{p.publicCode || p.productCode}</span><span className={'badge ' + p.status.toLowerCase().replace('_', '-')}>{p.status}</span><span className={'badge ' + (p.distribution?.ready ? 'verified' : 'pending')}>{p.distribution?.ready ? 'Agent ready' : 'Distribution pending'}</span><small>{p.variants?.reduce((n: number, v: any) => n + (v.ratePlans?.length || 0), 0) || 0} rate plans{p.distribution?.reasonCodes?.length ? ` · ${distributionReasonLabel[p.distribution.reasonCodes[0]] || p.distribution.reasonCodes[0].replaceAll('_', ' ')}` : ''}</small></div>{p.status === 'LIVE' && !p.distribution?.ready && <button className="btn small primary" onClick={() => void activateForAgents(p.id)}>Enable for Agents</button>}</div>)}
      </div></div></div>}
    {canCreateVendor && createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><div className="modal-card vendor-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-vendor-title"><div className="panel-head"><div><h3 id="create-vendor-title">Create a vendor</h3><p className="muted">Use this for suppliers you sign offline. We’ll email the owner a code to set their password and access the completed vendor profile.</p></div><button type="button" className="modal-close" onClick={closeCreate} aria-label="Close">×</button></div><div className="panel-body"><form onSubmit={(event) => void createVendor(event)}><div className="form-grid three">
      <label className="field"><span>Legal name</span><input required minLength={2} value={createForm.vendorName} onChange={(event) => setCreateForm((current) => ({ ...current, vendorName: event.target.value }))} placeholder="Konkan Kayak Co." /></label>
      <label className="field"><span>Supplier type</span><select value={createForm.supplierType} onChange={(event) => setCreateForm((current) => ({ ...current, supplierType: event.target.value }))}><option value="DIRECT_OPERATOR">Direct operator</option><option value="ATTRACTION_VENUE">Attraction / venue</option><option value="AGGREGATOR_DMC">Aggregator / DMC</option><option value="GOVERNMENT_BODY">Government body</option></select></label>
      <label className="field"><span>Main city</span><input required minLength={2} value={createForm.cityName} onChange={(event) => setCreateForm((current) => ({ ...current, cityName: event.target.value }))} placeholder="Malvan" /></label>
      <label className="field"><span>Owner name</span><input required minLength={2} value={createForm.ownerName} onChange={(event) => setCreateForm((current) => ({ ...current, ownerName: event.target.value }))} placeholder="Rahul Sawant" /></label>
      <label className="field"><span>Email</span><input required type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} placeholder="owner@example.com" /></label>
      <label className="field"><span>Mobile</span><input required type="tel" value={createForm.mobile} onChange={(event) => setCreateForm((current) => ({ ...current, mobile: event.target.value }))} placeholder="+91 94220 18833" /></label>
      <label className="field"><span>Commercial model</span><select value={createForm.commercialModel} onChange={(event) => setCreateForm((current) => ({ ...current, commercialModel: event.target.value }))}><option value="COMMISSIONABLE">Commission on sell price</option><option value="NET_RATE">Net rate</option></select></label>
      <label className="field"><span>Commission %</span><input type="number" min="0" max="100" step="0.01" disabled={createForm.commercialModel === 'NET_RATE'} value={createForm.commissionPercent} onChange={(event) => setCreateForm((current) => ({ ...current, commissionPercent: event.target.value }))} /></label>
      <label className="field"><span>Account manager</span><input value={createForm.accountManagerName} onChange={(event) => setCreateForm((current) => ({ ...current, accountManagerName: event.target.value }))} placeholder="Assigned staff member" /></label>
      </div><div className="modal-actions"><button type="button" className="btn" onClick={closeCreate}>Cancel</button><button className="btn primary" disabled={creating}>{creating ? 'Creating…' : 'Create & send invite'}</button></div></form>{createdInvite && <div className={`alert ${createdInvite.sent ? 'success' : 'info'} vendor-credentials`}><b>{createdInvite.sent ? 'Vendor created and activation email sent.' : 'Vendor account created.'}</b><span>{createdInvite.vendorName} · {createdInvite.email}</span><span>The vendor sets their password with the emailed code on the sign-in page.</span>{!createdInvite.sent && <button type="button" className="btn small" disabled={inviteBusy} onClick={() => void resendVendorInvite()}>{inviteBusy ? 'Sending…' : 'Send invite again'}</button>}</div>}</div></div></div>}
    {viewing && <div className={`doc-preview-backdrop${onboardingReviewOpen ? ' admin-onboarding-document-preview' : ''}`} onClick={closePreview}><div className="doc-preview" onClick={(e) => e.stopPropagation()}><div className="panel-head"><h3>{viewing.fileName}</h3><span className="doc-preview-actions"><a className="btn small" href={viewing.url} target="_blank" rel="noreferrer">Open in new tab</a><a className="btn small" href={viewing.url} download={viewing.fileName}>Download</a><button className="btn small" onClick={closePreview}>Close</button></span></div>{viewing.mimeType === 'application/pdf' ? <iframe title={viewing.fileName} src={viewing.url} /> : <img alt={viewing.fileName} src={viewing.url} />}</div></div>}
    {onboardingReviewOpen && onboarding && selected && <AdminOnboardingReviewModal application={onboarding} vendorName={selected.vendorProfile?.legalBusinessName || selected.name || 'Vendor'} onClose={() => setOnboardingReviewOpen(false)} onReview={reviewOnboarding} onReopen={() => { setOnboardingReviewOpen(false); void reopenOnboarding(); }} documentActions={{ onView: (fileAssetId, fileName, mimeType) => void preview({ fileAsset: { id: fileAssetId, originalName: fileName, mimeType } }), onVerify: (versionId) => void verifyDocument(versionId), onReject: rejectOnboardingDocument, verifyingVersionId: verifyingDocumentId, error: documentActionError }} />}
    {reasonModal && (
      <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReasonModal(); }}>
        <div className="modal-card reason-modal" role="dialog" aria-modal="true" aria-labelledby="reason-modal-title">
          <div className="panel-head">
            <div>
              <h3 id="reason-modal-title">{reasonModal.kind === 'document' ? 'Reject document' : reasonModal.kind === 'suspend' ? 'Suspend vendor' : reasonModal.kind === 'commercial' ? 'Reject commercial change' : reasonModal.status === 'REJECTED' ? 'Reject onboarding' : 'Request onboarding corrections'}</h3>
              <p className="muted">Enter a reason. This will be saved with the decision.</p>
            </div>
            <button type="button" className="modal-close" onClick={closeReasonModal} aria-label="Close">×</button>
          </div>
          <div className="panel-body">
            <label className="field"><span>Reason *</span><textarea autoFocus value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder="Explain what needs attention" /></label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={closeReasonModal} disabled={reasonBusy}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void submitReason()} disabled={reasonBusy || !reasonText.trim()}>{reasonBusy ? 'Saving…' : 'Save reason'}</button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>;
}
