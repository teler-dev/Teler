import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceDot,
} from 'recharts';
import { useSessions } from './useSessions';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts, SEVERITY_CONFIG } from './alertUtils';
import { Session, Employee, classifyScore } from '../../types';
import {
  Users, TrendingUp, AlertTriangle, Activity, BrainCircuit,
  CheckCircle, ChevronRight, Info, ArrowRight, Wifi, WifiOff,
  RefreshCw, ChevronUp, ChevronDown, Search, Zap,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_COLORS: Record<string, string> = {
  Elite: '#3DF2FF', Strong: '#4ade80', Moderate: '#fbbf24', Low: '#f87171',
};

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d;
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function avgArr(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}
function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk helpers
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = 'red' | 'yellow' | 'green';
function getRiskLevel(avgScore: number, idlePct: number): RiskLevel {
  if (avgScore < 41 || idlePct > 40) return 'red';
  if (avgScore < 71 || idlePct > 25) return 'yellow';
  return 'green';
}
function getRiskSortValue(level: RiskLevel): number {
  return { red: 0, yellow: 1, green: 2 }[level];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline builder
// ─────────────────────────────────────────────────────────────────────────────

function buildSparkline(sessions: Session[], cutoff7d: Date): { day: number; score: number | null }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(cutoff7d); d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().slice(0, 10);
    const scores = sessions.filter(s => s.created_at.startsWith(dayStr))
      .map(s => s.overall_productivity_score).filter(v => v > 0);
    return { day: i, score: scores.length ? Math.round(avgArr(scores)) : null };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived metrics
// ─────────────────────────────────────────────────────────────────────────────

interface DerivedMetrics {
  focusScore: number; contextSwitchIndex: number; toolUsageEfficiency: number;
  distractionRatio: number; deepWorkRatio: number;
}
function computeDerivedMetrics(sessions: Session[]): DerivedMetrics {
  if (!sessions.length) return { focusScore: 0, contextSwitchIndex: 0, toolUsageEfficiency: 0, distractionRatio: 0, deepWorkRatio: 0 };
  const focusScore          = Math.round(avgArr(sessions.map(s => s.focus_score).filter(v => v > 0)));
  const contextSwitchIndex  = Math.round(avgArr(sessions.map(s => s.context_switching_score).filter(v => v > 0)));
  const toolUsageEfficiency = Math.round(avgArr(sessions.map(s => s.tool_usage_score).filter(v => v > 0)));
  const distractionRatio    = Math.round(avgArr(sessions.map(s => s.total_minutes > 0 ? (s.idle_minutes_estimate / s.total_minutes) * 100 : 0)));
  const deepWorkRatio       = Math.round((sessions.filter(s => s.focus_score >= 70).length / sessions.length) * 100);
  return { focusScore, contextSwitchIndex, toolUsageEfficiency, distractionRatio, deepWorkRatio };
}

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Health Score (composite KPI)
// ─────────────────────────────────────────────────────────────────────────────

function computeWorkforceHealthScore(
  avgScore: number, focusScore: number,
  activeToday: number, totalEmployees: number, alertCount: number,
): number {
  if (avgScore === 0) return 0;
  const base    = avgScore * 0.45 + focusScore * 0.30 + (activeToday / Math.max(totalEmployees, 1)) * 100 * 0.25;
  const penalty = Math.min(20, alertCount * 2.5);
  return Math.max(0, Math.min(100, Math.round(base - penalty)));
}

// ─────────────────────────────────────────────────────────────────────────────
// AI narrative (structured)
// ─────────────────────────────────────────────────────────────────────────────

interface NarrativeInsight {
  message: string; priority: number; type: 'critical' | 'warning' | 'positive' | 'info';
}
interface WorkforceKpis {
  totalEmployees: number; activeToday: number; avgScore: number;
  totalHoursMin: number; idlePct: number; alerts: number;
}

function buildWorkforceNarrative(
  kpis: WorkforceKpis, derived: DerivedMetrics, sessions7dCount: number,
): { insights: NarrativeInsight[]; suggestedAction: string | null } {
  const list: NarrativeInsight[] = [];

  if (kpis.alerts > 0)
    list.push({ type: 'critical', priority: 100, message: `${kpis.alerts} alert${kpis.alerts !== 1 ? 's' : ''} flagged — immediate review recommended across ${kpis.alerts > 3 ? 'multiple' : 'flagged'} sessions.` });
  if (kpis.idlePct > 30)
    list.push({ type: 'warning', priority: 95, message: `Team idle time is critically high at ${Math.round(kpis.idlePct)}% — focus is being lost to unstructured or untracked time.` });
  else if (kpis.idlePct > 20)
    list.push({ type: 'warning', priority: 80, message: `Idle time is elevated at ${Math.round(kpis.idlePct)}% — consider identifying recurring interruption sources.` });
  if (kpis.avgScore >= 80 && kpis.avgScore > 0)
    list.push({ type: 'positive', priority: 75, message: `Strong team performance — average productivity score of ${Math.round(kpis.avgScore)}/100 over the past 7 days.` });
  else if (kpis.avgScore > 0 && kpis.avgScore < 55)
    list.push({ type: 'warning', priority: 90, message: `Team productivity is below target at ${Math.round(kpis.avgScore)}/100 — review workload balance and remove focus blockers.` });
  if (sessions7dCount > 0 && derived.deepWorkRatio >= 60)
    list.push({ type: 'positive', priority: 70, message: `${derived.deepWorkRatio}% of sessions reached deep-work level (focus ≥ 70), indicating strong sustained concentration.` });
  else if (sessions7dCount > 0 && derived.deepWorkRatio < 30)
    list.push({ type: 'warning', priority: 85, message: `Only ${derived.deepWorkRatio}% of sessions achieved deep-work threshold — frequent interruptions may be limiting output quality.` });
  if (sessions7dCount > 0 && derived.contextSwitchIndex < 50)
    list.push({ type: 'info', priority: 60, message: `Low context-switching discipline detected (score: ${derived.contextSwitchIndex}/100) — excessive app juggling may be fragmenting focus.` });
  if (kpis.activeToday === 0 && kpis.totalEmployees > 0)
    list.push({ type: 'info', priority: 55, message: `No team members have recorded sessions today.` });
  else if (kpis.activeToday === kpis.totalEmployees && kpis.totalEmployees > 1)
    list.push({ type: 'positive', priority: 50, message: `Full team attendance — all ${kpis.totalEmployees} members are active today.` });

  const sorted = list.sort((a, b) => b.priority - a.priority).slice(0, 3);

  let suggestedAction: string | null = null;
  const top = sorted[0];
  if (top) {
    if (kpis.alerts > 0)
      suggestedAction = 'Open the Alerts page and review critical sessions. Prioritize employees with multiple flags.';
    else if (kpis.idlePct > 30)
      suggestedAction = 'Review roles with the highest idle time. Consider restructuring unblocked task queues.';
    else if (kpis.avgScore > 0 && kpis.avgScore < 55)
      suggestedAction = 'Schedule performance check-ins with underperforming team members this week.';
    else if (derived.deepWorkRatio < 30 && sessions7dCount > 0)
      suggestedAction = 'Audit recurring interruptions. Consider implementing team-wide focus hour blocks.';
  }

  if (!sorted.length)
    return { insights: [{ type: 'info', priority: 0, message: 'Insufficient session data. Insights will appear once the AI Timer captures activity.' }], suggestedAction: null };

  return { insights: sorted, suggestedAction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-line trend data (3 simultaneous metrics)
// ─────────────────────────────────────────────────────────────────────────────

function buildMultiTrendData(sessions: Session[]) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const dayS = sessions.filter(s => s.created_at.startsWith(dateStr));
    const prodVals  = dayS.map(s => s.overall_productivity_score).filter(v => v > 0);
    const focusVals = dayS.map(s => s.focus_score).filter(v => v > 0);
    return {
      date:         d.toLocaleDateString('en-US', { weekday: 'short' }),
      productivity: prodVals.length  ? Math.round(avgArr(prodVals))  : null,
      focus:        focusVals.length ? Math.round(avgArr(focusVals)) : null,
      idle:         dayS.length ? Math.round(avgArr(dayS.map(s => s.total_minutes > 0 ? (s.idle_minutes_estimate / s.total_minutes) * 100 : 0))) : null,
    };
  });
  const prodNonNull = days.filter(d => d.productivity !== null).map(d => d.productivity as number);
  const mean   = prodNonNull.length ? avgArr(prodNonNull) : 0;
  const stdDev = prodNonNull.length > 1
    ? Math.sqrt(prodNonNull.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / prodNonNull.length) : 0;
  return days.map(d => ({
    ...d,
    isAnomaly:  d.productivity !== null && stdDev > 0 && Math.abs(d.productivity - mean) > 1.5 * stdDev,
    anomalyDir: d.productivity !== null ? (d.productivity > mean ? 'high' : 'low') : null as 'high' | 'low' | null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hourly timeline
// ─────────────────────────────────────────────────────────────────────────────

interface HourBucket {
  hour: number; label: string;
  deepWork: number; productive: number; communication: number; distraction: number; idle: number;
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM'; if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM'; return `${h - 12} PM`;
}

function buildHourlyTimeline(sessions: Session[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: formatHourLabel(h),
    deepWork: 0, productive: 0, communication: 0, distraction: 0, idle: 0,
  }));
  for (const s of sessions) {
    const startStr = s.session_start || s.created_at;
    if (!startStr || !s.total_minutes || s.total_minutes <= 0) continue;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) continue;
    const startMinAbs = start.getHours() * 60 + start.getMinutes();
    const endMinAbs   = startMinAbs + s.total_minutes;
    const idlePct     = Math.min(1, s.total_minutes > 0 ? s.idle_minutes_estimate / s.total_minutes : 0);
    const activePct   = 1 - idlePct;
    const switchCount = s.app_switches?.length ?? 0;
    const switchRate  = s.total_minutes > 0 ? switchCount / (s.total_minutes / 60) : 0;
    const commPct     = activePct * (switchRate > 30 ? 0.15 : switchRate > 15 ? 0.08 : 0.04);
    const deepPct     = s.focus_score >= 70 ? activePct * 0.80 : 0;
    const prodPct     = s.focus_score >= 70 ? activePct * 0.16 : s.focus_score >= 40 ? activePct * 0.65 : activePct * 0.20;
    const distrPct    = Math.max(0, activePct - deepPct - prodPct - commPct);
    for (let h = Math.floor(startMinAbs / 60); h < 24; h++) {
      const hStart  = h * 60;
      const overlap = Math.max(0, Math.min(hStart + 60, endMinAbs) - Math.max(hStart, startMinAbs));
      if (overlap <= 0) break;
      buckets[h].deepWork      += overlap * deepPct;
      buckets[h].productive    += overlap * prodPct;
      buckets[h].communication += overlap * commPct;
      buckets[h].distraction   += overlap * distrPct;
      buckets[h].idle          += overlap * idlePct;
    }
  }
  return buckets;
}

function getHourSessions(sessions: Session[], hour: number): Session[] {
  return sessions.filter(s => {
    const start = new Date(s.session_start || s.created_at);
    if (isNaN(start.getTime()) || !s.total_minutes) return false;
    const startMinAbs = start.getHours() * 60 + start.getMinutes();
    return hour * 60 < startMinAbs + s.total_minutes && (hour + 1) * 60 > startMinAbs;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee stat helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeStat {
  employee: Employee; sessions7d: Session[]; sessionsAll: Session[];
  avgScore: number; totalTrackedMin: number; totalActiveMin: number; idlePct: number;
  alertCount: number; isActiveToday: boolean;
  sparklineData: { day: number; score: number | null }[];
  prevAvgScore: number; lastActiveAt: string | null;
  contextSwitchIndex: number; riskLevel: RiskLevel;
}

function buildEmployeeStats(sessions: Session[], cutoff7d: Date, today: string): EmployeeStat[] {
  const uniqueUsers = new Set(sessions.map(s => s.userName).filter(Boolean));
  const useRoleGrouping = uniqueUsers.size <= 1 && sessions.some(s => s.role);
  const map = new Map<string, { emp: Employee; all: Session[] }>();
  for (const s of sessions) {
    const key = useRoleGrouping ? (s.role || s.userName || 'Unknown') : (s.userName || s.role || 'Unknown');
    if (!map.has(key)) map.set(key, { emp: { name: key, role: s.role ?? '', client: s.client ?? '' }, all: [] });
    map.get(key)!.all.push(s);
  }
  return [...map.values()].map(({ emp, all }) => {
    const sessions7d      = all.filter(s => new Date(s.created_at) >= cutoff7d);
    const scores          = sessions7d.map(s => s.overall_productivity_score).filter(v => v > 0);
    const totalTrackedMin = sessions7d.reduce((a, s) => a + (s.total_minutes ?? 0), 0);
    const totalActiveMin  = sessions7d.reduce((a, s) => a + (s.active_minutes_estimate ?? 0), 0);
    const totalIdleMin    = sessions7d.reduce((a, s) => a + (s.idle_minutes_estimate ?? 0), 0);
    const idlePct         = totalTrackedMin > 0 ? (totalIdleMin / totalTrackedMin) * 100 : 0;
    const isActiveToday   = all.some(s => s.created_at.startsWith(today));
    const cutoff14d       = new Date(cutoff7d); cutoff14d.setDate(cutoff14d.getDate() - 7);
    const prev7d          = all.filter(s => new Date(s.created_at) >= cutoff14d && new Date(s.created_at) < cutoff7d);
    const prevScores      = prev7d.map(s => s.overall_productivity_score).filter(v => v > 0);
    const sparklineData   = buildSparkline(sessions7d, cutoff7d);
    const lastActiveAt    = all.length ? all.reduce((latest, s) => {
      const ts = s.session_end || s.created_at; return ts > latest ? ts : latest;
    }, '') : null;
    const contextSwitchIndex = Math.round(avgArr(sessions7d.map(s => s.context_switching_score).filter(v => v > 0)));
    const avgScoreVal = scores.length ? avgArr(scores) : 0;
    return {
      employee: emp, sessions7d, sessionsAll: all, avgScore: avgScoreVal,
      totalTrackedMin, totalActiveMin, idlePct, isActiveToday, sparklineData,
      prevAvgScore: prevScores.length ? avgArr(prevScores) : 0,
      lastActiveAt: lastActiveAt || null, contextSwitchIndex,
      alertCount: 0, // Will be overridden by generateAlerts post-build
      riskLevel: getRiskLevel(avgScoreVal, idlePct),
    };
  });
}

function getEmployeeTask(stat: EmployeeStat): string {
  const latest = [...stat.sessions7d, ...stat.sessionsAll]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest?.task || latest?.main_tasks?.[0] || 'Active session';
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700): number {
  const [cur, setCur] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef(0);
  useEffect(() => {
    setCur(0); startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      setCur(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return cur;
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return time;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const RiskDot: React.FC<{ level: RiskLevel }> = ({ level }) => (
  <span className={`w-2.5 h-2.5 rounded-full shrink-0 inline-block ${
    level === 'red' ? 'bg-red-400' : level === 'yellow' ? 'bg-amber-400' : 'bg-green-400'
  }`} />
);

const TrendArrow: React.FC<{ current: number; previous: number }> = ({ current, previous }) => {
  if (!previous) return null;
  const delta = Math.round(current - previous);
  const color = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
  return (
    <span className={`text-[10px] font-semibold ${color}`}>
      {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {delta > 0 ? '+' : ''}{delta} vs prev week
    </span>
  );
};

const MiniSparkline: React.FC<{ data: { day: number; score: number | null }[] }> = ({ data }) => (
  <ResponsiveContainer width={80} height={28}>
    <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <Line type="monotone" dataKey="score" stroke="#13D6FF" strokeWidth={1.5}
        dot={{ r: 2, fill: '#13D6FF', strokeWidth: 0 }} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>
);

const MetricTooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="relative group inline-flex items-center gap-1 cursor-help">
    {children}
    <span className="absolute bottom-full left-0 mb-2 w-60 bg-navy-700 border border-white/10 text-gray-300 text-[10px] rounded-lg p-2.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none leading-relaxed whitespace-normal shadow-xl">
      {text}
    </span>
  </div>
);

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
  const c = classifyScore(score);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${c.bg} ${c.color} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
};

const EnhancedKpiCard: React.FC<{
  label: string; value: number; displayValue?: string; sub?: string;
  icon: React.ReactNode; accent?: string; tooltipText?: string;
  prevValue?: number; onClick?: () => void; pulse?: boolean;
}> = ({ label, value, displayValue, sub, icon, accent = 'text-cyan-400', tooltipText, prevValue, onClick, pulse }) => {
  const animated = useCountUp(value);
  return (
    <div
      onClick={onClick}
      className={`bg-navy-800/60 border border-white/8 rounded-2xl px-5 py-4 flex flex-col gap-1.5
        hover:border-cyan-500/20 hover:shadow-[0_0_20px_rgba(19,214,255,0.10)] transition-all duration-300
        ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <MetricTooltip text={tooltipText ?? label}>
          <span className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">{label}</span>
          {tooltipText && <Info className="w-2.5 h-2.5 text-gray-600 shrink-0" />}
        </MetricTooltip>
        <div className={`shrink-0 ${accent}`}>{icon}</div>
      </div>
      <p className={`text-2xl font-black leading-tight ${accent} flex items-center gap-2`}>
        {displayValue ?? String(animated)}
        {pulse && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
      </p>
      {prevValue !== undefined && <TrendArrow current={value} previous={prevValue} />}
      {sub && <p className="text-gray-600 text-[10px]">{sub}</p>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Workforce Intelligence Panel
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_CONFIG: Record<NarrativeInsight['type'], { icon: React.FC<{ className?: string }>; iconCls: string; cardCls: string }> = {
  critical: { icon: AlertTriangle, iconCls: 'text-red-400',   cardCls: 'bg-red-500/8 border-red-500/20' },
  warning:  { icon: AlertTriangle, iconCls: 'text-amber-400', cardCls: 'bg-amber-500/8 border-amber-500/20' },
  positive: { icon: CheckCircle,   iconCls: 'text-green-400', cardCls: 'bg-green-500/8 border-green-500/20' },
  info:     { icon: Info,          iconCls: 'text-cyan-400',  cardCls: 'bg-white/3 border-white/8' },
};

const WorkforceInsightPanel: React.FC<{
  kpis: WorkforceKpis; derived: DerivedMetrics; sessions7dCount: number;
  onViewAlerts: () => void;
}> = ({ kpis, derived, sessions7dCount, onViewAlerts }) => {
  const { insights, suggestedAction } = useMemo(
    () => buildWorkforceNarrative(kpis, derived, sessions7dCount),
    [kpis, derived, sessions7dCount],
  );

  return (
    <div
      className="relative bg-navy-800/60 border border-cyan-500/25 rounded-2xl p-5 flex flex-col gap-3.5 overflow-hidden h-full"
      style={{ boxShadow: '0 0 60px rgba(19,214,255,0.08), inset 0 1px 0 rgba(19,214,255,0.10)' }}
    >
      {/* Ambient glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-cyan-500/8 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-600/5 blur-[60px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
            <BrainCircuit className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">AI Workforce Intelligence</h3>
            <p className="text-gray-500 text-[10px]">Rule-based · 7-day telemetry analysis</p>
          </div>
        </div>
        {kpis.alerts > 0 && (
          <button
            onClick={onViewAlerts}
            className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1 font-semibold hover:bg-red-500/20 transition-colors shrink-0"
          >
            View Alerts →
          </button>
        )}
      </div>

      {/* Insight cards */}
      <div className="relative z-10 flex flex-col gap-2">
        {insights.map((ins, i) => {
          const cfg = INSIGHT_CONFIG[ins.type];
          const Icon = cfg.icon;
          return (
            <div key={i} className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-2.5 ${cfg.cardCls}`}>
              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.iconCls}`} />
              <p className="text-xs text-gray-300 leading-relaxed">{ins.message}</p>
            </div>
          );
        })}
      </div>

      {/* Suggested action */}
      {suggestedAction && (
        <div className="relative z-10 flex items-start gap-2.5 bg-cyan-500/8 border border-cyan-500/20 rounded-xl px-3.5 py-2.5 mt-1">
          <Zap className="w-3.5 h-3.5 mt-0.5 text-cyan-400 shrink-0" />
          <div>
            <p className="text-[9px] text-cyan-500/80 uppercase tracking-widest font-bold mb-0.5">Suggested Action</p>
            <p className="text-xs text-cyan-200/80 leading-relaxed">{suggestedAction}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Team Status Panel (enhanced)
// ─────────────────────────────────────────────────────────────────────────────

type EmployeeStatus = 'working' | 'idle' | 'offline';

const STATUS_CONFIG: Record<EmployeeStatus, { label: string; dot: string; text: string; pulse?: boolean }> = {
  working: { label: 'Working', dot: 'bg-green-400',  text: 'text-green-400', pulse: true  },
  idle:    { label: 'Idle',    dot: 'bg-amber-400',  text: 'text-amber-400'               },
  offline: { label: 'Offline', dot: 'bg-gray-600',   text: 'text-gray-500'                },
};

const TeamStatusPanel: React.FC<{
  stats: EmployeeStat[]; onEmployeeClick: (e: Employee) => void;
  onViewAll: () => void;
}> = ({ stats, onEmployeeClick, onViewAll }) => {
  const now = Date.now();

  const withStatus = useMemo(() => stats.map(s => {
    let status: EmployeeStatus = 'offline';
    if (s.lastActiveAt) {
      const age = now - new Date(s.lastActiveAt).getTime();
      if (age < 10 * 60_000) status = 'working';
      else if (age < 30 * 60_000) status = 'idle';
    }
    return { ...s, status };
  }), [stats]);

  const counts = {
    working: withStatus.filter(s => s.status === 'working').length,
    idle:    withStatus.filter(s => s.status === 'idle').length,
    offline: withStatus.filter(s => s.status === 'offline').length,
  };

  const workingEmployees = withStatus.filter(s => s.status === 'working').slice(0, 5);
  const idleEmployees    = withStatus.filter(s => s.status === 'idle').slice(0, 3);

  return (
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-sm">Team Status</h3>
          <p className="text-gray-500 text-[10px] mt-0.5">Working &lt;10m · Idle &lt;30m · then Offline</p>
        </div>
        <button
          onClick={onViewAll}
          className="text-[10px] text-cyan-400/70 hover:text-cyan-400 font-semibold transition-colors whitespace-nowrap flex items-center gap-1"
        >
          View All <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Count chips */}
      <div className="grid grid-cols-3 gap-2">
        {(['working', 'idle', 'offline'] as EmployeeStatus[]).map(key => (
          <div key={key} className="bg-navy-700/50 border border-white/5 rounded-xl px-3 py-2.5 flex flex-col gap-0.5 text-center">
            <span className={`text-[9px] font-bold uppercase tracking-widest ${STATUS_CONFIG[key].text}`}>
              {STATUS_CONFIG[key].label}
            </span>
            <span className="text-xl font-black text-white">{counts[key]}</span>
          </div>
        ))}
      </div>

      {/* Working employees with task */}
      {workingEmployees.length > 0 && (
        <div>
          <p className="text-[9px] text-green-400/70 uppercase tracking-widest font-bold mb-2">
            Currently Working
          </p>
          <div className="flex flex-col gap-0.5">
            {workingEmployees.map(s => (
              <button
                key={s.employee.name}
                onClick={() => onEmployeeClick(s.employee)}
                className="flex items-start gap-2.5 hover:bg-white/5 rounded-lg px-2 py-2 text-left transition-colors group w-full"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-200 font-medium truncate group-hover:text-white transition-colors">
                    {s.employee.name}
                  </p>
                  <p className="text-[10px] text-gray-600 truncate">
                    {s.employee.role}{s.employee.role && ' · '}{getEmployeeTask(s)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Idle employees — compact */}
      {idleEmployees.length > 0 && (
        <div>
          <p className="text-[9px] text-amber-400/70 uppercase tracking-widest font-bold mb-1.5">Idle</p>
          <div className="flex flex-col gap-0.5">
            {idleEmployees.map(s => (
              <div key={s.employee.name} className="flex items-center gap-2 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-gray-500 truncate">{s.employee.name}</span>
                {s.employee.role && <span className="text-[10px] text-gray-700 truncate">— {s.employee.role}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {workingEmployees.length === 0 && idleEmployees.length === 0 && (
        <p className="text-xs text-gray-600 italic text-center py-2">No active employees right now</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Activity Timeline (enhanced tooltip)
// ─────────────────────────────────────────────────────────────────────────────

const TIMELINE_SEGMENTS = [
  { key: 'deepWork',      label: 'Deep Work',      color: '#13D6FF' },
  { key: 'productive',    label: 'Productive Work', color: '#34d399' },
  { key: 'communication', label: 'Communication',   color: '#818cf8' },
  { key: 'distraction',   label: 'Distraction',     color: '#f97316' },
  { key: 'idle',          label: 'Idle',            color: 'rgba(255,255,255,0.06)' },
] as const;

const TimelineTooltip: React.FC<any> = ({ active, payload, label, sessions }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a: number, p: any) => a + (p.value ?? 0), 0);
  if (total === 0) return null;

  const hour = parseInt(label?.split(':')[0] ?? '0') || 0;
  const hourSessions = getHourSessions(sessions ?? [], hour);
  const focusScores  = hourSessions.map(s => s.focus_score).filter(v => v > 0);
  const avgFocus     = focusScores.length ? Math.round(avgArr(focusScores)) : null;
  const topApps = [...new Set(hourSessions.flatMap(s => s.top_apps ?? []))].slice(0, 3);

  const dominant = payload.reduce((max: any, p: any) => (!max || p.value > max.value) ? p : max, null as any);

  return (
    <div style={{ background: '#0d1421', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', fontSize: 12, minWidth: 200 }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>{label}</p>
      {dominant && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dominant.fill, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{dominant.name}</span>
          <span style={{ color: '#6b7280', fontSize: 10, marginLeft: 'auto' }}>{Math.round(dominant.value)}m</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
        {payload.map((p: any) => p.value > 0 && (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.fill, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#9ca3af', flex: 1 }}>{p.name}</span>
            <span style={{ color: '#d1d5db' }}>{Math.round(p.value)}m</span>
            <span style={{ color: '#4b5563', fontSize: 10 }}>({total > 0 ? Math.round((p.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
      {avgFocus !== null && (
        <p style={{ color: '#13D6FF', fontSize: 10, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
          Avg Focus: <strong>{avgFocus}/100</strong>
        </p>
      )}
      {topApps.length > 0 && (
        <p style={{ color: '#6b7280', fontSize: 10 }}>
          Apps: {topApps.join(', ')}
        </p>
      )}
    </div>
  );
};

const WorkforceActivityTimeline: React.FC<{ sessions: Session[] }> = ({ sessions }) => {
  const chartData = useMemo(() => {
    const buckets = buildHourlyTimeline(sessions);
    return buckets.slice(6, 23).map(b => ({
      label:         b.label,
      deepWork:      Math.round(b.deepWork),
      productive:    Math.round(b.productive),
      communication: Math.round(b.communication),
      distraction:   Math.round(b.distraction),
      idle:          Math.round(b.idle),
    }));
  }, [sessions]);

  const hasData = chartData.some(d =>
    d.deepWork + d.productive + d.communication + d.distraction + d.idle > 0
  );

  return (
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 hover:border-white/12 transition-colors">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-white font-bold text-sm">Workforce Activity Timeline</h3>
          <p className="text-gray-500 text-xs mt-0.5">Hour-of-day activity patterns · All sessions · Hover for breakdown</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {TIMELINE_SEGMENTS.map(seg => (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{
                backgroundColor: seg.color,
                border: seg.key === 'idle' ? '1px solid rgba(255,255,255,0.15)' : 'none',
              }} />
              <span className="text-[10px] text-gray-500 font-medium">{seg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barCategoryGap="15%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} tickFormatter={v => `${v}m`} />
            <Tooltip
              content={(props: any) => <TimelineTooltip {...props} sessions={sessions} />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            {TIMELINE_SEGMENTS.map((seg, i) => (
              <Bar
                key={seg.key} dataKey={seg.key} name={seg.label} stackId="a" fill={seg.color}
                radius={i === TIMELINE_SEGMENTS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                stroke={seg.key === 'idle' ? 'rgba(255,255,255,0.06)' : 'none'}
                strokeWidth={seg.key === 'idle' ? 1 : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[180px] flex items-center justify-center text-gray-600 text-sm">
          No session data to display activity timeline
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Derived Metrics Panel (7 items, enhanced tooltips)
// ─────────────────────────────────────────────────────────────────────────────

const DerivedMetricsPanel: React.FC<{
  metrics: DerivedMetrics; totalHoursMin: number; idlePct: number;
}> = ({ metrics, totalHoursMin, idlePct }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const items = [
    { key: 'focusScore',         label: 'Focus Score',           value: metrics.focusScore,          color: 'bg-cyan-500',    tooltip: 'Average sustained concentration score across all 7-day sessions. Measures uninterrupted deep work periods. Score >70 indicates deep work capability.' },
    { key: 'contextSwitchIndex', label: 'Context Switch Index',  value: metrics.contextSwitchIndex,  color: 'bg-indigo-400',  tooltip: 'Measures how frequently employees switch between applications or tasks. Higher = better discipline. Excessive switching fragments focus and reduces output quality.' },
    { key: 'toolUsageEfficiency',label: 'Tool Efficiency',       value: metrics.toolUsageEfficiency, color: 'bg-green-400',   tooltip: 'Reflects how effectively the team uses their professional software toolchain. High scores indicate purposeful, task-aligned app usage rather than random browsing.' },
    { key: 'distractionRatio',   label: 'Distraction Ratio',     value: metrics.distractionRatio,    color: 'bg-amber-400',   tooltip: 'Average percentage of tracked time spent idle or off-task per session. Lower is better. Values above 25% suggest recurring focus blockers.' },
    { key: 'deepWorkRatio',      label: 'Deep Work Ratio',       value: metrics.deepWorkRatio,       color: 'bg-purple-400',  tooltip: 'Percentage of sessions where focus score reached ≥70 — the threshold for sustained, high-quality deep work. Target: above 50%.' },
    {
      key: 'trackedHours', label: 'Tracked Hours',
      value: Math.round(totalHoursMin / 60), color: 'bg-blue-400',
      tooltip: 'Total tracked work hours across all employees in the last 7 days, derived from session durations.',
    },
    {
      key: 'avgIdle', label: 'Avg Idle %',
      value: Math.round(idlePct), color: idlePct > 25 ? 'bg-amber-400' : 'bg-gray-400',
      tooltip: 'Average percentage of tracked time spent idle across all employees. Values above 25% may indicate focus or engagement issues.',
    },
  ];

  return (
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 hover:border-white/12 transition-colors">
      <div className="mb-4">
        <h3 className="text-white font-bold text-sm">Workforce Derived Metrics</h3>
        <p className="text-gray-500 text-xs mt-0.5">Calculated from raw telemetry · last 7 days · hover for explanation</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-4">
        {items.map(item => (
          <div key={item.key} className="space-y-2 p-2 rounded-xl hover:bg-white/3 transition-colors">
            <MetricTooltip text={item.tooltip}>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold leading-tight">{item.label}</span>
              <Info className="w-3 h-3 text-gray-600 shrink-0" />
            </MetricTooltip>
            <p className="text-xl font-black text-white">
              {item.key === 'trackedHours' ? fmtHours(totalHoursMin) : item.key === 'avgIdle' ? `${item.value}%` : item.value}
              {item.key !== 'trackedHours' && item.key !== 'avgIdle' && <span className="text-gray-600 text-xs font-normal">/100</span>}
            </p>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${item.color} transition-all duration-700 ease-out`}
                style={{ width: mounted ? `${Math.min(item.value, 100)}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Chart tooltip
// ─────────────────────────────────────────────────────────────────────────────

const EnhancedBarTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 160 }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{d.fullName}</p>
      <p style={{ color: '#9ca3af' }}>Score: <strong style={{ color: '#fff' }}>{d.score}/100</strong> · {d.label}</p>
      <p style={{ color: '#9ca3af', marginTop: 4 }}>Active: {d.activeTime}</p>
      <p style={{ color: '#9ca3af' }}>Idle: {d.idlePct}%</p>
    </div>
  );
};

const MultiTrendTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', fontSize: 12, minWidth: 180 }}>
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: '#9ca3af', flex: 1 }}>{p.name}</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{p.value !== null ? `${p.value}${p.dataKey === 'idle' ? '%' : '/100'}` : 'No data'}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Employee table section header
// ─────────────────────────────────────────────────────────────────────────────

type EmpCategory = 'attention' | 'top' | 'all';
function categorizeEmp(stat: EmployeeStat): EmpCategory {
  if (stat.alertCount > 0 || (stat.avgScore > 0 && stat.avgScore < 40)) return 'attention';
  if (stat.alertCount === 0 && stat.avgScore > 80) return 'top';
  return 'all';
}

const EmpSectionHeader: React.FC<{
  title: string; count: number; desc: string;
  icon: React.FC<{ className?: string }>; iconCls: string; borderCls: string; textCls: string;
}> = ({ title, count, desc, icon: Icon, iconCls, borderCls, textCls }) => (
  <div className={`flex items-center gap-3 px-5 py-3 border-b border-white/5 ${borderCls}`}>
    <Icon className={`w-3.5 h-3.5 ${iconCls}`} />
    <span className={`text-xs font-bold ${textCls}`}>{title}</span>
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${iconCls.replace('text-', 'bg-').replace('-400', '-500/10')} border-current/20`}>
      {count}
    </span>
    <span className="text-[10px] text-gray-600 ml-1">{desc}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

const OverviewSkeleton: React.FC = () => (
  <div className="px-6 py-8 flex flex-col gap-7">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-navy-800/60 border border-white/8 rounded-2xl px-5 py-4 space-y-3 animate-shimmer">
          <div className="h-3 w-16 bg-white/5 rounded" />
          <div className="h-8 w-20 bg-white/8 rounded-lg" />
          <div className="h-3 w-24 bg-white/5 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 bg-navy-800/60 border border-white/8 rounded-2xl p-5 h-48 animate-shimmer" />
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 h-48 animate-shimmer" />
    </div>
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 h-52 animate-shimmer" />
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 animate-shimmer">
      <div className="grid grid-cols-4 xl:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-full bg-white/5 rounded" />
            <div className="h-6 w-12 bg-white/8 rounded" />
            <div className="h-1.5 w-full bg-white/5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Sort types
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'avgScore' | 'sessions7d' | 'totalActiveMin' | 'idlePct' | 'alertCount' | 'risk' | 'contextSwitch';
const SortIcon: React.FC<{ col: SortKey; active: SortKey; dir: 'asc' | 'desc' }> = ({ col, active, dir }) => {
  if (col !== active) return null;
  return dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onLogout: () => void;
  onEmployeeClick: (employee: Employee) => void;
  onSectionNavigate: (section: NavSection) => void;
  clientName?: string;
}

export const EmployerOverview: React.FC<Props> = ({
  onLogout, onEmployeeClick, onSectionNavigate, clientName = 'Your Company',
}) => {
  const { sessions, loading, usingMock, error, refetch } = useSessions();
  const [sortKey, setSortKey]       = useState<SortKey>('avgScore');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [tableSearch, setTableSearch] = useState('');
  const now = useClock();

  const cutoff7d = useMemo(() => daysAgo(7), []);
  const today    = useMemo(() => todayStr(), []);

  // ── Employee stats ──────────────────────────────────────────────────────
  const allAlerts = useMemo(() => generateAlerts(sessions), [sessions]);

  const employeeStats = useMemo(() => {
    const stats = buildEmployeeStats(sessions, cutoff7d, today);
    // Attach real alert counts from generateAlerts
    return stats.map(stat => ({
      ...stat,
      alertCount: allAlerts.filter(a => a.employeeName === stat.employee.name).length,
    }));
  }, [sessions, cutoff7d, today, allAlerts]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo<WorkforceKpis>(() => {
    const allScores7d  = employeeStats.flatMap(e => e.sessions7d.map(s => s.overall_productivity_score).filter(v => v > 0));
    const totalTracked = employeeStats.reduce((a, e) => a + e.totalTrackedMin, 0);
    const totalIdle    = employeeStats.reduce((a, e) => a + e.sessions7d.reduce((b, s) => b + (s.idle_minutes_estimate ?? 0), 0), 0);
    return {
      totalEmployees: employeeStats.length,
      activeToday:    employeeStats.filter(e => e.isActiveToday).length,
      avgScore:       allScores7d.length > 0 ? avgArr(allScores7d) : 0,
      totalHoursMin:  totalTracked,
      idlePct:        totalTracked > 0 ? (totalIdle / totalTracked) * 100 : 0,
      alerts:         allAlerts.length,
    };
  }, [employeeStats, allAlerts]);

  const sessions7dAll  = useMemo(() => sessions.filter(s => new Date(s.created_at) >= cutoff7d), [sessions, cutoff7d]);
  const derivedMetrics = useMemo(() => computeDerivedMetrics(sessions7dAll), [sessions7dAll]);

  const workforceHealthScore = useMemo(
    () => computeWorkforceHealthScore(kpis.avgScore, derivedMetrics.focusScore, kpis.activeToday, kpis.totalEmployees, kpis.alerts),
    [kpis, derivedMetrics],
  );

  // Deep work hours from full session history (hourly timeline)
  const deepWorkHours = useMemo(() => {
    const buckets = buildHourlyTimeline(sessions);
    return buckets.reduce((a, b) => a + b.deepWork, 0) / 60;
  }, [sessions]);

  // ── Multi-trend data ────────────────────────────────────────────────────
  const multiTrendData = useMemo(() => buildMultiTrendData(sessions), [sessions]);

  // ── Bar chart ───────────────────────────────────────────────────────────
  const barData = useMemo(
    () => [...employeeStats].filter(e => e.avgScore > 0).sort((a, b) => b.avgScore - a.avgScore).map(e => ({
      name: e.employee.name.split(' ')[0], fullName: e.employee.name,
      score: Math.round(e.avgScore), label: classifyScore(e.avgScore).label,
      idlePct: Math.round(e.idlePct), activeTime: fmtHours(e.totalActiveMin),
    })),
    [employeeStats],
  );

  // ── Employee table sort + risk sections ─────────────────────────────────
  const sortedStats = useMemo(() => {
    return [...employeeStats].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'name')          diff = a.employee.name.localeCompare(b.employee.name);
      else if (sortKey === 'sessions7d') diff = a.sessions7d.length - b.sessions7d.length;
      else if (sortKey === 'risk')     diff = getRiskSortValue(a.riskLevel) - getRiskSortValue(b.riskLevel);
      else if (sortKey === 'contextSwitch') diff = a.contextSwitchIndex - b.contextSwitchIndex;
      else diff = (a[sortKey as keyof EmployeeStat] as number) - (b[sortKey as keyof EmployeeStat] as number);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [employeeStats, sortKey, sortDir]);

  const filteredStats = useMemo(() => {
    const q = tableSearch.toLowerCase();
    if (!q) return sortedStats;
    return sortedStats.filter(s =>
      s.employee.name.toLowerCase().includes(q) ||
      s.employee.role.toLowerCase().includes(q) ||
      s.employee.client.toLowerCase().includes(q)
    );
  }, [sortedStats, tableSearch]);

  const tableSections = useMemo(() => ({
    attention: filteredStats.filter(s => categorizeEmp(s) === 'attention'),
    top:       filteredStats.filter(s => categorizeEmp(s) === 'top'),
    all:       filteredStats.filter(s => categorizeEmp(s) === 'all'),
  }), [filteredStats]);

  // ── 30s auto-refresh ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => refetch(false), 30_000);
    return () => clearInterval(id);
  }, [refetch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const healthColor = workforceHealthScore >= 70 ? 'text-cyan-400' : workforceHealthScore >= 50 ? 'text-amber-400' : 'text-red-400';

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 text-white flex">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/3 blur-[180px] rounded-full" />
          <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-700/4 blur-[150px] rounded-full" />
        </div>
        <DashboardSidebar activeSection="dashboard" onNavigate={onSectionNavigate} alertCount={0} onLogout={onLogout} clientName={clientName} />
        <div className="flex-1 ml-56 flex flex-col relative z-10">
          <header className="sticky top-0 z-40 bg-navy-900/85 backdrop-blur-2xl border-b border-white/5">
            <div className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-gray-600">Workforce Intelligence</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white font-semibold">Dashboard</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border bg-amber-500/5 border-amber-500/20 text-amber-400">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Loading data…</span>
              </div>
            </div>
          </header>
          <main className="relative z-10 flex-1"><OverviewSkeleton /></main>
        </div>
      </div>
    );
  }

  // ── Row renderer ────────────────────────────────────────────────────────
  const renderEmpRow = (stat: EmployeeStat) => {
    const lastTs = stat.lastActiveAt;
    const ageMs  = lastTs ? Date.now() - new Date(lastTs).getTime() : Infinity;
    const rowStatus: EmployeeStatus = ageMs < 10 * 60_000 ? 'working' : ageMs < 30 * 60_000 ? 'idle' : 'offline';
    return (
      <button
        key={stat.employee.name}
        onClick={() => onEmployeeClick(stat.employee)}
        className="w-full grid grid-cols-[auto_1fr_repeat(7,auto)] items-center px-5 py-4 border-b border-white/5 hover:bg-white/3 transition-colors gap-4 text-left group"
      >
        {/* Avatar + status dot */}
        <div className="relative w-8 h-8 shrink-0">
          <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm select-none">
            {stat.employee.name.charAt(0).toUpperCase()}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0f1a] ${
            rowStatus === 'working' ? 'bg-green-400' : rowStatus === 'idle' ? 'bg-amber-400' : 'bg-gray-600'
          }`} />
        </div>
        {/* Name & role */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">{stat.employee.name}</span>
            {stat.isActiveToday && (
              <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-1.5 py-0.5 font-semibold shrink-0">
                <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />Today
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 truncate">{stat.employee.role}{stat.employee.client && ` · ${stat.employee.client}`}</div>
        </div>
        {/* Score */}
        <div className="text-right">
          <ScoreBadge score={Math.round(stat.avgScore)} />
          <TrendArrow current={stat.avgScore} previous={stat.prevAvgScore} />
        </div>
        {/* Sessions */}
        <span className="text-sm text-gray-400 text-center">{stat.sessions7d.length}</span>
        {/* Active time */}
        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtHours(stat.totalActiveMin)}</span>
        {/* Idle % */}
        <span className={`text-xs font-semibold ${stat.idlePct > 25 ? 'text-amber-400' : 'text-gray-400'}`}>{Math.round(stat.idlePct)}%</span>
        {/* Alerts */}
        <span className={`text-xs font-bold ${stat.alertCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>{stat.alertCount > 0 ? stat.alertCount : '—'}</span>
        {/* Risk */}
        <div className="flex items-center gap-1.5">
          <RiskDot level={stat.riskLevel} />
          <span className={`text-[10px] font-semibold capitalize hidden lg:block ${stat.riskLevel === 'red' ? 'text-red-400' : stat.riskLevel === 'yellow' ? 'text-amber-400' : 'text-green-400'}`}>{stat.riskLevel}</span>
        </div>
        {/* Sparkline */}
        <div className="opacity-70 group-hover:opacity-100 transition-opacity"><MiniSparkline data={stat.sparklineData} /></div>
      </button>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-navy-900 text-white flex">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/3 blur-[180px] rounded-full" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-700/4 blur-[150px] rounded-full" />
      </div>

      <DashboardSidebar
        activeSection="dashboard"
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
              <span className="text-gray-600">Workforce Intelligence</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white font-semibold">Dashboard</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-white/3 border border-white/5 rounded-lg px-3 py-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />{timeStr}
              </div>
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
              <button onClick={() => refetch(true)} title="Refresh" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
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
              <h1 className="text-2xl font-black text-white tracking-tight">{clientName}</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Workforce Intelligence · <span className="text-cyan-400">{kpis.totalEmployees}</span> employees · Last 7 days
              </p>
            </div>
            <div className="text-xs text-gray-600">{sessions.length} total sessions on record</div>
          </div>

          {/* ── Section 1: KPI Cards (4) ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <EnhancedKpiCard
              label="Workforce Health"
              value={workforceHealthScore}
              displayValue={workforceHealthScore > 0 ? `${workforceHealthScore}` : '—'}
              sub="Composite · productivity + focus + activity"
              icon={<Activity className="w-5 h-5" />}
              accent={healthColor}
              tooltipText="Composite workforce health score (0–100) combining avg productivity (45%), focus score (30%), active participation (25%), minus alert penalty."
            />
            <EnhancedKpiCard
              label="Active Workforce"
              value={kpis.activeToday}
              displayValue={`${kpis.activeToday} / ${kpis.totalEmployees}`}
              sub="employees active today"
              icon={<Users className="w-5 h-5" />}
              accent="text-green-400"
              tooltipText="Employees with at least one session recorded today vs. total headcount."
              onClick={() => onSectionNavigate('employees')}
              pulse={kpis.activeToday > 0}
            />
            <EnhancedKpiCard
              label="Deep Work Hours"
              value={Math.round(deepWorkHours * 10)}
              displayValue={deepWorkHours > 0 ? `${deepWorkHours.toFixed(1)}h` : '—'}
              sub="sustained focus sessions"
              icon={<BrainCircuit className="w-5 h-5" />}
              accent="text-cyan-400"
              tooltipText="Total estimated deep work time (focus ≥ 70) across all sessions, derived from the activity timeline."
            />
            <EnhancedKpiCard
              label="Alerts / Risks"
              value={allAlerts.length}
              sub="active workforce alerts"
              icon={<AlertTriangle className="w-5 h-5" />}
              accent={allAlerts.length > 0 ? 'text-red-400' : 'text-gray-500'}
              tooltipText="Active alerts from focus, idle, and context-switching rules. Click to review all alerts sorted by severity."
              onClick={() => onSectionNavigate('alerts')}
            />
          </div>

          {/* ── Section 2: AI Insight + Team Status ──────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <WorkforceInsightPanel
                kpis={kpis}
                derived={derivedMetrics}
                sessions7dCount={sessions7dAll.length}
                onViewAlerts={() => onSectionNavigate('alerts')}
              />
            </div>
            <TeamStatusPanel
              stats={employeeStats}
              onEmployeeClick={onEmployeeClick}
              onViewAll={() => onSectionNavigate('employees')}
            />
          </div>

          {/* ── Section 3: Workforce Activity Timeline ───────────────────── */}
          <WorkforceActivityTimeline sessions={sessions} />

          {/* ── Section 4: Derived Metrics (7 items) ─────────────────────── */}
          <DerivedMetricsPanel
            metrics={derivedMetrics}
            totalHoursMin={kpis.totalHoursMin}
            idlePct={kpis.idlePct}
          />

          {/* ── Section 5: Productivity Distribution (full width) ─────────── */}
          <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 hover:border-white/12 transition-colors">
            <h3 className="text-white font-bold text-sm mb-1">Productivity Distribution</h3>
            <p className="text-gray-500 text-xs mb-4">Average score per employee · last 7 days · click a bar to view employee detail</p>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<EnhancedBarTooltip />} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }}
                    onClick={(data: any) => {
                      const stat = employeeStats.find(e => e.employee.name.split(' ')[0] === data.name);
                      if (stat) onEmployeeClick(stat.employee);
                    }}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={SCORE_COLORS[entry.label] ?? '#6b7280'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No session data in last 7 days</div>
            )}
          </div>

          {/* ── Section 6: Weekly Trend — 3 simultaneous lines ────────────── */}
          <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 hover:border-white/12 transition-colors">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-white font-bold text-sm">Weekly Trend</h3>
                <p className="text-gray-500 text-xs mt-0.5">All employees · last 7 days · anomaly markers in red/amber</p>
              </div>
              {/* Inline legend */}
              <div className="flex items-center gap-4">
                {[
                  { color: '#13D6FF', label: 'Productivity' },
                  { color: '#4ade80', label: 'Focus Score' },
                  { color: '#f59e0b', label: 'Idle %' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="text-[10px] text-gray-500 font-medium">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={multiTrendData} margin={{ right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<MultiTrendTooltip />} />
                <Line type="monotone" dataKey="productivity" name="Productivity" stroke="#13D6FF" strokeWidth={2}
                  dot={{ fill: '#13D6FF', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#3DF2FF' }} connectNulls={false} />
                <Line type="monotone" dataKey="focus" name="Focus Score" stroke="#4ade80" strokeWidth={2}
                  strokeDasharray="5 3" dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#86efac' }} connectNulls={false} />
                <Line type="monotone" dataKey="idle" name="Idle %" stroke="#f59e0b" strokeWidth={1.5}
                  strokeDasharray="3 3" dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#fcd34d' }} connectNulls={false} />
                {multiTrendData.filter(d => d.isAnomaly && d.productivity !== null).map((d, i) => (
                  <ReferenceDot key={i} x={d.date} y={d.productivity!} r={6}
                    fill={d.anomalyDir === 'high' ? '#f87171' : '#f59e0b'}
                    stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Section 7: Employee Table with Risk Sections ──────────────── */}
          <div className="bg-navy-800/60 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-white font-bold text-sm">Employee Performance</h3>
                <p className="text-gray-500 text-xs mt-0.5">
                  {tableSections.attention.length > 0 && <span className="text-red-400 mr-2">{tableSections.attention.length} needs attention ·</span>}
                  {tableSections.top.length > 0 && <span className="text-green-400 mr-2">{tableSections.top.length} top performers ·</span>}
                  Click any row to view detailed telemetry in Dashboard 2
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input
                  type="text" placeholder="Search employees…" value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  className="bg-navy-700/60 border border-white/8 text-gray-300 text-xs rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-cyan-500/40 w-44"
                />
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_repeat(7,auto)] items-center px-5 py-2.5 border-b border-white/5 text-[10px] font-bold text-gray-600 uppercase tracking-widest gap-4">
              <span></span>
              <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-400 transition-colors text-left">
                Employee <SortIcon col="name" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('avgScore')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Score <SortIcon col="avgScore" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('sessions7d')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Sessions <SortIcon col="sessions7d" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('totalActiveMin')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Active <SortIcon col="totalActiveMin" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('idlePct')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Idle % <SortIcon col="idlePct" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('alertCount')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Alerts <SortIcon col="alertCount" active={sortKey} dir={sortDir} />
              </button>
              <button onClick={() => handleSort('risk')} className="flex items-center gap-1 hover:text-gray-400 transition-colors">
                Risk <SortIcon col="risk" active={sortKey} dir={sortDir} />
              </button>
              <span>7d Trend</span>
            </div>

            {filteredStats.length === 0 ? (
              <div className="py-16 text-center text-gray-600 text-sm">
                {tableSearch ? 'No employees match your search.' : 'No employee data available.'}
              </div>
            ) : (
              <>
                {/* Needs Attention */}
                {tableSections.attention.length > 0 && (
                  <>
                    <EmpSectionHeader
                      title="Needs Attention" count={tableSections.attention.length}
                      desc="Alerts active or productivity below threshold"
                      icon={AlertTriangle} iconCls="text-red-400" borderCls="border-l-2 border-red-500/50 bg-red-500/3" textCls="text-red-300"
                    />
                    {tableSections.attention.map(renderEmpRow)}
                  </>
                )}

                {/* Top Performers */}
                {tableSections.top.length > 0 && (
                  <>
                    <EmpSectionHeader
                      title="Top Performers" count={tableSections.top.length}
                      desc="Productivity score > 80 · No active alerts"
                      icon={TrendingUp} iconCls="text-green-400" borderCls="border-l-2 border-green-500/50 bg-green-500/3" textCls="text-green-300"
                    />
                    {tableSections.top.map(renderEmpRow)}
                  </>
                )}

                {/* All Employees */}
                {tableSections.all.length > 0 && (
                  <>
                    <EmpSectionHeader
                      title="All Employees" count={tableSections.all.length}
                      desc="Remaining team members"
                      icon={Users} iconCls="text-gray-400" borderCls="border-l-2 border-white/10" textCls="text-gray-300"
                    />
                    {tableSections.all.map(renderEmpRow)}
                  </>
                )}
              </>
            )}
          </div>

          <footer className="text-center text-xs text-gray-700 pb-4 pt-2">
            TELER · Workforce Intelligence · Auto-refreshes every 30s · v3.0
          </footer>
        </main>
      </div>
    </div>
  );
};
