import { useEffect, useState } from 'react';
import { api } from '../api';

const docs = [['GSTIN', 'GSTIN certificate'], ['PAN', 'PAN card'], ['BANK_PROOF', 'Cancelled cheque / bank proof'], ['TRADE_LICENSE', 'Trade license']] as const;

export default function AdminVendors() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [viewing, setViewing] = useState<{ fileName: string; url: string; mimeType: string } | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = () => api.request<any[]>('/admin/vendors').then(setVendors).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function open(id: string) { try { setSelected(await api.request<any>('/admin/vendors/' + id)); } catch (e) { setError((e as Error).message); } }
  async function update(path: string, body: any) { try { await api.request(path, { method: 'PATCH', body: JSON.stringify(body) }); if (selected) await open(selected.id); await load(); } catch (e) { setError((e as Error).message); } }
  async function preview(version: any) { try { const blob = await api.blob(`/files/${version.fileAsset.id}/content`); if (viewing) URL.revokeObjectURL(viewing.url); setViewing({ fileName: version.fileAsset.originalName, url: URL.createObjectURL(blob), mimeType: version.fileAsset.mimeType }); } catch (e) { setError((e as Error).message); } }
  function closePreview() { if (viewing) URL.revokeObjectURL(viewing.url); setViewing(null); }
  const filtered = vendors.filter((v) => (v.name + ' ' + (v.vendorProfile?.legalBusinessName || '') + ' ' + v.users?.[0]?.email).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="admin-hero"><div><h2>Vendors</h2><p className="muted">All vendor tenants and onboarding status.</p></div><div className="admin-toolbar"><input className="search" placeholder="Search vendors..." value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn small" onClick={() => void load()}>Refresh</button></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="admin-columns">
      <div className="panel admin-vendor-list"><div className="panel-head"><h3>{filtered.length} vendors</h3></div>{filtered.map((v) => <button className={'admin-vendor-row ' + (selected?.id === v.id ? 'selected' : '')} key={v.id} onClick={() => void open(v.id)}><span className="avatar">{(v.name?.[0] || 'V').toUpperCase()}</span><span><b>{v.vendorProfile?.legalBusinessName || v.name}</b><small>{v.users?.[0]?.email || v.slug}</small></span><span className={'badge ' + (v.vendorProfile?.verificationStatus || 'pending').toLowerCase()}>{v.vendorProfile?.verificationStatus || 'PENDING'}</span></button>)}</div>
      {selected && <div className="panel admin-detail"><div className="panel-head"><h3>{selected.vendorProfile?.legalBusinessName || selected.name}</h3><span className="badge">{selected.vendorProfile?.verificationStatus}</span></div><div className="panel-body"><p className="muted">{selected.vendorProfile?.operatingCity || 'City not set'} · {selected.users?.[0]?.email}</p><div className="status-actions"><button className="btn small primary" onClick={() => void update(`/admin/vendors/${selected.id}/verification`, { status: 'VERIFIED' })}>Approve vendor</button><button className="btn small" onClick={() => { const reason = window.prompt('Reason for suspension (required)'); if (reason?.trim()) void update(`/admin/vendors/${selected.id}/verification`, { status: 'SUSPENDED', reason }); }}>Suspend</button></div>
        <h4>Documents</h4>
        {docs.map(([type, label]) => { const d = selected.vendorDocuments?.find((item: any) => item.type === type); const version = d?.versions?.[0]; return <div className="admin-doc" key={type}><span><b>{label}</b><small>{version?.fileAsset?.originalName || 'Not uploaded'} · {version?.status || d?.currentStatus || 'PENDING'}{version?.rejectionReason ? ` · ${version.rejectionReason}` : ''}</small></span><span><button className="btn small" disabled={!version} onClick={() => version && void preview(version)}>View</button><button className="btn small" disabled={!version} onClick={() => version && void update(`/admin/vendors/${selected.id}/documents/versions/${version.id}`, { status: 'VERIFIED' })}>Verify</button><button className="btn small" disabled={!version} onClick={() => { const reason = window.prompt('Reason for rejection (required)'); if (version && reason?.trim()) void update(`/admin/vendors/${selected.id}/documents/versions/${version.id}`, { status: 'REJECTED', reason }); }}>Reject</button></span></div>; })}
        <h4>Products ({selected.products?.length || 0})</h4>{selected.products?.map((p: any) => <div className="admin-listing" key={p.id}><b>{p.currentRevision?.productName || p.productCode}</b><span className={'badge ' + p.status.toLowerCase().replace('_', '-')}>{p.status}</span><small>{p.variants?.reduce((n: number, v: any) => n + (v.ratePlans?.length || 0), 0) || 0} rate plans</small></div>)}
      </div></div>}
    </div>
    {viewing && <div className="doc-preview-backdrop" onClick={closePreview}><div className="doc-preview" onClick={(e) => e.stopPropagation()}><div className="panel-head"><h3>{viewing.fileName}</h3><button className="btn small" onClick={closePreview}>Close</button></div>{viewing.mimeType === 'application/pdf' ? <iframe title={viewing.fileName} src={viewing.url} /> : <img alt={viewing.fileName} src={viewing.url} />}</div></div>}
  </>;
}
