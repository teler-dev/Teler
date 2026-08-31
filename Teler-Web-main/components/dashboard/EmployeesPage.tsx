import React, { useMemo, useEffect, useState } from 'react';
import { useSessions } from './useSessions';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts, alertsForEmployee } from './alertUtils';
import { Employee, Session, classifyScore } from '../../types';
import {
  Wifi, WifiOff, RefreshCw, ChevronRight, ArrowRight, Search,
  AlertTriangle, TrendingUp, Users,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function avgArr(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmtTimeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const ms = Date.now() - new Date(ts).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Activity status ────────────────────────────────────────────────────────────

type EmployeeStatus = 'working' | 'idle' | 'offline';

function getStatus(lastSessionEnd: string | null): EmployeeStatus {
  if (!lastSessionEnd) return 'offline';
  const ageMs = Date.now() - new Date(lastSessionEnd).getTime();
  if (ageMs < 10 * 60_000) return 'working';
  if (ageMs < 30 * 60_000) return 'idle';
  return 'offline';
}

const STATUS_DOT: Record<EmployeeStatus, string> = {
  working: 'bg-green-400 animate-pulse',
  idle:    'bg-amber-400',
  offline: 'bg-gray-600',
};
const STATUS_LABEL: Record<EmployeeStatus, string> = {
  working: 'Working', idle: 'Idle', offline: 'Offline',
};
const STATUS_TEXT: Record<EmployeeStatus, string> = {
  working: 'text-green-400', idle: 'text-amber-400', offline: 'text-gray-500',
};

// ── Per-employee row data ──────────────────────────────────────────────────────

interface EmpRow {
  employee: Employee;
  avgScore7d: number;
  sessions7d: number;
  totalSessions: number;
  isActiveToday: boolean;
  status: EmployeeStatus;
  lastSessionEnd: string | null;
  alertCount: number;
}

function buildRows(sessions: Session[], cutoff7d: Date, today: string, allAlerts: ReturnType<typeof generateAlerts>): EmpRow[] {
  const uniqueUsers = new Set(sessions.map(s => s.userName).filter(Boolean));
  const useRoleGrouping = uniqueUsers.size <= 1 && sessions.some(s => s.role);

  const map = new Map<string, { emp: Employee; all: Session[] }>();
  for (const s of sessions) {
    const key = useRoleGrouping
      ? (s.role || s.userName || 'Unknown')
      : (s.userName || s.role || 'Unknown');
    if (!map.has(key)) {
      map.set(key, { emp: { name: key, role: s.role ?? '', client: s.client ?? '' }, all: [] });
    }
    map.get(key)!.all.push(s);
  }

  return [...map.values()].map(({ emp, all }) => {
    const sessions7d = all.filter(s => new Date(s.created_at) >= cutoff7d);
    const scores7d = sessions7d.map(s => s.overall_productivity_score).filter(v => v > 0);
    const isActiveToday = all.some(s => s.created_at.startsWith(today));
    const lastSessionEnd = all.length
      ? all.reduce((latest, s) => {
          const ts = s.session_end || s.created_at;
          return ts > latest ? ts : latest;
        }, '')
      : null;
    return {
      employee:      emp,
      avgScore7d:    scores7d.length ? avgArr(scores7d) : 0,
      sessions7d:    sessions7d.length,
      totalSessions: all.length,
      isActiveToday,
      status:        getStatus(lastSessionEnd),
      lastSessionEnd,
      alertCount:    alertsForEmployee(allAlerts, emp.name).length,
    };
  });
}

// ── Components ─────────────────────────────────────────────────────────────────

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  if (score === 0) return <span className="text-xs text-gray-600">—</span>;
  const c = classifyScore(score);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${c.bg} ${c.color} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {Math.round(score)}
    </span>
  );
};

// ── Status priority sort ──────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<EmployeeStatus, number> = { working: 0, idle: 1, offline: 2 };

function categorize(row: EmpRow): 'attention' | 'top' | 'all' {
  if (row.alertCount > 0 || (row.avgScore7d > 0 && row.avgScore7d < 50)) return 'attention';
  if (row.avgScore7d >= 75 && row.alertCount === 0) return 'top';
  return 'all';
}

const SectionHeader: React.FC<{ title: string; count: number; icon: React.ReactNode; accent: string }> = ({
  title, count, icon, accent,
}) => (
  <div className={`flex items-center gap-2 px-5 py-2.5 border-b border-white/5 border-l-2 ${accent} bg-white/[0.015]`}>
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
    <span className="ml-1 text-[10px] text-gray-600">({count})</span>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onLogout: () => void;
  onEmployeeClick: (emp: Employee) => void;
  onSectionNavigate: (section: NavSection) => void;
  clientName?: string;
}

