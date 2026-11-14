import { API_BASE } from '../api';
export type ThemeId = 'voya-midnight' | 'revspine-warm' | 'lagoon' | 'canopy';
export type ThemeColors = { page: string; surface: string; raised: string; primary: string; accent: string };
export const THEME_CACHE = 'voya-platform-theme-v1';
const LEGACY_LAGOON_PALETTES: ThemeColors[] = [
  { page: '#102126', surface: '#183239', raised: '#23434a', primary: '#55b4a9', accent: '#e7b25b' },
  { page: '#06424d', surface: '#0c6670', raised: '#0b7780', primary: '#72f0d3', accent: '#ffc857' },
];
const LEGACY_WARM_PALETTES: ThemeColors[] = [
  { page: '#f2ebdd', surface: '#fff9f0', raised: '#dcc7aa', primary: '#87431e', accent: '#d18a2b' },
];
export const themes: { id: ThemeId; name: string; description: string; colors: ThemeColors }[] = [
  { id: 'voya-midnight', name: 'Midnight', description: 'Ink-blue page, slate panels, steel-blue headers, lavender actions and amber highlights.', colors: { page: '#0d1424', surface: '#1c2a40', raised: '#2e4360', primary: '#91a7ff', accent: '#f0a040' } },
  { id: 'revspine-warm', name: 'Warm', description: 'Cream page, ivory panels, beige headers, terracotta actions and honey accents.', colors: { page: '#fcf9f3', surface: '#fffaf6', raised: '#f2eadf', primary: '#8a4a20', accent: '#dda04a' } },
  { id: 'lagoon', name: 'Lagoon Light', description: 'Seafoam page, pale mint panels, soft turquoise headers, deep teal actions and honey accents.', colors: { page: '#d7ece7', surface: '#f0f7f3', raised: '#a8d5cb', primary: '#0b625e', accent: '#bd7926' } },
  { id: 'canopy', name: 'Canopy', description: 'Pine page, moss panels, leaf-green headers, sage actions and copper-gold accents.', colors: { page: '#13261b', surface: '#2b4b31', raised: '#4b7044', primary: '#b2d27c', accent: '#e4a34a' } },
];
export function defaultThemeColors(theme: ThemeId): ThemeColors { return { ...themes.find(preset => preset.id === theme)!.colors }; }
export function isThemeId(value: unknown): value is ThemeId { return themes.some(theme => theme.id === value); }
export function normalizeThemeColors(theme: ThemeId, value?: Partial<ThemeColors> | null): ThemeColors {
  const defaults = defaultThemeColors(theme);
  const matchesLegacy = (legacy: ThemeColors) => !!value && Object.entries(legacy).every(([key, color]) => {
    const saved = (value as Record<string, unknown>)[key];
    return typeof saved === 'string' && saved.toLowerCase() === color;
  });
  if (theme === 'revspine-warm' && LEGACY_WARM_PALETTES.some(matchesLegacy)) return defaults;
  if (theme === 'lagoon' && LEGACY_LAGOON_PALETTES.some(matchesLegacy)) return defaults;
  const isHex = (color: unknown): color is string => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color);
  return {
    page: isHex(value?.page) ? value.page : defaults.page,
    surface: isHex(value?.surface) ? value.surface : defaults.surface,
    raised: isHex(value?.raised) ? value.raised : defaults.raised,
    primary: isHex(value?.primary) ? value.primary : defaults.primary,
    accent: isHex(value?.accent) ? value.accent : defaults.accent,
  };
}
export function applyTheme(theme: ThemeId, colors: ThemeColors = defaultThemeColors(theme)) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const safeColors = normalizeThemeColors(theme, colors);
  root.style.setProperty('--voya-page', safeColors.page);
  root.style.setProperty('--voya-surface', safeColors.surface);
  root.style.setProperty('--voya-raised', safeColors.raised);
  const pageText = contrastTextFor(safeColors.page);
  const surfaceText = contrastTextFor(safeColors.surface);
  const raisedText = contrastTextFor(safeColors.raised);
  const primaryText = contrastTextFor(safeColors.primary);
  const accentText = contrastTextFor(safeColors.accent);
  const pageMuted = readableMutedFor(safeColors.page);
  const surfaceMuted = readableMutedFor(safeColors.surface);
  const raisedMuted = readableMutedFor(safeColors.raised);
  const colorScheme = relativeLuminance(safeColors.page) > 0.42 ? 'light' : 'dark';
  const darkSurfaces = relativeLuminance(safeColors.surface) <= 0.42;
  root.style.setProperty('--voya-page-text', pageText);
  root.style.setProperty('--voya-surface-text', surfaceText);
  root.style.setProperty('--voya-primary-text', primaryText);
  root.style.setProperty('--voya-accent-text', accentText);
  root.style.setProperty('--voya-raised-text', contrastTextFor(safeColors.raised));
  root.style.setProperty('--voya-primary', safeColors.primary);
  root.style.setProperty('--voya-accent', safeColors.accent);
  root.style.setProperty('--voya-action-gradient', `linear-gradient(180deg, color-mix(in srgb, ${safeColors.primary} 82%, white) 0%, ${safeColors.primary} 52%, color-mix(in srgb, ${safeColors.primary} 80%, black) 100%)`);
  root.style.setProperty('--voya-action-border', `color-mix(in srgb, ${safeColors.primary} 78%, black)`);
  root.style.setProperty('--voya-action-text', primaryText);
  root.style.setProperty('--voya-text', surfaceText);
  root.style.setProperty('--voya-page-muted', pageMuted);
  root.style.setProperty('--voya-surface-muted', surfaceMuted);
  root.style.setProperty('--voya-raised-muted', raisedMuted);
  root.style.setProperty('--voya-muted', surfaceMuted);
  root.style.setProperty('--voya-on-primary', primaryText);
  root.style.setProperty('--voya-color-scheme', colorScheme);
  root.style.setProperty('--voya-success', darkSurfaces ? '#87dcb1' : '#32652a');
  root.style.setProperty('--voya-success-soft', darkSurfaces ? '#17372f' : '#e6efdf');
  root.style.setProperty('--voya-warning', darkSurfaces ? '#ffc16b' : '#704500');
  root.style.setProperty('--voya-warning-soft', darkSurfaces ? '#3a2a14' : '#faedcd');
  root.style.setProperty('--voya-error', darkSurfaces ? '#ffb4ad' : '#a73118');
  root.style.setProperty('--voya-error-soft', darkSurfaces ? '#3a2028' : '#fae7df');
  root.style.colorScheme = colorScheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', safeColors.page);
}
function relativeLuminance(hex: string) {
  const [r, g, b] = hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrastRatio(a: string, b: string) {
  const first = relativeLuminance(a), second = relativeLuminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}
export function contrastTextFor(hex: string) {
  const dark = '#211c15';
  const light = '#fffaf6';
  return contrastRatio(hex, dark) >= contrastRatio(hex, light) ? dark : light;
}
function readableMutedFor(background: string) {
  const darkMuted = '#62584c';
  const lightMuted = '#c1c8d6';
  const candidate = relativeLuminance(background) > 0.42 ? darkMuted : lightMuted;
  return contrastRatio(background, candidate) >= 4.5 ? candidate : contrastTextFor(background);
}
export function cacheTheme(theme: ThemeId, colors: ThemeColors = defaultThemeColors(theme)) {
  const safeColors = normalizeThemeColors(theme, colors);
  try { localStorage.setItem(THEME_CACHE, JSON.stringify({ theme, colors: safeColors })); } catch { /* Storage may be blocked. */ }
  applyTheme(theme, safeColors);
}
export function startPlatformTheme() {
  try { const cached = JSON.parse(localStorage.getItem(THEME_CACHE) || 'null'); const theme = isThemeId(cached?.theme) ? cached.theme : 'voya-midnight'; applyTheme(theme, cached?.colors || undefined); } catch { applyTheme('voya-midnight'); }
  let preview = false;
  let pending = false;
  const onPreview = (event: Event) => { preview = (event as CustomEvent<boolean>).detail; };
  const refresh = async () => {
    if (pending || preview || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const res = await fetch(`${API_BASE}/auth/appearance`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (!preview && isThemeId(data.theme)) cacheTheme(data.theme, normalizeThemeColors(data.theme, data.colors));
      }
    } catch { /* Retain the last known theme while offline. */ }
    finally { pending = false; }
  };
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_CACHE && !preview) void refresh(); };
  window.addEventListener('voya-theme-preview', onPreview);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  const timer = window.setInterval(refresh, 30000);
  void refresh();
  return () => { clearInterval(timer); window.removeEventListener('voya-theme-preview', onPreview); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
}
