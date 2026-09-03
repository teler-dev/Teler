export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'teler_theme_mode';
const THEME_EVENT = 'teler:theme-change';
const STYLE_ID = 'teler-semantic-theme';

const SEMANTIC_CSS = `
:root,:root[data-theme="dark"]{--surface-page:10 15 26;--surface-card:17 24 39;--surface-raised:23 32 49;--text-primary:241 245 249;--text-secondary:148 163 184;--border-subtle:51 65 85;--accent:8 145 178;--success:34 197 94;--warning:245 158 11;--danger:239 68 68}
:root[data-theme="light"]{--surface-page:248 250 252;--surface-card:255 255 255;--surface-raised:241 245 249;--text-primary:15 23 42;--text-secondary:71 85 105;--border-subtle:203 213 225;--accent:8 126 164;--success:21 128 61;--warning:180 83 9;--danger:185 28 28}
html,body{background:rgb(var(--surface-page));color:rgb(var(--text-primary))}
.bg-surface-page{background-color:rgb(var(--surface-page))!important}.bg-surface-page\/90{background-color:rgb(var(--surface-page)/.9)!important}.bg-surface-card{background-color:rgb(var(--surface-card))!important}.bg-surface-raised{background-color:rgb(var(--surface-raised))!important}.text-primary{color:rgb(var(--text-primary))!important}.text-secondary{color:rgb(var(--text-secondary))!important}.border-subtle{border-color:rgb(var(--border-subtle)/.65)!important}.border-accent{border-color:rgb(var(--accent))!important}.text-accent{color:rgb(var(--accent))!important}.bg-accent{background-color:rgb(var(--accent))!important}.bg-accent\/10{background-color:rgb(var(--accent)/.1)!important}.text-success{color:rgb(var(--success))!important}.text-warning{color:rgb(var(--warning))!important}.text-danger{color:rgb(var(--danger))!important}
[data-theme="light"] .bg-navy-900,[data-theme="light"] .bg-navy-900\/85{background-color:rgb(var(--surface-page))!important}[data-theme="light"] .bg-navy-800\/60,[data-theme="light"] .bg-navy-800\/70,[data-theme="light"] .bg-navy-800\/40,[data-theme="light"] .bg-navy-800\/95{background-color:rgb(var(--surface-card))!important}[data-theme="light"] .bg-navy-700\/60,[data-theme="light"] .bg-navy-700\/40{background-color:rgb(var(--surface-raised))!important}[data-theme="light"] .text-white,[data-theme="light"] .text-gray-100,[data-theme="light"] .text-gray-200,[data-theme="light"] .text-gray-300{color:rgb(var(--text-primary))!important}[data-theme="light"] .text-gray-400,[data-theme="light"] .text-gray-500,[data-theme="light"] .text-gray-600{color:rgb(var(--text-secondary))!important}[data-theme="light"] .border-white\/5,[data-theme="light"] .border-white\/6,[data-theme="light"] .border-white\/8,[data-theme="light"] .border-white\/10,[data-theme="light"] .border-white\/15{border-color:rgb(var(--border-subtle)/.7)!important}[data-theme="light"] .bg-white\/3,[data-theme="light"] .bg-white\/4,[data-theme="light"] .bg-white\/5,[data-theme="light"] .bg-white\/8,[data-theme="light"] .bg-white\/10{background-color:rgb(var(--surface-raised)/.75)!important}
[data-theme="light"] .teler-ai-narrative{background:rgb(var(--surface-card))!important;box-shadow:0 12px 32px rgba(15,23,42,.08)!important}
`;

function ensureThemeStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SEMANTIC_CSS;
  document.head.appendChild(style);
}

export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

export function resolveTheme(mode: ThemeMode = getThemeMode()): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(mode: ThemeMode = getThemeMode()): void {
  if (typeof document === 'undefined') return;
  ensureThemeStyles();
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.style.colorScheme = resolved;
}

export function setThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: mode }));
}

export function subscribeTheme(listener: (mode: ThemeMode) => void): () => void {
  const onTheme = (event: Event) => listener((event as CustomEvent<ThemeMode>).detail);
  const onSystem = () => {
    if (getThemeMode() === 'system') {
      applyTheme('system');
      listener('system');
    }
  };
  window.addEventListener(THEME_EVENT, onTheme);
  const media = window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', onSystem);
  return () => {
    window.removeEventListener(THEME_EVENT, onTheme);
    media.removeEventListener('change', onSystem);
  };
}