export interface ThemeDefinition {
  id: string;
  name: string;
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
  border: string;
  borderHover: string;
  borderHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  tagColor: string;
}

export const DARK_THEME: ThemeDefinition = {
  id: 'dark',
  name: 'Prism Slate Dark',
  accent: '#31C5F4', // Selection stroke / vibrant cyan
  accentHover: '#38bdf8',
  accentSoft: 'rgba(49, 197, 244, 0.15)',
  bgApp: '#090B10', // User requested: 090B10
  bgSurface: '#0E131A',
  bgCard: '#151B25', // User requested: 151B25
  bgCardHover: '#1B2330',
  bgCardSelected: '#123244', // User requested selected button: 123244
  bgSidebar: '#10141C', // User requested sidebar: 10141C
  bgHeader: '#090B10',
  border: '#1B222E',
  borderHover: '#232E3F',
  borderHighlight: '#31C5F4',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#5a687c',
  tagColor: '#31C5F4',
};

export const DEFAULT_THEME = DARK_THEME;

export function getTheme(_idOrName?: string, _fallbackAccent?: string): ThemeDefinition {
  return DARK_THEME;
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

  root.style.setProperty('--theme-border', theme.border);
  root.style.setProperty('--theme-border-hover', theme.borderHover);
  root.style.setProperty('--theme-border-highlight', theme.borderHighlight);

  root.style.setProperty('--theme-text-primary', theme.textPrimary);
  root.style.setProperty('--theme-text-secondary', theme.textSecondary);
  root.style.setProperty('--theme-text-muted', theme.textMuted);

  root.setAttribute('data-theme', 'dark');
  root.classList.add('dark-mode');
  root.classList.remove('light-mode');
}
