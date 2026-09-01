export type AuthenticatedUser = {
  username: string;
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function login(username: string, password: string): Promise<AuthenticatedUser> {
  const response = await fetch('/api/auth-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await readJson(response);

  if (!response.ok || typeof body.username !== 'string') {
    throw new Error(typeof body.error === 'string' ? body.error : 'Unable to sign in');
  }
  return { username: body.username };
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await fetch('/api/auth-me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) return null;

  const body = await readJson(response);
  if (!response.ok || typeof body.username !== 'string') return null;
  return { username: body.username };
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/auth-logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Unable to end the server session');
}
