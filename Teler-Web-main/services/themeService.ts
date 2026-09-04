export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'teler_theme_mode';
const THEME_EVENT = 'teler:theme-change';
const STYLE_ID = 'teler-semantic-theme';

const SEMANTIC_CSS = `
:root,:root[data-theme="dark"]{
  --surface-page:10 15 26;--surface-sidebar:10 15 26;--surface-card:17 24 39;--surface-raised:24 34 52;--surface-input:15 23 42;--surface-hover:30 41 59;
  --text-primary:241 245 249;--text-secondary:203 213 225;--text-muted:148 163 184;
  --border-subtle:51 65 85;--border-strong:71 85 105;
  --accent:8 145 178;--accent-hover:6 182 212;--accent-soft:14 116 144;--focus-ring:34 211 238;
  --success:34 197 94;--success-soft:20 83 45;--warning:245 158 11;--warning-soft:120 53 15;--danger:248 113 113;--danger-soft:127 29 29;--info:56 189 248;--info-soft:12 74 110;
  --shadow-card:0 10px 30px rgba(0,0,0,.22);--scroll-track:10 15 26;--scroll-thumb:71 85 105;--skeleton-a:255 255 255;--skeleton-b:255 255 255;
}
:root[data-theme="light"]{
  --surface-page:248 250 252;--surface-sidebar:255 255 255;--surface-card:255 255 255;--surface-raised:241 245 249;--surface-input:255 255 255;--surface-hover:238 244 248;
  --text-primary:15 23 42;--text-secondary:51 65 85;--text-muted:71 85 105;
  --border-subtle:219 227 238;--border-strong:148 163 184;
  --accent:15 118 110;--accent-hover:13 100 94;--accent-soft:204 251 241;--focus-ring:13 148 136;
  --success:21 128 61;--success-soft:220 252 231;--warning:161 98 7;--warning-soft:254 243 199;--danger:185 28 28;--danger-soft:254 226 226;--info:3 105 161;--info-soft:224 242 254;
  --shadow-card:0 10px 28px rgba(15,23,42,.07);--scroll-track:241 245 249;--scroll-thumb:148 163 184;--skeleton-a:226 232 240;--skeleton-b:241 245 249;
}
html,body,#root{min-height:100%;background:rgb(var(--surface-page));color:rgb(var(--text-primary))}
body{transition:background-color .15s ease,color .15s ease}
.bg-surface-page{background-color:rgb(var(--surface-page))!important}.bg-surface-page\\/90{background-color:rgb(var(--surface-page)/.9)!important}
.bg-surface-card{background-color:rgb(var(--surface-card))!important}.bg-surface-raised{background-color:rgb(var(--surface-raised))!important}.bg-surface-input{background-color:rgb(var(--surface-input))!important}.bg-surface-hover{background-color:rgb(var(--surface-hover))!important}
.text-primary{color:rgb(var(--text-primary))!important}.text-secondary{color:rgb(var(--text-secondary))!important}.text-muted{color:rgb(var(--text-muted))!important}
.border-subtle{border-color:rgb(var(--border-subtle))!important}.border-strong{border-color:rgb(var(--border-strong))!important}.border-accent{border-color:rgb(var(--accent))!important}
.text-accent{color:rgb(var(--accent))!important}.bg-accent{background-color:rgb(var(--accent))!important}.bg-accent\\/10{background-color:rgb(var(--accent)/.10)!important}.bg-accent-soft{background-color:rgb(var(--accent-soft))!important}
.text-success{color:rgb(var(--success))!important}.text-warning{color:rgb(var(--warning))!important}.text-danger{color:rgb(var(--danger))!important}.text-info{color:rgb(var(--info))!important}
.shadow-card{box-shadow:var(--shadow-card)!important}
:where(input,select,textarea){background:rgb(var(--surface-input));color:rgb(var(--text-primary));border-color:rgb(var(--border-subtle));accent-color:rgb(var(--accent))}
:where(input,select,textarea):hover:not(:disabled){border-color:rgb(var(--border-strong))}
:where(input,select,textarea):focus-visible,:where(button,a,[role="button"]):focus-visible{outline:2px solid rgb(var(--focus-ring));outline-offset:2px}
:where(input,select,textarea):disabled{background:rgb(var(--surface-raised));color:rgb(var(--text-muted));opacity:.72;cursor:not-allowed}
:where(input,select,textarea)[aria-invalid="true"]{border-color:rgb(var(--danger))}
select option{background:rgb(var(--surface-card));color:rgb(var(--text-primary))}
input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-text-fill-color:rgb(var(--text-primary));box-shadow:0 0 0 1000px rgb(var(--surface-input)) inset!important;transition:background-color 9999s ease-out}
input[type="range"]{appearance:none;background:transparent;height:28px}
input[type="range"]::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(90deg,rgb(var(--accent)) 0 45%,rgb(var(--border-subtle)) 45% 100%)}
input[type="range"]::-webkit-slider-thumb{appearance:none;width:18px;height:18px;margin-top:-6px;border-radius:999px;background:rgb(var(--surface-card));border:3px solid rgb(var(--accent));box-shadow:0 1px 4px rgba(15,23,42,.18)}
input[type="range"]::-moz-range-track{height:6px;border-radius:999px;background:rgb(var(--border-subtle))}input[type="range"]::-moz-range-progress{height:6px;border-radius:999px;background:rgb(var(--accent))}input[type="range"]::-moz-range-thumb{width:14px;height:14px;border-radius:999px;background:rgb(var(--surface-card));border:3px solid rgb(var(--accent))}
*{scrollbar-color:rgb(var(--scroll-thumb)) rgb(var(--scroll-track));scrollbar-width:thin}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:rgb(var(--scroll-track))}::-webkit-scrollbar-thumb{background:rgb(var(--scroll-thumb));border-radius:999px;border:2px solid rgb(var(--scroll-track))}::-webkit-scrollbar-thumb:hover{background:rgb(var(--accent))}
.skeleton-shimmer{background:linear-gradient(90deg,rgb(var(--skeleton-a)/.28) 25%,rgb(var(--skeleton-b)/.9) 50%,rgb(var(--skeleton-a)/.28) 75%)!important;background-size:200% 100%!important}
.theme-form-surface :where(input,select,textarea){background:rgb(var(--surface-input))!important;color:rgb(var(--text-primary))!important;border-color:rgb(var(--border-subtle))!important}
.theme-form-surface :where(input,select,textarea)::placeholder{color:rgb(var(--text-muted))!important}
.theme-form-surface .theme-provider-selected{background:rgb(var(--accent-soft))!important;border-color:rgb(var(--accent))!important;color:rgb(var(--accent-hover))!important}
@media (max-height:560px) and (min-width:768px){.teler-sidebar-nav{padding-top:.5rem!important;padding-bottom:.5rem!important}.teler-sidebar-nav>a{padding-top:.45rem!important;padding-bottom:.45rem!important}.teler-sidebar-actions{max-height:44vh;overflow-y:auto}.teler-sidebar-brand{padding-top:.5rem!important;padding-bottom:.5rem!important}}
`;

function ensureThemeStyles(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) { style = document.createElement('style'); style.id = STYLE_ID; document.head.appendChild(style); }
  if (style.textContent !== SEMANTIC_CSS) style.textContent = SEMANTIC_CSS;
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

function syncBrowserChrome(resolved: 'light' | 'dark'): void {
  document.documentElement.style.colorScheme = resolved;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = resolved === 'light' ? '#f8fafc' : '#0a0f1a';
}

export function applyTheme(mode: ThemeMode = getThemeMode()): void {
  if (typeof document === 'undefined') return;
  ensureThemeStyles();
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  syncBrowserChrome(resolved);
}

export function setThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: mode }));
}

export function subscribeTheme(listener: (mode: ThemeMode) => void): () => void {
  const onTheme = (event: Event) => listener((event as CustomEvent<ThemeMode>).detail);
  const onSystem = () => { if (getThemeMode() === 'system') { applyTheme('system'); listener('system'); } };
  window.addEventListener(THEME_EVENT, onTheme);
  const media = window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', onSystem);
  return () => { window.removeEventListener(THEME_EVENT, onTheme); media.removeEventListener('change', onSystem); };
}