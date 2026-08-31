import React, { useState } from 'react';
import { Activity } from 'lucide-react';
import { Session, SegmentEntry } from '../../types';

// ── Display state ─────────────────────────────────────────────────────────────

type DisplayState =
  | 'deep_work'
  | 'focus_work'
  | 'passive_work'
  | 'context_switch'
  | 'distraction'
  | 'idle'
  | 'neutral';

function deriveState(seg: SegmentEntry): DisplayState {
  const act = (seg.activity_state || seg.segment_type || 'active').toLowerCase();
  const rel  = (seg.work_relevance || '').toLowerCase();

  if (act === 'idle')                                    return 'idle';
  if (rel === 'distraction')                             return 'distraction';
  if (act === 'passive_work')                            return 'passive_work';
  // Short active bursts (<2 min) signal rapid context switching
  if (seg.duration_seconds < 120 && act === 'active')   return 'context_switch';
  // Long active blocks (≥20 min) = deep work
  if (seg.duration_seconds >= 1200 && act === 'active') return 'deep_work';
  if (act === 'active')                                  return 'focus_work';
  return 'neutral';
}

const STATE_META: Record<DisplayState, { color: string; label: string }> = {
  deep_work:      { color: '#a855f7', label: 'Deep Work'      },
  focus_work:     { color: '#06b6d4', label: 'Focus'          },
  passive_work:   { color: '#3b82f6', label: 'Passive'        },
  context_switch: { color: '#f59e0b', label: 'Context Switch' },
  distraction:    { color: '#ef4444', label: 'Distraction'    },
  idle:           { color: '#374151', label: 'Idle'           },
  neutral:        { color: '#475569', label: 'Neutral'        },
};

const LEGEND_STATES: DisplayState[] = [
  'deep_work', 'focus_work', 'passive_work', 'context_switch', 'distraction', 'idle',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function fmtTime(t: string): string {
  // "2026-03-04 09:36:00" → "09:36"  or  "09:36:00" → "09:36"
  const parts = t.split(' ');
  return (parts[parts.length - 1] || '').slice(0, 5);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipData {
  seg: SegmentEntry;
  state: DisplayState;
  x: number;
  y: number;
}

const BlockTooltip: React.FC<{ data: TooltipData }> = ({ data }) => {
  const { seg, state } = data;
  const meta = STATE_META[state];

  return (
    <div
      className="fixed z-50 pointer-events-none rounded-xl shadow-2xl p-3 text-xs"
      style={{
        left:           data.x + 14,
        top:            data.y - 12,
        minWidth:       '170px',
        background:     '#0d1117',
        border:         '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: meta.color }}
        />
        <span className="text-white font-bold">{meta.label}</span>
      </div>

      <div className="flex flex-col gap-1 text-gray-400">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Time</span>
          <span className="text-white tabular-nums">{fmtTime(seg.start_time)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Duration</span>
          <span className="text-white tabular-nums">{fmtDur(seg.duration_seconds)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">App</span>
          <span className="text-white truncate max-w-[100px]">{seg.app || '—'}</span>
        </div>
        {seg.context_type && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Context</span>
            <span className="text-white capitalize">{seg.context_type.replace(/_/g, ' ')}</span>
          </div>
        )}
        {seg.work_relevance && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Relevance</span>
            <span className="text-white capitalize">{seg.work_relevance.replace(/_/g, ' ')}</span>
          </div>
        )}
        {seg.url_domain && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">URL</span>
            <span className="text-gray-300 truncate max-w-[100px]">{seg.url_domain}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const FocusTimeline: React.FC<{ session: Session }> = ({ session }) => {
  const segments = session.segments ?? [];
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  if (segments.length === 0) return null;

  const totalSec = segments.reduce((a, s) => a + s.duration_seconds, 0) || 1;

  const firstTime = fmtTime(segments[0].start_time);
  const lastTime  = segments.length > 1 ? fmtTime(segments[segments.length - 1].end_time) : '';

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">
            Focus Timeline
          </h4>
          <span className="text-[10px] text-gray-600">{segments.length} segments</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {LEGEND_STATES.map(s => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ background: STATE_META[s].color }}
              />
              {STATE_META[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Timeline bar */}
      <div
        className="flex h-8 rounded-lg overflow-hidden gap-px"
        style={{ background: 'rgba(255,255,255,0.03)' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {segments.map(seg => {
          const state = deriveState(seg);
          const pct   = (seg.duration_seconds / totalSec) * 100;
          const color = STATE_META[state].color;

          return (
            <div
              key={seg.index}
              className="h-full cursor-pointer rounded-sm transition-all hover:brightness-125 hover:ring-1 hover:ring-white/25"
              style={{
                flexBasis:  `${pct}%`,
                minWidth:   '6px',
                background: color,
                opacity:    state === 'idle' ? 0.35 : 0.72,
              }}
              onMouseEnter={e =>
                setTooltip({ seg, state, x: e.clientX, y: e.clientY })
              }
              onMouseMove={e =>
                setTooltip(prev =>
                  prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                )
              }
            />
          );
        })}
      </div>

      {/* Time labels */}
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-600 tabular-nums select-none">
        <span>{firstTime}</span>
        {lastTime && <span>{lastTime}</span>}
      </div>

      {/* Tooltip */}
      {tooltip && <BlockTooltip data={tooltip} />}
    </section>
  );
};
