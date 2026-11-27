import { useEffect, useId, useState } from 'react';
import './destinations.css';
import { api } from '../../api';
import { DEFAULT_PRODUCT_DESTINATIONS, locationToken, type ProductDestination } from '../../../../activity-saas-backend/src/common/product-entry-contract';
import type { RevisionForm } from './types';

function DestinationSelect({ label, value, values, disabled, onChange }: { label:string; value:string; values:string[]; disabled:boolean; onChange:(value:string)=>void }) {
  const id = useId(), [query,setQuery] = useState(value), [open,setOpen] = useState(false), [active,setActive] = useState(0);
  useEffect(() => setQuery(value), [value]);
  const options = values.filter(item => locationToken(item).includes(locationToken(query))).sort((a,b)=>{
    const rank=(value:string)=>locationToken(value)===locationToken(query)?0:locationToken(value).startsWith(locationToken(query))?1:2;
    return rank(a)-rank(b)||a.localeCompare(b);
  }).slice(0,50);
  function choose(next:string) { onChange(next); setQuery(next); setOpen(false); setActive(0); }
  return <div className="field destination-select"><label htmlFor={id}>{label}</label><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined} autoComplete="off" value={query} disabled={disabled} placeholder={`Search ${label.replace(' *','').toLowerCase()}`} onFocus={() => { setQuery(''); setOpen(true); setActive(0); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} onBlur={() => { setOpen(false); setQuery(value); }} onKeyDown={event => { if (event.key==='Escape') { setOpen(false); setQuery(value); } if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => options.length ? (index + (event.key==='ArrowDown'?1:-1) + options.length)%options.length : 0); } if (event.key==='Enter' && open) { event.preventDefault(); if(options[active]) choose(options[active]); } }} />{open && <ul className="destination-options" id={`${id}-options`} role="listbox" aria-label={`${label} choices`}>{options.map((item,index)=><li key={item} role="option" aria-selected={index===active} id={`${id}-${index}`}><button type="button" tabIndex={-1} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}>{item}</button></li>)}{!options.length && <li>No matching destination. Ask your administrator to add it in Configuration.</li>}</ul>}</div>;
}

export default function DestinationPicker({ form, locked, onChange }: { form:RevisionForm; locked:boolean; onChange:<K extends keyof RevisionForm>(key:K,value:RevisionForm[K])=>void }) {
  const [destinations,setDestinations] = useState<ProductDestination[]>(DEFAULT_PRODUCT_DESTINATIONS), [error,setError] = useState('');
  useEffect(()=>{ let current=true; void api.request<{destinations:ProductDestination[]}>('/product-entry/reference').then(result=>{if(!Array.isArray(result?.destinations))throw new Error('Missing destination reference');if(current) setDestinations(result.destinations);}).catch(()=>{if(current) setError('The latest destination list could not be loaded. Standard destinations are available; reload to retry.');});return()=>{current=false;}; },[]);
  const countries=[...new Set(destinations.map(row=>row.country))].sort();
  const states=[...new Set(destinations.filter(row=>row.country===form.countryName).map(row=>row.state))].sort();
  const cities=[...new Set(destinations.filter(row=>row.country===form.countryName && row.state===form.stateName).map(row=>row.city))].sort();
  // Keep an unchanged historical value visible without making it a choice for other destinations.
  const withExisting=(options:string[],value:string)=>value && !options.includes(value) ? [value,...options] : options;
  return <div className="form-full"><p className="experience-help">Destination: choose a country, then its state / region and city. Missing destinations can be added by an administrator in Configuration.</p>{error && <p role="status" className="experience-help">{error}</p>}<div className="experience-form-grid three">
    <DestinationSelect label="Country *" value={form.countryName} values={withExisting(countries,form.countryName)} disabled={locked} onChange={value=>{if(value!==form.countryName){onChange('countryName',value);onChange('stateName','');onChange('cityName','');}}} />
    <DestinationSelect label="State / region *" value={form.stateName} values={withExisting(states,form.stateName)} disabled={locked || !form.countryName} onChange={value=>{if(value!==form.stateName){onChange('stateName',value);onChange('cityName','');}}} />
    <DestinationSelect label="Destination city *" value={form.cityName} values={withExisting(cities,form.cityName)} disabled={locked || !form.countryName || !form.stateName} onChange={value=>onChange('cityName',value)} />
  </div></div>;
}
