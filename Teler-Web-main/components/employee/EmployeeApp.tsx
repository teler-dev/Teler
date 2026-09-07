import React, { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, login, logout } from '../../services/authService';
import {
  formatDuration,
  getCurrentTrackingSession,
  listTrackingSessions,
  pauseTrackingSession,
  resumeTrackingSession,
  startTrackingSession,
  stopTrackingSession,
  TrackingSession,
  TrackingStatus,
} from '../../services/trackingSessionService';

const P = {
  bg: '#0c1118', bar: '#111820', field: '#161f2c', fieldAct: '#1b2537',
  line: '#1e2d3d', lineFoc: '#13D6FF', cyan: '#13D6FF', cyanBg: 'rgba(19,214,255,0.07)',
  cyanGlow: '0 0 22px rgba(19,214,255,0.20)', amber: '#f5a524', amberBg: 'rgba(245,165,36,0.07)',
  red: '#e84040', redBg: 'rgba(232,64,64,0.08)', green: '#24b964', hi: '#d8e4f0', mid: '#4a607a', lo: '#2c3d50',
  sans: '-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",system-ui,sans-serif',
  mono: '"SF Mono","Cascadia Code","Fira Code","Consolas",monospace',
} as const;

type Stage = 'loading' | 'login' | 'app';

type UiStatus = 'idle' | 'running' | 'paused' | 'saved';

function fieldStyle(focused: boolean): CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', background: focused ? P.fieldAct : P.field,
    border: `1px solid ${focused ? P.lineFoc : P.line}`, borderRadius: 4, padding: '7px 10px',
    color: P.hi, fontSize: 12, fontFamily: P.sans, outline: 'none', cursor: 'text',
    transition: 'border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease',
    boxShadow: focused ? '0 0 0 3px rgba(19,214,255,0.06)' : 'none',
  };
}

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: P.mid, marginBottom: 4, textTransform: 'uppercase' }}>
    {children}
  </div>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  const [focused, setFocused] = useState(false);
  return <input {...props} onFocus={e => { setFocused(true); props.onFocus?.(e); }} onBlur={e => { setFocused(false); props.onBlur?.(e); }} style={{ ...fieldStyle(focused), ...props.style }} />;
};

interface LoginProps { onLogin: (name: string) => void; }

const LoginScreen: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError('Email is required.');
    if (!password) return setError('Password is required.');
    setBusy(true); setError('');
    try {
      const user = await login(email.trim(), password);
      onLogin(user.username);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ width: '100%', height: '100%', background: P.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: P.sans }}>
      <form onSubmit={submit} style={{ width: 300, background: P.bar, border: `1px solid ${P.line}`, borderRadius: 6, padding: '32px 28px 28px', boxShadow: '0 18px 60px rgba(0,0,0,.35)' }}>
        <div style={{ marginBottom: 26, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: P.cyan, fontSize: 16, fontWeight: 800, letterSpacing: 3 }}>TELER</span>
          <span style={{ color: P.lo, fontSize: 11 }}>Employee</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><FieldLabel>Email</FieldLabel><TextInput type="email" value={email} autoComplete="email" placeholder="you@company.com" onChange={e => { setEmail(e.target.value); setError(''); }} /></div>
          <div><FieldLabel>Password</FieldLabel><TextInput type="password" value={password} autoComplete="current-password" placeholder="••••••••" onChange={e => { setPassword(e.target.value); setError(''); }} /></div>
          {error && <p style={{ margin: 0, fontSize: 11, color: P.red }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ marginTop: 4, padding: 9, borderRadius: 4, border: 'none', background: P.cyan, color: P.bg, fontSize: 13, fontWeight: 700, fontFamily: P.sans, cursor: busy ? 'default' : 'pointer', boxShadow: P.cyanGlow, opacity: busy ? .7 : 1, transition: 'transform .18s ease, filter .18s ease' }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
        <p style={{ marginTop: 18, fontSize: 10, color: P.lo, textAlign: 'center' }}>TELER Employee · v2</p>
      </form>
    </div>
  );
};

function localDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
function localTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

interface AppScreenProps { userName: string; onSignOut: () => void; }

