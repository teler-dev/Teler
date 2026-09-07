import { apiFetch } from './apiConfig';

export type TrackingStatus = 'running' | 'paused' | 'stopped';
export type TrackingEvent = {
  id: string;
  event_type: 'start' | 'pause' | 'resume' | 'stop';
  event_ts: string;
  client_event_id?: string | null;
  client_source?: string | null;
};
export type TrackingSession = {
  id: string;
  role_at_time: string;
  start_ts: string;
  end_ts?: string | null;
  status: TrackingStatus;
  total_duration_seconds: number;
  total_paused_seconds: number;
  pause_count: number;
  events?: TrackingEvent[];
};

interface Envelope<T> {
  data: T;
  server_ts?: string;
  pagination?: { limit: number; offset: number; total: number };
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: unknown } & T;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `TELER tracking HTTP ${response.status}`);
  return body;
}

function eventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function mutate(path: string, payload: Record<string, unknown>): Promise<TrackingSession> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status < 500 || attempt === 2) return (await jsonOrThrow<Envelope<TrackingSession>>(response)).data;
      lastError = new Error(`TELER tracking HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise(resolve => window.setTimeout(resolve, 400 * (2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error('Tracking request failed');
}

export async function getCurrentTrackingSession(): Promise<TrackingSession | null> {
  const response = await apiFetch('/api/v1/tracking-sessions/current');
  return (await jsonOrThrow<Envelope<TrackingSession | null>>(response)).data;
}

export async function listTrackingSessions(limit = 30, offset = 0): Promise<Envelope<TrackingSession[]>> {
  const response = await apiFetch(`/api/v1/tracking-sessions?limit=${limit}&offset=${offset}`);
  return jsonOrThrow<Envelope<TrackingSession[]>>(response);
}

export function startTrackingSession(roleAtTime: string): Promise<TrackingSession> {
  return mutate('/api/v1/tracking-sessions/start', {
    role_at_time: roleAtTime,
    client_source: 'web',
    client_event_id: eventId(),
  });
}

export function pauseTrackingSession(sessionId: string): Promise<TrackingSession> {
  return mutate(`/api/v1/tracking-sessions/${encodeURIComponent(sessionId)}/pause`, {
    client_source: 'web', client_event_id: eventId(),
  });
}

export function resumeTrackingSession(sessionId: string): Promise<TrackingSession> {
  return mutate(`/api/v1/tracking-sessions/${encodeURIComponent(sessionId)}/resume`, {
    client_source: 'web', client_event_id: eventId(),
  });
}

export function stopTrackingSession(sessionId: string, status: TrackingStatus): Promise<TrackingSession> {
  return mutate(`/api/v1/tracking-sessions/${encodeURIComponent(sessionId)}/stop`, {
    client_source: 'web', client_event_id: eventId(), from_status: status,
  });
}

export function formatDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':');
}