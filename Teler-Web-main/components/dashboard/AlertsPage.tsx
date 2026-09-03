import React, { useMemo, useEffect, useState } from 'react';
import { useSessions } from './useSessions';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { AlertWorkflowPanel } from './AlertWorkflowPanel';
import {
  generateAlerts, Alert, ALERT_LABEL, ALERT_DESCRIPTION,
  SEVERITY_CONFIG, SEVERITY_ORDER, AlertSeverity,
} from './alertUtils';
import { Employee } from '../../types';
import {
  Wifi, WifiOff, RefreshCw, ChevronRight, AlertTriangle,
  ShieldCheck, Clock, X,
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTimeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDateTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Severity badge ────────────────────────────────────────────────────────────

const SeverityBadge: React.FC<{ severity: AlertSeverity }> = ({ severity }) => {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ── Alert type badge ──────────────────────────────────────────────────────────

const AlertTypeBadge: React.FC<{ type: Alert['alertType'] }> = ({ type }) => {
  const colors: Record<Alert['alertType'], string> = {
    low_focus:             'bg-purple-500/10 text-purple-400 border-purple-500/20',
    high_idle:             'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high_context_switch:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    suspicious_inactivity: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors[type]}`}>
      {ALERT_LABEL[type]}
    </span>
  );
};

// ── Alert detail drawer ───────────────────────────────────────────────────────

const AlertDetailDrawer: React.FC<{
  alert: Alert | null;
  onClose: () => void;
  onViewEmployee: (emp: Employee) => void;
}> = ({ alert, onClose, onViewEmployee }) => {
  if (!alert) return null;
  const cfg = SEVERITY_CONFIG[alert.severity];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#080D16] border-l border-white/8 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
              <AlertTriangle className={`w-4 h-4 ${cfg.color}`} />
            </div>
            <div>
              <p className="text-white font-bold text-sm">{alert.alertLabel}</p>
              <p className="text-gray-500 text-xs mt-0.5">{alert.employeeName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close alert details" title="Close alert details" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={alert.severity} />
            <AlertTypeBadge type={alert.alertType} />
          </div>

          <div className="bg-navy-800/60 border border-white/8 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="text-gray-400">{fmtDateTime(alert.timestamp)}</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{fmtTimeAgo(alert.timestamp)}</span>
            </div>
            {alert.employeeRole && (
              <p className="text-xs text-gray-500"><span className="text-gray-600">Role:</span> {alert.employeeRole}</p>
            )}
            <div className="border-t border-white/5 pt-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-1">Detected Metric</p>
              <p className="text-sm text-white font-semibold">{alert.details}</p>
            </div>
          </div>

          <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-4`}>
            <p className={`text-[10px] ${cfg.color} opacity-80 uppercase tracking-widest font-semibold mb-1`}>Alert Rule</p>
            <p className="text-xs text-gray-300 leading-relaxed">{ALERT_DESCRIPTION[alert.alertType]}</p>
          </div>

          <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-4">
            <p className="text-[10px] text-cyan-400/80 uppercase tracking-widest font-semibold mb-1">Recommended Action</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              {alert.alertType === 'low_focus' && 'Review the employee\'s session timeline. Consider checking for recurring distractions or environmental issues affecting concentration.'}
              {alert.alertType === 'high_idle' && 'Check if the employee was in a meeting, on a break, or facing technical issues. High idle time may indicate untracked work.'}
              {alert.alertType === 'high_context_switch' && 'Discuss workload prioritization. Excessive switching may indicate unclear task assignments or competing priorities.'}
              {alert.alertType === 'suspicious_inactivity' && 'This session shows high idle time over a long period. Review the session timeline for more context before reaching conclusions.'}
            </p>
          </div>

          <AlertWorkflowPanel alertId={alert.id} />
        </div>

        <div className="px-6 py-4 border-t border-white/5 shrink-0">
          <button
            onClick={() => onViewEmployee({ name: alert.employeeName, role: alert.employeeRole ?? '', client: '' })}
            className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2"
          >
            View Employee Detail
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const SEVERITY_FILTER_OPTS: { key: AlertSeverity | 'all'; label: string; activeClass: string }[] = [
  { key: 'all',      label: 'All',      activeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'     },
  { key: 'critical', label: 'Critical', activeClass: 'bg-red-500/15 text-red-400 border-red-500/30'         },
  { key: 'high',     label: 'High',     activeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30'},
  { key: 'medium',   label: 'Medium',   activeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'},
  { key: 'low',      label: 'Low',      activeClass: 'bg-green-500/15 text-green-400 border-green-500/30'  },
];

interface Props {
  onLogout: () => void;
  onEmployeeClick: (emp: Employee) => void;
  onSectionNavigate: (section: NavSection) => void;
  clientName?: string;
}

export const AlertsPage: React.FC<Props> = ({
  onLogout, onEmployeeClick, onSectionNavigate, clientName = 'Your Company',
}) => {
  const { sessions, loading, usingMock, error, refetch } = useSessions();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<Alert['alertType'] | 'all'>('all');
  const [groupByEmployee, setGroupByEmployee] = useState(true);

  const allAlerts = useMemo(() => generateAlerts(sessions), [sessions]);

  const filtered = useMemo(() => {
    const base = allAlerts.filter(a => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (typeFilter !== 'all' && a.alertType !== typeFilter) return false;
      return true;
    });
    // Re-sort after filter: severity first, then timestamp desc
    return [...base].sort((a, b) => {
      const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return sd !== 0 ? sd : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [allAlerts, severityFilter, typeFilter]);

  const groupedAlerts = useMemo(() => {
    const map = new Map<string, Alert[]>();
    filtered.forEach(a => {
      if (!map.has(a.employeeName)) map.set(a.employeeName, []);
      map.get(a.employeeName)!.push(a);
    });
    return [...map.entries()]
      .sort(([, aArr], [, bArr]) => {
        const aTop = Math.min(...aArr.map(a => SEVERITY_ORDER[a.severity]));
        const bTop = Math.min(...bArr.map(b => SEVERITY_ORDER[b.severity]));
        return aTop !== bTop ? aTop - bTop : bArr.length - aArr.length;
      });
  }, [filtered]);

  useEffect(() => {
    const id = setInterval(() => refetch(false), 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  const countBy = (sev: AlertSeverity) => allAlerts.filter(a => a.severity === sev).length;

  return (
    <div className="min-h-screen bg-navy-900 text-white flex">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/3 blur-[180px] rounded-full" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-700/4 blur-[150px] rounded-full" />
      </div>

      <DashboardSidebar
        activeSection="alerts"
        onNavigate={onSectionNavigate}
        alertCount={allAlerts.length}
        onLogout={onLogout}
        clientName={clientName}
      />

      <div className="flex-1 ml-56 flex flex-col min-h-screen relative z-10">
        {/* Context header */}
        <header className="sticky top-0 z-40 bg-navy-900/85 backdrop-blur-2xl border-b border-white/5 shrink-0">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button onClick={() => onSectionNavigate('dashboard')} className="text-gray-600 hover:text-gray-400 transition-colors">
                Workforce Intelligence
              </button>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white font-semibold">Alerts</span>
            </div>
            <div className="flex items-center gap-2.5">
              {error ? (
                <div className="hidden sm:flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border bg-red-500/8 border-red-500/30 text-red-400">
                  <WifiOff className="w-3.5 h-3.5" />
                  API Error
                </div>
              ) : usingMock ? (
                <div className="hidden sm:flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border bg-amber-500/5 border-amber-500/20 text-amber-400">
                  <WifiOff className="w-3.5 h-3.5" />
                  Dev mode
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border bg-green-500/5 border-green-500/20 text-green-400">
                  <Wifi className="w-3.5 h-3.5" />
                  Live API
                </div>
              )}
              <button type="button" onClick={() => refetch(true)} aria-label="Refresh alerts" title="Refresh alerts" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-7 flex flex-col gap-6">
          {/* API error banner */}
          {error && !loading && (
            <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/25 rounded-2xl px-5 py-4">
              <WifiOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-400">Live session data unavailable</p>
                <p className="text-xs text-red-400/70 mt-0.5 break-words">{error}</p>
              </div>
              <button onClick={() => refetch(true)} className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 transition-colors shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}
          {/* Page heading */}
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Active Alerts</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {allAlerts.length} total ·{' '}
                <span className="text-red-400">{countBy('critical')} critical</span> ·{' '}
                <span className="text-orange-400">{countBy('high')} high</span> ·{' '}
                <span className="text-yellow-400">{countBy('medium')} medium</span> ·{' '}
                <span className="text-green-400">{countBy('low')} low</span>
              </p>
            </div>
            {allAlerts.length === 0 && !loading && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
                <ShieldCheck className="w-4 h-4" />
                No active alerts — team is performing well
              </div>
            )}
          </div>

          {/* Summary cards — 4 severity buckets */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = countBy(sev);
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev === severityFilter ? 'all' : sev)}
                  className={`border rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.02] ${cfg.bg} ${cfg.border} ${
                    severityFilter === sev ? 'ring-1 ring-white/20' : ''
                  }`}
                >
                  <p className={`text-xs uppercase tracking-widest font-bold ${cfg.color} mb-1`}>{cfg.label}</p>
                  <p className={`text-2xl font-black ${cfg.color}`}>{count}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {count === 1 ? 'alert' : 'alerts'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Severity filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Severity:</span>
              {SEVERITY_FILTER_OPTS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSeverityFilter(opt.key as AlertSeverity | 'all')}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                    severityFilter === opt.key
                      ? opt.activeClass
                      : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-white/5 mx-1" />

            {/* Type filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Type:</span>
              {(['all', 'low_focus', 'high_idle', 'high_context_switch', 'suspicious_inactivity'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                    typeFilter === t
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                      : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
                  }`}
                >
                  {t === 'all' ? 'All types' : ALERT_LABEL[t]}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">View:</span>
              <button
                onClick={() => setGroupByEmployee(false)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  !groupByEmployee
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
                }`}
              >All Alerts</button>
              <button
                onClick={() => setGroupByEmployee(true)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                  groupByEmployee
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
                }`}
              >By Employee</button>
            </div>
          </div>

          {/* Alert display */}
          {loading ? (
            <div className="py-16 text-center text-gray-600 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-navy-800/60 border border-white/8 rounded-2xl py-16 text-center">
              <ShieldCheck className="w-8 h-8 text-green-500/40 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">
                {severityFilter !== 'all' || typeFilter !== 'all'
                  ? 'No alerts match your current filters.'
                  : 'No alerts detected. Team is performing within normal thresholds.'}
              </p>
            </div>
          ) : groupByEmployee ? (
            /* ── Grouped by employee ─────────────────────────────────────── */
            <div className="flex flex-col gap-3">
              {groupedAlerts.map(([empName, empAlerts]) => {
                let topSev: AlertSeverity = empAlerts[0].severity;
                for (const a of empAlerts) {
                  if (SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[topSev]) topSev = a.severity;
                }
                const gc = SEVERITY_CONFIG[topSev];
                const role = empAlerts[0]?.employeeRole;
                return (
                  <div key={empName} className={`border rounded-2xl overflow-hidden bg-navy-800/60 ${gc.border}`}>
                    {/* Group header */}
                    <div className={`px-5 py-3.5 ${gc.bg} flex items-center justify-between gap-3`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-navy-800/80 border ${gc.border} flex items-center justify-center ${gc.color} font-bold text-sm shrink-0`}>
                          {empName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{empName}</p>
                          {role && <p className="text-[11px] text-gray-500">{role}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <SeverityBadge severity={topSev} />
                        <span className={`text-xs font-semibold ${gc.color}`}>
                          {empAlerts.length} alert{empAlerts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    {/* Alert rows */}
                    {empAlerts.map(alert => {
                      const ac = SEVERITY_CONFIG[alert.severity];
                      return (
                        <button
                          key={alert.id}
                          onClick={() => setSelectedAlert(alert)}
                          className="w-full flex items-center gap-3 px-5 py-3 border-t border-white/5 hover:bg-white/3 transition-colors text-left group"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${ac.dot}`} />
                          <SeverityBadge severity={alert.severity} />
                          <span className="text-sm text-white flex-1 min-w-0 truncate">{alert.alertLabel}</span>
                          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">{alert.details}</span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">{fmtTimeAgo(alert.timestamp)}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Flat table ──────────────────────────────────────────────── */
            <div className="bg-navy-800/60 border border-white/8 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center px-5 py-3 border-b border-white/5 text-[10px] font-bold text-gray-600 uppercase tracking-widest gap-4">
                <span>Severity</span>
                <span>Employee · Alert</span>
                <span>Type</span>
                <span>Details</span>
                <span>Detected</span>
                <span></span>
              </div>
              {filtered.map(alert => {
                const cfg = SEVERITY_CONFIG[alert.severity];
                return (
                  <button
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center px-5 py-4 border-b border-white/5 hover:bg-white/3 transition-colors gap-4 text-left group"
                  >
                    <div className="flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} title={cfg.label} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center ${cfg.color} font-bold text-xs shrink-0`}>
                          {alert.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          {alert.employeeName}
                        </span>
                        {alert.employeeRole && (
                          <span className="text-xs text-gray-600 hidden sm:block">· {alert.employeeRole}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-9 mt-0.5">
                        <p className="text-xs text-gray-500">{alert.alertLabel}</p>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                    </div>
                    <AlertTypeBadge type={alert.alertType} />
                    <span className="text-xs text-gray-400 whitespace-nowrap">{alert.details}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{fmtTimeAgo(alert.timestamp)}</span>
                    <ChevronRight className="w-4 h-4 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>
          )}

          <footer className="text-center text-xs text-gray-700 pb-4 pt-2">
            TELER · Alerts · Sorted by severity · Auto-refreshes every 30s · {filtered.length} of {allAlerts.length} shown
          </footer>
        </main>
      </div>

      <AlertDetailDrawer
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onViewEmployee={(emp) => { setSelectedAlert(null); onEmployeeClick(emp); }}
      />
    </div>
  );
};