const AppScreen: React.FC<AppScreenProps> = ({ userName, onSignOut }) => {
  const [current, setCurrent] = useState<TrackingSession | null>(null);
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [pending, setPending] = useState<'start' | 'pause' | 'resume' | 'stop' | null>(null);
  const [error, setError] = useState('');
  const [outOfSync, setOutOfSync] = useState(false);
  const [savedUntil, setSavedUntil] = useState(0);
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  const [task, setTask] = useState('');
  const [client, setClient] = useState('');
  const [desc, setDesc] = useState('');
  const role = 'general';

  const refreshSessions = useCallback(async () => {
    const payload = await listTrackingSessions(30, 0);
    setSessions(payload.data);
  }, []);

  const refreshCurrent = useCallback(async () => {
    try {
      const next = await getCurrentTrackingSession();
      setCurrent(next); setSyncedAt(Date.now()); setOutOfSync(false);
    } catch {
      setOutOfSync(true);
    }
  }, []);

  useEffect(() => { void refreshCurrent(); void refreshSessions().catch(() => {}); }, [refreshCurrent, refreshSessions]);
  useEffect(() => {
    const id = window.setInterval(() => void refreshCurrent(), 5000);
    return () => window.clearInterval(id);
  }, [refreshCurrent]);
  useEffect(() => {
    const id = window.setInterval(() => void refreshSessions().catch(() => {}), 30000);
    return () => window.clearInterval(id);
  }, [refreshSessions]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const uiStatus: UiStatus = Date.now() < savedUntil ? 'saved' : current?.status ?? 'idle';
  const elapsed = current
    ? current.total_duration_seconds + (current.status === 'running' ? Math.max(0, Math.floor((tick - syncedAt) / 1000)) : 0)
    : 0;

  const runAction = useCallback(async (action: 'start' | 'pause' | 'resume' | 'stop', fn: () => Promise<TrackingSession>) => {
    setPending(action); setError('');
    try {
      const next = await fn();
      if (action === 'stop') {
        setCurrent(null); setSavedUntil(Date.now() + 1400); setSyncedAt(Date.now());
        await refreshSessions();
      } else {
        setCurrent(next); setSyncedAt(Date.now());
      }
      setOutOfSync(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action}`);
      void refreshCurrent();
    } finally { setPending(null); }
  }, [refreshCurrent, refreshSessions]);

  const pill = useMemo(() => ({
    idle: { dot: P.lo, text: P.mid, label: 'Idle' },
    running: { dot: P.green, text: P.green, label: 'Running' },
    paused: { dot: P.amber, text: P.amber, label: 'Paused' },
    saved: { dot: P.mid, text: P.mid, label: 'Saved' },
  }[uiStatus]), [uiStatus]);

  const doPrimary = () => {
    if (!current) return void runAction('start', () => startTrackingSession(role));
    if (current.status === 'running') return void runAction('pause', () => pauseTrackingSession(current.id));
    if (current.status === 'paused') return void runAction('resume', () => resumeTrackingSession(current.id));
  };

  return (
    <div style={{ width: '100%', height: '100%', background: P.bg, display: 'flex', flexDirection: 'column', fontFamily: P.sans, color: P.hi, userSelect: 'none' }}>
      <style>{`@keyframes telerPulse{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.45);opacity:1}}`}</style>
      <div style={{ height: 44, flexShrink: 0, background: P.bar, borderBottom: `1px solid ${P.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <span style={{ color: P.cyan, fontSize: 12, fontWeight: 800, letterSpacing: 3 }}>TELER</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 3, border: `1px solid ${pill.text}22`, background: `${pill.text}0A`, transition: 'all .18s ease' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: pill.dot, animation: uiStatus === 'running' ? 'telerPulse 1.3s ease-in-out infinite' : 'none' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: pill.text, letterSpacing: .4 }}>{pill.label}</span>
          </div>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', padding: 0, color: P.mid, fontSize: 11, fontFamily: P.sans, cursor: 'pointer' }}>{userName}</button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 11, color: P.mid, fontWeight: 700 }}>TRACKING CONTROLS</div><div style={{ fontSize: 10, color: P.lo, marginTop: 2 }}>Server-authoritative session state</div></div>
          {uiStatus === 'paused' && <span style={{ fontSize: 10, color: P.amber }}>Paused</span>}
        </div>
        <div style={{ fontFamily: P.mono, fontVariantNumeric: 'tabular-nums', fontSize: 32, fontWeight: 700, letterSpacing: 1.5, color: uiStatus === 'paused' ? P.mid : P.hi, textAlign: 'center', padding: '4px 0', transition: 'color .18s ease, opacity .18s ease' }}>{formatDuration(elapsed)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={!!pending || uiStatus === 'saved'} onClick={doPrimary} style={{ flex: 1, height: 38, borderRadius: 5, border: current?.status === 'running' ? `1px solid ${P.amber}55` : `1px solid ${P.cyan}`, background: current?.status === 'running' ? P.amberBg : P.cyanBg, color: current?.status === 'running' ? P.amber : P.cyan, fontWeight: 700, fontSize: 11, cursor: pending ? 'default' : 'pointer', transition: 'transform .18s ease, background .18s ease, border-color .18s ease', opacity: pending ? .6 : 1 }}>
            {pending === 'start' ? 'Starting…' : pending === 'pause' ? 'Pausing…' : pending === 'resume' ? 'Resuming…' : !current ? '▶  START TRACKING' : current.status === 'running' ? 'Ⅱ  PAUSE' : '▶  RESUME'}
          </button>
          <button disabled={!current || !!pending} onClick={() => current && void runAction('stop', () => stopTrackingSession(current.id, current.status))} style={{ flex: 1, height: 38, borderRadius: 5, border: `1px solid ${current ? P.red + '55' : P.line}`, background: current ? P.redBg : 'transparent', color: current ? P.red : P.lo, fontWeight: 700, fontSize: 11, cursor: current && !pending ? 'pointer' : 'default', opacity: pending ? .6 : 1 }}>
            {pending === 'stop' ? 'Saving…' : '■  STOP TRACKING'}
          </button>
        </div>
        {(error || outOfSync) && <div style={{ fontSize: 10, color: P.red, background: P.redBg, border: `1px solid ${P.red}30`, borderRadius: 4, padding: '6px 8px' }}>{outOfSync ? 'Session may be out of sync. Reconnecting to the server…' : error}</div>}
      </div>

      <div style={{ flex: 1, minHeight: 110, borderTop: `1px solid ${P.line}`, borderBottom: `1px solid ${P.line}`, padding: '10px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, color: P.mid, fontWeight: 700, letterSpacing: .6, marginBottom: 8 }}>ACTIVITY REPORTS</div>
        {sessions.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: P.lo, fontSize: 10, gap: 5 }}><span style={{ fontSize: 18 }}>◷</span><span>No activity yet. Start tracking to create a session.</span></div>
        ) : (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 3 }}>
            {sessions.map(session => (
              <div key={session.id} style={{ borderLeft: `3px solid ${P.cyan}`, background: P.bar, padding: '7px 9px', borderRadius: '0 4px 4px 0', transition: 'background .18s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontSize: 10, fontWeight: 700, color: P.hi }}>{session.role_at_time || 'General'}</span><span style={{ fontFamily: P.mono, fontSize: 10, color: P.hi }}>{formatDuration(session.total_duration_seconds)}</span></div>
                <div style={{ fontSize: 9, color: P.mid, marginTop: 3 }}>{localDate(session.start_ts)} · {localTime(session.start_ts)} → {localTime(session.end_ts)}</div>
                {session.pause_count > 0 && <div style={{ fontSize: 9, color: P.lo, marginTop: 2 }}>Includes {session.pause_count} pause{session.pause_count === 1 ? '' : 's'} · {Math.round(session.total_paused_seconds / 60)}m paused time.</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ flex: 3 }}><FieldLabel>Task</FieldLabel><TextInput value={task} placeholder="What are you working on?" onChange={e => setTask(e.target.value)} /></div>
          <div style={{ flex: 2 }}><FieldLabel>Client</FieldLabel><TextInput value={client} placeholder="Optional" onChange={e => setClient(e.target.value)} /></div>
        </div>
        <div><FieldLabel>Description</FieldLabel><TextInput value={desc} placeholder="Optional notes…" onChange={e => setDesc(e.target.value)} /></div>
      </div>
    </div>
  );
};

export const EmployeeApp: React.FC = () => {
  const [stage, setStage] = useState<Stage>('loading');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    getCurrentUser().then(user => {
      if (user) { setUserName(user.username); setStage('app'); }
      else setStage('login');
    }).catch(() => setStage('login'));
  }, []);

  const handleSignOut = async () => {
    try { await logout(); } finally { setUserName(''); setStage('login'); }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: P.sans, background: P.bg }}>
      {stage === 'loading'
        ? <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: P.mid, fontSize: 11 }}>Restoring session…</div>
        : stage === 'login'
          ? <LoginScreen onLogin={name => { setUserName(name); setStage('app'); }} />
          : <AppScreen userName={userName} onSignOut={() => void handleSignOut()} />}
    </div>
  );
};

export default EmployeeApp;