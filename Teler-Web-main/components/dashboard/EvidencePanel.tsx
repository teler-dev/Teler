import React, { useState, useMemo } from 'react';
import { ProductivitySignalsPanel } from './ProductivitySignalsPanel';
import { BehaviorInsightPanel } from './AiInsightPanel';
import { Session, SessionAnalytics, HourlyMetric, MicroWindow, HourBlock, DailySummary } from '../../types';
import { FocusTimeline } from './FocusTimeline';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LineChart, Line,
} from 'recharts';
import {
  Camera, FileText, Keyboard, BarChart2, TrendingUp,
  Chrome, Globe, Code2, Terminal, Figma, Slack,
  MessageSquare, Video, Mail, FileSpreadsheet, Music,
  Box, Zap, Github, BrainCircuit, FolderOpen, Clock, Monitor, Activity, Layers, BookOpen,
} from 'lucide-react';

// ── Domain extraction ─────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  if (!url) return '';
  try {
    if (!url.includes('/')) return url.toLowerCase(); // e.g. "Booking.com"
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url.split('/')[0].toLowerCase();
  }
}

// ── App categorization ────────────────────────────────────────────────────────

const PRODUCTIVE_APPS = new Set([
  'vs code', 'visual studio code', 'cursor', 'terminal', 'cmd', 'powershell',
  'postman', 'github', 'docker', 'dbeaver', 'cypress', 'figma', 'notion',
  'jira', 'confluence', 'zoom', 'slack', 'teams', 'excel', 'word', 'outlook',
  'claude', 'chatgpt',
]);
const DISTRACTION_APPS = new Set([
  'youtube', 'twitter', 'x.com', 'reddit', 'instagram', 'facebook', 'tiktok',
  'netflix', 'twitch', '9gag', 'pinterest', 'snapchat',
]);

const DISTRACTION_URL_KWS  = ['youtube', 'youtu.be', 'twitter', 'x.com', 'reddit', 'instagram',
  'facebook', 'tiktok', 'netflix', 'twitch', '9gag', 'pinterest'];
const PRODUCTIVE_URL_KWS   = ['github', 'gitlab', 'stackoverflow', 'docs.google', 'confluence',
  'jira', 'notion.so', 'linear.app', 'figma.com', 'vercel', 'aws.amazon', 'azure', 'bitbucket',
  'postman.com', 'atlassian'];
const DISTRACTION_TITLE_KWS = ['youtube', 'netflix', 'twitter', 'reddit', 'instagram', 'tiktok', 'twitch'];
const PRODUCTIVE_TITLE_KWS  = ['github', 'visual studio', 'vs code', 'cursor', 'terminal',
  'postman', 'figma', 'notion', 'jira', 'confluence', 'claude', 'chatgpt', 'outlook',
  'teams', 'slack', 'zoom', 'docker', 'excel', 'word'];

function categorizeApp(
  app: string,
  url?: string,
  windowTitle?: string,
): 'Productive' | 'Neutral' | 'Distraction' {
  const u = (url || '').toLowerCase();
  const t = (windowTitle || '').toLowerCase();
  const a = app.toLowerCase();

  // URL-based (highest priority — especially for browsers showing social media)
  if (u) {
    for (const kw of DISTRACTION_URL_KWS) if (u.includes(kw)) return 'Distraction';
    for (const kw of PRODUCTIVE_URL_KWS)  if (u.includes(kw)) return 'Productive';
  }
  // Window title keywords
  for (const kw of DISTRACTION_TITLE_KWS) if (t.includes(kw)) return 'Distraction';
  for (const kw of PRODUCTIVE_TITLE_KWS)  if (t.includes(kw)) return 'Productive';
  // App name fallback
  if (DISTRACTION_APPS.has(a)) return 'Distraction';
  if (PRODUCTIVE_APPS.has(a))  return 'Productive';
  return 'Neutral';
}

// ── Process → icon map ────────────────────────────────────────────────────────

function getProcessIcon(proc: string, size: number): React.ReactElement {
  const p   = (proc || '').toLowerCase();
  const cls = 'shrink-0 text-gray-400';
  const s   = size;

  // Browsers
  if (p.includes('chrome'))                                  return <Chrome        className={cls} width={s} height={s} />;
  if (p.includes('msedge') || p === 'edge' || p.includes('firefox')) return <Globe className={cls} width={s} height={s} />;

  // Code editors / IDEs
  if (p.includes('code') || p.includes('vscode') || p.includes('cursor') || p.includes('devenv'))
                                                             return <Code2         className={cls} width={s} height={s} />;

  // Terminal / shell
  if (p.includes('terminal') || p.includes('cmd') || p.includes('powershell') || p === 'wt')
                                                             return <Terminal      className={cls} width={s} height={s} />;

  // Design / productivity
  if (p.includes('figma'))                                   return <Figma         className={cls} width={s} height={s} />;
  if (p.includes('slack'))                                   return <Slack         className={cls} width={s} height={s} />;
  if (p.includes('teams') || p.includes('discord'))         return <MessageSquare className={cls} width={s} height={s} />;
  if (p.includes('zoom'))                                    return <Video         className={cls} width={s} height={s} />;
  if (p.includes('outlook'))                                 return <Mail          className={cls} width={s} height={s} />;
  if (p.includes('excel'))                                   return <FileSpreadsheet className={cls} width={s} height={s} />;
  if (p.includes('word') || p.includes('notion'))           return <FileText      className={cls} width={s} height={s} />;

  // Entertainment
  if (p.includes('spotify'))                                 return <Music         className={cls} width={s} height={s} />;

  // Dev tools
  if (p.includes('docker'))                                  return <Box           className={cls} width={s} height={s} />;
  if (p.includes('postman'))                                 return <Zap           className={cls} width={s} height={s} />;
  if (p.includes('github'))                                  return <Github        className={cls} width={s} height={s} />;

  // AI assistants
  if (p.includes('claude') || p.includes('chatgpt') || p.includes('ai'))
                                                             return <BrainCircuit  className={cls} width={s} height={s} />;

  // File system
  if (p.includes('explorer') || p.includes('finder'))       return <FolderOpen    className={cls} width={s} height={s} />;

  // App timer
  if (p.includes('timer'))                                   return <Clock         className={cls} width={s} height={s} />;

  // Default — always renders something
  return <Monitor className={cls} width={s} height={s} />;
}

// ── Dynamic App Icon ──────────────────────────────────────────────────────────
// Priority 1: favicon from URL domain
// Priority 2: deterministic icon from process name  (never blank)
// Priority 3: letter avatar  (unreachable in practice, kept as safety net)

