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
  name: 'Dark Mode',
  accent: '#38bdf8',
  accentHover: '#7dd3fc',
  accentSoft: 'rgba(56, 189, 248, 0.15)',
  bgApp: '#0b0c0f',
  bgSurface: '#111317',
  bgCard: '#171920',
  bgCardHover: '#1e212b',
  bgCardSelected: '#252936',
  bgSidebar: '#0f1014',
  bgHeader: '#08080b',
  border: '#20232d',
  borderHover: '#2d3240',
  borderHighlight: 'rgba(56, 189, 248, 0.55)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  tagColor: '#38bdf8',
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
