import React, { useState } from 'react';
import { Session, SegmentType, TaskBreakdownItem } from '../../types';

const SEG_COLOR: Record<SegmentType, { bg: string; label: string; text: string }> = {
  productive:  { bg: '#13D6FF', label: 'Productive',  text: 'text-cyan-400' },
  neutral:     { bg: '#4B5563', label: 'Neutral',     text: 'text-gray-400' },
  distraction: { bg: '#f87171', label: 'Distraction', text: 'text-red-400'  },
  idle:        { bg: '#1e293b', label: 'Idle',        text: 'text-gray-600' },
};

function fmtMin(min: number, baseTime: string) {
  const base = new Date(baseTime);
  base.setMinutes(base.getMinutes() + min);
  return base.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Timeline Bar ─────────────────────────────────────────────────────────────
export const SessionTimelineBar: React.FC<{
  session: Session;
  prevSession?: Session | null;
}> = ({ session, prevSession }) => {
  const [tooltip, setTooltip] = useState<{ x: number; seg: typeof session.timeline_segments[0] } | null>(null);
  const segs = session.timeline_segments ?? [];
  const total = session.total_minutes;

  if (!segs.length) return (
    <div className="h-10 bg-navy-700/40 rounded-lg flex items-center justify-center text-xs text-gray-600">No timeline data</div>
  );

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {Object.entries(SEG_COLOR).map(([type, { bg, label }]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: bg }} />
            {label}
          </span>
        ))}
        {session.focus_score >= 70 && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <span className="w-2.5 h-1 rounded-sm bg-amber-400/70" />
            Deep Work
          </span>
        )}
      </div>

      {/* Deep work annotation — thin amber band above bar for high-focus sessions */}
      {session.focus_score >= 70 && segs.some(s => s.type === 'productive') && (
        <div className="relative h-1 mb-1">
          {segs.filter(s => s.type === 'productive').map((seg, i) => (
            <div
              key={i}
              title="Deep Work Block"
              className="absolute h-full rounded-full bg-amber-400/70"
              style={{
                left: `${(seg.startMin / total) * 100}%`,
                width: `${((seg.endMin - seg.startMin) / total) * 100}%`,
              }}
            />
          ))}
        </div>
      )}

      {/* Main bar */}
      <div
        className="relative h-9 rounded-lg overflow-hidden bg-navy-700/40 flex"
        onMouseLeave={() => setTooltip(null)}
      >
        {segs.map((seg, i) => {
          const pct = ((seg.endMin - seg.startMin) / total) * 100;
          return (
            <div
              key={i}
              className="h-full transition-opacity hover:opacity-90 cursor-pointer relative"
              style={{ width: `${pct}%`, background: SEG_COLOR[seg.type].bg, opacity: seg.type === 'idle' ? 0.5 : 0.85 }}
              onMouseEnter={e => setTooltip({ x: (e.currentTarget as HTMLElement).offsetLeft, seg })}
            />
          );
        })}
      </div>

      {/* Time ticks */}
      <div className="flex justify-between mt-1 text-[10px] text-gray-600">
        <span>{fmtMin(0, session.session_start)}</span>
        <span>{fmtMin(Math.floor(total / 4), session.session_start)}</span>
        <span>{fmtMin(Math.floor(total / 2), session.session_start)}</span>
        <span>{fmtMin(Math.floor(3 * total / 4), session.session_start)}</span>
        <span>{fmtMin(total, session.session_start)}</span>
      </div>

      {/* App switch markers */}
      {session.app_switches && session.app_switches.length > 0 && (
        <div className="relative mt-2 h-3">
          {session.app_switches.map((sw, i) => {
            const left = (sw.atMin / total) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 -translate-x-1/2 group cursor-default"
                style={{ left: `${left}%` }}
              >
                <div className="w-px h-3 bg-white/20 group-hover:bg-cyan-400 transition-colors" />
                <div className="hidden group-hover:block absolute bottom-5 left-1/2 -translate-x-1/2 z-20 bg-navy-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-300 whitespace-nowrap shadow-xl">
                  {sw.from} → {sw.to}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute -top-16 z-30 bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl pointer-events-none"
          style={{ left: Math.min(tooltip.x, 60) }}
        >
          <p className={`font-bold ${SEG_COLOR[tooltip.seg.type].text}`}>{SEG_COLOR[tooltip.seg.type].label}</p>
          <p className="text-gray-300">{tooltip.seg.app} · {tooltip.seg.label}</p>
          <p className="text-gray-500">{fmtMin(tooltip.seg.startMin, session.session_start)} – {fmtMin(tooltip.seg.endMin, session.session_start)}</p>
          {tooltip.seg.type === 'idle' && <p className="text-gray-500 text-[10px]">● Idle period</p>}
          {tooltip.seg.type === 'distraction' && <p className="text-amber-400 text-[10px]">⚠ Distraction detected</p>}
        </div>
      )}

      {/* Context spikes */}
      {session.context_spikes && session.context_spikes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {session.context_spikes.map((spike, i) => (
            <span key={i} className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border ${
              spike.severity === 'high'   ? 'bg-red-500/10 border-red-500/25 text-red-400' :
              spike.severity === 'medium' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' :
                                            'bg-white/5 border-white/10 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${spike.severity === 'high' ? 'bg-red-400' : spike.severity === 'medium' ? 'bg-amber-400' : 'bg-gray-500'}`} />
              {fmtMin(spike.atMin, session.session_start)} · {spike.label}
            </span>
          ))}
        </div>
      )}

      {/* Previous session overlay */}
      {prevSession && prevSession.timeline_segments && prevSession.timeline_segments.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] text-gray-600 mb-1 flex items-center gap-2">
            <span className="w-4 h-px bg-gray-600 inline-block" />
            Previous Session
            <span className="text-gray-700">{new Date(prevSession.session_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="h-6 rounded-lg overflow-hidden bg-navy-700/40 flex opacity-50">
            {prevSession.timeline_segments.map((seg, i) => {
              const pct = ((seg.endMin - seg.startMin) / prevSession.total_minutes) * 100;
              return (
                <div
                  key={i}
                  className="h-full"
                  style={{ width: `${pct}%`, background: SEG_COLOR[seg.type].bg }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Task Analysis ────────────────────────────────────────────────────────────

function timeDiff(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

export const TaskAnalysis: React.FC<{ session: Session }> = ({ session }) => {
  const overlap = session.task_overlap_pct ?? 0;
  const detected = session.detected_tasks ?? [];
  const breakdown = session.task_breakdown ?? [];
  const claimed = session.claimed_task ?? 'Not specified';

  const overlapColor = overlap >= 85 ? 'text-cyan-400' : overlap >= 65 ? 'text-green-400' : overlap >= 40 ? 'text-amber-400' : 'text-red-400';
  const overlapLabel = overlap >= 85 ? 'Excellent' : overlap >= 65 ? 'Good' : overlap >= 40 ? 'Moderate' : 'Poor';
  const overlapExplain =
    overlap >= 85 ? '✓ Excellent alignment — AI-detected activities closely match the claimed task.' :
    overlap >= 65 ? '✓ Good alignment — mostly on-task with minor divergence.' :
    overlap >= 40 ? '⚠ Moderate mismatch — significant time spent outside the claimed task.' :
                    '✗ Poor alignment — evidence contradicts the claimed task. Review required.';

  const rowColor: Record<TaskBreakdownItem['type'], string> = {
    productive:  'bg-cyan-500/5 border-cyan-500/10',
    neutral:     'bg-white/3 border-white/6',
    distraction: 'bg-red-500/5 border-red-500/10',
    idle:        'bg-navy-700/30 border-white/5',
  };
  const typeTag: Record<TaskBreakdownItem['type'], string> = {
    productive:  'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    neutral:     'text-gray-400 bg-white/5 border-white/10',
    distraction: 'text-red-400 bg-red-500/10 border-red-500/20',
    idle:        'text-gray-600 bg-white/3 border-white/5',
  };

  // Task Consistency Score
  const consistencyData = (() => {
    if (!breakdown.length) return null;
    const productiveMins = breakdown.filter(r => r.type === 'productive').reduce((a, r) => a + timeDiff(r.start, r.end), 0);
    const totalTracked   = breakdown.reduce((a, r) => a + timeDiff(r.start, r.end), 0);
    const pct = totalTracked > 0 ? Math.round((productiveMins / totalTracked) * 100) : 0;
    return { pct, misaligned: 100 - pct };
  })();

  // Top mismatch segments
  const topMismatches = breakdown
    .filter(r => (r.type === 'distraction' || r.type === 'idle') && timeDiff(r.start, r.end) > 3)
    .sort((a, b) => timeDiff(b.start, b.end) - timeDiff(a.start, a.end))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      {/* Claimed vs Detected + Overlap */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-navy-700/40 border border-white/8 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Claimed Task</p>
          <p className="text-white font-semibold text-sm">{claimed}</p>
        </div>
        <div className="bg-navy-700/40 border border-white/8 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Overlap Match</p>
          <p className={`text-3xl font-black ${overlapColor}`}>{overlap}%</p>
          <p className={`text-[11px] font-semibold mt-1 ${overlapColor}`}>{overlapLabel}</p>
        </div>
      </div>

      {/* Overlap explanation */}
      <div className="text-xs text-gray-400 bg-navy-700/30 border border-white/5 rounded-lg px-4 py-3 leading-relaxed">
        {overlapExplain}
      </div>

      {/* Task Consistency Score */}
      {consistencyData && (
        <div className="bg-navy-700/40 border border-white/8 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Task Consistency Score</p>
          <div className="flex items-center gap-3 mb-2.5">
            <span className={`text-2xl font-black ${
              consistencyData.pct >= 70 ? 'text-cyan-400' : consistencyData.pct >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>{consistencyData.pct}%</span>
            <span className="text-xs text-gray-500">of tracked time is productive work</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-cyan-400/80 rounded-l-full transition-all duration-700"
              style={{ width: `${consistencyData.pct}%` }}
            />
            <div
              className="h-full bg-red-400/40 rounded-r-full transition-all duration-700"
              style={{ width: `${consistencyData.misaligned}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1.5">
            <span>{consistencyData.pct}% Aligned</span>
            <span>{consistencyData.misaligned}% Misaligned</span>
          </div>
        </div>
      )}

      {/* Detected Tasks */}
      {detected.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">AI Detected Activities</h4>
          <div className="flex flex-col gap-2">
            {detected.map((t, i) => {
              const conf = t.confidence;
              const confColor = conf >= 90 ? 'bg-cyan-400' : conf >= 75 ? 'bg-green-400' : conf >= 60 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={i} className="flex items-center gap-3 bg-white/3 border border-white/6 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.apps.join(' · ')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{t.duration_minutes}m</p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <div className="h-1 w-12 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full ${confColor} rounded-full`} style={{ width: `${conf}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500">{conf}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Mismatch Segments */}
      {topMismatches.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2.5">Top Mismatch Segments</h4>
          <div className="flex flex-col gap-1.5">
            {topMismatches.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 ${rowColor[r.type]}`}>
                <div className="w-24 shrink-0 text-xs font-mono text-gray-400">{r.start}–{r.end}</div>
                <div className="flex-1 text-sm text-white truncate">{r.activity}</div>
                <div className="hidden sm:block text-xs text-gray-500 w-28 text-right truncate">{r.app}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize shrink-0 ${typeTag[r.type]}`}>
                  {r.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Minute-by-Minute Breakdown */}
      {breakdown.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Minute-by-Minute Breakdown</h4>
          <div className="flex flex-col gap-1.5">
            {breakdown.map((row, i) => (
              <div key={i} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 ${rowColor[row.type]}`}>
                <div className="w-24 shrink-0 text-xs font-mono text-gray-400">{row.start}–{row.end}</div>
                <div className="flex-1 text-sm text-white">{row.activity}</div>
                <div className="hidden sm:block text-xs text-gray-500 w-28 text-right truncate">{row.app}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize shrink-0 ${typeTag[row.type]}`}>
                  {row.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
