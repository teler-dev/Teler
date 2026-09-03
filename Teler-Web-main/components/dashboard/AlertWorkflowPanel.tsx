import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, History, UserRound, MoonStar } from 'lucide-react';
import { AlertWorkflowState, getAlertWorkflow, updateAlertWorkflow } from '../../services/workspaceService';

interface Props {
  alertId: string;
  actor?: string;
}

export const AlertWorkflowPanel: React.FC<Props> = ({ alertId, actor = 'Manager' }) => {
  const [workflow, setWorkflow] = useState<AlertWorkflowState>(() => getAlertWorkflow(alertId));

  useEffect(() => setWorkflow(getAlertWorkflow(alertId)), [alertId]);

  const update = (patch: Partial<AlertWorkflowState>) => setWorkflow(updateAlertWorkflow(alertId, patch, actor));

  return <div className="bg-surface-card border border-subtle rounded-xl p-4 space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><p className="text-sm font-semibold text-primary">Operational workflow</p><p className="text-xs text-secondary mt-0.5">Assign, acknowledge, snooze or resolve this alert.</p></div>
      <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-full border ${workflow.status === 'resolved' ? 'text-green-400 border-green-500/30 bg-green-500/10' : workflow.status === 'snoozed' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : workflow.status === 'acknowledged' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' : 'text-secondary border-subtle bg-surface-raised'}`}>{workflow.status}</span>
    </div>

    <label className="block"><span className="text-xs text-secondary flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5" />Owner</span><input value={workflow.owner} onChange={e => update({ owner: e.target.value })} placeholder="Manager or team owner" className="mt-2 w-full bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" /></label>
    <label className="block"><span className="text-xs text-secondary">Internal note</span><textarea rows={3} value={workflow.note} onChange={e => update({ note: e.target.value })} placeholder="Add investigation context or follow-up notes…" className="mt-2 w-full bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent resize-none" /></label>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button type="button" onClick={() => update({ status: 'acknowledged', snoozedUntil: null })} className="px-3 py-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 text-cyan-400 text-xs font-semibold flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Acknowledge</button>
      <button type="button" onClick={() => update({ status: 'snoozed', snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })} className="px-3 py-2 rounded-lg border border-amber-500/25 bg-amber-500/5 text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5"><MoonStar className="w-3.5 h-3.5" />Snooze 24h</button>
      <button type="button" onClick={() => update({ status: 'resolved', snoozedUntil: null })} className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-green-500/25 bg-green-500/5 text-green-400 text-xs font-semibold flex items-center justify-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Resolve</button>
    </div>

    {workflow.snoozedUntil && <p className="text-xs text-secondary flex gap-1.5 items-center"><Clock3 className="w-3.5 h-3.5" />Snoozed until {new Date(workflow.snoozedUntil).toLocaleString()}</p>}

    {workflow.history.length > 0 && <details className="border-t border-subtle pt-3"><summary className="cursor-pointer text-xs text-secondary flex items-center gap-1.5"><History className="w-3.5 h-3.5" />History ({workflow.history.length})</summary><div className="mt-3 space-y-2">{workflow.history.slice(0,8).map((item,index) => <div key={`${item.at}-${index}`} className="text-xs"><p className="text-primary">{item.action}</p><p className="text-secondary mt-0.5">{item.actor} · {new Date(item.at).toLocaleString()}</p></div>)}</div></details>}
  </div>;
};