import React, { useEffect, useMemo, useState } from 'react';
import { Loader, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { TextInput, Select, FieldLabel } from '../ui/FormControls';
import { addEmployee, JOB_ROLES, listTeam, NewEmployeeInput, TeamMember } from '../../services/teamService';

const EMPTY_FORM: NewEmployeeInput = { displayName: '', email: '', password: '', jobRole: 'general' };

function roleLabel(value: string): string {
  return (JOB_ROLES.find(role => role.value === value)?.label) || (value ? value[0].toUpperCase() + value.slice(1) : 'General');
}

export const TeamSettingsPanel: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<NewEmployeeInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setLoadError(null);
    try {
      setMembers(await listTeam());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const canSubmit = useMemo(
    () => form.displayName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password.length >= 8,
    [form],
  );

  const update = (patch: Partial<NewEmployeeInput>) => setForm(current => ({ ...current, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true); setFormError(null); setSuccess(null);
    try {
      const created = await addEmployee({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        jobRole: form.jobRole,
      });
      setMembers(current => [...current, created]);
      setForm(EMPTY_FORM);
      setSuccess(`${created.display_name} can now sign in and their tracking will appear in this workspace.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="space-y-6">
    <form onSubmit={submit} className="theme-form-surface bg-surface-card border border-subtle rounded-2xl p-5 space-y-4 shadow-card">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-accent" />
        <div>
          <p className="text-sm font-bold text-primary">Add employee</p>
          <p className="text-[11px] text-secondary">Creates a sign-in for the desktop tracker. New employees join this workspace as viewers.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 block">
          <FieldLabel>Full name</FieldLabel>
          <TextInput value={form.displayName} onChange={e => update({ displayName: e.target.value })} placeholder="Jane Cooper" autoComplete="off" maxLength={100} />
        </label>
        <label className="space-y-1.5 block">
          <FieldLabel>Work email</FieldLabel>
          <TextInput type="email" value={form.email} onChange={e => update({ email: e.target.value })} placeholder="jane@company.com" autoComplete="off" maxLength={254} />
        </label>
        <label className="space-y-1.5 block">
          <FieldLabel>Temporary password</FieldLabel>
          <TextInput type="text" value={form.password} onChange={e => update({ password: e.target.value })} placeholder="At least 8 characters" autoComplete="off" maxLength={200} />
        </label>
        <label className="space-y-1.5 block">
          <FieldLabel>Job role</FieldLabel>
          <Select value={form.jobRole} onChange={e => update({ jobRole: e.target.value })}>
            {JOB_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
          </Select>
        </label>
      </div>

      {formError && <p className="text-xs text-danger rounded-lg border border-danger bg-danger-soft px-3 py-2">{formError}</p>}
      {success && <p className="text-xs text-primary rounded-lg border border-subtle bg-surface-raised px-3 py-2">{success}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Share the password with the employee; they can change it after signing in.</p>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          {submitting ? 'Adding…' : 'Add employee'}
        </Button>
      </div>
    </form>

    <section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-subtle">
        <div>
          <p className="text-sm font-bold text-primary">Workspace employees</p>
          <p className="text-[11px] text-secondary">{loading ? 'Loading…' : `${members.length} ${members.length === 1 ? 'person' : 'people'} in this workspace`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      {loadError ? <p className="text-xs text-danger px-5 py-4">{loadError}</p>
        : loading ? <div className="py-8 flex justify-center"><Loader className="w-4 h-4 animate-spin text-accent" /></div>
        : members.length === 0 ? <p className="text-xs text-secondary px-5 py-6 text-center">No employees yet. Add your first one above.</p>
        : <ul className="divide-y divide-subtle">
            {members.map(member => <li key={member.employee_id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{member.display_name}</p>
                <p className="text-[11px] text-secondary truncate">{member.email || '—'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary border border-subtle rounded-full px-2 py-0.5">{roleLabel(member.job_role)}</span>
                {['owner', 'admin'].includes(String(member.member_role).toLowerCase())
                  && <span className="text-[10px] font-semibold uppercase tracking-wide text-accent border border-accent rounded-full px-2 py-0.5">{member.member_role}</span>}
              </div>
            </li>)}
          </ul>}
    </section>
  </div>;
};
