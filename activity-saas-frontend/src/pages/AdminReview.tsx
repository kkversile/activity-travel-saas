import { useEffect, useState } from 'react';
import { api } from '../api';
export default function AdminReview(){
 const [items,setItems]=useState<any[]>([]); const [error,setError]=useState('');
 const load=()=>api.request<any[]>('/admin/activities/review').then(setItems).catch(e=>setError((e as Error).message));
 useEffect(()=>{void load();},[]);
 async function act(id:string,action:'publish'|'reject'){try{await api.request(`/admin/activities/${id}/${action}`,{method:'POST'});void load();}catch(e){setError((e as Error).message)}}
 return <><div className="admin-hero"><div><h2>Activity review queue</h2><p className="muted">Approve catalogue submissions before they become visible to customers.</p></div><span className="badge pending">{items.length} awaiting review</span></div>{error&&<div className="alert error">{error}</div>}<div className="panel"><div className="panel-body">{!items.length?<div className="empty">No draft or submitted activities are waiting for review.</div>:items.map(a=><div className="admin-review-row" key={a.id}><div><b>{a.productName}</b><small>{a.tenant?.vendorProfile?.legalBusinessName||a.tenant?.name} · {a.cityName}</small><small>{a.ratePlans?.length||0} rate plans configured</small></div><span className={'badge '+a.status.toLowerCase().replace('_','-')}>{a.status}</span><div className="status-actions"><button className="btn small primary" onClick={()=>act(a.id,'publish')}>Publish</button><button className="btn small" onClick={()=>act(a.id,'reject')}>Reject</button></div></div>)}</div></div></>;
}
