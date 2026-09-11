import { useEffect, useMemo, useState } from 'react';
import { api, type Product } from '../api';
import { Badge, ErrorBox, Loading, Panel } from '../components/Ui';
import ProductBuilder from './ProductBuilder';

export default function Products() {
  const [rows, setRows] = useState<Product[]>([]); const [selected, setSelected] = useState<Product | null | undefined>(undefined); const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); try { setRows(await api.request<Product[]>('/products')); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => rows.filter((p) => `${p.productCode} ${p.currentRevision?.productName || ''}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  if (selected !== undefined) return <ProductBuilder product={selected} onDone={() => setSelected(undefined)} onChanged={() => { void load(); }} />;
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} />;
  return <><div className="listing-tabs"><button className="listing-tab active">Products</button><button className="listing-tab" onClick={() => setSelected(null)}>+ New Product</button></div><div className="toolbar"><input className="search" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} /><button className="btn accent" onClick={() => setSelected(null)}>+ New Product</button></div><Panel><div className="listing-list">{filtered.map((p) => <button className="listing-card" key={p.id} onClick={() => setSelected(p)}><div className="listing-thumb"><span>{p.currentRevision?.type?.slice(0, 1) || 'P'}</span></div><div className="listing-info"><b>{p.currentRevision?.productName || 'Untitled product'}</b><small>{p.productCode} · {p.currentRevision?.cityName || 'Location pending'} · {p._count?.variants || 0} variants</small></div><Badge value={p.status} /><div className="listing-price"><b>{p.currentRevision ? `v${p.currentRevision.versionNumber}` : 'No revision'}</b><small>{p.revisions?.[0]?.status || 'Draft'}</small></div></button>)}</div>{!filtered.length && <div className="empty">No products match this search.</div>}</Panel></>;
}
