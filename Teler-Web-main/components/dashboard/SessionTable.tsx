import React, { useState } from 'react';
import { Session, classifyScore } from '../../types';
import { ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { SessionDrawer } from './SessionDrawer';

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type SortKey = 'created_at' | 'total_minutes' | 'overall_productivity_score' | 'model_used';

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const SessionTable: React.FC<Props> = ({ sessions, selectedId, onSelect }) => {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc]   = useState(false);
  const [drawerSession, setDrawerSession] = useState<Session | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...sessions].sort((a, b) => {
    let av: any = a[sortKey];
    let bv: any = b[sortKey];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const SortBtn: React.FC<{ k: SortKey; label: string }> = ({ k, label }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
    >
      {label}
      {sortKey === k
        ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
        : <ChevronDown className="w-3 h-3 opacity-30" />}
    </button>
  );

  return (
    <>
      {/* Drawer */}
      <SessionDrawer session={drawerSession} allSessions={sessions} onClose={() => setDrawerSession(null)} />

      <div className="bg-navy-800/60 border border-white/8 rounded-2xl overflow-hidden hover:border-cyan-500/20 transition-colors">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-base">Sessions</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · click row to compare · <Eye className="w-3 h-3 inline" /> for deep analysis
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-6 py-3"><SortBtn k="created_at" label="Date" /></th>
                <th className="text-left px-4 py-3"><SortBtn k="total_minutes" label="Duration" /></th>
                <th className="text-left px-4 py-3">Tasks</th>
                <th className="text-left px-4 py-3"><SortBtn k="model_used" label="Model" /></th>
                <th className="text-left px-4 py-3"><SortBtn k="overall_productivity_score" label="Score" /></th>
                <th className="text-left px-4 py-3">Risk</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const cls = classifyScore(s.overall_productivity_score);
                const isSelected = s.id === selectedId;
                const overlap = s.task_overlap_pct;
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`border-b border-white/3 cursor-pointer transition-colors ${isSelected ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500/50' : 'hover:bg-white/3'}`}
                  >
                    <td className="px-6 py-3 text-gray-300 whitespace-nowrap">{fmtDateTime(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtDuration(s.total_minutes)}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="truncate text-gray-300 text-xs font-medium">
                        {s.task && s.task !== 'N/A' ? s.task : s.main_tasks[0] ?? '—'}
                      </div>
                      {s.role && s.role !== 'N/A' && (
                        <div className="text-[10px] text-gray-600 truncate mt-0.5">{s.role}{s.client && s.client !== 'N/A' ? ` · ${s.client}` : ''}</div>
                      )}
                      {overlap != null && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${overlap >= 80 ? 'bg-cyan-400' : overlap >= 60 ? 'bg-green-400' : 'bg-amber-400'}`}
                              style={{ width: `${overlap}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-600">{overlap}% match</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-gray-300">{s.model_used}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-black text-xl ${cls.color}`}>{s.overall_productivity_score}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        s.overall_productivity_score >= 80
                          ? 'bg-green-500/15 border-green-500/30 text-green-400'
                          : s.overall_productivity_score >= 50
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-red-500/15 border-red-500/30 text-red-400'
                      }`}>
                        {s.overall_productivity_score >= 80 ? 'Healthy' : s.overall_productivity_score >= 50 ? 'Warning' : 'High Risk'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); setDrawerSession(s); }}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-cyan-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/5 border border-transparent hover:border-cyan-500/20"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline font-medium">Deep View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
