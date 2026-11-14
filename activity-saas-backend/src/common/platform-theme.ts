export const PLATFORM_THEME_KEY = 'platform.appearance';
export const PLATFORM_THEMES = ['voya-midnight', 'revspine-warm', 'lagoon', 'canopy'] as const;
export type PlatformTheme = typeof PLATFORM_THEMES[number];
export type PlatformThemeColors = { page: string; surface: string; raised: string; primary: string; accent: string };
const DEFAULT_COLORS: Record<PlatformTheme, PlatformThemeColors> = {
  'voya-midnight': { page: '#0e131d', surface: '#161d2a', raised: '#1c2433', primary: '#8d9df5', accent: '#f0a040' },
  'revspine-warm': { page: '#fcf9f3', surface: '#fffaf6', raised: '#e1cbad', primary: '#8a4a20', accent: '#dda04a' },
  lagoon: { page: '#d7ece7', surface: '#f0f7f3', raised: '#a8d5cb', primary: '#0b625e', accent: '#bd7926' },
  canopy: { page: '#111b17', surface: '#1a2a21', raised: '#26392e', primary: '#91b47f', accent: '#e4ae58' },
};
const LEGACY_LAGOON_PALETTES: PlatformThemeColors[] = [
  { page: '#102126', surface: '#183239', raised: '#23434a', primary: '#55b4a9', accent: '#e7b25b' },
  { page: '#06424d', surface: '#0c6670', raised: '#0b7780', primary: '#72f0d3', accent: '#ffc857' },
];
const LEGACY_WARM_PALETTES: PlatformThemeColors[] = [
  { page: '#fcf9f3', surface: '#fffaf6', raised: '#f2eadf', primary: '#8a4a20', accent: '#dda04a' },
  { page: '#f2ebdd', surface: '#fff9f0', raised: '#dcc7aa', primary: '#87431e', accent: '#d18a2b' },
];
export function normalizePlatformTheme(value: unknown): PlatformTheme {
  const theme = (value as { theme?: unknown } | null)?.theme;
  return PLATFORM_THEMES.includes(theme as PlatformTheme) ? theme as PlatformTheme : 'voya-midnight';
}
export function normalizePlatformThemeColors(theme: PlatformTheme, value: unknown): PlatformThemeColors {
  const defaults = DEFAULT_COLORS[theme];
  const colors = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const matchesLegacy = (legacy: PlatformThemeColors) => Object.entries(legacy).every(([key, color]) => typeof colors[key] === 'string' && (colors[key] as string).toLowerCase() === color);
  if (theme === 'revspine-warm' && LEGACY_WARM_PALETTES.some(matchesLegacy)) return defaults;
  if (theme === 'lagoon' && LEGACY_LAGOON_PALETTES.some(matchesLegacy)) return defaults;
  const safeColor = (key: keyof PlatformThemeColors) => typeof colors[key] === 'string' && /^#[\da-f]{6}$/i.test(colors[key] as string) ? (colors[key] as string).toLowerCase() : defaults[key];
  return { page: safeColor('page'), surface: safeColor('surface'), raised: safeColor('raised'), primary: safeColor('primary'), accent: safeColor('accent') };
}
export async function readPlatformTheme(prisma: any) {
  const row = await prisma.globalSetting.findFirst({ where: { tenantId: null, key: PLATFORM_THEME_KEY }, select: { value: true, updatedAt: true } });
  const theme = normalizePlatformTheme(row?.value);
  return { theme, colors: normalizePlatformThemeColors(theme, (row?.value as any)?.colors), updatedAt: row?.updatedAt || null };
}
