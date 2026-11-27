import { useState } from 'react';
import type { VendorOutlet } from '../api';

export default function ProductOutletPrompt({ outlets, onSelect }: { outlets: VendorOutlet[]; onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState('');
  const available = outlets.filter(outlet => outlet.status === 'ACTIVE');
  const valid = available.some(outlet => outlet.id === selected);
  return <section className="partner-product-outlet-prompt" aria-labelledby="product-outlet-title">
    <h1 id="product-outlet-title">Choose an outlet to create a product</h1>
    <p>Your product, prices and availability will belong to this outlet. Choose it before entering the experience details.</p>
    {available.length ? <>
      <label className="field"><span>Outlet for new product</span><select value={valid ? selected : ''} onChange={event => setSelected(event.target.value)}>
        <option value="">Choose an outlet</option>
        {available.map(outlet => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
      </select></label>
      <button type="button" className="btn primary" disabled={!valid} onClick={() => { if (valid) onSelect(selected); }}>Continue to product details</button>
    </> : <p role="status">No active outlet is available. Ask your account owner to activate or assign an outlet before creating a product.</p>}
  </section>;
}
