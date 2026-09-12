import React, { useEffect, useState } from 'react';
import { BarChart3, Bell, BrainCircuit, ClipboardList, LayoutDashboard, LogOut, Menu, Monitor, Moon, Search, Sun, Users, X } from 'lucide-react';
import { Logo } from '../Logo';
import { applyTheme, getThemeMode, setThemeMode, subscribeTheme, ThemeMode } from '../../services/themeService';
import { openCommandPalette } from '../../services/commandPaletteService';

export type NavSection = 'dashboard' | 'employees' | 'sessions' | 'reports' | 'alerts' | 'settings' | 'ai-settings' | 'ai-queue' | 'workspace';

const PRIMARY_NAV: Array<{ key: NavSection; label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'employees', label: 'Employees', href: '/employees', icon: Users },
  { key: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell },
  { key: 'workspace', label: 'Analytics', href: '/analytics', icon: BarChart3 },
];

const ROUTED_PREFIXES = [
  '/dashboard', '/employees', '/alerts', '/analytics', '/reports',
  '/dashboards', '/saved-views', '/ai', '/settings', '/admin',
];

interface Props { activeSection: NavSection; onNavigate: (section: NavSection) => void; alertCount: number; onLogout: () => void; clientName: string; }

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5" /> },
];

export const DashboardSidebar: React.FC<Props> = ({ activeSection, onNavigate, alertCount, onLogout, clientName }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => { applyTheme(theme); return subscribeTheme(setTheme); }, []);

  const follow = (event: React.MouseEvent<HTMLAnchorElement>, section: NavSection, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const pathname = window.location.pathname;
    const alreadyInRoutedApp = ROUTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

    if (!alreadyInRoutedApp) {
      event.preventDefault();
      setMobileOpen(false);
      window.location.assign(href);
      return;
    }

    event.preventDefault();
    setMobileOpen(false);
    onNavigate(section);
  };

  const setThemeExplicitly = (next: ThemeMode) => {
    setTheme(next);
    setThemeMode(next);
  };

  const openAiWorkspace = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setMobileOpen(false);
    const pathname = window.location.pathname;
    const alreadyInRoutedApp = ROUTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (!alreadyInRoutedApp) {
      window.location.assign('/ai');
      return;
    }
    window.history.pushState({}, '', '/ai');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openSearch = () => {
    setMobileOpen(false);
    openCommandPalette();
  };

  const navItem = (item: typeof PRIMARY_NAV[number]) => {
    const Icon = item.icon;
    const active = activeSection === item.key;
    return <a
      key={item.key}
      href={item.href}
      onClick={event => follow(event, item.key, item.href)}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${active ? 'bg-accent-soft text-primary border border-accent' : 'text-secondary hover:text-primary hover:bg-surface-hover border border-transparent'}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.key === 'alerts' && alertCount > 0 && <span className="bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center" aria-label={`${alertCount} active alerts`}>{alertCount > 99 ? '99+' : alertCount}</span>}
    </a>;
  };

  return <>
    <style>{`@media (max-width:767px){.ml-56{margin-left:0!important}.min-h-screen>.ml-56{padding-top:3.5rem;min-width:0}.ml-56>header.sticky.top-0{top:3.5rem!important}.ml-56>main{min-width:0;overflow-x:hidden;padding-left:1rem;padding-right:1rem}}`}</style>
    <div className="fixed inset-x-0 top-0 h-14 bg-surface-card border-b border-subtle z-50 flex items-center justify-between px-4 md:hidden shadow-card">
      <Logo variant="navbar" />
      <button type="button" onClick={() => setMobileOpen(value => !value)} aria-label={mobileOpen ? 'Close dashboard navigation' : 'Open dashboard navigation'} aria-expanded={mobileOpen} className="w-10 h-10 rounded-xl border border-subtle bg-surface-raised text-secondary hover:text-primary flex items-center justify-center">{mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}</button>
    </div>

    {mobileOpen && <button type="button" aria-label="Close dashboard navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/45 z-40 md:hidden" />}

    <nav aria-label="Dashboard navigation" className={`fixed left-0 top-0 bottom-0 w-64 md:w-56 bg-surface-card border-r border-subtle flex flex-col z-50 transition-transform duration-200 md:translate-x-0 shadow-card ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="teler-sidebar-brand px-5 py-4 border-b border-subtle shrink-0 min-h-14">
        <Logo variant="navbar" />
        <p className="text-xs text-muted mt-1 truncate">{clientName}</p>
      </div>

      <div className="teler-sidebar-nav flex-1 min-h-0 py-4 px-3 overflow-y-auto overscroll-contain">
        <div className="space-y-1">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Workspace</p>
          <button type="button" onClick={openSearch} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary border border-transparent hover:text-primary hover:bg-surface-hover transition-colors">
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-[10px] border border-subtle rounded-md px-1.5 py-0.5 text-muted">⌘K</kbd>
          </button>
          {PRIMARY_NAV.map(navItem)}
        </div>

        <div className="mt-5 pt-4 border-t border-subtle space-y-1">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">AI</p>
          <a href="/ai" onClick={openAiWorkspace} aria-current={window.location.pathname === '/ai' ? 'page' : undefined} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${window.location.pathname === '/ai' ? 'bg-accent-soft border-accent text-primary' : 'border-transparent text-secondary hover:text-primary hover:bg-surface-hover'}`}><BrainCircuit className="w-4 h-4 text-accent" /><span className="flex-1">AI Workspace</span></a>
          <a href="/ai/queue" onClick={event => follow(event, 'ai-queue', '/ai/queue')} aria-current={activeSection === 'ai-queue' ? 'page' : undefined} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${activeSection === 'ai-queue' ? 'bg-accent-soft border-accent text-primary' : 'border-transparent text-secondary hover:text-primary hover:bg-surface-hover'}`}><ClipboardList className="w-4 h-4" /><span>AI Queue</span></a>
          <a href="/settings/ai" onClick={event => follow(event, 'ai-settings', '/settings/ai')} aria-current={activeSection === 'ai-settings' ? 'page' : undefined} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${activeSection === 'ai-settings' ? 'bg-accent-soft border-accent text-primary' : 'border-transparent text-secondary hover:text-primary hover:bg-surface-hover'}`}><BrainCircuit className="w-4 h-4" /><span>AI Settings</span></a>
        </div>
      </div>

      <div className="teler-sidebar-actions p-3 border-t border-subtle shrink-0 bg-surface-card">
        <div className="mb-2">
          <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Appearance</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-subtle bg-surface-raised p-1">
            {THEME_OPTIONS.map(option => <button
              key={option.value}
              type="button"
              onClick={() => setThemeExplicitly(option.value)}
              aria-pressed={theme === option.value}
              title={option.label}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition-all ${theme === option.value ? 'bg-surface-card text-primary shadow-sm border border-subtle' : 'text-muted hover:text-primary'}`}
            >
              {option.icon}
              <span className="hidden xl:inline">{option.label}</span>
            </button>)}
          </div>
        </div>
        <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:text-danger hover:bg-surface-hover transition-all"><LogOut className="w-4 h-4" /><span>Sign out</span></button>
      </div>
    </nav>
  </>;
};
