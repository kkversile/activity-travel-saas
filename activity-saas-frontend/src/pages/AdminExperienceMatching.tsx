import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Field, Loading, Panel } from '../components/Ui';

type Product = {
  id: string;
  productCode: string;
  name: string;
  type: string;
  subType?: string;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
  destination: string;
  vendor: { id: string; name: string };
  status: string;
  experienceMasterId?: string | null;
};
type Suggestion = { id: string; confidence: number; fingerprint: string; source: Product; candidate: Product };
type Master = {
  id: string;
  canonicalName: string;
  displayMode: 'SINGLE_OFFER' | 'ALL_OFFERS';
  selectionPolicy: 'CHEAPEST' | 'BALANCED' | 'HIGHEST_COMMISSION' | 'ADMIN_SELECTED';
  products: Product[];
};

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const scoreFields = [
  { key: 'name', label: 'Product name', weight: 40 },
  { key: 'type', label: 'Type', weight: 15 },
  { key: 'cityName', label: 'City', weight: 15 },
  { key: 'stateName', label: 'State', weight: 15 },
  { key: 'countryName', label: 'Country', weight: 15 },
] as const;

export default function AdminExperienceMatching() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [vendorA, setVendorA] = useState('');
  const [vendorB, setVendorB] = useState('');
  const [selectedProductA, setSelectedProductA] = useState('');
  const [selectedProductB, setSelectedProductB] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    const [nextSuggestions, nextMasters, nextProducts, nextVendors] = await Promise.all([
      api.request<Suggestion[]>('/admin/experience-matching/suggestions'),
      api.request<Master[]>('/admin/experience-matching/masters'),
      api.request<any>('/admin/experience-matching/products?limit=100'),
      api.request<any[]>('/admin/vendors'),
    ]);
    setSuggestions(nextSuggestions);
    setMasters(nextMasters);
    setProducts(nextProducts.items || []);
    setVendors(nextVendors);
  };

  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, []);

  const filteredProducts = (searchText: string, vendorId: string, excludeId: string) => {
    const query = searchText.trim().toLowerCase();
    return products.filter((item) => {
      if (item.id === excludeId) return false;
      if (vendorId && item.vendor.id !== vendorId) return false;
      if (!query) return true;
      return `${item.name} ${item.productCode} ${item.vendor.name} ${item.destination}`.toLowerCase().includes(query);
    });
  };

  const productA = products.find((item) => item.id === selectedProductA);
  const productB = products.find((item) => item.id === selectedProductB);
  const differentVendors = Boolean(productA && productB && productA.vendor.id !== productB.vendor.id);
  const pairReady = Boolean(productA && productB && differentVendors);
  const matchScore = useMemo(() => {
    if (!productA || !productB) return null;
    const fields = scoreFields.map((field) => ({ ...field, matched: normalize(productA[field.key]) === normalize(productB[field.key]) && Boolean(normalize(productA[field.key])) }));
    return { score: fields.reduce((total, field) => total + (field.matched ? field.weight : 0), 0), fields };
  }, [productA, productB]);
  const productsA = useMemo(() => filteredProducts(searchA, vendorA, selectedProductB), [products, searchA, vendorA, selectedProductB]);
  const productsB = useMemo(() => filteredProducts(searchB, vendorB, selectedProductA), [products, searchB, vendorB, selectedProductA]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function accept(suggestion: Suggestion) {
    await run(async () => {
      const created = await api.request<Master>('/admin/experience-matching/masters', { method: 'POST', body: JSON.stringify({ productId: suggestion.source.id, canonicalName: suggestion.source.name }) });
      await api.request(`/admin/experience-matching/masters/${created.id}/products`, { method: 'POST', body: JSON.stringify({ productId: suggestion.candidate.id, reason: 'Accepted exact cross-vendor match' }) });
      setNotice(`Created a new experience master for ${suggestion.source.name} and linked both products.`);
    });
  }

  async function reject(id: string) { await run(async () => { await api.request(`/admin/experience-matching/suggestions/${id}/reject`, { method: 'POST', body: '{}' }); }); }

  async function createMasterAndLinkPair() {
    if (!productA || !productB || !differentVendors) return;
    await run(async () => {
      const created = await api.request<Master>('/admin/experience-matching/masters', { method: 'POST', body: JSON.stringify({ productId: productA.id, canonicalName: productA.name }) });
      await api.request(`/admin/experience-matching/masters/${created.id}/products`, { method: 'POST', body: JSON.stringify({ productId: productB.id, reason: 'Manually confirmed cross-vendor match' }) });
      setSelectedProductA(''); setSelectedProductB('');
      setNotice(`Created a new experience master “${created.canonicalName}” with exactly these two vendor products.`);
    });
  }

  async function updateMaster(master: Master, patch: Record<string, string>) { await run(async () => { await api.request(`/admin/experience-matching/masters/${master.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); }); }
  const vendorOptions = vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorProfile?.legalBusinessName || vendor.name}</option>);

  return <div className="experience-matching-page">
    <div className="admin-hero"><div><h2>Experience Matching</h2><p className="muted">Create one agent-facing experience master for each confirmed pair of vendor products.</p></div></div>
    {error && <ErrorBox error={error} />}{notice && <div className="alert info">{notice}</div>}
    <Panel title="Possible same experiences"><p className="muted">Suggestions use an exact normalized match of product name, type, city, state and country, and only compare different vendors. Nothing is linked automatically.</p>{suggestions.length ? <div className="matching-suggestion-list">{suggestions.map((item) => <div className="matching-suggestion" key={item.id}><div><b>{item.source.name}</b><small>{item.source.vendor.name} · {item.source.destination}</small></div><span className="matching-arrow">↔</span><div><b>{item.candidate.name}</b><small>{item.candidate.vendor.name} · {item.candidate.destination}</small></div><span className="matching-confidence">{item.confidence}% match</span><div className="row-actions"><button className="btn primary small" disabled={busy} onClick={() => void accept(item)}>Create master</button><button className="btn small" disabled={busy} onClick={() => void reject(item.id)}>Not the same</button></div></div>)}</div> : <div className="empty">No new cross-vendor exact matches found.</div>}</Panel>
    <Panel title="Create experience master from two products"><p className="muted">Select exactly one product from each vendor. Each pair creates a separate experience master, so the next pair can create another master.</p>
      <div className="matching-pair-grid">
        <div className="matching-pair-card"><h3>Product A</h3><div className="form-grid two"><Field label="Vendor A"><select value={vendorA} onChange={(e) => { setVendorA(e.target.value); setSelectedProductA(''); }}><option value="">Select vendor</option>{vendorOptions}</select></Field><Field label="Search Product A"><input value={searchA} onChange={(e) => setSearchA(e.target.value)} placeholder="Name or product code" /></Field></div><div className="matching-product-picker matching-product-picker-single">{productsA.map((item) => <button type="button" className={`matching-product-option ${selectedProductA === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedProductA(item.id)}><b>{item.name}</b><small>{item.vendor.name} · {item.destination}</small>{item.experienceMasterId && <em>Already linked to an experience master</em>}</button>)}</div>{productA && <div className="matching-selected-product"><b>Selected:</b> {productA.name} · {productA.vendor.name}</div>}</div>
        <div className="matching-pair-card"><h3>Product B</h3><div className="form-grid two"><Field label="Vendor B"><select value={vendorB} onChange={(e) => { setVendorB(e.target.value); setSelectedProductB(''); }}><option value="">Select vendor</option>{vendorOptions}</select></Field><Field label="Search Product B"><input value={searchB} onChange={(e) => setSearchB(e.target.value)} placeholder="Name or product code" /></Field></div><div className="matching-product-picker matching-product-picker-single">{productsB.map((item) => <button type="button" className={`matching-product-option ${selectedProductB === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedProductB(item.id)}><b>{item.name}</b><small>{item.vendor.name} · {item.destination}</small>{item.experienceMasterId && <em>Already linked to an experience master</em>}</button>)}</div>{productB && <div className="matching-selected-product"><b>Selected:</b> {productB.name} · {productB.vendor.name}</div>}</div>
      </div>
      {productA && productB && !differentVendors && <div className="alert warning">Select products from two different vendors. Linking two products from the same vendor is not allowed.</div>}
      {pairReady && matchScore && <div className={`matching-score-card ${matchScore.score >= 80 ? 'strong' : matchScore.score >= 50 ? 'possible' : 'weak'}`}><div><h3>Pair match score: {matchScore.score}%</h3><p>Score is advisory; the admin confirms whether this pair is the same real-world experience.</p></div><div className="matching-score-fields">{matchScore.fields.map((field) => <span className={field.matched ? 'matched' : 'unmatched'} key={field.key}>{field.matched ? '✓' : '×'} {field.label} ({field.weight}%)</span>)}</div></div>}
      <div className="experience-footer-actions"><button className="btn primary" disabled={busy || !pairReady} onClick={() => void createMasterAndLinkPair()}>Create new master and link pair</button></div>
    </Panel>
    <Panel title="Linked experience masters"><p className="muted">One master is the agent-facing identity. Each linked product remains vendor-owned and keeps its own commercial and operational data.</p>{masters.length ? <div className="matching-master-list">{masters.map((master) => <div className="matching-master" key={master.id}><div className="matching-master-heading"><div><h3>{master.canonicalName}</h3><small>{master.products.length} vendor offer{master.products.length === 1 ? '' : 's'}</small></div><div className="form-grid two matching-settings"><Field label="Agent display"><select value={master.displayMode} onChange={(e) => void updateMaster(master, { displayMode: e.target.value })}><option value="SINGLE_OFFER">Show one offer</option><option value="ALL_OFFERS">Show all offers</option></select></Field><Field label="Selection policy"><select value={master.selectionPolicy} onChange={(e) => void updateMaster(master, { selectionPolicy: e.target.value })}><option value="CHEAPEST">Cheapest</option><option value="BALANCED">Balanced</option><option value="HIGHEST_COMMISSION">Highest internal commission</option><option value="ADMIN_SELECTED">Admin selected</option></select></Field></div></div><div className="matching-offers">{master.products.map((product) => <span key={product.id}>{product.vendor.name}: {product.name}</span>)}</div></div>)}</div> : <div className="empty">No experience masters yet. Accept a suggestion or create one manually.</div>}</Panel>
    {busy && <Loading text="Updating experience matching…" />}
  </div>;
}
