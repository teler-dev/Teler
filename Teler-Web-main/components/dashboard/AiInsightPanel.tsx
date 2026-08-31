import React, { useMemo } from 'react';
import { Session, MicroWindow, HourBlock } from '../../types';
import { Zap, AlertTriangle, CheckCircle, Target, BrainCircuit } from 'lucide-react';

// ── BehaviorInsightPanel ──────────────────────────────────────────────────────
// Rule-based client-side insight widget for EvidencePanel.

function fmtMin(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function streakMinutes(windows: MicroWindow[]): number {
  let best = 0, cur = 0;
  for (const w of windows) {
    if ((w.focus_score ?? 0) >= 70 && w.activity_type === 'productive') {
      if (++cur > best) best = cur;
    } else { cur = 0; }
  }
  return Math.min(Math.round(best * 3.75), 180);
}

function focusDrop(hourBlocks: HourBlock[]): string | null {
  const active = hourBlocks.filter(
    h => (h.deep_work_minutes ?? 0) + (h.distraction_minutes ?? 0) > 5,
  );
  if (active.length < 2) return null;
  let maxDrop = 0, label: string | null = null;
  for (let i = 1; i < active.length; i++) {
    const drop = (active[i - 1].focus_score ?? 0) - (active[i].focus_score ?? 0);
    if (drop > maxDrop) { maxDrop = drop; label = (active[i].hour_start ?? '').slice(0, 5); }
  }
  return maxDrop >= 10 ? label : null;
}

interface Signal { message: string; priority: number; }

function buildSignals(session: Session): string[] {
  const micro  = session.micro_windows ?? [];
  const hours  = session.hour_blocks   ?? [];
  const ds     = session.daily_summary;
  const workH  = (session.total_minutes ?? 0) / 60;
  const signals: Signal[] = [];

  // A — Deep work streak ≥ 60 min  (priority 100 — strongest positive signal)
  if (micro.length > 0) {
    const streak = streakMinutes(micro);
    if (streak >= 60)
      signals.push({
        message:  `Strong deep work detected with a ${fmtMin(streak)} uninterrupted focus session.`,
        priority: 100,
      });
  }

  // B — High context switching >30/hr  (priority 90 — critical negative signal)
  const switches = ds?.context_switch_count;
  if (switches != null && workH > 0.25) {
    const rate = switches / workH;
    if (rate > 30)
      signals.push({
        message:  `High context switching detected (${Math.round(rate)}/hr), which may be fragmenting sustained focus.`,
        priority: 90,
      });
  }

  // C — Focus drop ≥ 10 points between consecutive hours  (priority 80)
  if (hours.length >= 2) {
    const drop = focusDrop(hours);
    if (drop)
      signals.push({
        message:  `Focus declined after ${drop}, suggesting increased interruptions mid-session.`,
        priority: 80,
      });
  }

  // D — Primary distraction source  (priority 60 — contextual)
  if (ds?.biggest_distraction)
    signals.push({
      message:  `Primary distraction source appears to be ${ds.biggest_distraction}.`,
      priority: 60,
    });

  return signals
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(s => s.message);
}

export const BehaviorInsightPanel: React.FC<{ session: Session }> = ({ session }) => {
  const signals = useMemo(() => buildSignals(session), [session]);

  const hasData =
    (session.micro_windows?.length ?? 0) > 0 ||
    (session.hour_blocks?.length ?? 0) > 0 ||
    session.daily_summary != null;

  return (
    <section className="bg-navy-800/50 border border-indigo-500/20 rounded-xl p-4 shadow-[0_0_24px_rgba(99,102,241,0.07)]">
      <div className="flex items-center gap-2 mb-3">
        <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">AI Insight</h4>
      </div>
      {!hasData || signals.length === 0 ? (
        <p className="text-xs text-gray-600 italic leading-relaxed">
          AI insight will appear after more activity is recorded.
        </p>
      ) : (
        <p className="text-xs text-gray-300 leading-relaxed">{signals.join(' ')}</p>
      )}
    </section>
  );
};

interface Props { session: Session | null; }

export const AiInsightPanel: React.FC<Props> = ({ session }) => {
  if (!session) {
    return (
      <div className="bg-navy-800/60 border border-white/8 rounded-2xl p-6 flex items-center justify-center min-h-[240px]">
        <p className="text-gray-600 text-sm">Select a session to view AI insights</p>
      </div>
    );
  }

  return (
    <div className="relative bg-navy-800/60 border border-cyan-500/20 rounded-2xl p-6 flex flex-col gap-5 overflow-hidden"
         style={{ boxShadow: '0 0 40px rgba(19,214,255,0.06), inset 0 1px 0 rgba(19,214,255,0.08)' }}>

      {/* Glow orb */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/5 blur-[60px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-2.5 relative z-10">
        <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
          <Zap className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-bold text-base">AI Insight</h3>
          <p className="text-gray-500 text-xs">
            {session.model_used.charAt(0).toUpperCase() + session.model_used.slice(1)} · {session.report_type} analysis
          </p>
        </div>
      </div>

      {/* Main Tasks */}
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-2.5">
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Main Tasks Detected</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {session.main_tasks.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 mt-1.5 shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Distractions */}
      {session.main_distractions.length > 0 && (
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Distractions</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {session.main_distractions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 mt-1.5 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red Flags */}
      {session.red_flags.length > 0 && (
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Red Flags</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {session.red_flags.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/60 mt-1.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Top Recommendations</span>
        </div>
        <ul className="flex flex-col gap-2">
          {session.recommendations.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl px-3 py-2 text-sm text-gray-300">
              <span className="text-cyan-500 font-bold shrink-0 text-xs mt-0.5">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