const AppIcon: React.FC<{ app: string; url?: string; process?: string; size?: number }> = ({
  app,
  url,
  process: proc = '',
  size = 16,
}) => {
  const domain = extractDomain(url || '');
  const [imgFailed, setImgFailed] = useState(false);

  // Priority 1 — favicon (only attempted when a real domain is available)
  if (domain && !imgFailed) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        width={size}
        height={size}
        className="rounded-sm shrink-0 object-contain"
        loading="lazy"
        alt=""
        onError={() => setImgFailed(true)}
      />
    );
  }

  // Priority 2 — process-mapped icon (covers all common apps, Monitor as default)
  return getProcessIcon(proc || app, size);
};

// ── Keystroke Intensity ───────────────────────────────────────────────────────

const KsTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl p-2 text-xs shadow-xl">
      <p className="text-gray-400">{label}</p>
      <p className="text-cyan-400 font-bold">{payload[0].value} keystrokes</p>
    </div>
  );
};

const KeystrokeGraph: React.FC<{ session: Session }> = ({ session }) => {
  const data    = session.evidence?.keystroke_per_minute ?? [];
  const step    = Math.max(1, Math.floor(data.length / 80));
  const sampled = data.filter((_, i) => i % step === 0);

  if (!sampled.length) return (
    <div className="h-40 flex items-center justify-center text-xs text-gray-600">No keystroke data</div>
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={sampled} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="ksGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#13D6FF" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#13D6FF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.floor(sampled.length / 5)} />
        <YAxis tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip content={<KsTooltip />} cursor={{ stroke: 'rgba(19,214,255,0.15)' }} />
        <Area type="monotone" dataKey="count" stroke="#13D6FF" strokeWidth={1.5} fill="url(#ksGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── App Time Chart + Enhanced List ───────────────────────────────────────────

const APP_COLORS = ['#13D6FF', '#818cf8', '#34d399', '#f59e0b', '#f472b6', '#60a5fa'];

const catStyle = {
  Productive:  'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Neutral:     'text-gray-400 bg-white/5 border-white/10',
  Distraction: 'text-red-400 bg-red-500/10 border-red-500/20',
} as const;

// ── Aggregated app entry type ─────────────────────────────────────────────────

interface AggApp {
  app: string;
  process: string;
  url: string;
  window_title: string;
  minutes: number;
  idle_seconds: number;
  switchCount: number;
}

function aggregateApps(sessions: Session[]): { apps: AggApp[]; totalMinutes: number } {
  const map = new Map<string, AggApp>();
  let totalMinutes = 0;

  for (const s of sessions) {
    const entries = s.evidence?.top_apps_minutes ?? [];
    if (entries.length === 0) continue;

    totalMinutes += s.total_minutes || 0;

    // Deduplicate within this single session before merging into the global map
    const perSessionMap = new Map<string, typeof entries[number]>();

    for (const a of entries) {
      const key = (a.process || a.app)
        .toLowerCase()
        .replace(/\.exe$/i, '')
        .replace(/\s+/g, '')
        .trim();

      if (!perSessionMap.has(key)) {
        perSessionMap.set(key, { ...a });
      } else {
        const existing = perSessionMap.get(key)!;
        existing.minutes      += a.minutes;
        existing.idle_seconds  = (existing.idle_seconds || 0) + (a.idle_seconds || 0);
      }
    }

    for (const a of perSessionMap.values()) {
      // Canonical key with googlechrome → chrome normalisation for the global map
      const key = (a.process || a.app)
        .toLowerCase()
        .replace(/\.exe$/i, '')
        .replace(/\s+/g, '')
        .replace(/googlechrome/g, 'chrome')
        .trim();
      let agg = map.get(key);
      if (!agg) {
        agg = { app: a.app, process: key, url: a.url || '', window_title: a.window_title || '', minutes: 0, idle_seconds: 0, switchCount: 0 };
        map.set(key, agg);
      }
      agg.minutes      += a.minutes;
      agg.idle_seconds += a.idle_seconds ?? 0;
      // Keep first non-empty url/window_title seen for this process
      if (!agg.url && a.url)                   agg.url          = a.url;
      if (!agg.window_title && a.window_title) agg.window_title = a.window_title;
    }

    // Accumulate switch counts across sessions (matched by display name)
    for (const sw of s.app_switches ?? []) {
      for (const agg of map.values()) {
        if (agg.app === sw.to) { agg.switchCount++; break; }
      }
    }
  }

  const apps = [...map.values()]
    .filter(a => a.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8);

  return { apps, totalMinutes: totalMinutes || 1 };
}

// ── App Time Chart ────────────────────────────────────────────────────────────

const AppTimeChart: React.FC<{ session: Session; allSessions?: Session[] }> = ({ session, allSessions }) => {
  // Aggregate across ALL sessions when available; fall back to current session only
  const { apps, totalMinutes } = useMemo(() => {
    const sources = allSessions && allSessions.length > 0 ? allSessions : [session];
    return aggregateApps(sources);
  }, [session, allSessions]);

  if (apps.length === 0) return (
    <div className="h-40 flex items-center justify-center text-xs text-gray-600">No app data</div>
  );

  return (
    <>
      {/* Bar chart — driven by aggregated data */}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={apps} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={true} vertical={false} />
          <XAxis dataKey="app" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} unit="m" />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
            labelStyle={{ color: '#9CA3AF' }}
            itemStyle={{ color: '#13D6FF' }}
          />
          <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
            {apps.map((_, i) => <Cell key={i} fill={APP_COLORS[i % APP_COLORS.length]} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* One row per process — aggregated across all sessions */}
      <div className="flex flex-col gap-0.5 mt-3 border-t border-white/5 pt-3">
        {apps.map((agg, i) => {
          const { app, minutes, url, window_title, idle_seconds, switchCount } = agg;
          const pct       = Math.round((minutes / totalMinutes) * 100);
          const activeMin = Math.max(0, minutes - Math.round(idle_seconds / 60));
          const cat       = categorizeApp(app, url, window_title);

          return (
            <div
              key={agg.process}
              className="flex items-center gap-2.5 hover:bg-white/3 rounded-lg px-2 py-1.5 transition-colors text-xs group relative"
            >
              {/* Dynamic icon */}
              <AppIcon app={app} url={url} process={agg.process} size={16} />

              {/* Name */}
              <div className="w-24 shrink-0 text-gray-300 truncate font-medium group-hover:text-white transition-colors">
                {app}
              </div>

              {/* Progress bar */}
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: APP_COLORS[i % APP_COLORS.length] }}
                />
              </div>

              {/* Time */}
              <span className="text-gray-400 w-8 text-right font-medium tabular-nums">{minutes}m</span>

              {/* Percent */}
              <span className="text-gray-500 w-8 text-right tabular-nums">{pct}%</span>

              {/* Category badge */}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${catStyle[cat]}`}>
                {cat}
              </span>

              {/* Switch count */}
              {switchCount > 0 && (
                <span className="text-[10px] text-amber-400/70 shrink-0 whitespace-nowrap">
                  {switchCount}× switch
                </span>
              )}

              {/* Hover tooltip */}
              <div className="absolute left-0 bottom-full mb-1.5 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="bg-navy-900 border border-white/10 rounded-xl p-3 text-[11px] shadow-2xl whitespace-nowrap min-w-[180px]">
                  <p className="text-white font-bold mb-2 text-xs">{app}</p>
                  <div className="flex flex-col gap-1 text-gray-400">
                    <span>Total time: <span className="text-white tabular-nums">{minutes}m ({pct}%)</span></span>
                    <span>Active: <span className="text-green-400 tabular-nums">{activeMin}m</span></span>
                    {idle_seconds > 0 && (
                      <span>Idle inside: <span className="text-amber-400 tabular-nums">{Math.round(idle_seconds / 60)}m</span></span>
                    )}
                    {switchCount > 0 && (
                      <span>Switches: <span className="text-amber-400 tabular-nums">{switchCount}×</span></span>
                    )}
                    {url && (
                      <span className="text-gray-600 truncate max-w-[160px]">{extractDomain(url)}</span>
                    )}
                  </div>
                  <span className={`inline-block mt-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${catStyle[cat]}`}>
                    {cat}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Duplicate Frame Placeholder ───────────────────────────────────────────────

const DuplicateFramePlaceholder: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 select-none">
    {/* Diagonal lines pattern via inline SVG background */}
    <div className="absolute inset-0 opacity-[0.04]" style={{
      backgroundImage: 'repeating-linear-gradient(45deg, #ffffff 0, #ffffff 1px, transparent 0, transparent 50%)',
      backgroundSize: '10px 10px',
    }} />
    <svg className="w-5 h-5 text-gray-600 mb-0.5 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M9 12h6M12 9v6" />
    </svg>
    <span className="text-[10px] font-semibold text-gray-500 text-center leading-tight relative">Duplicate Frame</span>
    <span className="text-[8px] text-gray-700 text-center leading-tight relative">No visual change detected</span>
  </div>
);

// ── Screenshots Grid ──────────────────────────────────────────────────────────

type SSFilter = 'all' | 'productive' | 'distraction' | 'idle';

const ScreenshotsGrid: React.FC<{ session: Session }> = ({ session }) => {
  const [ssFilter, setSsFilter] = useState<SSFilter>('all');
  const count = session.evidence?.screenshot_count ?? 0;
  const urls  = session.evidence?.screenshot_urls  ?? [];

  if (!count) return (
    <div className="h-32 flex items-center justify-center text-xs text-gray-600">No screenshots captured</div>
  );

  const items = urls.length > 0 ? urls.slice(0, 12) : Array.from({ length: Math.min(count, 12) });

  function getScreenshotState(idx: number): 'productive' | 'neutral' | 'distraction' | 'idle' {
    const segs = session.timeline_segments ?? [];
    if (!segs.length || !session.total_minutes || items.length <= 1) return 'neutral';
    const estimatedMin = (idx / (items.length - 1)) * session.total_minutes;
    const seg = segs.find(s => estimatedMin >= s.startMin && estimatedMin <= s.endMin);
    return (seg?.type as 'productive' | 'neutral' | 'distraction' | 'idle') ?? 'neutral';
  }

  const borderColor: Record<string, string> = {
    productive:  'border-green-500/60',
    neutral:     'border-white/8',
    distraction: 'border-red-500/50',
    idle:        'border-amber-400/30',
  };

  const types    = session.evidence?.screenshot_types ?? [];
  const allTagged = items.map((url, i) => ({
    url,
    i,
    state: getScreenshotState(i),
    screenshot_type: types[i] as string | undefined,
  }));
  const filteredItems = ssFilter === 'all'
    ? allTagged
    : allTagged.filter(({ state }) => {
        if (ssFilter === 'distraction') return state === 'distraction' || state === 'idle';
        return state === ssFilter;
      });

  const filterBtns: { key: SSFilter; label: string; activeClass: string }[] = [
    { key: 'all',         label: 'All',         activeClass: 'text-gray-300 border-white/20 bg-white/5' },
    { key: 'productive',  label: 'Deep Work',   activeClass: 'text-green-400 border-green-500/30 bg-green-500/5' },
    { key: 'distraction', label: 'Distraction', activeClass: 'text-red-400 border-red-500/30 bg-red-500/5' },
    { key: 'idle',        label: 'Idle',        activeClass: 'text-amber-400 border-amber-400/30 bg-amber-500/5' },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {filterBtns.map(f => (
          <button
            key={f.key}
            onClick={() => setSsFilter(f.key)}
            className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold transition-all ${
              ssFilter === f.key ? f.activeClass : 'text-gray-600 border-white/5 hover:text-gray-400 hover:border-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
        {filteredItems.length !== allTagged.length && (
          <span className="text-[10px] text-gray-600 self-center ml-1">{filteredItems.length} shown</span>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-gray-600">No screenshots match this filter</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {filteredItems.map(({ url, i, state, screenshot_type }) => {
            const estimatedMin = items.length > 1
              ? Math.round((i / (items.length - 1)) * session.total_minutes)
              : 0;
            const tsDate = new Date(session.session_start);
            tsDate.setMinutes(tsDate.getMinutes() + estimatedMin);
            const ts = tsDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

            // Prefer explicit screenshot_type; fall back to path-based inference for old sessions.
            const screenshotType = screenshot_type ?? (url ? 'image' : 'duplicate');
            const isDuplicate    = screenshotType === 'duplicate';
            const hasUrl         = screenshotType === 'image' && typeof url === 'string' && url.length > 0;

            if (isDuplicate) {
              return (
                <div
                  key={i}
                  className="duplicate-frame aspect-video rounded-lg overflow-hidden relative group"
                  title="Screenshot skipped because screen state did not change (process, URL, keys, clicks identical)."
                >
                  <DuplicateFramePlaceholder />
                  {/* Skipped badge — top-right */}
                  <div className="absolute top-1 right-1 duplicate-frame-badge">
                    Skipped
                  </div>
                  {/* Timestamp overlay on hover */}
                  <div className="absolute bottom-1 left-1 bg-black/75 rounded px-1 py-0.5 text-[9px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {ts}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={i}
                className={`aspect-video bg-navy-700/60 border-2 ${borderColor[state]} rounded-lg overflow-hidden relative group cursor-zoom-in hover:scale-105 hover:z-10 hover:shadow-2xl transition-all duration-200`}
              >
                {hasUrl ? (
                  <img
                    src={`http://localhost:7001/screenshots?path=${encodeURIComponent(url as string)}`}
                    className="w-full h-full object-cover"
                    alt={`Screenshot ${i + 1}`}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-4 h-4 text-gray-600" />
                  </div>
                )}
                {/* Timestamp overlay */}
                <div className="absolute bottom-1 left-1 bg-black/75 rounded px-1 py-0.5 text-[9px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {ts}
                </div>
                {/* State indicator dot */}
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  state === 'productive' ? 'bg-green-400' :
                  state === 'distraction' ? 'bg-red-400' :
                  state === 'idle' ? 'bg-amber-400' : 'bg-white/30'
                } opacity-80`} />
              </div>
            );
          })}
        </div>
      )}

      {count > 12 && (
        <p className="text-xs text-gray-500 mt-2 text-center">+{count - 12} more screenshots</p>
      )}
    </div>
  );
};

// ── OCR Sample ────────────────────────────────────────────────────────────────

const OcrSample: React.FC<{ session: Session }> = ({ session }) => {
  const text = session.evidence?.ocr_sample ?? '';
  if (!text) return <div className="text-xs text-gray-600 italic">No OCR data</div>;

  return (
    <pre className="bg-navy-900/60 border border-white/5 rounded-xl p-4 text-xs text-green-300/80 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-40">
      {text}
    </pre>
  );
};

// ── AI Work Narrative ─────────────────────────────────────────────────────────

const WorkNarrativePanel: React.FC<{ summary: DailySummary | null | undefined }> = ({ summary }) => {
  return (
    <section className="bg-navy-800/50 border border-white/8 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-3.5 h-3.5 text-violet-400" />
        <h4 className="text-xs font-bold text-violet-400 uppercase tracking-widest">AI Work Narrative</h4>
      </div>

      {!summary ? (
        <p className="text-xs text-gray-600 italic leading-relaxed">
          AI summary will appear after session reasoning completes.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Overview */}
          {summary.highlights && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Overview</p>
              <p className="text-xs text-gray-300 leading-relaxed">{summary.highlights}</p>
            </div>
          )}

          {/* Focus pattern */}
          {(summary.productive_hours != null || summary.deep_work_hours != null) && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Focus Pattern</p>
              <p className="text-xs text-gray-300 leading-relaxed">
                {summary.productive_hours != null && (
                  <span>Productive time: <span className="text-cyan-400 font-semibold">{summary.productive_hours}h</span>. </span>
                )}
                {summary.deep_work_hours != null && (
                  <span>Deep work: <span className="text-indigo-400 font-semibold">{summary.deep_work_hours}h</span>. </span>
                )}
                {summary.distraction_hours != null && summary.distraction_hours > 0 && (
                  <span>Distracted: <span className="text-red-400 font-semibold">{summary.distraction_hours}h</span>.</span>
                )}
              </p>
            </div>
          )}

          {/* Main work performed */}
          {summary.primary_tasks && summary.primary_tasks.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Main Work Performed</p>
              <ul className="flex flex-col gap-0.5">
                {summary.primary_tasks.map((t, i) => (
                  <li key={i} className="text-xs text-gray-300 flex gap-1.5">
                    <span className="text-violet-500 shrink-0 mt-px">·</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Distraction sources */}
          {summary.top_apps && summary.top_apps.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Top Apps</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.top_apps.map((app, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-gray-400">
                    {app}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Distraction signals */}
          {(summary.biggest_distraction || summary.context_switch_count != null) && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Distraction Signals</p>
              <div className="flex flex-col gap-0.5">
                {summary.biggest_distraction && (
                  <p className="text-xs text-gray-300">
                    <span className="text-gray-500">Main distraction: </span>
                    {summary.biggest_distraction}
                  </p>
                )}
                {summary.context_switch_count != null && (
                  <p className="text-xs text-gray-300">
                    <span className="text-gray-500">Context switches: </span>
                    <span className={summary.context_switch_count >= 30 ? 'text-red-400 font-semibold' : summary.context_switch_count >= 15 ? 'text-amber-400 font-semibold' : 'text-cyan-400 font-semibold'}>
                      {summary.context_switch_count}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Productivity insight */}
          {summary.recommendations && (
            <div className="border-t border-white/5 pt-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Productivity Insight</p>
              <p className="text-xs text-gray-400 leading-relaxed">{summary.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

// ── Analytics KPI Cards ───────────────────────────────────────────────────────

const AnalyticsKpiCards: React.FC<{ analytics: SessionAnalytics }> = ({ analytics }) => {
  const cards = [
    {
      label: 'Focus Score',
      value: `${analytics.focus_score}%`,
      sub: analytics.focus_score >= 70 ? 'High focus' : analytics.focus_score >= 40 ? 'Moderate' : 'Low focus',
      color: analytics.focus_score >= 70 ? 'text-cyan-400' : analytics.focus_score >= 40 ? 'text-amber-400' : 'text-red-400',
      bar:   analytics.focus_score >= 70 ? 'bg-cyan-400' : analytics.focus_score >= 40 ? 'bg-amber-400' : 'bg-red-400',
      pct:   analytics.focus_score,
    },
    {
      label: 'Deep Work',
      value: `${analytics.deep_work_minutes}m`,
      sub: `${analytics.deep_work_blocks} block${analytics.deep_work_blocks !== 1 ? 's' : ''}`,
      color: analytics.deep_work_minutes >= 60 ? 'text-indigo-400' : analytics.deep_work_minutes >= 20 ? 'text-indigo-300' : 'text-gray-500',
      bar:   'bg-indigo-400',
      pct:   Math.min(100, Math.round(analytics.deep_work_minutes / 1.2)),
    },
    {
      label: 'Switch Rate',
      value: `${analytics.context_switch_rate}/hr`,
      sub: analytics.context_switch_rate <= 10 ? 'Stable' : analytics.context_switch_rate <= 20 ? 'Moderate' : 'High churn',
      color: analytics.context_switch_rate <= 10 ? 'text-green-400' : analytics.context_switch_rate <= 20 ? 'text-amber-400' : 'text-red-400',
      bar:   analytics.context_switch_rate <= 10 ? 'bg-green-400' : analytics.context_switch_rate <= 20 ? 'bg-amber-400' : 'bg-red-400',
      pct:   Math.min(100, Math.round(analytics.context_switch_rate * 2.5)),
    },
    {
      label: 'Distraction',
      value: `${Math.round(analytics.distraction_ratio * 100)}%`,
      sub: analytics.distraction_ratio < 0.1 ? 'Minimal' : analytics.distraction_ratio < 0.2 ? 'Moderate' : 'High',
      color: analytics.distraction_ratio < 0.1 ? 'text-green-400' : analytics.distraction_ratio < 0.2 ? 'text-amber-400' : 'text-red-400',
      bar:   analytics.distraction_ratio < 0.1 ? 'bg-green-400' : analytics.distraction_ratio < 0.2 ? 'bg-amber-400' : 'bg-red-400',
      pct:   Math.round(analytics.distraction_ratio * 100),
    },
    {
      label: 'Activity',
      value: `${analytics.activity_intensity}/min`,
      sub: 'Keys · clicks · scroll',
      color: analytics.activity_intensity >= 30 ? 'text-cyan-400' : analytics.activity_intensity >= 10 ? 'text-blue-400' : 'text-gray-500',
      bar:   'bg-cyan-400',
      pct:   Math.min(100, Math.round(analytics.activity_intensity * 2)),
    },
    {
      label: 'Volatility',
      value: `${Math.round(analytics.volatility_index * 100)}%`,
      sub: analytics.volatility_index < 0.2 ? 'Stable' : analytics.volatility_index < 0.4 ? 'Moderate' : 'Fragmented',
      color: analytics.volatility_index < 0.2 ? 'text-green-400' : analytics.volatility_index < 0.4 ? 'text-amber-400' : 'text-red-400',
      bar:   analytics.volatility_index < 0.2 ? 'bg-green-400' : analytics.volatility_index < 0.4 ? 'bg-amber-400' : 'bg-red-400',
      pct:   Math.round(analytics.volatility_index * 100),
    },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
        <h4 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Session Analytics</h4>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {cards.map(card => (
          <div key={card.label}
            className="bg-navy-800/60 border border-white/8 rounded-xl p-3 flex flex-col gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-none">
              {card.label}
            </span>
            <span className={`text-xl font-black tabular-nums leading-none ${card.color}`}>
              {card.value}
            </span>
            {/* Mini progress bar */}
            <div className="h-0.5 bg-white/5 rounded-full overflow-hidden mt-0.5">
              <div className={`h-full rounded-full ${card.bar} opacity-60`}
                style={{ width: `${card.pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-600 leading-tight">{card.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Hourly Breakdown Chart ─────────────────────────────────────────────────────

const HourlyTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-white/10 rounded-xl p-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }} className="font-semibold">
          {p.name}: {p.value}m
        </p>
      ))}
    </div>
  );
};

