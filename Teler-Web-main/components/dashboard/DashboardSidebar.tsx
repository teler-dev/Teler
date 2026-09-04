import React, { useEffect, useState } from 'react';
import { BarChart3, Bell, BrainCircuit, LayoutDashboard, LogOut, Menu, MessageSquareText, Monitor, Moon, Sun, Users, X } from 'lucide-react';
import { Logo } from '../Logo';
import { applyTheme, getThemeMode, setThemeMode, subscribeTheme, ThemeMode } from '../../services/themeService';

export type NavSection = 'dashboard' | 'employees' | 'sessions' | 'reports' | 'alerts' | 'settings' | 'ai-settings' | 'workspace';

const NAV_ITEMS: Array<{ key: NavSection; label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'employees', label: 'Employees', href: '/employees', icon: Users },
  { key: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell },
  { key: 'workspace', label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { key: 'ai-settings', label: 'AI Settings', href: '/settings/ai', icon: BrainCircuit },
];

const ROUTED_PREFIXES = [
  '/dashboard', '/employees', '/alerts', '/analytics', '/reports',
  '/dashboards', '/saved-views', '/ai', '/settings', '/admin',
];

interface Props { activeSection: NavSection; onNavigate: (section: NavSection) => void; alertCount: number; onLogout: () => void; clientName: string; }

const themeIcon: Record<ThemeMode, React.ReactNode> = {
  dark: <Moon className="w-3.5 h-3.5" />, light: <Sun className="w-3.5 h-3.5" />, system: <Monitor className="w-3.5 h-3.5" />,
};

export const DashboardSidebar: React.FC<Props> = ({ activeSection, onNavigate, alertCount, onLogout, clientName }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getThemeMode());
  useEffect(() => { applyTheme(theme); return subscribeTheme(setTheme); }, []);

  const follow = (event: React.MouseEvent<HTMLAnchorElement>, section: NavSection, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const pathname = window.location.pathname;
    const alreadyInRoutedApp = ROUTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

    if (!alreadyInRoutedApp) {
      // Older tabs can still have the legacy authenticated App.tsx shell mounted
      // at / or /login. A full handoff guarantees the URL router owns Analytics
      // and the existing secure session cookie is reused on the routed page.
      event.preventDefault();
      setMobileOpen(false);
      window.location.assign(href);
      return;
    }

    event.preventDefault();
    setMobileOpen(false);
    onNavigate(section);
  };

  const cycleTheme = () => { const next: ThemeMode = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'; setTheme(next); setThemeMode(next); };
  const openAi = () => { setMobileOpen(false); window.dispatchEvent(new Event('teler:open-ai')); };

  return <>
    <style>{`@media (max-width:767px){.ml-56{margin-left:0!important}.min-h-screen>.ml-56{padding-top:3.5rem;min-width:0}.ml-56>header.sticky.top-0{top:3.5rem!important}.ml-56>main{min-width:0;overflow-x:hidden;padding-left:1rem;padding-right:1rem}}`}</style>
    <div className="fixed inset-x-0 top-0 h-14 bg-surface-card border-b border-subtle z-50 flex items-center justify-between px-4 md:hidden shadow-card">
      <Logo variant="navbar" />
      <button type="button" onClick={() => setMobileOpen(value => !value)} aria-label={mobileOpen ? 'Close dashboard navigation' : 'Open dashboard navigation'} aria-expanded={mobileOpen} className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary hover:text-primary flex items-center justify-center">{mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}</button>
    </div>
    {mobileOpen && <button type="button" aria-label="Close dashboard navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/45 z-40 md:hidden" />}
    <nav aria-label="Dashboard navigation" className={`fixed left-0 top-0 bottom-0 w-64 md:w-56 bg-surface-card border-r border-subtle flex flex-col z-50 transition-transform duration-200 md:translate-x-0 shadow-card ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="teler-sidebar-brand px-5 py-4 border-b border-subtle shrink-0 min-h-14"><Logo variant="navbar" /><p className="text-xs text-muted mt-1 truncate">{clientName}</p></div>
      <div className="teler-sidebar-nav flex-1 min-h-0 py-4 px-3 flex flex-col gap-1 overflow-y-auto overscroll-contain">
        {NAV_ITEMS.map(item => { const Icon=item.icon; const active=activeSection===item.key; return <a key={item.key} href={item.href} onClick={event => follow(event,item.key,item.href)} aria-current={active?'page':undefined} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${active?'bg-accent-soft text-primary border border-accent':'text-secondary hover:text-primary hover:bg-surface-hover border border-transparent'}`}><Icon className="w-4 h-4 shrink-0" /><span className="flex-1">{item.label}</span>{item.key==='alerts'&&alertCount>0&&<span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center" aria-label={`${alertCount} active alerts`}>{alertCount>99?'99+':alertCount}</span>}</a>; })}
      </div>
      <div className="teler-sidebar-actions p-3 border-t border-subtle shrink-0 space-y-1 bg-surface-card">
        <a href="/ai" onClick={event => { if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();setMobileOpen(false);const pathname=window.location.pathname;const alreadyInRoutedApp=ROUTED_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));if(!alreadyInRoutedApp){window.location.assign('/ai');return;}window.history.pushState({},'', '/ai');window.dispatchEvent(new PopStateEvent('popstate'));} }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-primary bg-surface-raised border border-subtle hover:border-accent hover:bg-surface-hover transition-all"><BrainCircuit className="w-4 h-4 text-accent" /><span>AI Workspace</span></a>
        <button type="button" onClick={openAi} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-primary bg-accent-soft border border-accent hover:bg-surface-hover transition-all"><MessageSquareText className="w-4 h-4 shrink-0 text-accent" /><span>Quick AI</span></button>
        <button type="button" onClick={cycleTheme} aria-label={`Theme mode: ${theme}. Activate to switch theme mode.`} aria-live="polite" title={`Theme: ${theme}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:text-primary hover:bg-surface-hover transition-all">{themeIcon[theme]}<span className="flex-1 text-left">Theme</span><span className="text-xs capitalize font-medium">{theme}</span></button>
        <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:text-primary hover:bg-surface-hover transition-all"><LogOut className="w-4 h-4" /><span>Sign out</span></button>
      </div>
    </nav>
  </>;
};