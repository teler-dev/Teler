/**
 * Team management client for the admin dashboard.
 *
 * Talks to the same-origin /api/team Vercel function, which validates the
 * dashboard session and forwards owner/admin authorization to the backend.
 */

export type TeamMember = {
  employee_id: string;
  display_name: string;
  email: string | null;
  job_role: string;
  member_role: string;
  status: string;
  created_at?: string;
};

export type NewEmployeeInput = {
  displayName: string;
  email: string;
  password: string;
  jobRole: string;
};

export const JOB_ROLES: Array<{ value: string; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'developer', label: 'Developer' },
  { value: 'designer', label: 'Designer' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'qa', label: 'QA' },
];

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function listTeam(): Promise<TeamMember[]> {
  const response = await fetch('/api/team', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Unable to load employees');
  return Array.isArray(body.employees) ? body.employees as TeamMember[] : [];
}

export async function addEmployee(input: NewEmployeeInput): Promise<TeamMember> {
  const response = await fetch('/api/team', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Unable to add employee');
  return body.employee as TeamMember;
}
