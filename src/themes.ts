export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  badge?: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  bgApp: string;
  bgSurface: string;
  bgCard: string;
  bgCardHover: string;
  bgCardSelected: string;
  bgSidebar: string;
  bgHeader: string;
  bgInput: string;
  border: string;
  borderHover: string;
  borderHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  tagColor: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Prism Slate Dark',
    description: 'Deep navy-slate dark tones with vibrant cyan highlights (Original)',
    badge: 'Default',
    accent: '#31C5F4',
    accentHover: '#38bdf8',
    accentSoft: 'rgba(49, 197, 244, 0.15)',
    bgApp: '#090B10',
    bgSurface: '#0E131A',
    bgCard: '#151B25',
    bgCardHover: '#1B2330',
    bgCardSelected: '#123244',
    bgSidebar: '#10141C',
    bgHeader: '#090B10',
    bgInput: '#0E131A',
    border: '#1B222E',
    borderHover: '#232E3F',
    borderHighlight: '#31C5F4',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textMuted: '#5a687c',
    tagColor: '#31C5F4',
  },
  {
    id: 'neutral-obsidian',
    name: 'Obsidian Charcoal',
    description: 'Deep neutral carbon & graphite palette with rich dark contrast',
    accent: '#e4e4e7',
    accentHover: '#f4f4f5',
    accentSoft: 'rgba(228, 228, 231, 0.15)',
    bgApp: '#0e0e11',
    bgSurface: '#141417',
    bgCard: '#1a1a1f',
    bgCardHover: '#232329',
    bgCardSelected: '#2c2c34',
    bgSidebar: '#111114',
    bgHeader: '#0e0e11',
    bgInput: '#141417',
    border: '#27272e',
    borderHover: '#363640',
    borderHighlight: '#e4e4e7',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    tagColor: '#d4d4d8',
  },
  {
    id: 'oled-stealth',
    name: 'Pure OLED Black',
    description: 'True pitch-black pixels (#000000) for OLED screens and stark contrast',
    badge: 'True Black',
    accent: '#ffffff',
    accentHover: '#e2e8f0',
    accentSoft: 'rgba(255, 255, 255, 0.12)',
    bgApp: '#000000',
    bgSurface: '#080808',
    bgCard: '#121212',
    bgCardHover: '#1c1c1c',
    bgCardSelected: '#262626',
    bgSidebar: '#040404',
    bgHeader: '#000000',
    bgInput: '#0d0d0d',
    border: '#222222',
    borderHover: '#333333',
    borderHighlight: '#ffffff',
    textPrimary: '#ffffff',
    textSecondary: '#a3a3a3',
    textMuted: '#666666',
    tagColor: '#ffffff',
  },
];

export const DARK_THEME: ThemeDefinition = THEMES[0];
export const DEFAULT_THEME = DARK_THEME;

export function getTheme(idOrName?: string, customAccent?: string): ThemeDefinition {
  const normalized = (idOrName || '').toLowerCase().trim();
  const found = THEMES.find((t) => t.id === normalized || t.name.toLowerCase() === normalized);
  const baseTheme = found || DARK_THEME;

  if (!customAccent || customAccent === baseTheme.accent) {
    return baseTheme;
  }

  return {
    ...baseTheme,
    accent: customAccent,
    accentHover: customAccent,
    accentSoft: `${customAccent}26`,
    borderHighlight: customAccent,
    tagColor: customAccent,
  };
}

export function applyThemeToDom(theme: ThemeDefinition = DARK_THEME): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.style.setProperty('--accent-color', theme.accent);
  root.style.setProperty('--accent-hover', theme.accentHover);
  root.style.setProperty('--accent-soft', theme.accentSoft);

  root.style.setProperty('--theme-bg-app', theme.bgApp);
  root.style.setProperty('--theme-bg-surface', theme.bgSurface);
  root.style.setProperty('--theme-bg-card', theme.bgCard);
  root.style.setProperty('--theme-bg-card-hover', theme.bgCardHover);
  root.style.setProperty('--theme-bg-card-selected', theme.bgCardSelected);
  root.style.setProperty('--theme-bg-sidebar', theme.bgSidebar);
  root.style.setProperty('--theme-bg-header', theme.bgHeader);
  root.style.setProperty('--theme-bg-input', theme.bgInput);

  root.style.setProperty('--theme-border', theme.border);
  root.style.setProperty('--theme-border-hover', theme.borderHover);
  root.style.setProperty('--theme-border-highlight', theme.borderHighlight);

  root.style.setProperty('--theme-text-primary', theme.textPrimary);
  root.style.setProperty('--theme-text-secondary', theme.textSecondary);
  root.style.setProperty('--theme-text-muted', theme.textMuted);

  root.setAttribute('data-theme', theme.id);
  root.classList.add('dark-mode');
  root.classList.remove('light-mode');
}
