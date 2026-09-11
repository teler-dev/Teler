import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, History, MoonStar, UserRound } from 'lucide-react';
import { AlertWorkflowState, getAlertWorkflow, updateAlertWorkflow } from '../../services/workspaceService';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FieldLabel, Textarea, TextInput } from '../ui/FormControls';
import { StatusBadge, StatusTone } from '../ui/StatusBadge';

interface Props {
  alertId: string;
  actor?: string;
}

function statusTone(status: AlertWorkflowState['status']): StatusTone {
  if (status === 'resolved') return 'success';
  if (status === 'snoozed') return 'warning';
  if (status === 'acknowledged') return 'info';
  return 'neutral';
}

export const AlertWorkflowPanel: React.FC<Props> = ({ alertId, actor = 'Manager' }) => {
  const [workflow, setWorkflow] = useState<AlertWorkflowState>(() => getAlertWorkflow(alertId));

  useEffect(() => setWorkflow(getAlertWorkflow(alertId)), [alertId]);

  const update = (patch: Partial<AlertWorkflowState>) => setWorkflow(updateAlertWorkflow(alertId, patch, actor));

  return (
    <Card padding="md" elevated={false} className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-primary">Operational workflow</p>
          <p className="text-xs text-secondary mt-1">Assign, acknowledge, snooze or resolve this alert.</p>
        </div>
        <StatusBadge tone={statusTone(workflow.status)}>{workflow.status}</StatusBadge>
      </div>

      <label className="block">
        <FieldLabel className="flex items-center gap-1.5">
          <UserRound className="w-3.5 h-3.5" />
          Owner
        </FieldLabel>
        <TextInput
          className="mt-2"
          value={workflow.owner}
          onChange={event => update({ owner: event.target.value })}
          placeholder="Manager or team owner"
        />
      </label>

      <label className="block">
        <FieldLabel>Internal note</FieldLabel>
        <Textarea
          className="mt-2"
          rows={3}
          value={workflow.note}
          onChange={event => update({ note: event.target.value })}
          placeholder="Add investigation context or follow-up notes…"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={() => update({ status: 'acknowledged', snoozedUntil: null })}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Acknowledge
        </Button>
        <Button variant="outline" size="sm" onClick={() => update({ status: 'snoozed', snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}>
          <MoonStar className="w-3.5 h-3.5" />
          Snooze 24h
        </Button>
        <Button variant="secondary" size="sm" onClick={() => update({ status: 'resolved', snoozedUntil: null })}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Resolve
        </Button>
      </div>

      {workflow.snoozedUntil && (
        <p className="text-xs text-secondary flex gap-1.5 items-center">
          <Clock3 className="w-3.5 h-3.5" />
          Snoozed until {new Date(workflow.snoozedUntil).toLocaleString()}
        </p>
      )}

      {workflow.history.length > 0 && (
        <details className="border-t border-subtle pt-3">
          <summary className="cursor-pointer text-xs font-medium text-secondary flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            History ({workflow.history.length})
          </summary>
          <div className="mt-3 space-y-2">
            {workflow.history.slice(0,8).map((item,index) => (
              <div key={`${item.at}-${index}`} className="text-xs rounded-xl border border-subtle bg-surface-raised p-3">
                <p className="text-primary font-medium">{item.action}</p>
                <p className="text-secondary mt-1">{item.actor} · {new Date(item.at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
};