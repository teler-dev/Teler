/**
 * EmployeeApp.tsx — TELER Employee Desktop Application
 *
 * This is the ROOT component of the employee-side desktop app.
 * It is NOT a view inside the web dashboard. It is a standalone
 * application intended to run inside an Electron renderer window
 * (or equivalent desktop WebView — Tauri, CEF, etc.).
 *
 * Desktop-native characteristics:
 *  - Fills 100vw × 100vh — owns the entire window, no page wrapper
 *  - Titlebar has -webkit-app-region: drag for native OS drag-to-move
 *  - userSelect: none globally — no text selection like a web page
 *  - cursor: default everywhere except interactive controls
 *  - Dense layout — no "web page" whitespace
 *  - No routing, no URL, no back/forward concept
 *  - No external CSS — all styles are compile-time constants
 *  - Single-purpose: start/stop work tracking only
 *
 * Entry point wiring (Electron example):
 *   // main.ts
 *   win.loadFile('dist-employee/index.html')
 *   win.setSize(480, 600)
 *   win.setResizable(false)
 *
 *   // src-employee/main.tsx
 *   ReactDOM.createRoot(document.getElementById('root')!).render(<EmployeeApp />)
 */

import React, {
  useState, useEffect, useRef, useCallback, CSSProperties,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Palette — single source of truth for all colours used in this application
// ─────────────────────────────────────────────────────────────────────────────

const P = {
  // Surfaces
  bg:       '#0c1118',   // window background
  bar:      '#111820',   // titlebar and statusbar
  field:    '#161f2c',   // input fields
  fieldAct: '#1b2537',   // focused input field

  // Borders
  line:     '#1e2d3d',   // dividers and input borders
  lineFoc:  '#13D6FF',   // focused input border

  // Accent
  cyan:     '#13D6FF',
  cyanBg:   'rgba(19,214,255,0.07)',
  cyanGlow: '0 0 22px rgba(19,214,255,0.20)',   // idle button only

  // State colours
  amber:    '#f5a524',
  amberBg:  'rgba(245,165,36,0.07)',
  red:      '#e84040',
  redBg:    'rgba(232,64,64,0.08)',
  green:    '#24b964',

  // Text
  hi:       '#d8e4f0',   // primary text
  mid:      '#4a607a',   // secondary / labels
  lo:       '#2c3d50',   // muted / placeholders

  // Typography
  sans: '-apple-system,BlinkMacSystemFont,"Segoe UI","Inter",system-ui,sans-serif',
  mono: '"SF Mono","Cascadia Code","Fira Code","Consolas",monospace',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Stage = 'login' | 'app';
type Status = 'idle' | 'running' | 'break';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function fmtTimer(s: number): string {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

// ─────────────────────────────────────────────────────────────────────────────
// Global window styles injected once
// Applied on the <body> by the entry point, not here.
// We rely on the parent setting: body { margin:0; overflow:hidden; }
// ─────────────────────────────────────────────────────────────────────────────

// Shared style for every text input / select in this app
function fieldStyle(focused: boolean): CSSProperties {
  return {
    width:       '100%',
    boxSizing:   'border-box',
    background:  focused ? P.fieldAct : P.field,
    border:      `1px solid ${focused ? P.lineFoc : P.line}`,
    borderRadius: 4,
    padding:     '7px 10px',
    color:       P.hi,
    fontSize:    12,
    fontFamily:  P.sans,
    outline:     'none',
    cursor:      'text',
    transition:  'border-color 0.10s, background 0.10s',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize:      10,
    fontWeight:    600,
    letterSpacing: 0.8,
    color:         P.mid,
    marginBottom:  4,
    textTransform: 'uppercase',
    cursor:        'default',
  }}>
    {children}
  </div>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e =>  { setFocused(false); props.onBlur?.(e);  }}
      style={{ ...fieldStyle(focused), ...props.style }}
    />
  );
};

const NativeSelect: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { empty?: string }
> = ({ empty, children, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e); }}
        onBlur={e =>  { setFocused(false); props.onBlur?.(e);  }}
        style={{
          ...fieldStyle(focused),
          paddingRight: 26,
          appearance:   'none',
          cursor:       'pointer',
          color:        props.value ? P.hi : P.lo,
        }}
      >
        {empty && <option value="">{empty}</option>}
        {children}
      </select>
      {/* chevron */}
      <svg width="9" height="5" viewBox="0 0 9 5" style={{
        position:      'absolute',
        right:         9,
        top:           '50%',
        transform:     'translateY(-50%)',
        pointerEvents: 'none',
      }}>
        <path d="M0.5 0.5L4.5 4.5L8.5 0.5" stroke={P.mid} strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Login Screen
