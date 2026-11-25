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

export const DARK_THEME: ThemeDefinition = {
  id: 'dark',
  name: 'Slate Dark',
  description: 'Precision studio dark slate with cyan indicator highlights',
  badge: 'Default',
  accent: '#38bdf8',
  accentHover: '#0ea5e9',
  accentSoft: 'rgba(56, 189, 248, 0.12)',
  bgApp: '#090b10',
  bgSurface: '#0e1219',
  bgCard: '#131822',
  bgCardHover: '#18202d',
  bgCardSelected: '#122538',
  bgSidebar: '#0c1017',
  bgHeader: '#090b10',
  bgInput: '#0e1219',
  border: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.14)',
  borderHighlight: '#38bdf8',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  tagColor: '#38bdf8',
};

export const THEMES: ThemeDefinition[] = [DARK_THEME];

export const DEFAULT_THEME = DARK_THEME;

export function getTheme(_idOrName?: string, customAccent?: string): ThemeDefinition {
  const baseTheme = DARK_THEME;

  if (!customAccent || customAccent === baseTheme.accent) {
    return baseTheme;
  }

  return {
    ...baseTheme,
    accent: customAccent,
    accentHover: customAccent,
    accentSoft: `${customAccent}22`,
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
