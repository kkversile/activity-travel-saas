import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, Panel, Toggle } from '../components/Ui';

type VisitorPricingSettings = {
  showEligibilityBasis: boolean;
  showVerificationRequired: boolean;
  updatedAt?: string | null;
};

type ActivityContentSettings = {
  terms: string[];
  howToRedeem: string[];
  bookingQuestions: Array<{ code: string; label: string; type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'; required: boolean }>;
};

export default function AdminSettings() {
  const [settings, setSettings] = useState<VisitorPricingSettings | null>(null);
  const [content, setContent] = useState<ActivityContentSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.request<VisitorPricingSettings>('/admin/settings/visitor-pricing'),
      api.request<ActivityContentSettings>('/admin/settings/activity-content'),
    ]).then(([visitor, activityContent]) => { setSettings(visitor); setContent(activityContent); })
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

  async function saveContent() {
    if (!content) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const savedContent = await api.request<ActivityContentSettings>('/admin/settings/activity-content', { method: 'PATCH', body: JSON.stringify(content) });
      setContent(savedContent); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }

  function updateQuestion(index: number, key: string, value: string | boolean) {
    if (!content) return;
    const bookingQuestions = content.bookingQuestions.map((question, questionIndex) => questionIndex === index ? { ...question, [key]: value } : question);
    setContent({ ...content, bookingQuestions });
  }

  if ((!settings || !content) && !error) return <Loading text="Loading platform settings…" />;
  return <>
    <div className="admin-hero"><div><h2>Platform settings</h2><p className="muted">Control optional visitor-pricing fields shown to vendors.</p></div></div>
    {error && <ErrorBox error={error} />}
    {settings && <Panel title="Visitor pricing display"><p className="muted">These settings apply globally to all vendor product forms. Hidden fields continue using their saved/default values in the pricing payload.</p><Toggle checked={settings.showEligibilityBasis} onChange={(value) => { setSettings({ ...settings, showEligibilityBasis: value }); void save({ showEligibilityBasis: value }); }} label="Show Eligibility basis" sub="When enabled, vendors can choose nationality or residency for visitor pricing." /><Toggle checked={settings.showVerificationRequired} onChange={(value) => { setSettings({ ...settings, showVerificationRequired: value }); void save({ showVerificationRequired: value }); }} label="Show Verification required" sub="When enabled, vendors can choose how visitor eligibility is verified." />{busy && <p className="muted">Saving…</p>}{saved && !busy && <p className="success-text">Settings saved.</p>}</Panel>}
    {content && <Panel title="Activity content defaults"><p className="muted">These defaults are used when AI or the supplier does not provide generic customer-facing content. Vendors can still edit them per activity.</p><label className="field-label">Generic terms and conditions<textarea rows={4} value={content.terms.join('\n')} onChange={(event) => setContent({ ...content, terms: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} /></label><label className="field-label">Generic how to redeem<textarea rows={4} value={content.howToRedeem.join('\n')} onChange={(event) => setContent({ ...content, howToRedeem: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} /></label><h4>Generic booking questions</h4><p className="muted">One row per default: code, label, type, required.</p>{content.bookingQuestions.map((question, index) => <div className="experience-form-grid four" key={`${question.code}-${index}`}><input value={question.code} onChange={(event) => updateQuestion(index, 'code', event.target.value)} placeholder="lead_name" /><input value={question.label} onChange={(event) => updateQuestion(index, 'label', event.target.value)} placeholder="Lead traveller name" /><select value={question.type} onChange={(event) => updateQuestion(index, 'type', event.target.value)}><option>TEXT</option><option>NUMBER</option><option>BOOLEAN</option><option>SELECT</option></select><label className="wizard-check"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, 'required', event.target.checked)} /> Required</label></div>)}<button type="button" className="btn primary" onClick={() => void saveContent()} disabled={busy}>Save activity defaults</button>{saved && !busy && <p className="success-text">Settings saved.</p>}</Panel>}
  </>;
}