const HourlyChart: React.FC<{ hourlyMetrics: HourlyMetric[] }> = ({ hourlyMetrics }) => {
  const data = hourlyMetrics.map(h => ({
    ...h,
    label: h.hour === 0 ? '12am' : h.hour < 12 ? `${h.hour}am` : h.hour === 12 ? '12pm' : `${h.hour - 12}pm`,
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Hourly Breakdown</h4>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-cyan-400/70" />Focus
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-indigo-400/70" />Deep Work
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-400/70" />Distraction
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={7} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} unit="m" />
          <Tooltip content={<HourlyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="focus_minutes"       name="Focus"       fill="#13D6FF" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
          <Bar dataKey="deep_work_minutes"   name="Deep Work"   fill="#818cf8" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
          <Bar dataKey="distraction_minutes" name="Distraction" fill="#f87171" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
};

// ── Micro Heat Strip ──────────────────────────────────────────────────────────
// Renders a horizontal color strip — one segment per micro window.
// Used inside HourBlocksPanel (expanded view) and StandaloneMicroPanel.

const MICRO_HEAT_CLR: Record<string, string> = {
  productive:    '#13D6FF',   // cyan
  meeting:       '#a78bfa',   // purple
  communication: '#a78bfa',   // purple
  distraction:   '#f87171',   // red
  idle:          '#374151',   // dark gray
};

const MicroHeatStrip: React.FC<{ windows: MicroWindow[] }> = ({ windows }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!windows.length)
    return <p className="text-[10px] text-gray-600 italic py-2">No micro data for this window yet.</p>;

  return (
    <div>
      {/* Color strip */}
      <div className="flex h-5 rounded-lg overflow-hidden">
        {windows.map((w, i) => {
          const base    = MICRO_HEAT_CLR[w.activity_type] ?? '#1f2937';
          const score   = w.focus_score ?? 50;
          const opacity = score >= 70 ? 1 : score >= 40 ? 0.6 : 0.25;
          return (
            <div
              key={i}
              className="relative flex-1 cursor-pointer"
              style={{ background: base, opacity }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Hover tooltip */}
              {hovered === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                  <div className="bg-navy-900 border border-white/15 rounded-xl px-2.5 py-2 text-[10px] shadow-2xl text-left min-w-[140px] whitespace-nowrap">
                    <p className="text-white font-mono font-bold mb-1">{(w.window_start ?? '').slice(0, 5)}</p>
                    <p className="text-gray-400 capitalize mb-0.5">{w.activity_type}</p>
                    <p className="text-gray-400">Focus: <span className={w.focus_score >= 70 ? 'text-cyan-400' : w.focus_score >= 40 ? 'text-amber-400' : 'text-red-400'}>{w.focus_score}</span></p>
                    {w.apps?.length > 0 && <p className="text-gray-500 mt-0.5">{w.apps.slice(0, 2).join(', ')}</p>}
                    {w.summary && <p className="text-gray-600 mt-1 max-w-[160px] whitespace-normal leading-tight">{w.summary.slice(0, 70)}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend + stats */}
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-600 flex-wrap">
        {(['productive', 'meeting', 'distraction', 'idle'] as const).map(k => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: MICRO_HEAT_CLR[k] }} />
            {k}
          </span>
        ))}
        <span className="ml-auto text-gray-700">{windows.length} windows · ~{Math.round(windows.length * 3.75)} min</span>
      </div>
    </div>
  );
};

// ── Focus Trend Tooltip ───────────────────────────────────────────────────────

const FocusTrendTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
      <p className="text-gray-500 font-mono">{label}</p>
      <p className="text-indigo-300 font-bold">{payload[0].value} focus</p>
    </div>
  );
};

// ── Hour Blocks Panel ─────────────────────────────────────────────────────────
// Compact performance rows with click-to-expand micro heat strips.

function microWindowsForHour(all: MicroWindow[], h: HourBlock): MicroWindow[] {
  if (!h.hour_start || !h.hour_end) return [];
  const s = new Date(`1970-01-01T${h.hour_start.slice(0, 8)}`);
  const e = new Date(`1970-01-01T${h.hour_end.slice(0, 8)}`);
  return all.filter(w => {
    if (!w.window_start) return false;
    const ws = new Date(`1970-01-01T${w.window_start.slice(0, 8)}`);
    return ws >= s && ws < e;
  });
}

const HourBlocksPanel: React.FC<{ hourBlocks: HourBlock[]; microWindows: MicroWindow[] }> = ({
  hourBlocks, microWindows,
}) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  if (!hourBlocks.length) return null;

  const avgFocus  = Math.round(hourBlocks.reduce((a, h) => a + (h.focus_score ?? 0), 0) / hourBlocks.length);
  const totalDeep = hourBlocks.reduce((a, h) => a + (h.deep_work_minutes ?? 0), 0);
  const totalDist = hourBlocks.reduce((a, h) => a + (h.distraction_minutes ?? 0), 0);

  const trendData = hourBlocks.map(h => ({
    label: (h.hour_start ?? '').slice(0, 5),
    focus: h.focus_score ?? 0,
  }));

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-indigo-300" />
          <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest">
            Hour Analysis · {hourBlocks.length} × ~60 min
          </h4>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>Avg <span className="text-indigo-300 font-bold">{avgFocus}</span></span>
          <span>Deep <span className="text-cyan-300 font-bold">{totalDeep}m</span></span>
          <span>Dist <span className="text-red-300 font-bold">{totalDist}m</span></span>
        </div>
      </div>

      {/* Focus trend line — only shown when ≥2 blocks */}
      {trendData.length > 1 && (
        <div className="mb-4">
          <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1 px-0.5">Focus trend</p>
          <ResponsiveContainer width="100%" height={56}>
            <LineChart data={trendData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<FocusTrendTooltip />} cursor={{ stroke: 'rgba(129,140,248,0.2)' }} />
              <Line
                type="monotone" dataKey="focus" stroke="#818cf8" strokeWidth={2}
                dot={{ fill: '#818cf8', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: '#a78bfa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance rows */}
      <div className="flex flex-col gap-0.5">
        {hourBlocks.map((h, i) => {
          const score       = h.focus_score ?? 0;
          const isExpanded  = expandedIdx === i;
          const micro       = microWindowsForHour(microWindows, h);
          const timeLabel   = `${(h.hour_start ?? '').slice(0, 5)}–${(h.hour_end ?? '').slice(0, 5)}`;
          const scoreColor  = score >= 70 ? 'text-cyan-400'    : score >= 40 ? 'text-amber-400'    : 'text-red-400';
          const barColor    = score >= 70 ? 'bg-cyan-400/55'   : score >= 40 ? 'bg-amber-400/55'   : 'bg-red-400/55';

          return (
            <div key={i}>
              {/* Compact row — clickable */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className="w-full flex items-center gap-3 hover:bg-white/3 rounded-lg px-2 py-1.5 transition-colors text-left"
              >
                {/* Time range */}
                <span className="text-gray-500 font-mono text-[11px] shrink-0 w-24">{timeLabel}</span>

                {/* Focus bar */}
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${score}%` }}
                  />
                </div>

                {/* Score */}
                <span className={`text-[13px] font-black tabular-nums w-7 text-right ${scoreColor}`}>{score}</span>

                {/* Productive ratio */}
                {micro.length > 0 && (() => {
                  const prodCount = micro.filter(w => w.activity_type === 'productive').length;
                  const prodRatio = Math.round((prodCount / micro.length) * 100);
                  return (
                    <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                      <span className={prodRatio >= 70 ? 'text-cyan-400' : prodRatio >= 40 ? 'text-amber-400' : 'text-red-400'}>{prodRatio}%</span> prod
                    </span>
                  );
                })()}

                {/* Primary task */}
                {h.primary_task && (
                  <span className="text-[10px] text-gray-500 truncate max-w-[130px] hidden sm:block">{h.primary_task}</span>
                )}

                {/* Micro count + chevron */}
                {micro.length > 0 && (
                  <span className="text-[9px] text-gray-600 tabular-nums shrink-0">{micro.length}w</span>
                )}
                <span className={`text-gray-600 shrink-0 text-sm leading-none transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>›</span>
              </button>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="mx-2 mb-2 mt-0.5 bg-navy-900/40 border border-white/5 rounded-xl p-3">
                  {/* Summary text */}
                  {h.summary && (
                    <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">{h.summary}</p>
                  )}

                  {/* Stats row */}
                  <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 mb-3">
                    {h.deep_work_minutes > 0   && <span>Deep: <span className="text-cyan-400 font-bold">{h.deep_work_minutes}m</span></span>}
                    {h.distraction_minutes > 0  && <span>Dist: <span className="text-red-400 font-bold">{h.distraction_minutes}m</span></span>}
                    {h.context_switch_rate > 0  && <span>Switch rate: <span className="text-amber-400 font-bold">{h.context_switch_rate}</span></span>}
                    {h.top_apps?.length > 0     && <span>Apps: <span className="text-gray-300">{h.top_apps.slice(0, 3).join(', ')}</span></span>}
                  </div>

                  {/* Micro heat strip */}
                  <MicroHeatStrip windows={micro} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

// ── Standalone Micro Panel (fallback when no hour blocks yet) ─────────────────
// Collapsed by default — avoids clutter for sessions < 60 min.

const StandaloneMicroPanel: React.FC<{ microWindows: MicroWindow[] }> = ({ microWindows }) => {
  const [expanded, setExpanded] = useState(false);
  if (!microWindows.length) return null;

  const avg     = Math.round(microWindows.reduce((s, w) => s + (w.focus_score ?? 50), 0) / microWindows.length);
  const prodPct = Math.round(microWindows.filter(w => w.activity_type === 'productive').length / microWindows.length * 100);

  return (
    <section>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between hover:bg-white/3 rounded-xl px-2 py-1.5 transition-colors -mx-2"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
            Micro Windows · {microWindows.length} × ~4 min
          </h4>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>Avg focus <span className="text-emerald-400 font-bold">{avg}</span></span>
          <span>Productive <span className="text-cyan-400 font-bold">{prodPct}%</span></span>
          <span className="text-gray-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2">
          <MicroHeatStrip windows={microWindows} />
        </div>
      )}
    </section>
  );
};

// ── Intelligence Dashboard — helpers & primitives ─────────────────────────────

function iqStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function fmtDurMin(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

interface ExecMetrics {
  overallScore:    number;
  deepWorkMin:     number;
  focusStability:  number | null;
  switchesPerHour: number | null;
}

function computeExecMetrics(session: Session): ExecMetrics {
  const hours      = session.hour_blocks   ?? [];
  const micro      = session.micro_windows ?? [];
  const totalHours = (session.total_minutes ?? 0) / 60;

  // Stability: exclude idle hours
  const activeHours = hours.filter(h => (h.deep_work_minutes ?? 0) + (h.distraction_minutes ?? 0) > 5);
  const focusStability = activeHours.length >= 2
    ? Math.max(0, Math.min(100, Math.round(100 - iqStdDev(activeHours.map(h => h.focus_score ?? 0)))))
    : null;

  // Deep work: analytics first, fallback micro streak
  let deepWorkMin = session.analytics?.deep_work_minutes ?? 0;
  if (!deepWorkMin && micro.length > 0) {
    let best = 0, cur = 0;
    for (const w of micro) {
      if ((w.focus_score ?? 0) >= 70 && w.activity_type === 'productive') { if (++cur > best) best = cur; } else cur = 0;
    }
    deepWorkMin = Math.min(Math.round(best * 3.75), 180);
  }

  // Context switch rate
  const switchCount    = session.daily_summary?.context_switch_count;
  const switchesPerHour = switchCount != null && totalHours > 0.25
    ? Math.round(switchCount / totalHours) : null;

  return { overallScore: session.overall_productivity_score ?? 0, deepWorkMin, focusStability, switchesPerHour };
}

// ── Section header ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ num: string; title: string; subtitle?: string }> = ({ num, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="text-[10px] font-black text-gray-700 tabular-nums font-mono shrink-0">{num}</span>
    <div className="flex flex-col">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest leading-none">{title}</h3>
      {subtitle && <p className="text-[10px] text-gray-600 mt-0.5">{subtitle}</p>}
    </div>
    <div className="flex-1 h-px bg-white/4" />
  </div>
);

// ── Executive KPI card ────────────────────────────────────────────────────────

const ExecKpiCard: React.FC<{
  label:       string;
  value:       string;
  sublabel:    string;
  valueColor:  string;
  accentClass: string;
  glow?:       boolean;
}> = ({ label, value, sublabel, valueColor, accentClass, glow }) => (
  <div className={`flex-1 min-w-0 bg-navy-800/60 border border-white/8 rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden hover:border-white/15 transition-all ${glow ? 'shadow-[0_0_32px_rgba(34,211,238,0.12)]' : ''}`}>
    <div className={`absolute top-0 inset-x-0 h-px ${accentClass}`} />
    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
    <span className={`text-4xl font-black tabular-nums leading-none ${valueColor}`}>{value}</span>
    <span className="text-[11px] text-gray-500 leading-snug">{sublabel}</span>
  </div>
);

// ── Top apps horizontal bar ───────────────────────────────────────────────────

const TopAppsBar: React.FC<{ session: Session }> = ({ session }) => {
  const apps = (session.evidence?.top_apps_minutes ?? []).slice(0, 5);
  if (!apps.length)
    return <p className="text-xs text-gray-600 italic">No application activity recorded this session.</p>;

  const maxMin = Math.max(...apps.map(a => a.minutes), 1);

  return (
    <div className="bg-navy-800/50 border border-white/8 rounded-xl p-4 flex flex-col gap-2.5">
      {apps.map(({ app, minutes, url, process: proc, window_title }, i) => {
        const pct    = (minutes / maxMin) * 100;
        const cat    = categorizeApp(app, url, window_title);
        const barHex = cat === 'Productive' ? '#06b6d4' : cat === 'Distraction' ? '#ef4444' : '#475569';
        const catCls = cat === 'Productive' ? 'text-cyan-400' : cat === 'Distraction' ? 'text-red-400' : 'text-gray-600';
        const h = Math.floor(minutes / 60), m = minutes % 60;
        const dur = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

        return (
          <div key={i} className="flex items-center gap-3 hover:bg-white/2 rounded-lg px-1 py-1 transition-colors">
            <span className="text-[10px] text-gray-700 w-3 text-right shrink-0 tabular-nums font-mono">{i + 1}</span>
            <div className="shrink-0">{getProcessIcon(proc ?? app, 13)}</div>
            <span className="text-xs text-gray-300 font-medium w-28 shrink-0 truncate">{app}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barHex, opacity: 0.75 }} />
            </div>
            <span className="text-xs text-gray-500 w-14 text-right tabular-nums shrink-0 font-mono">{dur}</span>
            <span className={`text-[10px] font-semibold w-16 text-right shrink-0 ${catCls}`}>{cat}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Evidence Panel — Intelligence Dashboard ───────────────────────────────────

export const EvidencePanel: React.FC<{ session: Session; allSessions?: Session[] }> = ({ session, allSessions }) => {
  const [showDetails, setShowDetails] = useState(false);
  const exec = useMemo(() => computeExecMetrics(session), [session]);

  // Score card
  const scoreLabel  = exec.overallScore >= 86 ? 'Elite performance' : exec.overallScore >= 71 ? 'Strong session' : exec.overallScore >= 41 ? 'Moderate output' : 'Low productivity';
  const scoreColor  = exec.overallScore >= 86 ? 'text-cyan-400' : exec.overallScore >= 71 ? 'text-green-400' : exec.overallScore >= 41 ? 'text-amber-400' : 'text-red-400';
  const scoreAccent = exec.overallScore >= 71 ? 'bg-gradient-to-r from-cyan-500/0 via-cyan-500/55 to-cyan-500/0' : exec.overallScore >= 41 ? 'bg-gradient-to-r from-amber-500/0 via-amber-500/50 to-amber-500/0' : 'bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0';

  // Stability card
  const stabLabel  = exec.focusStability == null ? 'Insufficient data' : exec.focusStability >= 80 ? 'Highly consistent' : exec.focusStability >= 60 ? 'Moderate consistency' : 'Fragmented attention';
  const stabColor  = exec.focusStability == null ? 'text-gray-600' : exec.focusStability >= 80 ? 'text-cyan-400' : exec.focusStability >= 60 ? 'text-amber-400' : 'text-red-400';
  const stabAccent = exec.focusStability == null ? 'bg-white/5' : exec.focusStability >= 80 ? 'bg-gradient-to-r from-cyan-500/0 via-cyan-500/45 to-cyan-500/0' : exec.focusStability >= 60 ? 'bg-gradient-to-r from-amber-500/0 via-amber-500/40 to-amber-500/0' : 'bg-gradient-to-r from-red-500/0 via-red-500/40 to-red-500/0';

  // Fragmentation card
  const fv         = exec.switchesPerHour;
  const fragLabel  = fv == null ? 'No switch data' : fv < 15 ? 'Focused attention' : fv <= 30 ? 'Normal switching' : 'Highly fragmented';
  const fragColor  = fv == null ? 'text-gray-600' : fv < 15 ? 'text-cyan-400' : fv <= 30 ? 'text-amber-400' : 'text-red-400';
  const fragAccent = fv == null ? 'bg-white/5' : fv < 15 ? 'bg-gradient-to-r from-cyan-500/0 via-cyan-500/40 to-cyan-500/0' : fv <= 30 ? 'bg-gradient-to-r from-amber-500/0 via-amber-500/40 to-amber-500/0' : 'bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0';

  return (
    <div className="flex flex-col gap-10">

      {/* ── 01 Executive Productivity Overview ──────────────────────────────── */}
      <div>
        <SectionLabel num="01" title="Productivity Overview" subtitle="Session-level performance at a glance" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <ExecKpiCard label="Productivity Score"      value={`${exec.overallScore}`}                    sublabel={scoreLabel} valueColor={scoreColor} accentClass={scoreAccent} glow={exec.overallScore >= 71} />
          <ExecKpiCard label="Deep Work Time"          value={fmtDurMin(exec.deepWorkMin)}                sublabel="Focused uninterrupted work"            valueColor="text-cyan-400"  accentClass={exec.deepWorkMin >= 60 ? 'bg-gradient-to-r from-cyan-500/0 via-cyan-500/45 to-cyan-500/0' : 'bg-white/5'} glow={exec.deepWorkMin >= 60} />
          <ExecKpiCard label="Focus Stability"         value={exec.focusStability != null ? `${exec.focusStability}` : '—'} sublabel={stabLabel} valueColor={stabColor} accentClass={stabAccent} />
          <ExecKpiCard label="Attention Fragmentation" value={fv != null ? `${fv}/hr` : '—'}             sublabel={fragLabel}  valueColor={fragColor}  accentClass={fragAccent} />
        </div>
      </div>

      {/* ── 02 AI Narrative Insight ─────────────────────────────────────────── */}
      <div>
        <SectionLabel num="02" title="AI Narrative" subtitle="Natural language session interpretation" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WorkNarrativePanel summary={session.daily_summary} />
          <BehaviorInsightPanel session={session} />
        </div>
      </div>

      {/* ── 03 Focus Timeline ───────────────────────────────────────────────── */}
      <div>
        <SectionLabel num="03" title="Focus Timeline" subtitle="Minute-by-minute activity map" />
        <div className="bg-navy-800/50 border border-white/8 rounded-xl p-5 flex flex-col gap-5">
          <FocusTimeline session={session} />

          {(session.micro_windows?.length ?? 0) > 0 && (
            <>
              <div className="h-px bg-white/5" />
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2 font-bold">
                  AI Micro Windows · {session.micro_windows!.length} × ~4 min
                </p>
                <MicroHeatStrip windows={session.micro_windows!} />
              </div>
            </>
          )}

          {(session.hour_blocks?.length ?? 0) > 0 && (
            <>
              <div className="h-px bg-white/5" />
              <HourBlocksPanel hourBlocks={session.hour_blocks!} microWindows={session.micro_windows ?? []} />
            </>
          )}

          {!(session.hour_blocks?.length) && (session.micro_windows?.length ?? 0) > 0 && (
            <StandaloneMicroPanel microWindows={session.micro_windows!} />
          )}
        </div>
      </div>

      {/* ── 04 Behavioral Intelligence ──────────────────────────────────────── */}
      <div>
        <SectionLabel num="04" title="Behavioral Intelligence" subtitle="Derived productivity signals" />
        <ProductivitySignalsPanel session={session} />
      </div>

      {/* ── 05 Work Activity Breakdown ──────────────────────────────────────── */}
      <div>
        <SectionLabel num="05" title="Work Activity" subtitle="Top applications this session" />
        <TopAppsBar session={session} />
      </div>

      {/* ── Details & Evidence (collapsed) ──────────────────────────────────── */}
      <div className="border-t border-white/5 pt-4">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors group"
        >
          <span className="uppercase tracking-widest font-bold group-hover:text-gray-300 transition-colors">
            Session Evidence &amp; Details
          </span>
          <span className="text-gray-700 group-hover:text-gray-400 transition-colors">
            {showDetails ? '▲ Collapse' : '▼ Expand'}
          </span>
        </button>

        {showDetails && (
          <div className="flex flex-col gap-6 mt-5">
            {session.analytics && <AnalyticsKpiCards analytics={session.analytics} />}

            {session.hourly_metrics && session.hourly_metrics.length > 0 && (
              <HourlyChart hourlyMetrics={session.hourly_metrics} />
            )}

            <section>
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-3.5 h-3.5 text-purple-400" />
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                  Screenshots · {session.evidence?.screenshot_count ?? 0} captured
                </h4>
              </div>
              <ScreenshotsGrid session={session} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Keystroke Intensity</h4>
                </div>
                <span className="text-xs text-gray-500">
                  Peak: <span className="text-white font-semibold">{session.evidence?.peak_wpm ?? 0} keys/min</span>
                </span>
              </div>
              <KeystrokeGraph session={session} />
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Full App Usage</h4>
              </div>
              <AppTimeChart session={session} allSessions={allSessions} />
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-3.5 h-3.5 text-green-400" />
                <h4 className="text-xs font-bold text-green-400 uppercase tracking-widest">OCR Text Sample</h4>
              </div>
              <OcrSample session={session} />
            </section>
          </div>
        )}
      </div>

    </div>
  );
};
