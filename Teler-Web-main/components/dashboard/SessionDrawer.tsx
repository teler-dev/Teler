import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Session, classifyScore, AppSwitch, EmployeeMemory, RiskLevel, TrendDirection } from '../../types';
import { SessionTimelineBar, TaskAnalysis } from './SessionTimeline';
import { apiFetch } from '../../services/apiConfig';
import { EvidencePanel } from './EvidencePanel';
import { ScoreComparison } from './Charts';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  X, Clock, Zap, AlertTriangle, Target, CheckCircle,
  Activity, GitBranch, Layers, Shield, TrendingUp,
  ChevronLeft, ChevronRight, ChevronDown, Info, ArrowRight,
  Columns2, Brain, TrendingDown, Minus,
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDT(dt: string) {
  return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtMinAsTime(min: number, baseTime: string) {
  const base = new Date(baseTime);
  base.setMinutes(base.getMinutes() + min);
  return base.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getRiskLevel(score: number, idlePct: number): 'green' | 'yellow' | 'red' {
  if (score < 41 || idlePct > 40) return 'red';
  if (score < 71 || idlePct > 25) return 'yellow';
  return 'green';
}

function detectContextBursts(switches: AppSwitch[]): { atMin: number; count: number }[] {
  const bursts: { atMin: number; count: number }[] = [];
  for (let i = 0; i < switches.length; i++) {
    const window = switches.filter(s => Math.abs(s.atMin - switches[i].atMin) <= 15);
    if (window.length >= 3 && !bursts.some(b => Math.abs(b.atMin - switches[i].atMin) < 15)) {
      bursts.push({ atMin: switches[i].atMin, count: window.length });
    }
  }
  return bursts;
}

// ── Count-up animation hook ──────────────────────────────────────────────────

function useCountUp(target: number, duration = 600): number {
  const [cur, setCur] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  useEffect(() => {
    setCur(0);
    startRef.current = null;
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

// ── Sub-components ───────────────────────────────────────────────────────────

const MetricTooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="relative group inline-flex items-center gap-1 cursor-help">
    {children}
    <span className="absolute bottom-full left-0 mb-2 w-52 bg-navy-700 border border-white/10 text-gray-300 text-[10px] rounded-lg p-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none leading-relaxed whitespace-normal shadow-xl">
      {text}
    </span>
  </div>
);

const DeltaBadge: React.FC<{ current: number; previous: number }> = ({ current, previous }) => {
  if (!previous) return null;
  const delta = Math.round(current - previous);
  const col = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  return (
    <span className={`text-[10px] font-semibold ${col}`}>
      {arrow}{delta > 0 ? '+' : ''}{delta} vs prev
    </span>
  );
};

const MiniSparkline: React.FC<{ data: { i: number; val: number | null }[] }> = ({ data }) => (
  <ResponsiveContainer width={64} height={22}>
    <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <Line type="monotone" dataKey="val" stroke="#13D6FF" strokeWidth={1.5}
        dot={{ r: 1.5, fill: '#13D6FF', strokeWidth: 0 }} connectNulls={false} />
    </LineChart>
  </ResponsiveContainer>
);

// ── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  animated?: number;
  color: string;
  tooltip: string;
  sub?: React.ReactNode;
  sparklineData?: { i: number; val: number | null }[];
  prevValue?: number;
}> = ({ label, value, animated, color, tooltip, sub, sparklineData, prevValue }) => (
  <div className="bg-navy-700/50 rounded-xl p-3 flex flex-col gap-1 hover:bg-white/5 transition-colors min-w-0">
    <MetricTooltip text={tooltip}>
      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold truncate">{label}</span>
      <Info className="w-2.5 h-2.5 text-gray-600 shrink-0" />
    </MetricTooltip>
    <div className={`text-2xl font-black leading-tight ${color}`}>
      {animated !== undefined ? animated : value}
    </div>
    {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    {prevValue !== undefined && <DeltaBadge current={typeof value === 'number' ? value : 0} previous={prevValue} />}
    {sparklineData && sparklineData.some(d => d.val !== null) && (
      <div className="mt-0.5 opacity-70">
        <MiniSparkline data={sparklineData} />
      </div>
    )}
  </div>
);

// ── Overview Tab ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  session: Session;
  prevSession?: Session | null;
  sessionHistory?: Session[];
  compareMode?: boolean;
}> = ({ session, prevSession, sessionHistory, compareMode }) => {
  const cls = classifyScore(session.overall_productivity_score);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const idlePct = session.total_minutes > 0
    ? Math.round((session.idle_minutes_estimate / session.total_minutes) * 100)
    : 0;
  const distractionRatio = idlePct;
  const riskLevel = getRiskLevel(session.overall_productivity_score, idlePct);

  const animatedScore = useCountUp(session.overall_productivity_score);
  const animatedFocus = useCountUp(session.focus_score);
  const animatedCtx   = useCountUp(session.context_switching_score);

  // Build sparklines from session history
  const focusSparkline = useMemo(
    () => (sessionHistory ?? []).map((s, i) => ({ i, val: s.focus_score > 0 ? s.focus_score : null })),
    [sessionHistory]
  );
  const ctxSparkline = useMemo(
    () => (sessionHistory ?? []).map((s, i) => ({ i, val: s.context_switching_score > 0 ? s.context_switching_score : null })),
    [sessionHistory]
  );

  const scores = [
    { label: 'Focus',               val: session.focus_score,               color: 'bg-cyan-400',   bar: '#13D6FF',  tooltip: 'Measures sustained concentration. Higher = fewer interruptions during the session.' },
    { label: 'Workflow Stability',   val: session.workflow_structure_score,   color: 'bg-indigo-400', bar: '#818cf8',  tooltip: 'Structured task execution and process consistency. High = disciplined workflow.' },
    { label: 'Tool Efficiency',      val: session.tool_usage_score,           color: 'bg-green-400',  bar: '#34d399',  tooltip: 'Effective use of professional tools. Reflects the quality of the toolchain being used.' },
    { label: 'Context Switch Index', val: session.context_switching_score,    color: 'bg-amber-400',  bar: '#f59e0b',  tooltip: 'Higher = better context management. Low scores indicate excessive app or task switching.' },
    { label: 'Distraction Ratio',    val: distractionRatio,                   color: 'bg-red-400',    bar: '#f87171',  tooltip: 'Percentage of session time spent idle or untracked. Lower is better.' },
  ];

  const riskConfig = {
    green:  { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  label: 'Low Risk'  },
    yellow: { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  label: 'Moderate'  },
    red:    { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    label: 'High Risk' },
  }[riskLevel];

  const comparisonMetrics = prevSession ? [
    { label: 'Overall Score',   cur: session.overall_productivity_score,  prev: prevSession.overall_productivity_score },
    { label: 'Focus Score',     cur: session.focus_score,                  prev: prevSession.focus_score },
    { label: 'Context Switch',  cur: session.context_switching_score,      prev: prevSession.context_switching_score },
    { label: 'Tool Usage',      cur: session.tool_usage_score,             prev: prevSession.tool_usage_score },
    { label: 'Active Time',     cur: session.active_minutes_estimate,      prev: prevSession.active_minutes_estimate },
    { label: 'Idle %',          cur: idlePct, prev: prevSession.total_minutes > 0 ? Math.round((prevSession.idle_minutes_estimate / prevSession.total_minutes) * 100) : 0 },
  ] : [];

  return (
    <div className="flex flex-col gap-6">
      {/* ── KPI Row: 4 cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="Overall Score"
          value={session.overall_productivity_score}
          animated={animatedScore}
          color={cls.color}
          tooltip="Composite productivity score computed from focus, workflow, tool usage and context switching."
          sub={<span className={cls.color}>{cls.label}</span>}
          prevValue={prevSession?.overall_productivity_score}
        />
        <KpiCard
          label="Idle Time"
          value={fmtDur(session.idle_minutes_estimate)}
          color="text-amber-400"
          tooltip="Estimated idle or untracked time during the session. High values may indicate breaks or distraction."
          sub={`${idlePct}% of session`}
          prevValue={prevSession?.idle_minutes_estimate}
        />
        <KpiCard
          label="Focus Score"
          value={session.focus_score}
          animated={animatedFocus}
          color="text-cyan-400"
          tooltip="Sustained concentration score. Higher = fewer interruptions and better deep work quality."
          prevValue={prevSession?.focus_score}
          sparklineData={focusSparkline}
        />
        <KpiCard
          label="Context Switch"
          value={session.context_switching_score}
          animated={animatedCtx}
          color="text-indigo-400"
          tooltip="Higher = more disciplined context management with fewer disruptive app switches."
          prevValue={prevSession?.context_switching_score}
          sparklineData={ctxSparkline}
        />
      </div>

      {/* ── Comparison panel ─────────────────────────────────────────── */}
      {compareMode && prevSession && (
        <div className="bg-navy-800/60 border border-white/8 rounded-xl p-4">
          <h4 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Comparison vs Previous Session</h4>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            <span className="text-gray-600 font-semibold">Metric</span>
            <span className="text-cyan-400 text-center font-semibold">Current</span>
            <span className="text-gray-400 text-center font-semibold">Previous</span>
            {comparisonMetrics.map(m => {
              const delta = m.cur - m.prev;
              const col = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
              return (
                <React.Fragment key={m.label}>
                  <span className="text-gray-400">{m.label}</span>
                  <span className="text-white text-center font-semibold">{typeof m.cur === 'number' && m.label.includes('Time') ? fmtDur(m.cur) : m.cur}</span>
                  <div className="text-center">
                    <span className="text-gray-500 mr-1">{typeof m.prev === 'number' && m.label.includes('Time') ? fmtDur(m.prev) : m.prev}</span>
                    <span className={`text-[10px] font-bold ${col}`}>{delta > 0 ? `+${Math.round(delta)}` : Math.round(delta)}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Score Breakdown ───────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Score Breakdown</h4>
        <div className="flex flex-col gap-3">
          {scores.map(({ label, val, bar, tooltip }) => {
            const sc = classifyScore(val);
            return (
              <div key={label} className="flex items-center gap-3">
                <MetricTooltip text={tooltip}>
                  <span className="w-36 text-sm text-gray-400 shrink-0 truncate">{label}</span>
                </MetricTooltip>
                <div className="flex-1 relative h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: mounted ? `${val}%` : '0%', background: bar }}
                  />
                </div>
                <div className="flex items-center gap-1.5 w-24 justify-end shrink-0">
                  <span className="text-[10px] text-white/60 font-bold">{val}%</span>
                  <span className={`text-sm font-semibold ${sc.color}`}>{val}</span>
                  <span className={`text-[10px] hidden sm:inline ${sc.color}`}>{sc.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ScoreComparison chart */}
      <ScoreComparison session={session} />

      {/* Timeline preview */}
      <div>
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Session Timeline</h4>
        <SessionTimelineBar session={session} />
      </div>

      {/* Tasks + Distractions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Main Tasks</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {session.main_tasks.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 mt-1.5 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        {session.main_distractions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Distractions</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {session.main_distractions.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 mt-1.5 shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Red flags */}
      {session.red_flags.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Red Flags</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {session.red_flags.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 mt-1.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Apps */}
      <div>
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Top Apps</h4>
        <div className="flex flex-wrap gap-2">
          {session.top_apps.map((a, i) => (
            <span key={i} className="px-3 py-1 bg-white/5 border border-white/8 rounded-full text-xs text-gray-300">{a}</span>
          ))}
        </div>
      </div>

      {/* Session meta */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5 text-xs text-gray-500">
        <span><Clock className="w-3 h-3 inline mr-1" />Duration: <span className="text-white">{fmtDur(session.total_minutes)}</span></span>
        <span><Zap className="w-3 h-3 inline mr-1" />Model: <span className="text-white capitalize">{session.model_used}</span></span>
        <span>Type: <span className={`font-bold ${session.report_type === 'IMG' ? 'text-purple-400' : 'text-cyan-400'}`}>{session.report_type}</span></span>
      </div>
    </div>
  );
};

// ── AI Report Tab ─────────────────────────────────────────────────────────────

type Tab = 'overview' | 'timeline' | 'evidence' | 'ai_analysis' | 'intelligence';

const AiReportTab: React.FC<{
  session: Session;
  viewMode: 'executive' | 'technical';
  onViewModeChange: (m: 'executive' | 'technical') => void;
  onTabSwitch: (t: Tab) => void;
}> = ({ session, viewMode, onViewModeChange, onTabSwitch }) => {
  const cls = classifyScore(session.overall_productivity_score);

  const detectedConfidence = useMemo(() => {
    const tasks = session.detected_tasks ?? [];
    if (!tasks.length) return 0;
    return Math.round(tasks.reduce((a, t) => a + t.confidence, 0) / tasks.length);
  }, [session.detected_tasks]);

  return (
    <div className="flex flex-col gap-6">
      {/* View mode toggle + confidence */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-navy-900/50 rounded-lg p-1">
          {(['executive', 'technical'] as const).map(m => (
            <button key={m} onClick={() => onViewModeChange(m)}
              className={`text-[11px] px-3 py-1 rounded-md font-semibold transition-all ${
                viewMode === m ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {m === 'executive' ? 'Executive Summary' : 'Technical Detail'}
            </button>
          ))}
        </div>
        {detectedConfidence > 0 && (
          <span className="text-[10px] px-2.5 py-1 rounded-full border text-green-400 bg-green-500/10 border-green-500/20 font-semibold">
            AI Confidence: {detectedConfidence}%
          </span>
        )}
      </div>

      {/* Header banner */}
      <div
        className="relative bg-navy-700/40 border rounded-2xl p-5 overflow-hidden"
        style={{ borderColor: 'rgba(19,214,255,0.2)', boxShadow: '0 0 30px rgba(19,214,255,0.05)' }}
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-cyan-500/5 blur-[40px] rounded-full" />
        <div className="flex items-start gap-4 relative z-10">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black border ${cls.bg} ${cls.border} ${cls.color} shrink-0`}>
            {session.overall_productivity_score}
          </div>
          <div>
            <div className={`text-xs font-bold uppercase tracking-widest ${cls.color} mb-1`}>{cls.label} Performance</div>
            <p className="text-xs text-gray-500">
              {new Date(session.session_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·
              {' '}{fmtDT(session.session_start)} – {fmtDT(session.session_end)} · {fmtDur(session.total_minutes)}
            </p>
            <div className="flex gap-2 mt-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${session.report_type === 'IMG' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'}`}>{session.report_type}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border text-gray-400 bg-white/5 border-white/10 capitalize">{session.model_used}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      {session.executive_summary && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Executive Summary</h4>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed bg-white/3 border border-white/6 rounded-xl p-4">
            {session.executive_summary}
          </p>
        </section>
      )}

      {/* Recommendations — always shown in executive mode */}
      {viewMode === 'executive' && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">AI Recommendations</h4>
          </div>
          <ul className="flex flex-col gap-2">
            {session.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl px-3 py-2.5 text-sm text-gray-300">
                <span className="text-cyan-500 font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Technical Detail — only in technical mode */}
      {viewMode === 'technical' && (
        <>
          {/* Focus & Workflow Analysis */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Focus & Workflow Analysis</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Focus Score',        val: session.focus_score,               bar: '#13D6FF' },
                { label: 'Workflow Structure', val: session.workflow_structure_score,   bar: '#818cf8' },
                { label: 'Tool Usage',         val: session.tool_usage_score,           bar: '#34d399' },
                { label: 'Context Switching',  val: session.context_switching_score,    bar: '#f59e0b' },
              ].map(({ label, val, bar }) => {
                const sc = classifyScore(val);
                return (
                  <div key={label} className="bg-navy-700/40 border border-white/8 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`text-lg font-black ${sc.color}`}>{val}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${val}%`, background: bar }} />
                    </div>
                    <span className={`text-[10px] font-bold mt-1 block ${sc.color}`}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
            {/* Evidence links */}
            <div className="flex gap-4 mt-3">
              <button onClick={() => onTabSwitch('timeline')}
                className="text-xs text-cyan-400/70 hover:text-cyan-400 flex items-center gap-1 transition-colors">
                View Timeline <ArrowRight className="w-3 h-3" />
              </button>
              <button onClick={() => onTabSwitch('evidence')}
                className="text-xs text-cyan-400/70 hover:text-cyan-400 flex items-center gap-1 transition-colors">
                View Evidence <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </section>

          {/* Task Claim vs Evidence */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Task Claim vs Evidence</h4>
            </div>
            <div className="bg-navy-700/40 border border-white/8 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Claimed</p>
                  <p className="text-sm text-white font-medium">{session.claimed_task ?? 'Not specified'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Evidence Match</p>
                  <p className={`text-2xl font-black ${session.task_overlap_pct && session.task_overlap_pct >= 80 ? 'text-cyan-400' : session.task_overlap_pct && session.task_overlap_pct >= 60 ? 'text-green-400' : 'text-amber-400'}`}>
                    {session.task_overlap_pct ?? '—'}%
                  </p>
                </div>
              </div>
              {session.detected_tasks && session.detected_tasks.map((t, i) => (
                <div key={i} className="flex items-center justify-between border-t border-white/5 pt-2">
                  <span className="text-xs text-gray-300">{t.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{t.duration_minutes}m</span>
                    <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${t.confidence}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500">{t.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Red Flags */}
          {session.red_flags.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest">Red Flags</h4>
              </div>
              <ul className="flex flex-col gap-2">
                {session.red_flags.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2 text-sm text-red-300/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400/70 mt-1.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recommendations */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-3.5 h-3.5 text-cyan-400" />
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">AI Recommendations</h4>
            </div>
            <ul className="flex flex-col gap-2">
              {session.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl px-3 py-2.5 text-sm text-gray-300">
                  <span className="text-cyan-500 font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
                  {r}
                </li>
              ))}
            </ul>
          </section>

          {/* Full AI Report Text */}
          {session.ai_report_text && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-gray-400" />
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Full Report</h4>
              </div>
              <pre className="bg-navy-900/60 border border-white/5 rounded-xl p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">
                {session.ai_report_text}
              </pre>
            </section>
          )}
        </>
      )}
    </div>
  );
};

// ── Intelligence Tab ──────────────────────────────────────────────────────────

const RISK_CFG: Record<RiskLevel, { color: string; bg: string; border: string; dot: string; label: string }> = {
  low:      { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25',  dot: 'bg-green-400',  label: 'LOW'      },
  moderate: { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  dot: 'bg-amber-400',  label: 'MODERATE' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25', dot: 'bg-orange-400', label: 'HIGH'     },
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25',    dot: 'bg-red-400',    label: 'CRITICAL' },
};

const SEVERITY_CFG = {
  low:    { color: 'text-amber-400',  bg: 'bg-amber-500/8',   border: 'border-amber-500/20'  },
  medium: { color: 'text-orange-400', bg: 'bg-orange-500/8',  border: 'border-orange-500/20' },
  high:   { color: 'text-red-400',    bg: 'bg-red-500/8',     border: 'border-red-500/20'    },
};

function TrendArrow({ dir, label }: { dir: TrendDirection; label: string }) {
  if (dir === 'improving') return (
    <span className="flex items-center gap-1 text-green-400">
      <TrendingUp className="w-3 h-3" />
      <span className="text-[10px] font-semibold">{label}</span>
      <span className="text-[10px] font-bold">↑</span>
    </span>
  );
  if (dir === 'worsening') return (
    <span className="flex items-center gap-1 text-red-400">
      <TrendingDown className="w-3 h-3" />
      <span className="text-[10px] font-semibold">{label}</span>
      <span className="text-[10px] font-bold">↓</span>
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-gray-500">
      <Minus className="w-3 h-3" />
      <span className="text-[10px] font-semibold">{label}</span>
      <span className="text-[10px]">→</span>
    </span>
  );
}

const IntelligenceTab: React.FC<{ session: Session }> = ({ session }) => {
  const [memory, setMemory]     = useState<EmployeeMemory | null>(null);
  const [memLoading, setMemLoading] = useState(false);
  const [memError, setMemError] = useState(false);

  // Fetch employee memory using only the real employee identifier (userName).
  // session.role is a job title, not a unique identity — never use it for memory lookup.
  useEffect(() => {
    const empKey = session.userName;
    if (!empKey) {
      // No reliable employee identity — show graceful empty state, don't attempt fetch
      setMemError(true);
      return;
    }
    setMemLoading(true);
    setMemError(false);
    setMemory(null);
    apiFetch(`/api/memory/${encodeURIComponent(empKey)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: EmployeeMemory) => setMemory(data))
      .catch(() => setMemError(true))
      .finally(() => setMemLoading(false));
  }, [session.userName]);

  const noIdentity = !session.userName;  // no reliable employee key — memory is structurally unavailable

  const risk = session.structured_risk_score;
  const riskCfg = risk ? RISK_CFG[risk.level] : null;
  const anomalies = session.session_anomalies ?? [];
  const baseline  = memory?.baseline_7 ?? memory?.baseline_14 ?? memory?.baseline_all ?? null;

  return (
    <div className="flex flex-col gap-6">

      {/* ── 1. Session Risk Card ───────────────────────────────────────── */}
      {risk && riskCfg ? (
        <div className={`rounded-xl border p-4 ${riskCfg.bg} ${riskCfg.border}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Session Risk</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${riskCfg.dot}`} />
              <span className={`text-xs font-black uppercase tracking-widest ${riskCfg.color}`}>{riskCfg.label}</span>
              <span className={`text-2xl font-black leading-none ${riskCfg.color}`}>{risk.score}</span>
              <span className="text-xs text-gray-600">/100</span>
            </div>
          </div>
          {risk.summary[0] && (
            <p className={`text-xs font-semibold ${riskCfg.color}`}>{risk.summary[0]}</p>
          )}
          {risk.summary.length > 1 && (
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{risk.summary[1]}</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4 text-sm text-gray-500 text-center">
          Risk score not available for this session.
        </div>
      )}

      {/* ── 2. Why this score? ─────────────────────────────────────────── */}
      {risk && risk.contributors.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Why this score?</h4>
          <div className="flex flex-col gap-2">
            {[...risk.contributors]
              .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
              .slice(0, 4)
              .map((c, i) => {
                const isIncrease = c.direction === 'increase';
                const pts = Math.abs(Math.round(c.contribution));
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-white/3 border border-white/6 rounded-xl px-3 py-2.5"
                  >
                    <span
                      className={`text-xs font-black shrink-0 w-10 text-right tabular-nums ${
                        isIncrease ? 'text-red-400' : 'text-green-400'
                      }`}
                    >
                      {isIncrease ? '+' : '−'}{pts}
                    </span>
                    <span className="text-xs text-gray-300 leading-relaxed">{c.explanation}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── 3. Anomalies Detected ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Anomalies Detected</h4>
          {anomalies.length > 0 && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/8 text-amber-400 font-bold">
              {anomalies.length}
            </span>
          )}
        </div>
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-3">
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-xs text-green-400 font-semibold">No anomalies detected</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {anomalies.map((a, i) => {
              const sc = SEVERITY_CFG[a.severity] ?? SEVERITY_CFG.medium;
              const typeLabel = a.type.replace(/_/g, ' ');
              return (
                <div key={i} className={`rounded-xl border px-3 py-2.5 ${sc.bg} ${sc.border}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold capitalize ${sc.color}`}>{typeLabel}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${sc.bg} ${sc.border} ${sc.color}`}>
                      {a.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">{a.explanation}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600 font-mono">
                    <span>Current: <span className="text-gray-300">{a.currentValue}</span></span>
                    <span>·</span>
                    <span>Baseline: <span className="text-gray-400">{a.baselineValue}</span></span>
                    <span>·</span>
                    <span className={a.currentValue > a.baselineValue ? 'text-red-400' : 'text-green-400'}>
                      {a.currentValue > a.baselineValue ? '↑' : '↓'} {a.deviationPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Baseline vs Current ─────────────────────────────────────── */}
      <div>
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Baseline vs Current</h4>
        {memLoading ? (
          <div className="text-xs text-gray-600 py-2">Loading baseline data…</div>
        ) : noIdentity ? (
          <div className="text-xs text-gray-600 bg-white/3 border border-white/6 rounded-xl px-4 py-3">
            Employee memory unavailable — no employee identifier on this session.
          </div>
        ) : !baseline || memError ? (
          <div className="text-xs text-gray-600 bg-white/3 border border-white/6 rounded-xl px-4 py-3">
            Not enough data yet — baseline requires at least 2 sessions.
          </div>
        ) : (() => {
          const ts = session.timeline_summary;
          const rows: { label: string; current: number | null; base: number; unit?: string; lowerIsBetter?: boolean }[] = [
            {
              label:         'Focus Time',
              current:       ts?.totalFocusMin ?? null,
              base:          baseline.avgFocusMin,
              unit:          'min',
            },
            {
              label:         'Idle Time',
              current:       session.idle_minutes_estimate,
              base:          baseline.avgIdleMin,
              unit:          'min',
              lowerIsBetter: true,
            },
            {
              label:         'Distraction',
              current:       ts?.totalDistractionMin ?? null,
              base:          baseline.avgDistractionMin,
              unit:          'min',
              lowerIsBetter: true,
            },
            {
              label:         'Role Score',
              current:       session.role_based_score?.score ?? null,
              base:          baseline.avgRoleScore,
            },
            {
              label:         'Productivity',
              current:       session.overall_productivity_score,
              base:          baseline.avgProductivityScore,
            },
          ].filter(r => r.base > 0 && r.current !== null);

          return (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-3 gap-x-3 text-[10px] text-gray-600 font-semibold uppercase tracking-widest pb-1.5 border-b border-white/5">
                <span>Metric</span>
                <span className="text-right">Current</span>
                <span className="text-right">Avg ({memory?.baseline_7 ? '7 sessions' : memory?.baseline_14 ? '14 sessions' : 'all'})</span>
              </div>
              {rows.map(({ label, current, base, unit, lowerIsBetter }) => {
                const cur = current as number;
                const delta = cur - base;
                const pctDiff = base > 0 ? Math.round(Math.abs(delta) / base * 100) : 0;
                // good direction: higher is better by default; lowerIsBetter flips it
                const isGood = lowerIsBetter ? delta <= 0 : delta >= 0;
                const col = Math.abs(delta) < base * 0.05 ? 'text-gray-400'
                  : isGood ? 'text-green-400' : 'text-red-400';
                const arrow = Math.abs(delta) < base * 0.05 ? '→'
                  : delta > 0 ? '↑' : '↓';
                return (
                  <div key={label} className="grid grid-cols-3 gap-x-3 items-center py-1.5 border-b border-white/4">
                    <span className="text-xs text-gray-400">{label}</span>
                    <span className={`text-xs text-right font-semibold ${col}`}>
                      {Math.round(cur)}{unit ? ' ' + unit : ''}
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-xs text-gray-500">{Math.round(base)}{unit ? ' ' + unit : ''}</span>
                      {pctDiff >= 5 && (
                        <span className={`text-[10px] font-bold ${col}`}>{arrow} {pctDiff}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── 5. Trend Indicators ────────────────────────────────────────── */}
      <div>
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Trends</h4>
        {memLoading ? (
          <div className="text-xs text-gray-600 py-2">Loading trends…</div>
        ) : noIdentity ? (
          <div className="text-xs text-gray-600 bg-white/3 border border-white/6 rounded-xl px-4 py-3">
            Employee memory unavailable — no employee identifier on this session.
          </div>
        ) : !memory?.trends || memError ? (
          <div className="text-xs text-gray-600 bg-white/3 border border-white/6 rounded-xl px-4 py-3">
            Not enough data yet — trends require multiple sessions.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {([
              ['Productivity',   memory.trends.productivityTrend],
              ['Focus',          memory.trends.focusTrend],
              ['Idle',           memory.trends.idleTrend],
              ['Distraction',    memory.trends.distractionTrend],
              ['Switch Bursts',  memory.trends.switchBurstTrend],
            ] as [string, TrendDirection][]).map(([label, dir]) => (
              <div key={label} className="bg-white/3 border border-white/6 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{label}</span>
                <TrendArrow dir={dir} label="" />
              </div>
            ))}
          </div>
        )}
        {memory && (
          <p className="text-[10px] text-gray-600 mt-2">
            Based on {memory.session_count_available} session{memory.session_count_available !== 1 ? 's' : ''} · compared against {memory.trends.comparedAgainst}
          </p>
        )}
      </div>

      {/* ── Role Score detail ──────────────────────────────────────────── */}
      {session.role_based_score && (
        <div>
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Role-Based Score</h4>
          <div className="bg-white/3 border border-white/6 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400 capitalize">{session.role_based_score.role} profile</span>
              <span className={`text-2xl font-black ${classifyScore(session.role_based_score.score).color}`}>
                {session.role_based_score.score}
              </span>
            </div>
            {/* Factor bars */}
            <div className="flex flex-col gap-2">
              {Object.entries(session.role_based_score.factors).map(([key, val]) => {
                const sc  = classifyScore(val as number);
                const w   = session.role_based_score!.weights[key] ?? 0;
                // Map score classification to a bar hex color
                const barColor =
                  (val as number) >= 86 ? '#22d3ee' :
                  (val as number) >= 71 ? '#4ade80' :
                  (val as number) >= 41 ? '#fbbf24' : '#f87171';
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-32 text-[11px] text-gray-500 shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${val}%`, backgroundColor: barColor }} />
                    </div>
                    <span className={`text-[11px] font-bold w-7 text-right ${sc.color}`}>{val}</span>
                    <span className="text-[10px] text-gray-700 w-8 text-right">×{w}%</span>
                  </div>
                );
              })}
            </div>
            {/* Explanations */}
            <div className="flex flex-col gap-1 pt-2 border-t border-white/5">
              {session.role_based_score.explanation.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-gray-600 mt-1.5 shrink-0" />
                  <span className="text-[11px] text-gray-500 leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',      label: 'Overview',      icon: <Activity className="w-3.5 h-3.5" />  },
  { id: 'intelligence',  label: 'Intelligence',  icon: <Brain className="w-3.5 h-3.5" />     },
  { id: 'timeline',      label: 'Timeline',      icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: 'evidence',      label: 'Evidence',      icon: <Shield className="w-3.5 h-3.5" />    },
  { id: 'ai_analysis',   label: 'AI Analysis',   icon: <Zap className="w-3.5 h-3.5" />       },
];

// ── Session Drawer ────────────────────────────────────────────────────────────

interface Props {
  session: Session | null;
  onClose: () => void;
  allSessions?: Session[];
}

export const SessionDrawer: React.FC<Props> = ({ session, onClose, allSessions }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [compareMode, setCompareMode] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [aiViewMode, setAiViewMode] = useState<'executive' | 'technical'>('executive');

  // Internal active session (enables prev/next navigation)
  const [activeSession, setActiveSession] = useState<Session | null>(session);
  useEffect(() => { if (session) setActiveSession(session); }, [session?.id]);

  // Reset tab when session changes
  useEffect(() => { setActiveTab('overview'); setShowOverlay(false); }, [session?.id]);

  // Sorted newest-first
  const sortedSessions = useMemo(
    () => allSessions ? [...allSessions].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [],
    [allSessions]
  );
  const currentIdx = useMemo(
    () => activeSession ? sortedSessions.findIndex(s => s.id === activeSession.id) : -1,
    [sortedSessions, activeSession?.id]
  );
  const prevSession = useMemo(
    () => currentIdx >= 0 ? (sortedSessions[currentIdx + 1] ?? null) : null,
    [sortedSessions, currentIdx]
  );
  const sessionHistory = useMemo(
    () => sortedSessions.slice(currentIdx, currentIdx + 7).reverse(),
    [sortedSessions, currentIdx]
  );

  const navigateTo = (idx: number) => {
    if (sortedSessions[idx]) {
      setActiveSession(sortedSessions[idx]);
      setActiveTab('overview');
      setShowOverlay(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  if (!session || !activeSession) return null;

  const cls = classifyScore(activeSession.overall_productivity_score);
  const totalSessions = sortedSessions.length;
  const sessionNum = totalSessions > 0 && currentIdx >= 0 ? totalSessions - currentIdx : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 h-screen z-50 flex flex-col bg-navy-900 border-l border-white/8 shadow-2xl"
        style={{ width: 'min(860px, 95vw)' }}
      >
        {/* ── Drawer header ───────────────────────────────────────────── */}
        <div className="shrink-0 px-6 py-4 border-b border-white/6 bg-navy-800/60 backdrop-blur-sm">
          {/* Breadcrumb row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[11px] text-gray-600 min-w-0">
              <span className="text-gray-500 font-medium truncate">{activeSession.userName ?? 'Employee'}</span>
              {activeSession.role && activeSession.role !== 'N/A' && (
                <><span>·</span><span className="text-gray-600 truncate">{activeSession.role}</span></>
              )}
              {sessionNum !== null && totalSessions > 1 && (
                <><span>·</span><span className="text-gray-600 whitespace-nowrap">Session {sessionNum} of {totalSessions}</span></>
              )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Compare toggle */}
              <button onClick={() => setCompareMode(v => !v)}
                title="Compare with previous session"
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-all ${
                  compareMode ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' : 'bg-white/3 text-gray-500 border-white/8 hover:text-gray-300'
                }`}>
                <Columns2 className="w-3 h-3" />
                <span className="hidden sm:inline">Compare</span>
              </button>

              {/* Session selector */}
              {sortedSessions.length > 1 && (
                <div className="relative">
                  <select
                    value={activeSession.id}
                    onChange={e => {
                      const idx = sortedSessions.findIndex(s => s.id === e.target.value);
                      if (idx >= 0) navigateTo(idx);
                    }}
                    className="bg-navy-700/60 border border-white/8 text-gray-300 text-[11px] rounded-lg px-2 py-1.5 pr-6 outline-none appearance-none focus:border-cyan-500/40 cursor-pointer"
                  >
                    {sortedSessions.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {s.overall_productivity_score}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                </div>
              )}

              {/* Prev arrow */}
              <button
                onClick={() => navigateTo(currentIdx + 1)}
                disabled={currentIdx >= sortedSessions.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-400 hover:text-white"
                title="Previous session (older)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Next arrow */}
              <button
                onClick={() => navigateTo(currentIdx - 1)}
                disabled={currentIdx <= 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-400 hover:text-white"
                title="Next session (newer)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Close */}
              <button onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Session info row */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border shrink-0 ${cls.bg} ${cls.border} ${cls.color}`}>
              {activeSession.overall_productivity_score}
            </div>
            <div className="min-w-0 flex-1">
              {(activeSession.task && activeSession.task !== 'N/A') ? (
                <p className="text-white font-bold text-sm truncate">{activeSession.task}</p>
              ) : (
                <p className="text-white font-bold text-sm truncate">
                  {new Date(activeSession.session_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}{fmtDT(activeSession.session_start)}
                </p>
              )}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {activeSession.client && activeSession.client !== 'N/A' && (
                  <span className="text-xs text-gray-500">{activeSession.client}</span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls.bg} ${cls.border} ${cls.color}`}>{cls.label}</span>
                <span className="text-xs text-gray-500 capitalize">{activeSession.model_used}</span>
                <span className={`text-[10px] font-bold ${activeSession.report_type === 'IMG' ? 'text-purple-400' : 'text-cyan-400'}`}>{activeSession.report_type}</span>
                <span className="text-xs text-gray-500">{fmtDur(activeSession.total_minutes)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex gap-0 border-b border-white/6 bg-navy-800/40 px-4 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === t.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/20'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'overview' && (
            <OverviewTab
              session={activeSession}
              prevSession={prevSession}
              sessionHistory={sessionHistory}
              compareMode={compareMode}
            />
          )}

          {activeTab === 'intelligence' && (
            <IntelligenceTab session={activeSession} />
          )}

          {activeTab === 'timeline' && (
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h3 className="text-sm font-bold text-white">Session Timeline</h3>
                  {prevSession && prevSession.timeline_segments && prevSession.timeline_segments.length > 0 && (
                    <button
                      onClick={() => setShowOverlay(v => !v)}
                      className={`text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                        showOverlay ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-white/3 text-gray-500 border-white/8 hover:text-gray-300'
                      }`}
                    >
                      {showOverlay ? '✓ ' : ''}Overlay Previous Session
                    </button>
                  )}
                </div>
                <SessionTimelineBar
                  session={activeSession}
                  prevSession={showOverlay ? prevSession : undefined}
                />

                {/* Context burst badges */}
                {(() => {
                  const bursts = detectContextBursts(activeSession.app_switches ?? []);
                  if (!bursts.length) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest shrink-0">Context Bursts:</span>
                      {bursts.map((b, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/25 bg-red-500/5 text-red-400">
                          ⚡ {b.count} switches @ {fmtMinAsTime(b.atMin, activeSession.session_start)}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="border-t border-white/5 pt-6">
                <h3 className="text-sm font-bold text-white mb-4">Context Switches ({activeSession.app_switches?.length ?? 0})</h3>
                {activeSession.app_switches && activeSession.app_switches.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {activeSession.app_switches.map((sw, i) => {
                      const ts = fmtMinAsTime(sw.atMin, activeSession.session_start);
                      return (
                        <div key={i} className="flex items-center gap-3 bg-white/3 border border-white/5 rounded-xl px-4 py-2.5">
                          <span className="font-mono text-xs text-gray-500 w-12 shrink-0">{ts}</span>
                          <span className="text-sm text-gray-300">{sw.from}</span>
                          <span className="text-cyan-500 text-xs">→</span>
                          <span className="text-sm text-white font-medium">{sw.to}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No app switches recorded</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="flex flex-col gap-8">
              <EvidencePanel session={activeSession} allSessions={sortedSessions} />
              <div className="border-t border-white/5 pt-6">
                <h3 className="text-sm font-bold text-white mb-4">Task Analysis</h3>
                <TaskAnalysis session={activeSession} />
              </div>
            </div>
          )}

          {activeTab === 'ai_analysis' && (
            <AiReportTab
              session={activeSession}
              viewMode={aiViewMode}
              onViewModeChange={setAiViewMode}
              onTabSwitch={setActiveTab}
            />
          )}
        </div>
      </div>
    </>
  );
};
