import React, { useMemo } from 'react';
import { Session, MicroWindow, HourBlock } from '../../types';
import { Zap, Flame, Shuffle } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Metric: Focus Stability Score ─────────────────────────────────────────────

function computeFocusStability(hourBlocks: HourBlock[]): number | null {
  // Exclude idle/near-idle hours — focus_score=0 on inactive hours inflates stddev
  const activeHours = hourBlocks.filter(
    h => (h.deep_work_minutes ?? 0) + (h.distraction_minutes ?? 0) > 5,
  );
  if (activeHours.length < 2) return null;
  const scores = activeHours.map(h => h.focus_score ?? 0);
  const sd = stdDev(scores);
  return Math.max(0, Math.min(100, Math.round(100 - sd)));
}

// ── Metric: Deep Work Streak ──────────────────────────────────────────────────

function computeDeepWorkStreak(microWindows: MicroWindow[]): number {
  // Returns longest consecutive streak in minutes (each window ≈ 3.75 min), capped at 180
  let best = 0;
  let current = 0;
  for (const w of microWindows) {
    if ((w.focus_score ?? 0) >= 70 && w.activity_type === 'productive') {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return Math.min(Math.round(best * 3.75), 180);
}

// ── Metric: Attention Fragmentation Index ─────────────────────────────────────

function computeFragmentation(
  session: Session,
): { switchesPerHour: number; source: 'daily' | 'micro' } | null {
  const totalHours = (session.total_minutes ?? 0) / 60;
  if (totalHours < 0.25) return null;

  // Prefer daily_summary.context_switch_count
  const switchCount = session.daily_summary?.context_switch_count;
  if (switchCount != null) {
    return { switchesPerHour: Math.round(switchCount / totalHours), source: 'daily' };
  }

  // Fallback: count distraction transitions in micro_windows
  const windows = session.micro_windows ?? [];
  if (windows.length < 2) return null;
  let transitions = 0;
  for (let i = 1; i < windows.length; i++) {
    if (windows[i].activity_type !== windows[i - 1].activity_type) transitions++;
  }
  return { switchesPerHour: Math.round(transitions / totalHours), source: 'micro' };
}

// ── Signal Card ───────────────────────────────────────────────────────────────

interface SignalCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  label: string;
  valueColor: string;
  glowClass?: string;
  missing?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({
  icon, title, value, label, valueColor, glowClass = '', missing = false,
}) => (
  <div className={`flex-1 min-w-0 bg-navy-800/60 border border-white/8 rounded-xl p-4 flex flex-col gap-2 ${glowClass}`}>
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{title}</span>
    </div>
    {missing ? (
      <p className="text-[10px] text-gray-600 italic">Insufficient data to compute signal.</p>
    ) : (
      <>
        <span className={`text-2xl font-black tabular-nums leading-none ${valueColor}`}>{value}</span>
        <span className="text-[10px] text-gray-500 leading-snug">{label}</span>
      </>
    )}
  </div>
);

// ── Main Panel ────────────────────────────────────────────────────────────────

export const ProductivitySignalsPanel: React.FC<{ session: Session }> = ({ session }) => {
  const hourBlocks   = session.hour_blocks   ?? [];
  const microWindows = session.micro_windows ?? [];

  const stability = useMemo(() => computeFocusStability(hourBlocks),  [hourBlocks]);
  const streakMin = useMemo(() => computeDeepWorkStreak(microWindows), [microWindows]);
  const frag      = useMemo(() => computeFragmentation(session),       [session]);

  // ── Focus Stability ───────────────────────────────────────────────────────
  const stabilityColor =
    stability == null ? 'text-gray-500' :
    stability >= 80   ? 'text-cyan-400'  :
    stability >= 60   ? 'text-amber-400' : 'text-red-400';
  const stabilityGlow =
    stability != null && stability >= 80 ? 'shadow-[0_0_18px_rgba(34,211,238,0.10)]' : '';
  const stabilityLabel =
    stability == null ? '' :
    stability >= 80   ? 'Stable consistency'    :
    stability >= 60   ? 'Moderate consistency'  : 'Fragmented focus';

  // ── Deep Work Streak ──────────────────────────────────────────────────────
  const streakColor = 'text-cyan-400';
  const streakGlow  = streakMin >= 60 ? 'shadow-[0_0_18px_rgba(34,211,238,0.10)]' : '';
  const streakLabel = 'Longest uninterrupted focus';

  // ── Fragmentation ─────────────────────────────────────────────────────────
  const fragVal   = frag?.switchesPerHour ?? 0;
  const fragColor =
    frag == null   ? 'text-gray-500' :
    fragVal < 15   ? 'text-cyan-400'  :
    fragVal <= 30  ? 'text-amber-400' : 'text-red-400';
  const fragLabel =
    frag == null   ? '' :
    fragVal < 15   ? 'Focused switching'     :
    fragVal <= 30  ? 'Normal switching'      : 'Highly fragmented';

  return (
    <section className="bg-navy-800/50 border border-white/8 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
          AI Productivity Signals
        </h4>
      </div>

      {/* Three cards */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Focus Stability */}
        <SignalCard
          icon={<Zap className="w-3 h-3 text-gray-500" />}
          title="Focus Stability"
          value={stability != null ? String(stability) : '—'}
          label={stabilityLabel}
          valueColor={stabilityColor}
          glowClass={stabilityGlow}
          missing={stability == null}
        />

        {/* Deep Work Streak */}
        <SignalCard
          icon={<Flame className="w-3 h-3 text-gray-500" />}
          title="Deep Work Streak"
          value={microWindows.length > 0 ? (streakMin > 0 ? fmtMinutes(streakMin) : '0m') : '—'}
          label={streakMin > 0 ? streakLabel : 'No qualifying deep work windows'}
          valueColor={streakColor}
          glowClass={streakGlow}
          missing={microWindows.length === 0}
        />

        {/* Attention Fragmentation */}
        <SignalCard
          icon={<Shuffle className="w-3 h-3 text-gray-500" />}
          title="Attention Fragmentation"
          value={frag != null ? `${fragVal} / hr` : '—'}
          label={fragLabel}
          valueColor={fragColor}
          missing={frag == null}
        />
      </div>
    </section>
  );
};