// ─────────────────────────────────────────────────────────────────────────────

interface LoginProps { onLogin: (name: string) => void; }

const LoginScreen: React.FC<LoginProps> = ({ onLogin }) => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim())  { setError('Email is required.');    return; }
    if (!password)      { setError('Password is required.'); return; }
    setBusy(true);
    // Replace with real auth — e.g. window.electronAPI.login(email, password)
    setTimeout(() => {
      const raw  = email.split('@')[0] ?? 'Employee';
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      onLogin(name);
    }, 500);
  };

  return (
    <div style={{
      width:          '100%',
      height:         '100%',
      background:     P.bg,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     P.sans,
      cursor:         'default',
    }}>
      <form
        onSubmit={submit}
        style={{
          width:        300,
          background:   P.bar,
          border:       `1px solid ${P.line}`,
          borderRadius: 6,
          padding:      '32px 28px 28px',
        }}
      >
        {/* Wordmark */}
        <div style={{ marginBottom: 26, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            color:         P.cyan,
            fontSize:      16,
            fontWeight:    800,
            letterSpacing: 3,
          }}>
            TELER
          </span>
          <span style={{ color: P.lo, fontSize: 11 }}>Employee</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              placeholder="you@company.com"
              value={email}
              autoComplete="email"
              tabIndex={1}
              onChange={e => { setEmail(e.target.value); setError(''); }}
            />
          </div>

          <div>
            <FieldLabel>Password</FieldLabel>
            <TextInput
              type="password"
              placeholder="••••••••"
              value={password}
              autoComplete="current-password"
              tabIndex={2}
              onChange={e => { setPassword(e.target.value); setError(''); }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 11, color: P.red }}>{error}</p>
          )}

          <button
            type="submit"
            tabIndex={3}
            disabled={busy}
            style={{
              marginTop:     4,
              padding:       '9px',
              borderRadius:  4,
              border:        'none',
              background:    P.cyan,
              color:         P.bg,
              fontSize:      13,
              fontWeight:    700,
              fontFamily:    P.sans,
              letterSpacing: 0.4,
              cursor:        busy ? 'default' : 'pointer',
              boxShadow:     P.cyanGlow,
              opacity:       busy ? 0.75 : 1,
              userSelect:    'none',
            }}
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

        </div>

        <p style={{ marginTop: 18, fontSize: 10, color: P.lo, textAlign: 'center', cursor: 'default' }}>
          TELER Employee · v2
        </p>
      </form>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Application Screen
// ─────────────────────────────────────────────────────────────────────────────

const CLIENTS = ['ABC LLC', 'XYZ Corp', 'MAD Industry'];

interface AppScreenProps {
  userName: string;
  onSignOut: () => void;
}

