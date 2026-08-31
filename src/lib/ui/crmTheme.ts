export type CrmThemePalette = {
  primary: string;
  secondary: string;
  tertiary: string;
};

export type CrmThemeTokens = CrmThemePalette & {
  control: string;
  onPrimary: string;
  onSecondary: string;
  onTertiary: string;
  primaryHover: string;
  link: string;
  focus: string;
  surfaceTint: string;
  surfaceTintStrong: string;
  onSurfaceTint: string;
  borderAccent: string;
  sidebar: string;
  sidebarHover: string;
  sidebarActive: string;
  onSidebar: string;
  onSidebarMuted: string;
  onSidebarActive: string;
  sidebarIcon: string;
};

export const HUDDLEWAY_CRM_PALETTE: Readonly<CrmThemePalette> = Object.freeze({
  primary: '#003366',
  secondary: '#C6A95B',
  tertiary: '#FFFFFF',
});

type Rgb = { red: number; green: number; blue: number };

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const BLACK = '#000000';
const WHITE = '#FFFFFF';
const SLATE = '#0F172A';

function normalizeHex(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  return HEX_COLOR.test(candidate) ? candidate.toUpperCase() : fallback;
}

function hexToRgb(hex: string): Rgb {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ red, green, blue }: Rgb) {
  const channel = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

function mix(first: string, second: string, secondWeight: number) {
  const left = hexToRgb(first);
  const right = hexToRgb(second);
  const weight = Math.max(0, Math.min(1, secondWeight));
  return rgbToHex({
    red: left.red + (right.red - left.red) * weight,
    green: left.green + (right.green - left.green) * weight,
    blue: left.blue + (right.blue - left.blue) * weight,
  });
}

function relativeLuminance(hex: string) {
  const color = hexToRgb(hex);
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearize(color.red)
    + 0.7152 * linearize(color.green)
    + 0.0722 * linearize(color.blue)
  );
}

export function crmContrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const light = Math.max(firstLuminance, secondLuminance);
  const dark = Math.min(firstLuminance, secondLuminance);
  return (light + 0.05) / (dark + 0.05);
}

function bestOn(background: string) {
  return crmContrastRatio(BLACK, background) >= crmContrastRatio(WHITE, background)
    ? BLACK
    : WHITE;
}

function ensureContrast(
  foreground: string,
  background: string,
  minimumRatio: number,
) {
  if (crmContrastRatio(foreground, background) >= minimumRatio) {
    return foreground;
  }

  const target = crmContrastRatio(BLACK, background)
    >= crmContrastRatio(WHITE, background)
    ? BLACK
    : WHITE;
  let lower = 0;
  let upper = 1;
  let result = target;
  for (let index = 0; index < 12; index += 1) {
    const weight = (lower + upper) / 2;
    const candidate = mix(foreground, target, weight);
    if (crmContrastRatio(candidate, background) >= minimumRatio) {
      result = candidate;
      upper = weight;
    } else {
      lower = weight;
    }
  }
  return result;
}

export function buildCrmThemeTokens(
  input: Partial<CrmThemePalette> | null | undefined,
): CrmThemeTokens {
  const primary = normalizeHex(
    input?.primary,
    HUDDLEWAY_CRM_PALETTE.primary,
  );
  const secondary = normalizeHex(
    input?.secondary,
    HUDDLEWAY_CRM_PALETTE.secondary,
  );
  const tertiary = normalizeHex(
    input?.tertiary,
    HUDDLEWAY_CRM_PALETTE.tertiary,
  );
  const control = ensureContrast(primary, WHITE, 3);
  const onPrimary = bestOn(control);
  const sidebar = mix(primary, SLATE, 0.48);
  const onSidebar = bestOn(sidebar);
  const sidebarActive = crmContrastRatio(secondary, sidebar) >= 3
    ? secondary
    : crmContrastRatio(tertiary, sidebar) >= 3
      ? tertiary
      : ensureContrast(secondary, sidebar, 3);
  const surfaceTint = mix(WHITE, secondary, 0.12);
  const surfaceTintStrong = mix(WHITE, secondary, 0.22);

  return {
    primary,
    secondary,
    tertiary,
    control,
    onPrimary,
    onSecondary: bestOn(secondary),
    onTertiary: bestOn(tertiary),
    primaryHover: mix(control, onPrimary === WHITE ? BLACK : WHITE, 0.14),
    link: ensureContrast(primary, WHITE, 4.5),
    focus: ensureContrast(primary, WHITE, 3),
    surfaceTint,
    surfaceTintStrong,
    onSurfaceTint: ensureContrast(primary, surfaceTint, 4.5),
    borderAccent: ensureContrast(secondary, WHITE, 3),
    sidebar,
    sidebarHover: sidebarActive,
    sidebarActive,
    onSidebar,
    onSidebarMuted: ensureContrast(mix(onSidebar, sidebar, 0.34), sidebar, 4.5),
    onSidebarActive: bestOn(sidebarActive),
    sidebarIcon: ensureContrast(tertiary, sidebar, 3),
  };
}

const CSS_TOKEN_NAMES: ReadonlyArray<[keyof CrmThemeTokens, string]> = [
  ['primary', '--crm-brand-primary'],
  ['secondary', '--crm-brand-secondary'],
  ['tertiary', '--crm-brand-tertiary'],
  ['control', '--crm-brand-control'],
  ['onPrimary', '--crm-on-primary'],
  ['onSecondary', '--crm-on-secondary'],
  ['onTertiary', '--crm-on-tertiary'],
  ['primaryHover', '--crm-brand-primary-hover'],
  ['link', '--crm-brand-link'],
  ['focus', '--crm-brand-focus'],
  ['surfaceTint', '--crm-brand-surface'],
  ['surfaceTintStrong', '--crm-brand-surface-strong'],
  ['onSurfaceTint', '--crm-on-brand-surface'],
  ['borderAccent', '--crm-brand-border'],
  ['sidebar', '--crm-brand-sidebar'],
  ['sidebarHover', '--crm-brand-sidebar-hover'],
  ['sidebarActive', '--crm-brand-sidebar-active'],
  ['onSidebar', '--crm-on-sidebar'],
  ['onSidebarMuted', '--crm-on-sidebar-muted'],
  ['onSidebarActive', '--crm-on-sidebar-active'],
  ['sidebarIcon', '--crm-sidebar-icon'],
];

export function serializeCrmThemeVariables(tokens: CrmThemeTokens) {
  return CSS_TOKEN_NAMES
    .map(([key, cssName]) => `${cssName}: ${tokens[key]}`)
    .join('; ');
}
