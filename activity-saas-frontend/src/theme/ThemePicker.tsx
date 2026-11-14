import { createElement, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import 'shop-color-picker';
import type { ShopColorPicker as ShopColorPickerElement } from 'shop-color-picker';
import { api } from '../api';
import { Panel, ErrorBox } from '../components/Ui';
import { applyTheme, cacheTheme, contrastTextFor, defaultThemeColors, isThemeId, normalizeThemeColors, themes, type ThemeColors, type ThemeId } from './platformTheme';

type Appearance = { theme: ThemeId; colors: ThemeColors };
const colorFields: { key: keyof ThemeColors; label: string; shortLabel: string }[] = [
  { key: 'page', label: 'Page background', shortLabel: 'Page' },
  { key: 'surface', label: 'Panels and cards', shortLabel: 'Panels' },
  { key: 'raised', label: 'Panel and section headers', shortLabel: 'Panel headers' },
  { key: 'primary', label: 'Primary actions', shortLabel: 'Primary' },
  { key: 'accent', label: 'Accent highlights', shortLabel: 'Accent' },
];

function ColorEditor({ id, label, value, onChange, onClose }: { id: string; label: string; value: string; onChange: (color: string) => void; onClose: () => void }) {
  const pickerRef = useRef<ShopColorPickerElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [hex, setHex] = useState(value.toLowerCase());

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const picker = pickerRef.current;
    const dialog = dialogRef.current;
    if (!picker || !dialog) return;
    if (!dialog.open) dialog.showModal();
    picker.value = value;
    const handleChange = (event: Event) => {
      const next = (event.target as ShopColorPickerElement).value.toLowerCase();
      setHex(next);
      onChangeRef.current(next);
    };
    picker.addEventListener('change', handleChange);
    return () => {
      picker.removeEventListener('change', handleChange);
      if (dialog.open) dialog.close();
    };
  }, []);

  function updateHex(next: string) {
    setHex(next);
    if (/^#[\da-f]{6}$/i.test(next)) {
      const color = next.toLowerCase();
      if (pickerRef.current) pickerRef.current.value = color;
      onChange(color);
    }
  }

  const previewColor = /^#[\da-f]{6}$/i.test(hex) ? hex : value;
  return <dialog id={id} ref={dialogRef} className="theme-color-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="theme-color-editor-head">
      <div><strong id={`${id}-title`}>{label}</strong><span>Choose a color or enter its hex value.</span></div>
      <div className="theme-color-current" aria-label={`Selected color ${previewColor.toUpperCase()}`}><span style={{ backgroundColor: previewColor }} /><code>{previewColor.toUpperCase()}</code></div>
      <button type="button" className="theme-color-close" aria-label="Close color picker" onClick={onClose}>×</button>
    </div>
    {createElement('shop-color-picker', { ref: pickerRef, value, 'aria-label': `${label} color picker` })}
    <label className="theme-hex-field"><span>Hex</span><input aria-label={`${label} hex value`} value={hex} maxLength={7} spellCheck={false} onChange={event => updateHex(event.currentTarget.value)} onBlur={() => { if (!/^#[\da-f]{6}$/i.test(hex)) setHex(value.toLowerCase()); }} /></label>
  </dialog>;
}

export default function ThemePicker() {
  const savedRef = useRef<Appearance | null>(null);
  const [saved, setSaved] = useState<Appearance | null>(null);
  const [selected, setSelected] = useState<ThemeId>('voya-midnight');
  const [palettes, setPalettes] = useState<Record<ThemeId, ThemeColors>>({
    'voya-midnight': defaultThemeColors('voya-midnight'),
    'revspine-warm': defaultThemeColors('revspine-warm'),
    lagoon: defaultThemeColors('lagoon'),
    canopy: defaultThemeColors('canopy'),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeColor, setActiveColor] = useState<{ theme: ThemeId; key: keyof ThemeColors } | null>(null);
  const selectedColors = palettes[selected];
  const isThemeDirty = (theme: ThemeId) => !!saved && (theme !== saved.theme || colorFields.some(({ key }) => palettes[theme][key].toLowerCase() !== saved.colors[key].toLowerCase()));
  const dirty = isThemeDirty(selected);

  useEffect(() => {
    let mounted = true;
    api.request<Partial<Appearance>>('/admin/settings/appearance').then(data => {
      if (!mounted) return;
      const theme: ThemeId = isThemeId(data.theme) ? data.theme : 'voya-midnight';
      const colors = normalizeThemeColors(theme, data.colors);
      const appearance = { theme, colors };
      savedRef.current = appearance;
      setSaved(appearance);
      setSelected(theme);
      setPalettes(previous => ({ ...previous, [theme]: colors }));
      cacheTheme(theme, colors);
    }).catch(e => { if (mounted) setError(String(e.message || e)); });
    return () => {
      mounted = false;
      if (savedRef.current) applyTheme(savedRef.current.theme, savedRef.current.colors);
      window.dispatchEvent(new CustomEvent('voya-theme-preview', { detail: false }));
    };
  }, []);

  function preview(id: ThemeId, colors = palettes[id]) {
    setSelected(id);
    setNotice('');
    window.dispatchEvent(new CustomEvent('voya-theme-preview', { detail: true }));
    applyTheme(id, colors);
  }

  function chooseColor(id: ThemeId, key: keyof ThemeColors, color: string) {
    const next = { ...palettes[id], [key]: color };
    setPalettes(previous => ({ ...previous, [id]: next }));
    preview(id, next);
  }

  function toggleColorEditor(id: ThemeId, key: keyof ThemeColors) {
    if (selected !== id) preview(id);
    setActiveColor(current => current?.theme === id && current.key === key ? null : { theme: id, key });
  }

  async function save(themeId: ThemeId) {
    if (!isThemeDirty(themeId)) return;
    setBusy(true); setError('');
    try {
      const payload = { theme: themeId, ...palettes[themeId] };
      const data = await api.request<Partial<Appearance>>('/admin/settings/appearance', { method: 'PATCH', body: JSON.stringify(payload) });
      const theme: ThemeId = isThemeId(data.theme) ? data.theme : themeId;
      const colors = normalizeThemeColors(theme, data.colors || palettes[themeId]);
      const appearance = { theme, colors };
      savedRef.current = appearance;
      setSaved(appearance);
      setSelected(theme);
      setPalettes(previous => ({ ...previous, [theme]: colors }));
      cacheTheme(theme, colors);
      setActiveColor(null);
      window.dispatchEvent(new CustomEvent('voya-theme-preview', { detail: false }));
      setNotice('Colors saved for everyone. Open sessions update within 30 seconds or when refreshed.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function cancel() {
    if (!saved) return;
    setActiveColor(null);
    setSelected(saved.theme);
    setPalettes({ 'voya-midnight': defaultThemeColors('voya-midnight'), 'revspine-warm': defaultThemeColors('revspine-warm'), lagoon: defaultThemeColors('lagoon'), canopy: defaultThemeColors('canopy'), [saved.theme]: saved.colors });
    applyTheme(saved.theme, saved.colors);
    window.dispatchEvent(new CustomEvent('voya-theme-preview', { detail: false }));
    setNotice('Preview cancelled. Saved website colors restored.');
  }

  return <Panel title="Website appearance">
    <p className="muted">Choose a theme, then select a color swatch to edit it. Use <strong>Reset to default</strong> to restore that individual color. <strong>Panel headers</strong> controls title bars such as “Tiers &amp; default commission”; <strong>Panels</strong> controls the content area below them. Saved colors apply across admin, vendor, agent, login and registration pages.</p>
    {error && <ErrorBox error={error} />}
    <fieldset className="theme-options" disabled={!saved || busy}>
      <legend>Website theme</legend>
      {themes.map(theme => <section
        className={`theme-choice${selected === theme.id ? ' selected' : ''}`}
        key={theme.id}
        style={{ '--theme-choice-page': palettes[theme.id].page, '--theme-choice-page-text': contrastTextFor(palettes[theme.id].page), '--theme-choice-surface': palettes[theme.id].surface, '--theme-choice-surface-text': contrastTextFor(palettes[theme.id].surface), '--theme-choice-primary': palettes[theme.id].primary, '--theme-choice-primary-text': contrastTextFor(palettes[theme.id].primary), '--theme-choice-raised': palettes[theme.id].raised, '--theme-choice-raised-text': contrastTextFor(palettes[theme.id].raised) } as CSSProperties}
      >
        <div className="theme-choice-top">
          <label className="theme-choice-heading">
            <input type="radio" name="website-theme" value={theme.id} checked={selected === theme.id} onChange={() => { setActiveColor(null); preview(theme.id); }} />
            <strong>{theme.name}</strong>
          </label>
          <button type="button" className="btn primary theme-choice-apply" aria-label={`Apply ${theme.name} theme and colors`} disabled={!saved || busy || !isThemeDirty(theme.id)} onClick={() => void save(theme.id)}>{busy ? 'Saving…' : 'Apply'}</button>
        </div>
        <div className="theme-swatches">
          {colorFields.map(({ key, label }) => <div className="theme-swatch-item" key={key}>
            <button type="button" className={`theme-swatch${activeColor?.theme === theme.id && activeColor.key === key ? ' active' : ''}`} style={{ '--swatch-color': palettes[theme.id][key] } as CSSProperties} aria-label={`Edit ${theme.name} ${label}, ${palettes[theme.id][key]}`} aria-controls={`theme-color-editor-${theme.id}-${key}`} aria-expanded={activeColor?.theme === theme.id && activeColor.key === key} onClick={() => toggleColorEditor(theme.id, key)} />
            <span>{colorFields.find(field => field.key === key)!.shortLabel}</span>
            <code>{palettes[theme.id][key].toUpperCase()}</code>
            <button type="button" className="theme-swatch-reset" aria-label={`Reset ${theme.name} ${label} to default`} title={`Restore ${defaultThemeColors(theme.id)[key].toUpperCase()}`} onClick={() => chooseColor(theme.id, key, defaultThemeColors(theme.id)[key])}>Reset</button>
          </div>)}
        </div>
        <div className="theme-header-preview" aria-label={`Panel header color preview: ${palettes[theme.id].raised.toUpperCase()}`}>
          <small>Panel header preview</small>
          <strong>Tiers &amp; default commission</strong>
        </div>
        <p>{theme.description}</p>
      </section>)}
    </fieldset>
    {activeColor && <ColorEditor id={`theme-color-editor-${activeColor.theme}-${activeColor.key}`} key={`${activeColor.theme}-${activeColor.key}`} label={colorFields.find(field => field.key === activeColor.key)!.label} value={palettes[activeColor.theme][activeColor.key]} onChange={color => chooseColor(activeColor.theme, activeColor.key, color)} onClose={() => setActiveColor(null)} />}
    <div className="theme-actions">
      <button className="btn" disabled={!saved || busy || !dirty} onClick={cancel}>Cancel preview</button>
      <span role="status">{notice || (dirty ? 'Preview applies to this tab until you save.' : '')}</span>
    </div>
  </Panel>;
}
