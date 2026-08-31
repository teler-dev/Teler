import React, { useState, useMemo, useEffect } from 'react';
import { useSessions } from './useSessions';
import { SessionTable } from './SessionTable';
import { Logo } from '../Logo';
import { Session, Employee, AppSwitch, MicroWindow, classifyScore } from '../../types';
import {
  RefreshCw, LogOut, Wifi, WifiOff, Filter, X, ChevronDown, Bug, Calendar,
  ArrowLeft, AlertTriangle, CheckCircle, Zap, Clock, GitBranch, BrainCircuit,
  Sun, Moon,
} from 'lucide-react';
import { resolveName, AppIcon, resolveActivityIntent, categorizeResolved, activityBarColor, getSwitchType } from './activityUtils';

interface Props {
  onLogout: () => void;
  userName?: string;
  /** Pre-select this employee on mount (passed from EmployerOverview) */
  initialEmployee?: Employee;
  /** If provided, a "Back" button appears navigating to the overview */
  onBack?: () => void;
}

// ── Live clock ─────────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDur(min: number): string {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function fmtDT(dt: string): string {
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMinAsTime(min: number, baseTime: string): string {
  const base = new Date(baseTime);
  base.setMinutes(base.getMinutes() + min);
  return base.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDeepWorkMinutes(s: Session): number {
  if (s.analytics?.deep_work_minutes != null) return s.analytics.deep_work_minutes;
  if (s.hour_blocks && s.hour_blocks.length > 0) {
    return s.hour_blocks.reduce((acc, h) => acc + (h.deep_work_minutes ?? 0), 0);
  }
  return Math.round((s.focus_score / 100) * (s.active_minutes_estimate ?? 0));
}

function getRiskLevel(score: number, idlePct: number): 'green' | 'yellow' | 'red' {
  if (score < 41 || idlePct > 40) return 'red';
  if (score < 71 || idlePct > 25) return 'yellow';
  return 'green';
}

function buildSessionSummary(s: Session): string {
  if (s.executive_summary) return s.executive_summary;
  const score = s.overall_productivity_score;
  const idlePct = s.total_minutes > 0
    ? Math.round((s.idle_minutes_estimate / s.total_minutes) * 100) : 0;
  const cls = classifyScore(score);
  const tasks = s.main_tasks.slice(0, 2).join(', ');
  return `${cls.label} session with a productivity score of ${score}/100. ${idlePct}% idle time recorded.${tasks ? ` Primary tasks: ${tasks}.` : ''}`;
}

function buildKeyIssues(s: Session): string[] {
  const issues: string[] = [...(s.red_flags ?? [])];
  const score = s.overall_productivity_score;
  const idlePct = s.total_minutes > 0
    ? Math.round((s.idle_minutes_estimate / s.total_minutes) * 100) : 0;
  const switchCount = s.app_switches?.length ?? 0;
  const hours = s.total_minutes / 60;
  const lc = (str: string) => str.toLowerCase();
  if (score < 41 && !issues.some(i => lc(i).includes('score') || lc(i).includes('focus')))
    issues.push(`Very low productivity score (${score}/100) — requires immediate review.`);
  if (idlePct > 40 && !issues.some(i => lc(i).includes('idle')))
    issues.push(`${idlePct}% of session was idle — significantly above acceptable threshold.`);
  if (hours >= 0.5 && switchCount / hours > 40 && !issues.some(i => lc(i).includes('switch')))
    issues.push(`High context switching rate (${Math.round(switchCount / hours)}/hr) — may indicate fragmented focus.`);
  return issues.slice(0, 4);
}

function detectContextBursts(switches: AppSwitch[]): { atMin: number; count: number }[] {
  const bursts: { atMin: number; count: number }[] = [];
  for (let i = 0; i < switches.length; i++) {
    const win = switches.filter(s => Math.abs(s.atMin - switches[i].atMin) <= 15);
    if (win.length >= 3 && !bursts.some(b => Math.abs(b.atMin - switches[i].atMin) < 15)) {
      bursts.push({ atMin: switches[i].atMin, count: win.length });
    }
  }
  return bursts;
}

// Hybrid classification: domain-level truth overrides AI inferred type when confident
function hybridClassify(aiType: string, resolvedApp: string, url?: string): string {
  const cat = categorizeResolved(resolvedApp, url);
  if (cat === 'distraction' && aiType !== 'idle') return 'distraction';
  if (cat === 'productive'  && aiType === 'neutral') return 'productive';
  return aiType;
}


// ── Risk Badge ─────────────────────────────────────────────────────────────────
const RiskBadge: React.FC<{ level: 'green' | 'yellow' | 'red' }> = ({ level }) => {
  const cfg = {
    red:    { label: 'High Risk',       color: 'text-red-400',   bg: 'bg-red-500/15',   border: 'border-red-500/30',   icon: <AlertTriangle className="w-4 h-4" /> },
    yellow: { label: 'Medium Risk',     color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', icon: <AlertTriangle className="w-4 h-4" /> },
    green:  { label: 'Healthy Session', color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30', icon: <CheckCircle className="w-4 h-4" /> },
  }[level];
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.icon}
      {cfg.label}
    </div>
  );
};

// ── Session Header ─────────────────────────────────────────────────────────────
const SessionHeader: React.FC<{
  employee: Employee | null;
  session: Session | null;
  isActive: boolean;
  employees: Employee[];
  onSelect: (name: string) => void;
}> = ({ employee, session, isActive, employees, onSelect }) => {
  if (!employee) return null;
  const idlePct = session && session.total_minutes > 0
    ? Math.round((session.idle_minutes_estimate / session.total_minutes) * 100) : 0;
  const risk = session ? getRiskLevel(session.overall_productivity_score, idlePct) : null;

  const primaryApp = (() => {
    if (!session) return null;
    const raw = session.evidence?.top_apps_minutes;
    if (raw && raw.length > 0) {
      const sorted = [...raw].sort((a, b) => b.minutes - a.minutes);
      const top = sorted[0];
      const totalMin = sorted.reduce((acc, a) => acc + a.minutes, 0) || 1;
      return {
        name: resolveName(top.app, top.url, top.window_title, top.process),
        minutes: top.minutes,
        pct: Math.round((top.minutes / totalMin) * 100),
      };
    }
    if (session.top_apps && session.top_apps.length > 0)
      return { name: resolveName(session.top_apps[0]), minutes: 0, pct: 0 };
    return null;
  })();

  const riskAccent = risk === 'red'
    ? 'border-red-500/25'
    : risk === 'yellow'
    ? 'border-amber-500/25'
    : 'border-white/10';

  return (
    <div
      className={`bg-navy-800/70 border ${riskAccent} rounded-2xl px-6 py-5`}
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(19,214,255,0.015) 100%)' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Identity block */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Avatar with status dot */}
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-300 font-black text-2xl select-none">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-navy-900 ${isActive ? 'bg-green-400' : 'bg-gray-600'}`} />
          </div>

          {/* Name, role, session meta */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white font-black text-xl tracking-tight leading-none">{employee.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isActive
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
              }`}>
                {isActive ? 'Active' : 'Offline'}
              </span>
            </div>

            <p className="text-sm text-cyan-400/80 font-medium mt-1 leading-none">
              {employee.role}
              {employee.client && employee.client !== 'N/A' && (
                <span className="text-gray-500 font-normal"> · {employee.client}</span>
              )}
            </p>

            {session && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-500">
                <span>Session: <span className="text-gray-300">{fmtDT(session.created_at)}</span></span>
                <span className="text-gray-700">·</span>
                <span>Duration: <span className="text-gray-300">{fmtDur(session.total_minutes)}</span></span>
                {primaryApp && (
                  <>
                    <span className="text-gray-700">·</span>
                    <span>
                      Primary: <span className="text-white font-semibold">{primaryApp.name}</span>
                      {primaryApp.pct > 0 && <span className="text-gray-600"> ({primaryApp.pct}%)</span>}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Risk badge + employee selector */}
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {risk && <RiskBadge level={risk} />}
          {employees.length > 1 && (
            <div className="relative">
              <select
                value={employee.name}
                onChange={e => onSelect(e.target.value)}
                className="bg-navy-700/60 border border-white/8 text-gray-300 text-xs rounded-lg px-3 py-2 pr-8 outline-none focus:border-cyan-500/40 cursor-pointer appearance-none"
              >
                {employees.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Section 2: Session Health KPI Cards ───────────────────────────────────────
const SessionHealthKpi: React.FC<{ session: Session }> = ({ session }) => {
  const cls = classifyScore(session.overall_productivity_score);
  const deepWork = getDeepWorkMinutes(session);
  const idlePct = session.total_minutes > 0
    ? Math.round((session.idle_minutes_estimate / session.total_minutes) * 100) : 0;
  const switchCount = session.app_switches?.length ?? 0;
  const switchRate = session.total_minutes >= 30
    ? Math.round(switchCount / (session.total_minutes / 60)) : null;

  const cards = [
    {
      label: 'Productivity Score',
      value: session.overall_productivity_score,
      sub: cls.label,
      color: cls.color,
      icon: <Zap className="w-5 h-5" />,
      iconBg: `${cls.bg} ${cls.border}`,
    },
    {
      label: 'Deep Work Time',
      value: fmtDur(deepWork),
      sub: `of ${fmtDur(session.total_minutes)} session`,
      color: 'text-cyan-400',
      icon: <BrainCircuit className="w-5 h-5" />,
      iconBg: 'bg-cyan-500/15 border-cyan-500/20',
    },
    {
      label: 'Idle Time',
      value: fmtDur(session.idle_minutes_estimate),
      sub: `${idlePct}% of session`,
      color: idlePct > 40 ? 'text-red-400' : idlePct > 25 ? 'text-amber-400' : 'text-gray-400',
      icon: <Clock className="w-5 h-5" />,
      iconBg: idlePct > 40
        ? 'bg-red-500/15 border-red-500/20'
        : 'bg-amber-500/15 border-amber-500/20',
    },
    {
      label: 'Context Switches',
      value: switchCount,
      sub: switchRate !== null ? `${switchRate}/hr` : 'this session',
      color: switchCount > 30 ? 'text-red-400' : switchCount > 15 ? 'text-amber-400' : 'text-indigo-400',
      icon: <GitBranch className="w-5 h-5" />,
      iconBg: 'bg-indigo-500/15 border-indigo-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(c => (
        <div
          key={c.label}
          className="bg-navy-800/60 border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-colors flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-widest leading-tight">{c.label}</span>
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${c.iconBg} ${c.color}`}>
              {c.icon}
            </div>
          </div>
          <div>
            <div className={`text-3xl font-black ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Section 3: AI Narrative Panel ─────────────────────────────────────────────
const AiNarrativePanel: React.FC<{ session: Session }> = ({ session }) => {
  const summary = buildSessionSummary(session);
  const issues  = buildKeyIssues(session);
  const recs    = session.recommendations ?? [];

  return (
    <div
      className="relative bg-navy-800/70 border border-cyan-500/30 rounded-2xl p-7 flex flex-col gap-5 overflow-hidden"
      style={{ boxShadow: '0 0 60px rgba(19,214,255,0.10), inset 0 1px 0 rgba(19,214,255,0.12)' }}
    >
      {/* Glow orb */}
      <div className="absolute -top-10 -right-10 w-56 h-56 bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-2 relative z-10">
        <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-cyan-400" />
        </div>
        <h3 className="text-base font-black text-white tracking-tight">AI Session Interpretation</h3>
      </div>

      {/* Sub-section A: Session Summary */}
      <div className="relative z-10">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Session Summary</span>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">{summary}</p>
      </div>

      {/* Sub-section B: Key Issues */}
      <div className="relative z-10 border-t border-white/5 pt-4">
        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Key Issues Detected</span>
        {issues.length > 0 ? (
          <ul className="flex flex-col gap-2 mt-2">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-300">{issue}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">No significant issues detected</span>
          </div>
        )}
      </div>

      {/* Sub-section C: Suggested Actions — only shown when issues exist */}
      {issues.length > 0 && recs.length > 0 && (
        <div className="relative z-10 border-t border-white/5 pt-4">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Suggested Manager Actions</span>
          <ul className="flex flex-col gap-2 mt-2">
            {recs.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl px-3 py-2 text-sm text-gray-300">
                <span className="text-cyan-500 font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Section 4: Activity Timeline ───────────────────────────────────────────────

const SEG_COLOR: Record<string, string> = {
  productive:  '#3b82f6',
  neutral:     '#f59e0b',
  distraction: '#ef4444',
  idle:        '#374151',
};

// Unified display segment — works for both timeline_segments and micro_windows
interface UnifiedSeg {
  startMin:       number;
  endMin:         number;
  type:           string;
  resolvedApp:    string;
  label?:         string;
  focusScore?:    number;
  summary?:       string;
  isMicro:        boolean;
  confidence?:    number;    // AI confidence % (micro windows only)
  switchesInWin?: number;    // app switches that occurred within this segment window
  idleSeconds?:   number;    // estimated idle seconds within this segment
}

function microToUnified(w: MicroWindow, sessionStart: string): UnifiedSeg | null {
  const base = new Date(sessionStart);
  function parseMin(t: string): number {
    const [h, m, s] = t.split(':').map(Number);
    const d = new Date(base);
    d.setHours(h, m, s || 0, 0);
    if (d.getTime() < base.getTime()) d.setDate(d.getDate() + 1);
    return Math.max(0, (d.getTime() - base.getTime()) / 60000);
  }
  const startMin = parseMin(w.window_start);
  const endMin   = parseMin(w.window_end);
  if (endMin <= startMin) return null;
  const TYPE_MAP: Record<string, string> = {
    productive: 'productive', coding: 'productive', writing: 'productive',
    design: 'productive',     review: 'productive',  testing: 'productive',
    meeting: 'neutral',       communication: 'neutral', reading: 'neutral', research: 'neutral',
    distraction: 'distraction', video: 'distraction', social: 'distraction',
    idle: 'idle',
  };
  const rawApp      = w.apps?.[0] ?? '';
  const intent      = resolveActivityIntent(w.activity_type ?? '');
  const resolvedApp = rawApp ? resolveName(rawApp) : intent.label;
  const aiType      = TYPE_MAP[(w.activity_type ?? '').toLowerCase()] ?? 'neutral';
  return {
    startMin, endMin,
    type:        hybridClassify(aiType, resolvedApp),
    resolvedApp,
    label:       intent.label,
    focusScore:  w.focus_score,
    summary:     w.summary,
    isMicro:     true,
    confidence:  w.confidence,
    idleSeconds: Math.round((1 - (w.focus_score / 100)) * (endMin - startMin) * 60),
  };
}

const ActivityTimeline: React.FC<{ session: Session }> = ({ session }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Prefer timeline_segments; fall back to micro_windows
  const segs: UnifiedSeg[] = useMemo(() => {
    if (session.timeline_segments && session.timeline_segments.length > 0) {
      return session.timeline_segments.map(s => {
        const resolved = resolveName(s.app);
        return {
          startMin:    s.startMin,
          endMin:      s.endMin,
          type:        hybridClassify(s.type, resolved),
          resolvedApp: resolved,
          label:       s.label || undefined,
          isMicro:     false,
          idleSeconds: s.type === 'idle' ? Math.round((s.endMin - s.startMin) * 60) : 0,
        };
      });
    }
    if (session.micro_windows && session.micro_windows.length > 0) {
      const switches = session.app_switches ?? [];
      return session.micro_windows
        .map(w => {
          const seg = microToUnified(w, session.session_start);
          if (!seg) return null;
          seg.switchesInWin = switches.filter(
            sw => sw.atMin >= seg.startMin && sw.atMin < seg.endMin,
          ).length;
          return seg;
        })
        .filter((s): s is UnifiedSeg => s !== null);
    }
    return [];
  }, [session.timeline_segments, session.micro_windows, session.session_start, session.app_switches]);

  const bursts = useMemo(() => detectContextBursts(session.app_switches ?? []), [session.app_switches]);
  const hovered = hoveredIdx !== null ? segs[hoveredIdx] : null;

  if (segs.length === 0) {
    return (
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Activity Timeline</h3>
        </div>
        <p className="text-sm text-gray-600 italic">Timeline data unavailable for this session.</p>
      </div>
    );
  }

  const maxEnd = Math.max(...segs.map(s => s.endMin), session.total_minutes, 1);

  return (
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">
            Activity Timeline
            {segs[0]?.isMicro && (
              <span className="ml-2 text-[10px] text-indigo-400/60 font-normal normal-case">AI micro windows (3.75m)</span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {(['productive', 'neutral', 'distraction', 'idle'] as const).map(t => (
            <span key={t} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEG_COLOR[t] }} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* Segment rows */}
      <div className="flex flex-col gap-1.5 relative" onMouseLeave={() => setHoveredIdx(null)}>
        {segs.map((seg, i) => {
          const dur   = Math.round(seg.endMin - seg.startMin);
          const barW  = Math.max((dur / maxEnd) * 100, 1.5);
          const color = SEG_COLOR[seg.type] ?? SEG_COLOR.neutral;
          const label = seg.label && seg.label !== seg.resolvedApp
            ? `${seg.resolvedApp} · ${seg.label}`
            : seg.resolvedApp;
          return (
            <div
              key={i}
              className="flex items-center gap-3 group hover:bg-white/3 rounded-lg px-2 py-1.5 transition-colors cursor-default"
              onMouseEnter={() => setHoveredIdx(i)}
            >
              <span className="font-mono text-[10px] text-gray-600 w-24 shrink-0">
                {fmtMinAsTime(seg.startMin, session.session_start)}–{fmtMinAsTime(seg.endMin, session.session_start)}
              </span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="relative h-5 rounded flex-1 bg-white/5 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${barW}%`, background: color, opacity: 0.8 }} />
                </div>
                <span className="text-xs text-gray-400 truncate max-w-[200px]">{label}</span>
              </div>
              <span className="text-[10px] text-gray-600 shrink-0 w-8 text-right">{dur}m</span>
            </div>
          );
        })}

        {/* Hover tooltip — 7 fields */}
        {hovered && (
          <div className="absolute right-0 top-0 bg-navy-700 border border-white/15 rounded-xl p-3 shadow-2xl z-20 w-64 pointer-events-none">
            <p className="font-mono text-[10px] text-gray-500 mb-2">
              {fmtMinAsTime(hovered.startMin, session.session_start)}
              {' – '}
              {fmtMinAsTime(hovered.endMin, session.session_start)}
            </p>
            <p className="text-sm font-semibold text-white truncate">{hovered.resolvedApp}</p>
            {hovered.label && (
              <p className="text-xs text-indigo-400 mt-0.5">{hovered.label}</p>
            )}
            <div className="flex flex-col gap-1.5 mt-2 border-t border-white/5 pt-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-gray-300">{Math.round(hovered.endMin - hovered.startMin)}m</span>
              </div>
              {hovered.focusScore !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Focus score</span>
                  <span className={`font-bold ${classifyScore(hovered.focusScore).color}`}>{hovered.focusScore}</span>
                </div>
              )}
              {hovered.switchesInWin !== undefined && hovered.switchesInWin > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Switches in window</span>
                  <span className="text-amber-400 font-semibold">{hovered.switchesInWin}</span>
                </div>
              )}
              {hovered.idleSeconds !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Idle</span>
                  <span className="text-gray-400">{hovered.idleSeconds}s</span>
                </div>
              )}
              {hovered.confidence !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">AI confidence</span>
                  <span className={`font-semibold ${
                    hovered.confidence >= 80 ? 'text-green-400' :
                    hovered.confidence >= 60 ? 'text-amber-400' : 'text-gray-400'
                  }`}>{hovered.confidence}%</span>
                </div>
              )}
            </div>
            {hovered.summary && (
              <p className="text-[10px] text-gray-500 mt-2 leading-relaxed line-clamp-3 border-t border-white/5 pt-2">{hovered.summary}</p>
            )}
          </div>
        )}
      </div>

      {bursts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
          <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest shrink-0">Context Bursts:</span>
          {bursts.map((b, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/25 bg-red-500/5 text-red-400">
              ⚡ {b.count} switches @ {fmtMinAsTime(b.atMin, session.session_start)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Section 5: Evidence Panels ─────────────────────────────────────────────────
const EvidencePanels: React.FC<{ session: Session }> = ({ session }) => {
  const [showAllSwitches, setShowAllSwitches] = useState(false);

  // Panel A — resolve app names and icons
  const topApps = useMemo(() => {
    const raw = session.evidence?.top_apps_minutes;
    if (raw && raw.length > 0) {
      return [...raw]
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 8)
        .map(a => ({
          ...a,
          resolvedName: resolveName(a.app, a.url, a.window_title, a.process),
          category:     categorizeResolved(resolveName(a.app, a.url, a.window_title, a.process), a.url),
        }));
    }
    return session.top_apps.map(a => ({
      app: a, minutes: 0,
      url: undefined as string | undefined,
      process: undefined as string | undefined,
      window_title: undefined as string | undefined,
      resolvedName: resolveName(a),
      category:     categorizeResolved(resolveName(a)) as 'productive' | 'neutral' | 'distraction',
    }));
  }, [session]);

  const maxAppMin = useMemo(() => Math.max(...topApps.map(a => a.minutes), 1), [topApps]);

  // Panel B — AI-interpreted behavior (distinct from raw apps)
  const aiActivity = useMemo(() => {
    // Priority 1: detected_tasks (AI-clustered task groups)
    if (session.detected_tasks && session.detected_tasks.length > 0)
      return { source: 'tasks' as const, tasks: session.detected_tasks };
    // Priority 2: micro_windows aggregated by intent type (with avg confidence)
    if (session.micro_windows && session.micro_windows.length > 0) {
      const WINDOW_MIN = 3.75;
      const groups: Record<string, { minutes: number; confidences: number[] }> = {};
      for (const w of session.micro_windows) {
        const key = w.activity_type || 'productive';
        if (!groups[key]) groups[key] = { minutes: 0, confidences: [] };
        groups[key].minutes += WINDOW_MIN;
        if (w.confidence != null) groups[key].confidences.push(w.confidence);
      }
      const items = Object.entries(groups)
        .sort(([, a], [, b]) => b.minutes - a.minutes)
        .map(([type, { minutes, confidences }]) => ({
          type, minutes,
          intent: resolveActivityIntent(type),
          avgConfidence: confidences.length > 0
            ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
            : undefined,
        }));
      return { source: 'micro' as const, items };
    }
    // Priority 3: main_tasks strings
    if (session.main_tasks.length > 0)
      return { source: 'strings' as const, items: session.main_tasks };
    return null;
  }, [session]);

  const totalMicroMin = (session.micro_windows?.length ?? 0) * 3.75 || 1;

  // Panel C — context switches with resolved names
  const switches = session.app_switches ?? [];
  const visibleSwitches = showAllSwitches ? switches : switches.slice(0, 8);
  const bursts = useMemo(() => detectContextBursts(switches), [switches]);

  const BAR_COLOR: Record<string, string> = {
    productive: '#3b82f6', neutral: '#6b7280', distraction: '#ef4444',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Panel A — Applications Used (raw software) */}
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5">
        <div className="mb-4">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Applications Used</h4>
          <p className="text-[10px] text-gray-600 mt-0.5">Raw software usage with duration</p>
        </div>
        {topApps.length > 0 ? (
          <div className="flex flex-col gap-3">
            {topApps.map((a, i) => {
              const pct      = a.minutes > 0 ? (a.minutes / maxAppMin) * 100 : 0;
              const barColor = BAR_COLOR[a.category];
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <AppIcon resolvedName={a.resolvedName} url={a.url} processName={a.process} size={14} />
                    <span className="text-xs text-gray-300 truncate flex-1">{a.resolvedName}</span>
                    {a.minutes > 0 && (
                      <span className="text-[10px] text-gray-500 shrink-0">{fmtDur(a.minutes)}</span>
                    )}
                  </div>
                  {a.minutes > 0 && (
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 italic">No app data recorded</p>
        )}
      </div>

      {/* Panel B — Detected Activity (AI-interpreted behavior intent) */}
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5">
        <div className="mb-4">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Detected Activity</h4>
          <p className="text-[10px] text-gray-600 mt-0.5">AI-interpreted behavior intent</p>
        </div>
        {!aiActivity ? (
          <p className="text-xs text-gray-600 italic">No activity data recorded</p>
        ) : aiActivity.source === 'tasks' ? (
          <div className="flex flex-col gap-2.5">
            {aiActivity.tasks.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <span className="text-sm text-gray-300 leading-tight">{t.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.duration_minutes > 0 && (
                    <span className="text-[10px] text-gray-600">{t.duration_minutes}m</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    t.confidence >= 80 ? 'bg-green-500/15 text-green-400' :
                    t.confidence >= 60 ? 'bg-amber-500/15 text-amber-400' :
                                         'bg-gray-500/15 text-gray-400'
                  }`}>{t.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : aiActivity.source === 'micro' ? (
          <div className="flex flex-col gap-2.5">
            {aiActivity.items.map((item, i) => {
              const pct = (item.minutes / totalMicroMin) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={item.intent.color}>{item.intent.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.avgConfidence !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          item.avgConfidence >= 80 ? 'bg-green-500/15 text-green-400' :
                          item.avgConfidence >= 60 ? 'bg-amber-500/15 text-amber-400' :
                                                     'bg-gray-500/15 text-gray-400'
                        }`}>{item.avgConfidence}%</span>
                      )}
                      <span className="text-gray-500">{fmtDur(Math.round(item.minutes))}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: activityBarColor(item.type) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {(aiActivity.items as string[]).slice(0, 6).map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 mt-1.5 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Panel C — Context Switching with resolved domain names */}
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Context Switching</h4>
          <span className="text-[10px] text-gray-600">{switches.length} switches</span>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">Resolved app transitions</p>
        {bursts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {bursts.map((b, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/25 bg-red-500/5 text-red-400">
                ⚡ {b.count} switches @ {fmtMinAsTime(b.atMin, session.session_start)}
              </span>
            ))}
          </div>
        )}
        {switches.length > 0 ? (
          <>
            <div className="flex flex-col gap-1.5">
              {visibleSwitches.map((sw, i) => {
                const fromName  = resolveName(sw.from);
                const toName    = resolveName(sw.to);
                const switchTyp = getSwitchType(sw.from, sw.to);
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono text-gray-600 w-10 shrink-0">
                      {fmtMinAsTime(sw.atMin, session.session_start)}
                    </span>
                    <span className="text-[9px] text-gray-600 italic shrink-0">{switchTyp}</span>
                    <span className="text-gray-400 truncate max-w-[60px]">{fromName}</span>
                    <span className="text-cyan-600 shrink-0">→</span>
                    <span className="text-gray-300 truncate max-w-[60px]">{toName}</span>
                  </div>
                );
              })}
            </div>
            {switches.length > 8 && (
              <button
                onClick={() => setShowAllSwitches(v => !v)}
                className="mt-3 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors"
              >
                {showAllSwitches ? 'Show less' : `View all ${switches.length} switches`}
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-600 italic">No context switches recorded</p>
        )}
      </div>
    </div>
  );
};

// ── Section 6: Hourly Performance Breakdown ────────────────────────────────────
const HourlyBlocks: React.FC<{ session: Session }> = ({ session }) => {
  const blocks = session.hour_blocks ?? [];
  if (blocks.length === 0) return null;
  return (
    <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-white">Hourly Performance</h3>
        <span className="text-xs text-gray-600 ml-auto">
          {blocks.length} hour{blocks.length !== 1 ? 's' : ''} tracked
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {blocks.map((h, i) => {
          const cls = classifyScore(h.focus_score);
          return (
            <div key={i} className="bg-navy-700/40 border border-white/5 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <span className="font-mono text-xs text-gray-400">
                  {h.hour_start.slice(0, 5)} – {h.hour_end.slice(0, 5)}
                </span>
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <span className={`font-bold ${cls.color}`}>Focus {h.focus_score}</span>
                  {h.deep_work_minutes > 0 && (
                    <span className="text-cyan-400">{fmtDur(h.deep_work_minutes)} deep work</span>
                  )}
                  {h.distraction_minutes > 0 && (
                    <span className="text-red-400/70">{fmtDur(h.distraction_minutes)} distracted</span>
                  )}
                  {h.context_switch_rate > 0 && (
                    <span className="text-gray-600">{Math.round(h.context_switch_rate)}/hr switches</span>
                  )}
                </div>
              </div>
              <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${h.focus_score}%`,
                    background: h.focus_score >= 70 ? '#3b82f6' : h.focus_score >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              {h.primary_task && h.primary_task !== 'Unknown' && h.primary_task !== 'N/A' && (
                <p className="text-[10px] text-gray-600 truncate">{h.primary_task}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Period Summary Banner ──────────────────────────────────────────────────────
interface PeriodSummaryData {
  sessionCount:      number;
  totalTrackedTime:  number;
  deepWorkMinutes:   number;
  idleMinutes:       number;
  contextSwitches:   number;
  dominantApp:       string | null;
  days:              number;
  alerts:            string[];
}

/** Stable shape for Dashboard-1 analytics consumption */
export type DailySummaryAggregate = Pick<
  PeriodSummaryData,
  'totalTrackedTime' | 'deepWorkMinutes' | 'idleMinutes' | 'contextSwitches' | 'dominantApp' | 'alerts'
>;

const PeriodSummaryBanner: React.FC<{ data: PeriodSummaryData }> = ({ data }) => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-navy-800/40 border border-white/6 rounded-xl px-5 py-3 text-xs">
    <span className="text-gray-600 font-semibold uppercase tracking-widest shrink-0">
      {data.days === 9999 ? 'All time' : `Last ${data.days}d`} · {data.sessionCount} session{data.sessionCount !== 1 ? 's' : ''}
    </span>
    <div className="h-3 w-px bg-white/10 shrink-0" />
    <span className="text-gray-400"><span className="text-white font-bold">{fmtDur(data.totalTrackedTime)}</span> tracked</span>
    <span className="text-gray-400"><span className="text-cyan-400 font-bold">{fmtDur(data.deepWorkMinutes)}</span> deep work</span>
    <span className="text-gray-400"><span className="text-amber-400 font-bold">{fmtDur(data.idleMinutes)}</span> idle</span>
    <span className="text-gray-400"><span className="text-indigo-400 font-bold">{data.contextSwitches}</span> switches</span>
    {data.dominantApp && (
      <span className="text-gray-400">Primary: <span className="text-gray-300 font-semibold">{data.dominantApp}</span></span>
    )}
    {data.alerts.length > 0 && (
      <span className="flex items-center gap-1 text-amber-400 font-semibold ml-auto">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        {data.alerts.length} alert{data.alerts.length !== 1 ? 's' : ''}
      </span>
    )}
  </div>
);

// ── Filter bar ─────────────────────────────────────────────────────────────────
interface Filters { model: string; reportType: string; days: number; }

const FilterBar: React.FC<{
  filters: Filters;
  onChange: (f: Filters) => void;
  models: string[];
  disabled?: boolean;
}> = ({ filters, onChange, models, disabled }) => {
  const sel = `bg-navy-700/60 border border-white/8 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-cyan-500/40 cursor-pointer appearance-none${disabled ? ' opacity-40 cursor-not-allowed' : ''}`;
  const hasActive = !!(filters.model || filters.reportType || filters.days !== 30);
  return (
    <div className={`flex flex-wrap items-center gap-3 bg-navy-800/40 border rounded-xl px-4 py-3 transition-colors ${hasActive ? 'border-cyan-500/20' : 'border-white/5'}${disabled ? ' pointer-events-none' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Filter className="w-3.5 h-3.5" />
        <span className="font-semibold uppercase tracking-widest">Filters</span>
        {disabled && <span className="text-[10px] text-amber-400/70 ml-1">Loading…</span>}
      </div>
      <div className="relative">
        <select className={sel} disabled={disabled} value={filters.days} onChange={e => onChange({ ...filters, days: Number(e.target.value) })}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={9999}>All time</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
      </div>
      <div className="relative">
        <select className={sel} disabled={disabled} value={filters.model} onChange={e => onChange({ ...filters, model: e.target.value })}>
          <option value="">All models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
      </div>
      <div className="relative">
        <select className={sel} disabled={disabled} value={filters.reportType} onChange={e => onChange({ ...filters, reportType: e.target.value })}>
          <option value="">All types</option>
          <option value="IMG">IMG</option>
          <option value="OCR">OCR</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
      </div>
      {hasActive && !disabled && (
        <button onClick={() => onChange({ model: '', reportType: '', days: 30 })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
          <X className="w-3 h-3" />Clear
        </button>
      )}
    </div>
  );
};

// ── Debug Panel ────────────────────────────────────────────────────────────────
interface DebugStats {
  totalSessionsFound: number;
  sessionsAfterDateFilter: number;
  sessionsWithAiJson: number;
  sessionsWithValidTimestamps: number;
  cutoffDate: string;
  newestSession: string | null;
  oldestSession: string | null;
  filterDays: number;
}

const DebugPanel: React.FC<{ stats: DebugStats; onClose: () => void }> = ({ stats, onClose }) => (
  <div className="bg-navy-800/95 border border-cyan-500/25 rounded-2xl p-5 shadow-2xl">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-cyan-400">
        <Bug className="w-3.5 h-3.5" />
        <span className="text-xs font-bold uppercase tracking-widest">Debug · Data Pipeline</span>
      </div>
      <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    <div className="grid grid-cols-2 gap-2 font-mono text-xs mb-3">
      {([
        { label: 'totalSessionsFound',         val: stats.totalSessionsFound,          ok: stats.totalSessionsFound > 0 },
        { label: 'sessionsAfterDateFilter',     val: stats.sessionsAfterDateFilter,     ok: stats.sessionsAfterDateFilter > 0 },
        { label: 'sessionsWithAiJson',          val: stats.sessionsWithAiJson,          ok: stats.sessionsWithAiJson > 0 },
        { label: 'sessionsWithValidTimestamps', val: stats.sessionsWithValidTimestamps, ok: stats.sessionsWithValidTimestamps > 0 },
      ] as const).map(({ label, val, ok }) => (
        <div key={label} className="flex items-center justify-between bg-white/3 rounded-lg px-3 py-2">
          <span className="text-gray-500 truncate mr-2">{label}</span>
          <span className={`font-bold shrink-0 ${ok ? 'text-green-400' : 'text-red-400'}`}>{val}</span>
        </div>
      ))}
    </div>
    <div className="text-[10px] text-gray-600 font-mono space-y-0.5 border-t border-white/5 pt-3">
      <p>Date filter: last {stats.filterDays === 9999 ? 'all time' : `${stats.filterDays} days`} · cutoff {stats.cutoffDate}</p>
      {stats.newestSession && <p>Newest session: <span className="text-gray-400">{stats.newestSession}</span></p>}
      {stats.oldestSession && <p>Oldest session: <span className="text-gray-400">{stats.oldestSession}</span></p>}
      {stats.sessionsAfterDateFilter === 0 && stats.totalSessionsFound > 0 && (
        <p className="text-amber-400 mt-1">⚠ All sessions predate the cutoff — switch to "All time" to view data.</p>
      )}
    </div>
  </div>
);

// ── Empty State ────────────────────────────────────────────────────────────────
const EmptyState: React.FC<{
  totalSessions: number;
  days: number;
  newestSession: string | null;
  onShowAll: () => void;
}> = ({ totalSessions, days, newestSession, onShowAll }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
      <Calendar className="w-7 h-7 text-gray-600" />
    </div>
    <div>
      <p className="text-white font-semibold text-base">No sessions in selected date range</p>
      <p className="text-gray-500 text-sm mt-1.5 max-w-sm">
        {days === 9999
          ? 'No sessions found. Make sure the API is running and data path is correct.'
          : `No sessions recorded in the last ${days} days.`}
        {totalSessions > 0 && (
          <span> <span className="text-cyan-400 font-semibold">{totalSessions}</span> sessions recorded all time.</span>
        )}
      </p>
      {newestSession && (
        <p className="text-gray-600 text-xs mt-1">
          Most recent session: {new Date(newestSession).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
    {days !== 9999 && totalSessions > 0 && (
      <button
        onClick={onShowAll}
        className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-white transition-colors bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 rounded-lg px-4 py-2 font-medium"
      >
        <Filter className="w-3.5 h-3.5" />
        Show all time data
      </button>
    )}
  </div>
);

// ── Dashboard Skeleton ─────────────────────────────────────────────────────────
const DashboardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-6">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-28 bg-white/3 rounded-2xl skeleton-shimmer animate-shimmer" />
      ))}
    </div>
    <div className="h-52 bg-white/3 rounded-2xl skeleton-shimmer animate-shimmer" />
    <div className="h-44 bg-white/3 rounded-2xl skeleton-shimmer animate-shimmer" />
  </div>
);

// ── Dashboard ──────────────────────────────────────────────────────────────────
export const Dashboard: React.FC<Props> = ({ onLogout, userName = 'User', initialEmployee, onBack }) => {
  const { sessions, loading, usingMock, error, refetch } = useSessions(initialEmployee?.name);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [filters, setFilters]         = useState<Filters>({ model: '', reportType: '', days: 30 });
  const [showDebug, setShowDebug]     = useState(false);
  const [isDark, setIsDark]           = useState(true);
  const [activeEmployeeName, setActiveEmployeeName] = useState<string | null>(null);
  const now = useClock();

  // ── Employees ──────────────────────────────────────────────────────────────
  const employees = useMemo<Employee[]>(() => {
    if (initialEmployee) return [initialEmployee];
    const seen = new Map<string, Employee>();
    for (const s of sessions) {
      if (s.userName && !seen.has(s.userName))
        seen.set(s.userName, { name: s.userName, role: s.role ?? '', client: s.client ?? '' });
    }
    return [...seen.values()];
  }, [sessions, initialEmployee]);

  useEffect(() => {
    if (employees.length > 0 && !activeEmployeeName)
      setActiveEmployeeName(initialEmployee?.name ?? employees[0].name);
  }, [employees]);

  useEffect(() => { setSelectedId(null); }, [activeEmployeeName]);

  const activeEmployee = useMemo(
    () => employees.find(e => e.name === activeEmployeeName) ?? employees[0] ?? null,
    [employees, activeEmployeeName]
  );

  // ── Sessions ───────────────────────────────────────────────────────────────
  const employeeSessions = useMemo(
    () => activeEmployee
      ? sessions.filter(s => s.userName === activeEmployee.name || s.role === activeEmployee.name)
      : sessions,
    [sessions, activeEmployee]
  );

  const isEmployeeActive = useMemo(() => {
    if (!activeEmployee || employeeSessions.length === 0) return false;
    const latest = Math.max(...employeeSessions.map(s => new Date(s.created_at).getTime()));
    return (Date.now() - latest) < 48 * 60 * 60 * 1000;
  }, [employeeSessions, activeEmployee]);

  const models = useMemo(() => {
    const seen = new Set<string>();
    for (const s of employeeSessions) {
      if (s.allModels && s.allModels.length > 0)
        s.allModels.forEach(m => seen.add(m.key));
      else if (s.modelKey)
        seen.add(s.modelKey);
      else if (s.model_used)
        seen.add(s.model_used.charAt(0).toUpperCase() + s.model_used.slice(1));
    }
    return [...seen].sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    function matchesModel(s: Session): boolean {
      if (!filters.model) return true;
      if (s.allModels && s.allModels.length > 0)
        return s.allModels.some(m => m.key.toLowerCase() === filters.model.toLowerCase());
      if (s.modelKey) return s.modelKey.toLowerCase() === filters.model.toLowerCase();
      const cap = s.model_used.charAt(0).toUpperCase() + s.model_used.slice(1);
      return cap.toLowerCase() === filters.model.toLowerCase();
    }
    if (filters.days === 9999) {
      return employeeSessions.filter(s =>
        matchesModel(s) && (!filters.reportType || s.report_type === filters.reportType)
      );
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.days);
    return employeeSessions.filter(s =>
      matchesModel(s) &&
      (!filters.reportType || s.report_type === filters.reportType) &&
      new Date(s.created_at) >= cutoff
    );
  }, [employeeSessions, filters]);

  // ── Debug stats ────────────────────────────────────────────────────────────
  const debugStats = useMemo((): DebugStats => {
    const cutoff = new Date();
    if (filters.days !== 9999) cutoff.setDate(cutoff.getDate() - filters.days);
    const sorted = [...employeeSessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      totalSessionsFound:          employeeSessions.length,
      sessionsAfterDateFilter:     filteredSessions.length,
      sessionsWithAiJson:          employeeSessions.filter(s => s.has_ai_report).length,
      sessionsWithValidTimestamps: employeeSessions.filter(s => {
        const st = new Date(s.session_start), en = new Date(s.session_end);
        return !isNaN(st.getTime()) && !isNaN(en.getTime()) && en >= st;
      }).length,
      cutoffDate:    filters.days === 9999 ? 'n/a (all time)' : cutoff.toISOString().slice(0, 10),
      newestSession: sorted[0]?.created_at ?? null,
      oldestSession: sorted[sorted.length - 1]?.created_at ?? null,
      filterDays:    filters.days,
    };
  }, [employeeSessions, filteredSessions, filters.days]);

  // ── Period summary (aggregated across all filtered sessions) ───────────────
  const periodSummary = useMemo((): PeriodSummaryData | null => {
    if (filteredSessions.length === 0) return null;
    const totalTrackedTime = filteredSessions.reduce((a, s) => a + s.total_minutes, 0);
    const deepWorkMinutes  = filteredSessions.reduce((a, s) => a + getDeepWorkMinutes(s), 0);
    const idleMinutes      = filteredSessions.reduce((a, s) => a + s.idle_minutes_estimate, 0);
    const contextSwitches  = filteredSessions.reduce((a, s) => a + (s.app_switches?.length ?? 0), 0);
    // Dominant app by total time across all sessions
    const appTime: Record<string, number> = {};
    for (const s of filteredSessions) {
      const raw = s.evidence?.top_apps_minutes;
      if (raw) {
        for (const a of raw) {
          const name = resolveName(a.app, a.url, a.window_title, a.process);
          appTime[name] = (appTime[name] || 0) + a.minutes;
        }
      } else if (s.top_apps && s.top_apps.length > 0) {
        const name = resolveName(s.top_apps[0]);
        appTime[name] = (appTime[name] || 0) + 1;
      }
    }
    const dominantApp = Object.entries(appTime).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    // Auto-alerts: deterministic thresholds, no AI inference
    const alerts: string[] = [];
    const idlePctTotal = totalTrackedTime > 0
      ? Math.round((idleMinutes / totalTrackedTime) * 100) : 0;
    const switchRate = totalTrackedTime >= 30
      ? Math.round(contextSwitches / (totalTrackedTime / 60)) : 0;
    const avgScore = filteredSessions.length > 0
      ? Math.round(filteredSessions.reduce((a, s) => a + s.overall_productivity_score, 0) / filteredSessions.length)
      : 100;
    if (idlePctTotal > 35)
      alerts.push(`High idle time: ${idlePctTotal}% of tracked time`);
    if (switchRate > 40)
      alerts.push(`Excessive context switching: ${switchRate}/hr average`);
    if (avgScore < 41)
      alerts.push(`Low average productivity score: ${avgScore}/100`);
    if (filteredSessions.some(s => (s.red_flags?.length ?? 0) > 0))
      alerts.push('Red flags detected in one or more sessions');

    return {
      sessionCount:     filteredSessions.length,
      totalTrackedTime, deepWorkMinutes, idleMinutes, contextSwitches, dominantApp,
      days: filters.days,
      alerts,
    };
  }, [filteredSessions, filters.days]);

  // ── Selected session ───────────────────────────────────────────────────────
  const selectedSession = useMemo(
    () => filteredSessions.find(s => s.id === selectedId) ?? filteredSessions[0] ?? null,
    [filteredSessions, selectedId]
  );

  useEffect(() => {
    if (!selectedId && filteredSessions.length > 0) setSelectedId(filteredSessions[0].id);
  }, [filteredSessions]);

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  type LoadState = 'loading' | 'loaded' | 'empty';
  const loadState: LoadState = loading ? 'loading' : filteredSessions.length > 0 ? 'loaded' : 'empty';

  return (
    <div className={`min-h-screen bg-navy-900 text-white${!isDark ? ' theme-light' : ''}`}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/3 blur-[180px] rounded-full" />
        <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-700/4 blur-[150px] rounded-full" />
      </div>

      {/* ── Top nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-navy-900/85 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Logo variant="navbar" />
            <div className="hidden md:block h-5 w-px bg-white/10" />
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-white font-semibold text-sm">{userName}</span>
              <span className="text-gray-500 text-[11px]">{dateStr}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-white/3 border border-white/5 rounded-lg px-3 py-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              {timeStr}
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
            <button
              onClick={() => setIsDark(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowDebug(v => !v)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showDebug ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white'}`}
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
            <button onClick={refetch} disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {onBack && (
              <button onClick={onBack}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-white/5 border border-white/8 hover:border-white/20 rounded-lg px-3 py-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </button>
            )}
            <button onClick={onLogout}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors bg-white/3 border border-white/5 hover:border-white/15 rounded-lg px-3 py-1.5">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">

        {showDebug && <DebugPanel stats={debugStats} onClose={() => setShowDebug(false)} />}

        {/* API error banner — shown when live data cannot be loaded */}
        {error && !loading && (
          <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/25 rounded-2xl px-5 py-4">
            <WifiOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-400">Live session data unavailable</p>
              <p className="text-xs text-red-400/70 mt-0.5 break-words">{error}</p>
            </div>
            <button
              onClick={() => refetch(true)}
              className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Section 1: Employee Session Summary */}
        <SessionHeader
          employee={activeEmployee}
          session={selectedSession}
          isActive={isEmployeeActive}
          employees={employees}
          onSelect={name => setActiveEmployeeName(name)}
        />

        {/* Sections 2–6: Only when a session is available */}
        {loading && !selectedSession ? (
          <DashboardSkeleton />
        ) : selectedSession ? (
          <>
            <SessionHealthKpi session={selectedSession} />
            {periodSummary && <PeriodSummaryBanner data={periodSummary} />}
            <AiNarrativePanel session={selectedSession} />
            <HourlyBlocks session={selectedSession} />
            <ActivityTimeline session={selectedSession} />
            <EvidencePanels session={selectedSession} />
          </>
        ) : null}

        {/* Section 6: Filters + Session Table */}
        <div className="border-t border-white/5 pt-4 flex flex-col gap-4">
          <FilterBar filters={filters} onChange={setFilters} models={models} disabled={loading} />

          {loadState === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-gray-600 animate-spin" />
            </div>
          )}
          {loadState === 'loaded' && (
            <SessionTable
              sessions={filteredSessions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {loadState === 'empty' && (
            <EmptyState
              totalSessions={employeeSessions.length}
              days={filters.days}
              newestSession={debugStats.newestSession}
              onShowAll={() => setFilters(f => ({ ...f, days: 9999 }))}
            />
          )}
        </div>

        <footer className="text-center text-xs text-gray-700 pb-4 pt-2">
          TELER · AI Workforce Telemetry · All data processed locally · v2.0
        </footer>
      </main>

    </div>
  );
};
