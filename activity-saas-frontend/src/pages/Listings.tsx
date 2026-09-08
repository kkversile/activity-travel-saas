import { useEffect, useMemo, useState } from 'react';
import { api, type Activity } from '../api';
import { Badge, ErrorBox, Loading, money } from '../components/Ui';
import ActivityEditor from './ActivityEditor';

export default function Listings() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState<Activity | null | undefined>(undefined);

  async function load() { setLoading(true); try { setRows(await api.request<Activity[]>('/activities')); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => rows.filter((r) => (filter === 'ALL' || r.status === filter) && r.productName.toLowerCase().includes(search.toLowerCase())), [rows, filter, search]);
  if (editing !== undefined) return <ActivityEditor activity={editing} onDone={() => setEditing(undefined)} onSaved={(saved) => { setRows((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]); setEditing(saved); }} />;
  if (error) return <ErrorBox error={error} />;
  if (loading) return <Loading />;

  return <>
    <div className="listing-tabs"><button className="listing-tab active">My Listings</button><button className="listing-tab" onClick={() => setEditing(null)}>+ Add / Edit Activity</button></div>
    <div className="toolbar"><input className="search" placeholder="Search your listings…" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="chips">{[['ALL','All'],['LIVE','Live'],['UNDER_REVIEW','Under Review'],['DRAFT','Draft']].map(([value,label]) => <button className={`chip ${filter === value ? 'active' : ''}`} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><button className="btn accent" onClick={() => setEditing(null)}>+ New Listing</button></div>
    <div className="listing-list">{filtered.map((a) => <button className="listing-card" key={a.id} onClick={() => setEditing(a)}><div className="listing-thumb"><span>{a.type.slice(0,1)}</span></div><div className="listing-info"><b>{a.productName}</b><small>{a.cityName} · {a.subCategory || a.type} · {a.subType} · {a.starRating ? `${a.starRating}★` : 'Unrated'}</small></div><Badge value={a.status} /><div className="listing-price">{a.ratePlans?.[0] ? money(a.ratePlans[0].basePrice) : 'No rate'}<small>{a.ratePlans?.[0]?.name || 'Add rate plan'}</small></div></button>)}</div>
    {filtered.length === 0 && <div className="empty">No listings match this filter.</div>}
  </>;
}
