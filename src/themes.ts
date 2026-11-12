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
  accent: '#22d3ee', // Vibrant cyan matching uploaded UI
  accentHover: '#38bdf8',
  accentSoft: 'rgba(34, 211, 238, 0.15)',
  bgApp: '#080c12', // Deep slate navy
  bgSurface: '#0d131b',
  bgCard: '#111a24',
  bgCardHover: '#162332',
  bgCardSelected: '#18283a',
  bgSidebar: '#070a0e',
  bgHeader: '#070a0e',
  border: '#16222f',
  borderHover: '#233346',
  borderHighlight: 'rgba(34, 211, 238, 0.55)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#5a687c',
  tagColor: '#22d3ee',
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