export const EmployeesPage: React.FC<Props> = ({
  onLogout, onEmployeeClick, onSectionNavigate, clientName = 'Your Company',
}) => {
  const { sessions, loading, usingMock, error, refetch } = useSessions();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('all');

  const cutoff7d = useMemo(() => daysAgo(7), []);
  const today    = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const allAlerts = useMemo(() => generateAlerts(sessions), [sessions]);

  const rows = useMemo(
    () => buildRows(sessions, cutoff7d, today, allAlerts),
    [sessions, cutoff7d, today, allAlerts]
  );

  const sections = useMemo(() => {
    const q = search.toLowerCase();
    const base = rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q && !r.employee.name.toLowerCase().includes(q) &&
               !r.employee.role.toLowerCase().includes(q) &&
               !r.employee.client.toLowerCase().includes(q)) return false;
      return true;
    });
    const sortByStatus = (a: EmpRow, b: EmpRow) => {
      const sd = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (sd !== 0) return sd;
      if (b.alertCount !== a.alertCount) return b.alertCount - a.alertCount;
      return b.avgScore7d - a.avgScore7d;
    };
    return {
      attention: base.filter(r => categorize(r) === 'attention').sort(sortByStatus),
      top:       base.filter(r => categorize(r) === 'top').sort(sortByStatus),
      all:       base.filter(r => categorize(r) === 'all').sort(sortByStatus),
    };
  }, [rows, search, statusFilter]);

  // 30s auto-refresh
  useEffect(() => {
    const id = setInterval(() => refetch(false), 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  const statusCounts = useMemo(() => ({
    working: rows.filter(r => r.status === 'working').length,
    idle:    rows.filter(r => r.status === 'idle').length,
    offline: rows.filter(r => r.status === 'offline').length,
  }), [rows]);

  const renderRow = (row: EmpRow) => (
    <button
      key={row.employee.name}
      onClick={() => onEmployeeClick(row.employee)}
      className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center px-5 py-4 border-b border-white/5 hover:bg-white/3 transition-colors gap-4 text-left group"
    >
      <div className="flex items-center justify-center">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[row.status]}`} title={STATUS_LABEL[row.status]} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs shrink-0">
            {row.employee.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
            {row.employee.name}
          </span>
          <span className={`text-[10px] font-semibold ${STATUS_TEXT[row.status]}`}>
            · {STATUS_LABEL[row.status]}
          </span>
        </div>
        <p className="text-xs text-gray-600 truncate ml-9">
          {row.employee.role}
          {row.employee.client && ` · ${row.employee.client}`}
        </p>
      </div>
      <ScoreBadge score={Math.round(row.avgScore7d)} />
      <span className="text-sm text-gray-400 text-center">{row.sessions7d}</span>
      <span className="text-xs text-gray-500 whitespace-nowrap">{fmtTimeAgo(row.lastSessionEnd)}</span>
      {row.alertCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
          <AlertTriangle className="w-3 h-3" />
          {row.alertCount}
        </span>
      ) : (
        <span className="text-xs text-gray-700">—</span>
      )}
      <ArrowRight className="w-4 h-4 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );

  return (
    <div className="min-h-screen bg-navy-900 text-white flex">
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/3 blur-[180px] rounded-full" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-700/4 blur-[150px] rounded-full" />
      </div>

      <DashboardSidebar
        activeSection="employees"
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
              <span className="text-white font-semibold">Employees</span>
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
              <button onClick={() => refetch(true)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
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
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Employees</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {rows.length} team member{rows.length !== 1 ? 's' : ''} ·{' '}
                <span className="text-green-400">{statusCounts.working}</span> working ·{' '}
                <span className="text-amber-400">{statusCounts.idle}</span> idle ·{' '}
                <span className="text-gray-500">{statusCounts.offline}</span> offline
              </p>
            </div>
            {allAlerts.length > 0 && (
              <button
                onClick={() => onSectionNavigate('alerts')}
                className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 hover:bg-red-500/20 transition-colors font-semibold"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {allAlerts.length} active alert{allAlerts.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Status filter pills + search */}
          <div className="flex items-center gap-3 flex-wrap">
            {(['all', 'working', 'idle', 'offline'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all capitalize ${
                  statusFilter === s
                    ? s === 'working' ? 'bg-green-500/15 text-green-400 border-green-500/30'
                    : s === 'idle'    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : s === 'offline' ? 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                    : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
                }`}
              >
                {s === 'all' ? `All (${rows.length})` : `${STATUS_LABEL[s]} (${statusCounts[s]})`}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search employees…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-navy-700/60 border border-white/8 text-gray-300 text-xs rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-cyan-500/40 w-52"
              />
            </div>
          </div>

          {/* Employee table */}
          <div className="bg-navy-800/60 border border-white/8 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center px-5 py-3 border-b border-white/5 text-[10px] font-bold text-gray-600 uppercase tracking-widest gap-4">
              <span>Status</span>
              <span>Employee</span>
              <span>Score (7d)</span>
              <span className="text-center">Sessions</span>
              <span>Last Active</span>
              <span>Alerts</span>
              <span></span>
            </div>

            {loading ? (
              <div className="py-16 text-center text-gray-600 text-sm">Loading…</div>
            ) : sections.attention.length === 0 && sections.top.length === 0 && sections.all.length === 0 ? (
              <div className="py-16 text-center text-gray-600 text-sm">
                {search || statusFilter !== 'all' ? 'No employees match your filter.' : 'No employee data.'}
              </div>
            ) : (
              <>
                {sections.attention.length > 0 && (
                  <>
                    <SectionHeader
                      title="Needs Attention"
                      count={sections.attention.length}
                      icon={<AlertTriangle className="w-3 h-3 text-red-400" />}
                      accent="border-l-red-500/40"
                    />
                    {sections.attention.map(renderRow)}
                  </>
                )}
                {sections.top.length > 0 && (
                  <>
                    <SectionHeader
                      title="Top Performers"
                      count={sections.top.length}
                      icon={<TrendingUp className="w-3 h-3 text-green-400" />}
                      accent="border-l-green-500/40"
                    />
                    {sections.top.map(renderRow)}
                  </>
                )}
                {sections.all.length > 0 && (
                  <>
                    <SectionHeader
                      title="All Employees"
                      count={sections.all.length}
                      icon={<Users className="w-3 h-3 text-gray-500" />}
                      accent="border-l-white/10"
                    />
                    {sections.all.map(renderRow)}
                  </>
                )}
              </>
            )}
          </div>

          <footer className="text-center text-xs text-gray-700 pb-4 pt-2">
            TELER · Employees · Auto-refreshes every 30s
          </footer>
        </main>
      </div>
    </div>
  );
};
