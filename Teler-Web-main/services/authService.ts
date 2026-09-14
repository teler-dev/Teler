export type AuthenticatedUser = {
  username: string;
  email?: string;
  jobRole?: string;
  organizationRole?: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
};

function isPublicAuthShell(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/' || window.location.pathname === '/login';
}

function handoffToRoutedDashboard(): void {
  if (isPublicAuthShell()) window.location.replace('/dashboard');
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function userFromBody(body: Record<string, unknown>): AuthenticatedUser | null {
  if (typeof body.username !== 'string') return null;
  const account = body.user && typeof body.user === 'object'
    ? body.user as Record<string, unknown>
    : {};
  const organization = account.organization && typeof account.organization === 'object'
    ? account.organization as Record<string, unknown>
    : {};
  const orgString = (key: string): string | undefined =>
    typeof organization[key] === 'string' ? organization[key] as string : undefined;
  return {
    username: body.username,
    email: typeof body.email === 'string' ? body.email : undefined,
    jobRole: typeof account.jobRole === 'string' ? account.jobRole : undefined,
    organizationRole: orgString('role'),
    organizationId: orgString('id'),
    organizationSlug: orgString('slug'),
    organizationName: orgString('name'),
  };
}

export function canManageAiQueue(user: Pick<AuthenticatedUser, 'organizationRole'> | null | undefined): boolean {
  return ['owner', 'admin'].includes(String(user?.organizationRole || '').toLowerCase());
}

export function canManageTeam(user: Pick<AuthenticatedUser, 'organizationRole'> | null | undefined): boolean {
  return ['owner', 'admin'].includes(String(user?.organizationRole || '').toLowerCase());
}

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  const response = await fetch('/api/auth-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  const user = userFromBody(body);

  if (!response.ok || !user) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Unable to sign in');
  }

  handoffToRoutedDashboard();
  return user;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await fetch('/api/auth-me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) return null;

  const body = await readJson(response);
  if (!response.ok) return null;
  const user = userFromBody(body);
  if (!user) return null;

  handoffToRoutedDashboard();
  return user;
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth-logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Unable to end the server session');
}
