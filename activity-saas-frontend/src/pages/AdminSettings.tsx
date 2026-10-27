import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, Panel, Toggle } from '../components/Ui';

type VisitorPricingSettings = {
  showEligibilityBasis: boolean;
  showVerificationRequired: boolean;
  updatedAt?: string | null;
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<VisitorPricingSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.request<VisitorPricingSettings>('/admin/settings/visitor-pricing')
      .then(setSettings)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  async function save(next: Partial<VisitorPricingSettings>) {
    if (!settings) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      setSettings(await api.request<VisitorPricingSettings>('/admin/settings/visitor-pricing', { method: 'PATCH', body: JSON.stringify(next) }));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!settings && !error) return <Loading text="Loading platform settings…" />;
  return <>
    <div className="admin-hero"><div><h2>Platform settings</h2><p className="muted">Control optional visitor-pricing fields shown to vendors.</p></div></div>
    {error && <ErrorBox error={error} />}
    {settings && <Panel title="Visitor pricing display"><p className="muted">These settings apply globally to all vendor product forms. Hidden fields continue using their saved/default values in the pricing payload.</p><Toggle checked={settings.showEligibilityBasis} onChange={(value) => { setSettings({ ...settings, showEligibilityBasis: value }); void save({ showEligibilityBasis: value }); }} label="Show Eligibility basis" sub="When enabled, vendors can choose nationality or residency for visitor pricing." /><Toggle checked={settings.showVerificationRequired} onChange={(value) => { setSettings({ ...settings, showVerificationRequired: value }); void save({ showVerificationRequired: value }); }} label="Show Verification required" sub="When enabled, vendors can choose how visitor eligibility is verified." />{busy && <p className="muted">Saving…</p>}{saved && !busy && <p className="success-text">Settings saved.</p>}</Panel>}
  </>;
}
