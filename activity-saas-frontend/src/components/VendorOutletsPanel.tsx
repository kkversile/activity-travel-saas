import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Panel } from './Ui';

type Outlet = { id: string; outletCode: string; name: string; location?: string | null; status: 'ACTIVE' | 'INACTIVE'; isDefault: boolean; bankAccountId?: string | null; bankAccount?: { id: string; bankName: string; accountNumberMasked: string; verificationStatus: string } | null };
type Bank = { id: string; bankName: string; accountNumberMasked: string; ifsc: string; accountHolder: string; verificationStatus: string; active: boolean };
type Member = { id: string; email: string; fullName?: string | null; organizationRole?: string | null; outletAccess: Array<{ outletId: string; active: boolean }> };
type Team = { members: Member[] };

export default function VendorOutletsPanel() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [team, setTeam] = useState<Team>({ members: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newOutlet, setNewOutlet] = useState({ outletCode: '', name: '', location: '' });
  const [bankForm, setBankForm] = useState({ accountNumber: '', bankName: '', ifsc: '', accountHolder: '', accountType: 'CURRENT', currency: 'INR' });
  const [bankProof, setBankProof] = useState<File | null>(null); const [editing, setEditing] = useState<Outlet | null>(null); const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [outletData, bankData, teamData] = await Promise.all([
        api.request<{ outlets: Outlet[] }>('/vendor/outlets'),
        api.request<{ items: Bank[] }>('/vendor/bank-accounts'),
        api.request<Team>('/vendor/team'),
      ]);
      setOutlets(outletData.outlets); setBanks(bankData.items); setTeam(teamData);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => { void load(); }, []);

  async function submitOutlet(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await api.request('/vendor/outlets', { method: 'POST', body: JSON.stringify(newOutlet) }); setNewOutlet({ outletCode: '', name: '', location: '' }); setNotice('Outlet created.'); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function submitBank(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { if (!bankProof) throw new Error('Upload bank proof for review.'); const data = new FormData(); data.append('file', bankProof); const proof = await api.request<{fileAssetId: string}>('/vendor/documents/bankProof', { method: 'POST', body: data }); await api.request('/vendor/bank-accounts', { method: 'POST', body: JSON.stringify({ ...bankForm, proofDocumentId: proof.fileAssetId }) }); setBankProof(null); setBankForm({ accountNumber: '', bankName: '', ifsc: '', accountHolder: '', accountType: 'CURRENT', currency: 'INR' }); setNotice('Bank account submitted for verification.'); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function assignBank(outlet: Outlet, bankAccountId: string) {
    setError(''); setNotice('');
    try { await api.request(`/vendor/outlets/${outlet.id}/bank-account`, { method: 'PATCH', body: JSON.stringify({ bankAccountId: bankAccountId || null }) }); setNotice(`Bank account updated for ${outlet.name}.`); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function updateMemberOutlet(member: Member, outlet: Outlet, active: boolean) {
    setError('');
    try { await api.request(`/vendor/outlets/${outlet.id}/members/${member.id}`, { method: 'PUT', body: JSON.stringify({ active }) }); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function setOutletStatus(outlet: Outlet) {
    setError('');
    try { await api.request(`/vendor/outlets/${outlet.id}`, { method: 'PATCH', body: JSON.stringify({ status: outlet.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function saveOutlet(event: React.FormEvent) { event.preventDefault(); if (!editing) return; setBusy(true); try { await api.request(`/vendor/outlets/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name, location: editing.location || null }) }); setEditing(null); await load(); window.dispatchEvent(new Event('voya:outlets-changed')); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  return <section className="vendor-outlets-settings">
    <header className="partner-page-header"><div><h2>Outlets and payout accounts</h2><p>Manage operating locations, verified beneficiary accounts, and employee outlet access.</p></div></header>
    {error && <ErrorBox error={error} />}{notice && <div className="alert success" role="status">{notice}</div>}
    <div className="partner-dashboard-grid">
      <Panel title="Add an outlet"><form className="partner-form-grid" onSubmit={(event) => void submitOutlet(event)}>
        <label><span>Outlet code</span><input required minLength={2} maxLength={24} value={newOutlet.outletCode} onChange={(event) => setNewOutlet({ ...newOutlet, outletCode: event.target.value.toUpperCase() })} placeholder="KOCHI" /></label>
        <label><span>Outlet name</span><input required value={newOutlet.name} onChange={(event) => setNewOutlet({ ...newOutlet, name: event.target.value })} placeholder="Kochi Operations" /></label>
        <label><span>Location</span><input value={newOutlet.location} onChange={(event) => setNewOutlet({ ...newOutlet, location: event.target.value })} placeholder="City or address" /></label>
        <button className="btn primary" disabled={busy}>Add outlet</button>
      </form></Panel>
      <Panel title="Add a bank account"><p className="muted">Account numbers are encrypted and masked after submission. New accounts need admin verification before an outlet can use them for payout.</p><form className="partner-form-grid" onSubmit={(event) => void submitBank(event)}>
        <label><span>Bank name</span><input required value={bankForm.bankName} onChange={(event) => setBankForm({ ...bankForm, bankName: event.target.value })} /></label>
        <label><span>Account holder</span><input required value={bankForm.accountHolder} onChange={(event) => setBankForm({ ...bankForm, accountHolder: event.target.value })} /></label>
        <label><span>Account number</span><input required autoComplete="off" value={bankForm.accountNumber} onChange={(event) => setBankForm({ ...bankForm, accountNumber: event.target.value })} /></label>
        <label><span>IFSC</span><input required value={bankForm.ifsc} onChange={(event) => setBankForm({ ...bankForm, ifsc: event.target.value.toUpperCase() })} /></label>
        <label><span>Account type</span><select value={bankForm.accountType} onChange={(event) => setBankForm({ ...bankForm, accountType: event.target.value })}><option value="CURRENT">Current</option><option value="SAVINGS">Savings</option><option value="OTHER">Other</option></select></label>
        <label><span>Currency</span><input required maxLength={3} value={bankForm.currency} onChange={(event) => setBankForm({ ...bankForm, currency: event.target.value.toUpperCase() })} /></label>
        <label><span>Bank proof</span><input type="file" required accept="application/pdf,image/png,image/jpeg" onChange={(event) => setBankProof(event.target.files?.[0] || null)} /></label><button className="btn primary" disabled={busy}>Submit for verification</button>
      </form></Panel>
    </div>
    {editing && <Panel title="Edit outlet"><form onSubmit={(event) => void saveOutlet(event)} className="partner-form-grid"><label>Name<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label><label>Location<input value={editing.location || ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></label><button className="btn primary" disabled={busy}>Save outlet</button><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button></form></Panel>}
    <Panel title="Outlet payout accounts"><div className="table-wrap"><table><thead><tr><th>Outlet</th><th>Status</th><th>Verified bank account</th><th /></tr></thead><tbody>{outlets.map((outlet) => <tr key={outlet.id}><td>{outlet.name} <span className="muted">({outlet.outletCode}{outlet.isDefault ? ', default' : ''})</span></td><td>{outlet.status}</td><td><select aria-label={`Bank account for ${outlet.name}`} value={outlet.bankAccountId || ''} onChange={(event) => void assignBank(outlet, event.target.value)}><option value="">No account assigned</option>{banks.filter((bank) => bank.active && bank.verificationStatus === 'VERIFIED').map((bank) => <option key={bank.id} value={bank.id}>{bank.bankName} · {bank.accountNumberMasked} · {bank.ifsc}</option>)}</select><div className="muted">{outlet.bankAccount ? `${outlet.bankAccount.bankName} · ${outlet.bankAccount.accountNumberMasked}` : 'Unassigned'}</div></td><td><button className="btn small" type="button" onClick={() => setEditing(outlet)}>Edit outlet</button><button className="btn small" type="button" onClick={() => void setOutletStatus(outlet)}>{outlet.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div></Panel>
    <Panel title="Employee outlet access"><p className="muted">Employees can access only the outlets selected here. Owners automatically have workspace wide access.</p><div className="table-wrap"><table><thead><tr><th>Team member</th>{outlets.map((outlet) => <th key={outlet.id}>{outlet.name}</th>)}</tr></thead><tbody>{team.members.filter((member) => member.organizationRole !== 'OWNER').map((member) => <tr key={member.id}><td>{member.fullName || member.email}</td>{outlets.map((outlet) => <td key={outlet.id}><input type="checkbox" aria-label={`${outlet.name} access for ${member.email}`} checked={member.outletAccess.some((grant) => grant.outletId === outlet.id && grant.active)} disabled={outlet.status !== 'ACTIVE'} onChange={(event) => void updateMemberOutlet(member, outlet, event.target.checked)} /></td>)}</tr>)}</tbody></table></div></Panel>
  </section>;
}
