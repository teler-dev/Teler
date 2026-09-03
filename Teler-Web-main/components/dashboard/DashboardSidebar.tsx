import React, { useState } from 'react';
import { Logo } from '../Logo';
import {
  LayoutDashboard, Users, Bell, LogOut, BrainCircuit, Menu, X,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'employees'
  | 'sessions'
  | 'reports'
  | 'alerts'
  | 'settings'
  | 'ai-settings';

const NAV_ITEMS: {
  key: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { key: 'employees',   label: 'Employees',   icon: Users },
  { key: 'alerts',      label: 'Alerts',      icon: Bell },
  { key: 'ai-settings', label: 'AI Settings', icon: BrainCircuit },
];

interface Props {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  alertCount: number;
  onLogout: () => void;
  clientName: string;
}

export const DashboardSidebar: React.FC<Props> = ({
  activeSection, onNavigate, alertCount, onLogout, clientName,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = (section: NavSection) => {
    onNavigate(section);
    setMobileOpen(false);
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .ml-56 { margin-left: 0 !important; }
          .min-h-screen > .ml-56 { padding-top: 3.5rem; min-width: 0; }
          .ml-56 > header.sticky.top-0 { top: 3.5rem !important; }
          .ml-56 > main { min-width: 0; overflow-x: hidden; padding-left: 1rem; padding-right: 1rem; }
        }
      `}</style>

      <div className="fixed inset-x-0 top-0 h-14 bg-[#080D16]/95 backdrop-blur-xl border-b border-white/5 z-50 flex items-center justify-between px-4 md:hidden">
        <Logo variant="navbar" />
        <button
          type="button"
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close dashboard navigation' : 'Open dashboard navigation'}
          aria-expanded={mobileOpen}
          className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 text-gray-300 flex items-center justify-center"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close dashboard navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/55 z-40 md:hidden"
        />
      )}

      <nav
        aria-label="Dashboard navigation"
        className={`fixed left-0 top-0 bottom-0 w-64 md:w-56 bg-[#080D16]/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-50 transition-transform duration-200 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-4 border-b border-white/5 shrink-0 min-h-14">
          <Logo variant="navbar" />
          <p className="text-[10px] text-gray-600 mt-1 truncate">{clientName}</p>
        </div>

        <div className="flex-1 py-4 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.key === 'alerts' && alertCount > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => { setMobileOpen(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    </>
  );
};