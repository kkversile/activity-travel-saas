import { useEffect, useState, type FormEvent } from 'react';
import { api, distributionReasonLabel, type ImpersonationTarget } from '../api';

const docs = [['GSTIN', 'GSTIN certificate'], ['PAN', 'PAN card'], ['BANK_PROOF', 'Cancelled cheque / bank proof']] as const;
type ReasonModal = { kind: 'onboarding'; status: 'CHANGES_REQUESTED' | 'REJECTED' } | { kind: 'suspend' } | { kind: 'document'; versionId: string };

export default function AdminVendors({ canImpersonate = false, canCreateVendor = false }: { canImpersonate?: boolean; canCreateVendor?: boolean }) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [viewing, setViewing] = useState<{ fileName: string; url: string; mimeType: string } | null>(null);
  const [reasonModal, setReasonModal] = useState<ReasonModal | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonBusy, setReasonBusy] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [vendorPassword, setVendorPassword] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ vendorName: string; email: string; temporaryPassword: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetVendorOpen, setResetVendorOpen] = useState(false);
  const [resetVendorPassword, setResetVendorPassword] = useState('');
  const [resetVendorBusy, setResetVendorBusy] = useState(false);
  const [resettingVendorId, setResettingVendorId] = useState<string | null>(null);
  const load = () => api.request<any[]>('/admin/vendors').then(setVendors).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function open(id: string) { try { const [vendor, application] = await Promise.all([api.request<any>('/admin/vendors/' + id), api.request<any>('/admin/vendors/' + id + '/onboarding')]); setSelected(vendor); setOnboarding(application.vendorOnboarding); } catch (e) { setError((e as Error).message); } }
  async function update(path: string, body: any) { try { await api.request(path, { method: 'PATCH', body: JSON.stringify(body) }); if (selected) await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function activateForAgents(productId: string) { try { await api.request(`/admin/distribution/products/${productId}/activate-agent`, { method: 'POST' }); if (selected) await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function reviewOnboarding(status: 'UNDER_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') { if (!selected) return; if (status === 'CHANGES_REQUESTED' || status === 'REJECTED') { openReasonModal({ kind: 'onboarding', status }); return; } try { await api.request('/admin/vendors/' + selected.id + '/onboarding/review', { method: 'POST', body: JSON.stringify({ status, reason: '' }) }); await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
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
    setCreating(true); setError(''); setCreatedCredentials(null);
    try {
      const result = await api.request<{ vendorName: string; email: string; temporaryPassword: string }>('/admin/vendors', { method: 'POST', body: JSON.stringify({ vendorName, email: vendorEmail, password: vendorPassword }) });
      setCreatedCredentials(result); setVendorName(''); setVendorEmail(''); setVendorPassword(''); await load();
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
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
      }
      setReasonModal(null); setReasonText('');
    } catch (e) { setError((e as Error).message); } finally { setReasonBusy(false); }
  }
  function closeCreate() { setCreateOpen(false); setCreatedCredentials(null); setVendorName(''); setVendorEmail(''); setVendorPassword(''); }
  async function copyCredentials() { if (!createdCredentials) return; await navigator.clipboard.writeText(`Voya vendor access\nVendor: ${createdCredentials.vendorName}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.temporaryPassword}`); }
  async function preview(version: any) { try { const blob = await api.blob(`/files/${version.fileAsset.id}/content`); if (viewing) URL.revokeObjectURL(viewing.url); setViewing({ fileName: version.fileAsset.originalName, url: URL.createObjectURL(blob), mimeType: version.fileAsset.mimeType }); } catch (e) { setError((e as Error).message); } }
  function closePreview() { if (viewing) URL.revokeObjectURL(viewing.url); setViewing(null); }
  const filtered = vendors.filter((v) => (v.name + ' ' + (v.vendorProfile?.legalBusinessName || '') + ' ' + v.users?.[0]?.email).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="admin-hero"><div><h2>Vendors</h2><p className="muted">All vendor tenants and onboarding status.</p></div><div className="admin-toolbar"><input className="search" placeholder="Search vendors..." value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn primary" onClick={() => { setError(''); setCreatedCredentials(null); setCreateOpen(true); }}>Create vendor</button><button className="btn small" onClick={() => void load()}>Refresh</button></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="admin-columns">
      <div className="panel admin-vendor-list"><div className="panel-head"><h3>{filtered.length} vendors</h3></div>{filtered.map((v) => { const target = v.users?.find((item: any) => item.active && item.id); const resetOpen = resettingVendorId === target?.id; return <div className={'admin-vendor-row ' + (selected?.id === v.id ? 'selected' : '')} key={v.id} role="button" tabIndex={0} onClick={() => void open(v.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void open(v.id); }}><span className="avatar">{(v.name?.[0] || 'V').toUpperCase()}</span><span><b>{v.vendorProfile?.legalBusinessName || v.name}</b><small>{v.users?.[0]?.email || v.slug}</small></span><span className={'badge ' + (v.vendorProfile?.verificationStatus || 'pending').toLowerCase()}>{v.vendorProfile?.verificationStatus || 'PENDING'}</span>{canImpersonate && <><button className="btn small" disabled={!target} onClick={(e) => { e.stopPropagation(); void loginAsVendor(v); }}>Login as</button><button className="btn small" disabled={!target} onClick={(e) => { e.stopPropagation(); setResettingVendorId(resetOpen ? null : target?.id || null); setResetVendorPassword(''); }}>{resetOpen ? 'Cancel reset' : 'Reset password'}</button></>}{canImpersonate && target && resetOpen && <form className="form-grid three" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void resetVendorPasswordForUser(e, target.id)}><label className="field"><span>New password</span><input required minLength={8} type="password" value={resetVendorPassword} onChange={(e) => setResetVendorPassword(e.target.value)} /></label><button className="btn primary" disabled={resetVendorBusy}>{resetVendorBusy ? 'Saving…' : 'Set new password'}</button></form>}</div>; })}</div>
      {selected && <div className="panel admin-detail"><div className="panel-head"><h3>{selected.vendorProfile?.legalBusinessName || selected.name}</h3><span className="badge">{selected.vendorProfile?.verificationStatus}</span></div><div className="panel-body"><p className="muted">{selected.vendorProfile?.operatingCity || 'City not set'} · {selected.users?.[0]?.email}</p><div className="status-actions"><button className="btn small primary" onClick={() => void update(`/admin/vendors/${selected.id}/verification`, { status: 'VERIFIED' })}>Approve vendor</button><button className="btn small" onClick={() => openReasonModal({ kind: 'suspend' })}>Suspend</button>{canImpersonate && selected.users?.find((item: any) => item.active && item.id) && <button className="btn small" onClick={() => void loginAsVendor(selected)}>Login as vendor</button>}</div>
        <h4>Onboarding application</h4>{onboarding ? <><div className="onboarding-admin-summary"><span className="badge">{onboarding.status.replaceAll('_', ' ')}</span><small>Last updated {new Date(onboarding.updatedAt).toLocaleString()}</small>{onboarding.reviewReason && <small>Review note: {onboarding.reviewReason}</small>}</div><div className="status-actions"><button className="btn small" disabled={onboarding.status === 'APPROVED'} onClick={() => void reviewOnboarding('UNDER_REVIEW')}>Mark under review</button><button className="btn small primary" disabled={onboarding.status === 'APPROVED'} onClick={() => void reviewOnboarding('APPROVED')}>Approve application</button><button className="btn small" disabled={onboarding.status === 'APPROVED'} onClick={() => void reviewOnboarding('CHANGES_REQUESTED')}>Request corrections</button><button className="btn small" disabled={onboarding.status === 'APPROVED'} onClick={() => void reviewOnboarding('REJECTED')}>Reject</button>{canImpersonate && <button className="btn small" disabled={!['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'].includes(onboarding.status)} onClick={() => void reopenOnboarding()}>{onboarding.status === 'REJECTED' ? 'Revoke rejection' : 'Return to draft'}</button>}</div></> : <p className="muted">No onboarding application has been started.</p>}{canCreateVendor && selected.users?.find((item: any) => item.active && item.id) && <div className="admin-password-reset"><h4>Vendor access</h4><button className="btn small" onClick={() => { setResetVendorOpen(!resetVendorOpen); setResetVendorPassword(''); }}>{resetVendorOpen ? 'Cancel reset' : 'Reset password'}</button>{resetVendorOpen && <form className="form-grid three" onSubmit={(event) => { const target = selected.users?.find((item: any) => item.active && item.id); if (target) void resetVendorPasswordForUser(event, target.id); }}><label className="field"><span>New password</span><input required minLength={8} type="password" value={resetVendorPassword} onChange={(event) => setResetVendorPassword(event.target.value)} /></label><button className="btn primary" disabled={resetVendorBusy}>{resetVendorBusy ? 'Saving…' : 'Set new password'}</button></form>}</div>} <h4>Documents</h4>
        {docs.map(([type, label]) => { const d = selected.vendorDocuments?.find((item: any) => item.type === type); const version = d?.versions?.[0]; const gstNotApplicable = type === 'GSTIN' && onboarding?.gstStatus === 'NOT_REGISTERED'; return <div className="admin-doc" key={type}><span><b>{label}</b><small>{gstNotApplicable ? 'Not applicable' : `${version?.fileAsset?.originalName || 'Not uploaded'} · ${version?.status || d?.currentStatus || 'PENDING'}${version?.rejectionReason ? ` · ${version.rejectionReason}` : ''}`}</small></span><span><button className="btn small" disabled={!version || gstNotApplicable} onClick={() => version && void preview(version)}>View</button><button className="btn small" disabled={!version || gstNotApplicable} onClick={() => version && void update(`/admin/vendors/${selected.id}/documents/versions/${version.id}`, { status: 'VERIFIED' })}>Verify</button><button className="btn small" disabled={!version || gstNotApplicable} onClick={() => version && openReasonModal({ kind: 'document', versionId: version.id })}>Reject</button></span></div>; })}
        <h4>Agreement &amp; signature</h4>
        <div className="admin-agreement-review">
          <div className="admin-agreement-meta">
            <span className={'badge ' + (onboarding?.agreementAcceptedAt ? 'verified' : 'pending')}>{onboarding?.agreementAcceptedAt ? 'Accepted' : 'Not accepted'}</span>
            <small>{onboarding?.agreementVersion || 'Draft agreement'}</small>
            {onboarding?.agreementAcceptedAt && <small>Accepted {new Date(onboarding.agreementAcceptedAt).toLocaleString()}</small>}
          </div>
          <dl className="admin-agreement-fields">
            <div><dt>Authorized business</dt><dd>{onboarding?.authorizedBusinessName || 'Not provided'}</dd></div>
            <div><dt>Authorized representative</dt><dd>{onboarding?.authorizedRepresentative || 'Not provided'}</dd></div>
          </dl>
          <div className="admin-signature-preview">
            <b>Signed agreement</b>
            {onboarding?.signatureData ? <img src={onboarding.signatureData} alt="Vendor signature" /> : <span className="muted">No signature drawn or uploaded.</span>}
            <small>{onboarding?.signatureData ? 'Drawn or uploaded signature' : 'Signature required before submission'}</small>
          </div>
        </div>
        <h4>Products ({selected.products?.length || 0})</h4>{selected.products?.map((p: any) => <div className="admin-listing" key={p.id}><div><b>{p.currentRevision?.productName || p.productCode}</b><span className={'badge ' + p.status.toLowerCase().replace('_', '-')}>{p.status}</span><span className={'badge ' + (p.distribution?.ready ? 'verified' : 'pending')}>{p.distribution?.ready ? 'Agent ready' : 'Distribution pending'}</span><small>{p.variants?.reduce((n: number, v: any) => n + (v.ratePlans?.length || 0), 0) || 0} rate plans{p.distribution?.reasonCodes?.length ? ` · ${distributionReasonLabel[p.distribution.reasonCodes[0]] || p.distribution.reasonCodes[0].replaceAll('_', ' ')}` : ''}</small></div>{p.status === 'LIVE' && !p.distribution?.ready && <button className="btn small primary" onClick={() => void activateForAgents(p.id)}>Enable for Agents</button>}</div>)}
      </div></div>}
    </div>
    {canCreateVendor && createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><div className="modal-card vendor-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-vendor-title"><div className="panel-head"><div><h3 id="create-vendor-title">Create vendor access</h3><p className="muted">Create a vendor login and share the initial password securely.</p></div><button type="button" className="modal-close" onClick={closeCreate} aria-label="Close">×</button></div><div className="panel-body"><form onSubmit={(event) => void createVendor(event)}><div className="form-grid three"><label className="field"><span>Vendor / business name</span><input required minLength={2} value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Demo Adventures" /></label><label className="field"><span>Vendor email</span><input required type="email" value={vendorEmail} onChange={(event) => setVendorEmail(event.target.value)} placeholder="vendor@example.com" /></label><label className="field"><span>Initial password</span><input required minLength={8} type="text" value={vendorPassword} onChange={(event) => setVendorPassword(event.target.value)} placeholder="At least 8 characters" /></label></div><div className="modal-actions"><button type="button" className="btn" onClick={closeCreate}>Cancel</button><button className="btn primary" disabled={creating}>{creating ? 'Creating…' : 'Create vendor'}</button></div></form>{createdCredentials && <div className="alert success vendor-credentials"><b>Vendor created. Share these credentials securely:</b><span>Email: {createdCredentials.email}</span><span>Password: {createdCredentials.temporaryPassword}</span><button type="button" className="btn small" onClick={() => void copyCredentials()}>Copy credentials</button></div>}</div></div></div>}
    {viewing && <div className="doc-preview-backdrop" onClick={closePreview}><div className="doc-preview" onClick={(e) => e.stopPropagation()}><div className="panel-head"><h3>{viewing.fileName}</h3><span className="doc-preview-actions"><a className="btn small" href={viewing.url} target="_blank" rel="noreferrer">Open in new tab</a><a className="btn small" href={viewing.url} download={viewing.fileName}>Download</a><button className="btn small" onClick={closePreview}>Close</button></span></div>{viewing.mimeType === 'application/pdf' ? <iframe title={viewing.fileName} src={viewing.url} /> : <img alt={viewing.fileName} src={viewing.url} />}</div></div>}
    {reasonModal && (
      <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReasonModal(); }}>
        <div className="modal-card reason-modal" role="dialog" aria-modal="true" aria-labelledby="reason-modal-title">
          <div className="panel-head">
            <div>
              <h3 id="reason-modal-title">{reasonModal.kind === 'document' ? 'Reject document' : reasonModal.kind === 'suspend' ? 'Suspend vendor' : reasonModal.status === 'REJECTED' ? 'Reject onboarding' : 'Request onboarding corrections'}</h3>
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
