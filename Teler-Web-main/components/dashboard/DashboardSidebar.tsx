import React from 'react';
import { Logo } from '../Logo';
import {
  LayoutDashboard, Users, Layers, FileText, Bell, Settings, LogOut, BrainCircuit,
} from 'lucide-react';

// ── Nav section type (shared across all dashboard pages) ──────────────────────
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
  disabled?: boolean;
}[] = [
  { key: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { key: 'employees',   label: 'Employees',   icon: Users            },
  { key: 'sessions',    label: 'Sessions',    icon: Layers,   disabled: true },
  { key: 'reports',     label: 'Reports',     icon: FileText, disabled: true },
  { key: 'alerts',      label: 'Alerts',      icon: Bell                     },
  { key: 'ai-settings', label: 'AI Settings', icon: BrainCircuit             },
  { key: 'settings',    label: 'Settings',    icon: Settings, disabled: true },
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
}) => (
  <nav className="fixed left-0 top-0 bottom-0 w-56 bg-[#080D16]/90 backdrop-blur-xl border-r border-white/5 flex flex-col z-50">
    {/* Brand */}
    <div className="px-5 py-4 border-b border-white/5 shrink-0">
      <Logo variant="navbar" />
      <p className="text-[10px] text-gray-600 mt-1 truncate">{clientName}</p>
    </div>

    {/* Nav items */}
    <div className="flex-1 py-4 px-3 flex flex-col gap-0.5 overflow-y-auto">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = activeSection === item.key;
        return (
          <button
            key={item.key}
            onClick={() => !item.disabled && onNavigate(item.key)}
            disabled={item.disabled}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
              isActive
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                : item.disabled
                ? 'text-gray-700 cursor-not-allowed'
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
            {item.disabled && (
              <span className="text-[9px] text-gray-700 font-semibold uppercase tracking-wider">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>

    {/* Logout */}
    <div className="p-3 border-t border-white/5 shrink-0">
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-all"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        <span>Sign out</span>
      </button>
    </div>
  </nav>
);
