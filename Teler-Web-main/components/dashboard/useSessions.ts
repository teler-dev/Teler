import { useCallback, useEffect, useState } from 'react';
import { Session } from '../../types';
import { apiUrl, authHeaders } from '../../services/apiConfig';
import {
  filterSessionsByWorkspace,
  getWorkspaceFilters,
  subscribeWorkspace,
} from '../../services/workspaceService';

const POLL_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

function normalizeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  if (error.name === 'TimeoutError' || error.name === 'AbortError' || error.message === 'The operation was aborted.') {
    return `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  }
  return error.message;
}

export function useSessions(employeeName?: string, enabled = true) {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const applyFilters = useCallback((source: Session[]) => {
    setSessions(filterSessionsByWorkspace(source, getWorkspaceFilters()));
  }, []);

  const fetchSessions = useCallback(async (showLoading = true) => {
    if (!enabled) {
      setAllSessions([]);
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const url = employeeName
        ? apiUrl(`/api/employee/${encodeURIComponent(employeeName)}`)
        : apiUrl('/api/sessions');
      const response = await fetch(url, {
        headers: authHeaders(),
        credentials: 'same-origin',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status === 401) {
        window.dispatchEvent(new Event('teler:unauthorized'));
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: unknown } | null;
        const detail = typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${response.status} from TELER API`;
        throw new Error(detail);
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('API returned unexpected format (expected array)');
      }

      const next = payload as Session[];
      setAllSessions(next);
      applyFilters(next);
    } catch (fetchError: unknown) {
      setError(`Failed to connect to TELER API — ${normalizeError(fetchError)}`);
      setAllSessions([]);
      setSessions([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [applyFilters, employeeName, enabled]);

  useEffect(() => {
    fetchSessions(true);
  }, [fetchSessions]);

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => fetchSessions(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, fetchSessions]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeWorkspace(() => applyFilters(allSessions));
  }, [allSessions, applyFilters, enabled]);

  return {
    sessions,
    loading,
    usingMock: false,
    error,
    refetch: fetchSessions,
  };
}