const AppScreen: React.FC<AppScreenProps> = ({ userName, onSignOut }) => {
  const [status,   setStatus]   = useState<Status>('idle');
  const [elapsed,  setElapsed]  = useState(0);    // seconds this session
  const [breakSec, setBreakSec] = useState(0);    // seconds this break
  const [hovMain,  setHovMain]  = useState(false);
  const [task,     setTask]     = useState('');
  const [desc,     setDesc]     = useState('');
  const [client,   setClient]   = useState('');

  // Stub history — replace with real API / IPC call
  const lastSession = '2h 14m';
  const mtdTotal    = '38h 22m';

  // ── Session timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // ── Break timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'break') { setBreakSec(0); return; }
    const id = setInterval(() => setBreakSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // ── Interactions ───────────────────────────────────────────────────────────
  const handleMainClick = useCallback(() => {
    if (status === 'idle')    { setElapsed(0); setStatus('running'); }
    else if (status === 'running') { setStatus('break'); }
    else if (status === 'break')   { setStatus('running'); }
  }, [status]);

  const handleStop = useCallback(() => {
    // TODO: fire window.electronAPI.stopSession({ elapsed, task, client, desc })
    setStatus('idle');
    setElapsed(0);
    setBreakSec(0);
  }, []);

  // ── Derived button appearance ──────────────────────────────────────────────
  // While running, hovering over the main button shows "BREAK" as a preview
  // of what a click will do — explicit intent, not accidental.
  const showBreakPreview = status === 'running' && hovMain;

  type BtnCfg = {
    label: string; sub: string | null;
    labelSize: number; labelFamily: string;
    border: string; bg: string; color: string;
    shadow: string;
  };

  const btn: BtnCfg = (() => {
    if (status === 'idle') return {
      label: 'START', sub: null,
      labelSize: 20, labelFamily: P.sans,
      border: P.cyan,  bg: P.cyanBg,  color: P.cyan,
      shadow: P.cyanGlow,
    };
    if (showBreakPreview) return {
      label: 'BREAK', sub: null,
      labelSize: 18, labelFamily: P.sans,
      border: P.amber, bg: P.amberBg, color: P.amber,
      shadow: 'none',
    };
    if (status === 'running') return {
      label: fmtTimer(elapsed), sub: 'RUNNING',
      labelSize: 28, labelFamily: P.mono,
      border: P.cyan,  bg: P.cyanBg,  color: P.hi,
      shadow: 'none',
    };
    // break
    return {
      label: 'RESUME', sub: 'ON BREAK',
      labelSize: 18, labelFamily: P.sans,
      border: P.amber, bg: P.amberBg, color: P.amber,
      shadow: 'none',
    };
  })();

  // ── Status bar pill ────────────────────────────────────────────────────────
  const pill = {
    idle:    { dot: P.lo,    text: P.mid,   label: 'Idle'     },
    running: { dot: P.green, text: P.green, label: 'Running'  },
    break:   { dot: P.amber, text: P.amber, label: 'On Break' },
  }[status];

  const active = status !== 'idle';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width:         '100%',
      height:        '100%',
      background:    P.bg,
      display:       'flex',
      flexDirection: 'column',
      fontFamily:    P.sans,
      color:         P.hi,
      cursor:        'default',
      userSelect:    'none',
    }}>

      {/* ── Title bar ─────────────────────────────────────────────────────
          -webkit-app-region: drag  →  this strip moves the Electron window.
          Interactive children must explicitly set -webkit-app-region: no-drag.  */}
      <div style={{
        height:        44,
        flexShrink:    0,
        background:    P.bar,
        borderBottom:  `1px solid ${P.line}`,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        padding:       '0 16px',
        // @ts-ignore — Electron-specific CSS property
        WebkitAppRegion: 'drag',
      }}>
        <span style={{
          color:         P.cyan,
          fontSize:      12,
          fontWeight:    800,
          letterSpacing: 3,
        }}>
          TELER
        </span>

        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        10,
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        }}>
          {/* Status pill */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          5,
            padding:      '3px 8px',
            borderRadius: 3,
            border:       `1px solid ${pill.text}22`,
            background:   `${pill.text}0A`,
          }}>
            <div style={{
              width: 5, height: 5,
              borderRadius: '50%',
              background: pill.dot,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize:      10,
              fontWeight:    600,
              color:         pill.text,
              letterSpacing: 0.4,
            }}>
              {pill.label}
            </span>
          </div>

          {/* User — click to sign out */}
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{
              background:    'none',
              border:        'none',
              padding:       0,
              color:         P.mid,
              fontSize:      11,
              fontFamily:    P.sans,
              fontWeight:    500,
              cursor:        'pointer',
              userSelect:    'none',
            }}
          >
            {userName}
          </button>
        </div>
      </div>

      {/* ── Main interaction area ─────────────────────────────────────────── */}
      <div style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            18,
        padding:        '16px 20px 8px',
      }}>

        {/* Break duration badge — only shown during break */}
        <div style={{ height: 22 }}>
          {status === 'break' && breakSec >= 1 && (
            <span style={{
              fontSize:      11,
              color:         P.amber,
              fontFamily:    P.mono,
              background:    P.amberBg,
              border:        `1px solid ${P.amber}28`,
              padding:       '2px 10px',
              borderRadius:  3,
            }}>
              Break {fmtTimer(breakSec)}
            </span>
          )}
        </div>

        {/* ── Circular main button ── */}
        <button
          onClick={handleMainClick}
          onMouseEnter={() => setHovMain(true)}
          onMouseLeave={() => setHovMain(false)}
          tabIndex={1}
          style={{
            width:          172,
            height:         172,
            borderRadius:   '50%',
            border:         `2px solid ${btn.border}`,
            background:     btn.bg,
            color:          btn.color,
            cursor:         'pointer',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      btn.shadow,
            outline:        'none',
            userSelect:     'none',
            flexShrink:     0,
            transition:     'border-color 0.12s, background 0.12s, box-shadow 0.12s',
          }}
        >
          <span style={{
            fontSize:           btn.labelSize,
            fontWeight:         700,
            fontFamily:         btn.labelFamily,
            letterSpacing:      status === 'running' && !showBreakPreview ? 0 : 3,
            lineHeight:         1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {btn.label}
          </span>
          {btn.sub && (
            <span style={{
              marginTop:     5,
              fontSize:      9,
              fontWeight:    600,
              color:         `${btn.color}70`,
              letterSpacing: 1.6,
            }}>
              {btn.sub}
            </span>
          )}
        </button>

        {/* ── Stop / idle hint ── */}
        <div style={{ height: 34, display: 'flex', alignItems: 'center' }}>
          {active ? (
            <button
              onClick={handleStop}
              tabIndex={2}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           6,
                padding:       '6px 20px',
                borderRadius:  4,
                border:        `1px solid ${P.red}40`,
                background:    P.redBg,
                color:         P.red,
                fontSize:      11,
                fontWeight:    700,
                fontFamily:    P.sans,
                letterSpacing: 1.4,
                cursor:        'pointer',
                outline:       'none',
                userSelect:    'none',
              }}
            >
              <svg width="7" height="7" viewBox="0 0 7 7">
                <rect width="7" height="7" rx="1" fill={P.red} />
              </svg>
              STOP SESSION
            </button>
          ) : (
            <span style={{ fontSize: 11, color: P.lo, letterSpacing: 0.2 }}>
              Press Start to begin
            </span>
          )}
        </div>
      </div>

      {/* ── Input section ──────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:    0,
        borderTop:     `1px solid ${P.line}`,
        padding:       '13px 16px 12px',
        display:       'flex',
        flexDirection: 'column',
        gap:           9,
      }}>
        {/* Task + Client */}
        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ flex: 3 }}>
            <FieldLabel>Task</FieldLabel>
            <TextInput
              type="text"
              placeholder="What are you working on?"
              value={task}
              tabIndex={3}
              onChange={e => setTask(e.target.value)}
            />
          </div>
          <div style={{ flex: 2 }}>
            <FieldLabel>Client</FieldLabel>
            <NativeSelect
              empty="Select…"
              value={client}
              tabIndex={4}
              onChange={e => setClient(e.target.value)}
            >
              {CLIENTS.map(c => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </div>
        </div>

        {/* Description */}
        <div>
          <FieldLabel>Description</FieldLabel>
          <TextInput
            type="text"
            placeholder="Optional notes…"
            value={desc}
            tabIndex={5}
            onChange={e => setDesc(e.target.value)}
          />
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height:        36,
        flexShrink:    0,
        background:    P.bar,
        borderTop:     `1px solid ${P.line}`,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        padding:       '0 16px',
      }}>
        <span style={{ fontSize: 11, color: P.lo }}>
          Last session:{' '}
          <span style={{ color: P.mid }}>{lastSession}</span>
        </span>
        <span style={{ fontSize: 11, color: P.lo }}>
          MTD:{' '}
          <span style={{ color: P.mid }}>{mtdTotal}</span>
        </span>
      </div>

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Root — owns the entire Electron renderer window
// ─────────────────────────────────────────────────────────────────────────────

export const EmployeeApp: React.FC = () => {
  const [stage,    setStage]    = useState<Stage>('login');
  const [userName, setUserName] = useState('');

  const handleLogin   = (name: string) => { setUserName(name); setStage('app'); };
  const handleSignOut = ()              => { setStage('login'); setUserName(''); };

  return (
    /*
     * This div IS the window.
     * In Electron: win.setSize(480, 600) + win.setResizable(false)
     * In development: render inside EmployeeDevShell (see EmployeeDevShell.tsx)
     *   which sets an explicit 480×600 viewport — do NOT use EmployeePreview.tsx.
     */
    <div style={{
      width:    '100vw',
      height:   '100vh',
      overflow: 'hidden',
      fontFamily: P.sans,
      background: P.bg,
    }}>
      {stage === 'login'
        ? <LoginScreen onLogin={handleLogin} />
        : <AppScreen   userName={userName} onSignOut={handleSignOut} />
      }
    </div>
  );
};

export default EmployeeApp;
