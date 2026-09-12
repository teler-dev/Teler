import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader, RefreshCw, Sparkles } from 'lucide-react';
import { apiFetch } from '../../services/apiConfig';
import { Button } from '../ui/Button';

type QueueItem = {
  session_id: string;
  employee_name: string;
  started_at: string;
  total_duration_seconds: number | null;
  screenshot_count: number;
  analysis_status: 'pending' | 'failed' | 'insufficient_evidence';
  error_message?: string | null;
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function timeLabel(value: string) { return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function duration(seconds: number | null) {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export const AiAnalysisQueue: React.FC = () => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await apiFetch('/api/v1/ai-reports/queue');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load the analysis queue');
      const next = Array.isArray(payload.data) ? payload.data : [];
      setItems(next); setSelected(current => current.filter(id => next.some((item: QueueItem) => item.session_id === id)));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load the analysis queue'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const grouped = useMemo(() => items.reduce<Record<string, QueueItem[]>>((groups, item) => {
    const key = new Date(item.started_at).toISOString().slice(0, 10);
    (groups[key] ||= []).push(item); return groups;
  }, {}), [items]);
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleAll = () => setSelected(selected.length === items.length ? [] : items.map(item => item.session_id));
  const submit = async () => {
    if (!selected.length) return;
    setSubmitting(true); setMessage(null);
    try {
      const response = await apiFetch('/api/v1/ai-reports/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_ids: selected }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to queue analysis');
      const count = payload.data?.queued?.length || 0;
      setMessage(count ? `${count} session${count === 1 ? '' : 's'} queued for analysis.` : 'Selected sessions are already queued.');
      setSelected([]); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to queue analysis'); }
    finally { setSubmitting(false); }
  };

  return <section className="rounded-xl border border-subtle bg-surface-raised p-4 space-y-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Analysis queue</p><p className="text-[11px] text-secondary mt-1">Completed sessions with screenshots, ready whenever an AI model is available.</p></div><Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading || submitting}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button></div>
    {message && <p className="text-xs text-secondary rounded-lg border border-subtle px-3 py-2">{message}</p>}
    {!loading && items.length > 0 && <div className="flex items-center justify-between gap-3 text-xs"><button className="text-accent font-semibold hover:underline" onClick={toggleAll}>{selected.length === items.length ? 'Clear selection' : 'Select all'}</button><span className="text-secondary">{selected.length} selected</span></div>}
    {loading ? <div className="py-5 flex justify-center"><Loader className="w-4 h-4 animate-spin text-accent" /></div> : !items.length ? <p className="text-xs text-secondary py-3 text-center">No sessions are waiting for AI analysis.</p> : <div className="max-h-64 overflow-y-auto space-y-3 pr-1">{(Object.entries(grouped) as Array<[string, QueueItem[]]>).map(([day, entries]) => <div key={day} className="space-y-1.5"><p className="text-[11px] font-semibold text-secondary px-1">{dateLabel(entries[0].started_at)}</p>{entries.map(item => <label key={item.session_id} className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-card px-3 py-2.5 cursor-pointer hover:border-accent"><input type="checkbox" checked={selected.includes(item.session_id)} onChange={() => toggle(item.session_id)} className="w-4 h-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold truncate">{item.employee_name} · {timeLabel(item.started_at)}</span><span className="block text-[11px] text-secondary mt-0.5">{item.screenshot_count} screenshot{item.screenshot_count === 1 ? '' : 's'} · {duration(item.total_duration_seconds)}{item.analysis_status === 'failed' ? ' · retry' : ''}</span></span><CheckSquare className="w-3.5 h-3.5 text-accent shrink-0" /></label>)}</div>)}</div>}
    <Button size="sm" className="w-full" onClick={() => void submit()} disabled={!selected.length || submitting}>{submitting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{submitting ? 'Queueing…' : `Analyze selected${selected.length ? ` (${selected.length})` : ''}`}</Button>
  </section>;
};
