/**
 * activityUtils.tsx
 *
 * Shared activity intelligence utilities for TELER dashboards.
 * Provides domain resolution, app icon rendering, and AI activity interpretation.
 * Only affects how captured data is interpreted and displayed — no telemetry changes.
 */

import React, { useState } from 'react';
import {
  Chrome, Globe, Code2, Terminal, Figma, Slack, MessageSquare, Video,
  Mail, FileSpreadsheet, FileText, Music, Box, Zap, Github, BrainCircuit,
  FolderOpen, Clock, Monitor, Camera, BookOpen, Layers,
} from 'lucide-react';

// ── Domain → human-readable service name ──────────────────────────────────────

export const DOMAIN_NAMES: Record<string, string> = {
  // Version control
  'github.com':               'GitHub',
  'gist.github.com':          'GitHub Gist',
  'raw.githubusercontent.com':'GitHub',
  'gitlab.com':               'GitLab',
  'bitbucket.org':            'Bitbucket',
  // Q&A / Dev docs
  'stackoverflow.com':        'Stack Overflow',
  'stackexchange.com':        'Stack Exchange',
  'developer.mozilla.org':    'MDN Docs',
  'mdn.io':                   'MDN Docs',
  'npmjs.com':                'npm Registry',
  'pypi.org':                 'PyPI',
  'crates.io':                'Crates.io',
  'pkg.go.dev':               'Go Packages',
  'bundlephobia.com':         'Bundlephobia',
  'npmtrends.com':            'npm Trends',
  // Google services
  'docs.google.com':          'Google Docs',
  'sheets.google.com':        'Google Sheets',
  'slides.google.com':        'Google Slides',
  'forms.google.com':         'Google Forms',
  'drive.google.com':         'Google Drive',
  'mail.google.com':          'Gmail',
  'calendar.google.com':      'Google Calendar',
  'meet.google.com':          'Google Meet',
  'classroom.google.com':     'Google Classroom',
  'analytics.google.com':     'Google Analytics',
  'console.cloud.google.com': 'Google Cloud',
  'cloud.google.com':         'Google Cloud',
  'google.com':               'Google Search',
  // AI assistants
  'chat.openai.com':          'ChatGPT',
  'openai.com':               'OpenAI',
  'claude.ai':                'Claude AI',
  'anthropic.com':            'Anthropic',
  'gemini.google.com':        'Gemini',
  'copilot.microsoft.com':    'Copilot',
  'bard.google.com':          'Gemini',
  'perplexity.ai':            'Perplexity',
  'phind.com':                'Phind',
  'you.com':                  'You.com',
  // Social media
  'facebook.com':             'Facebook',
  'twitter.com':              'Twitter/X',
  'x.com':                    'Twitter/X',
  'instagram.com':            'Instagram',
  'linkedin.com':             'LinkedIn',
  'tiktok.com':               'TikTok',
  'reddit.com':               'Reddit',
  'pinterest.com':            'Pinterest',
  'snapchat.com':             'Snapchat',
  'discord.com':              'Discord',
  'discord.gg':               'Discord',
  // Entertainment
  'youtube.com':              'YouTube',
  'youtu.be':                 'YouTube',
  'netflix.com':              'Netflix',
  'twitch.tv':                'Twitch',
  'spotify.com':              'Spotify',
  'soundcloud.com':           'SoundCloud',
  'primevideo.com':           'Prime Video',
  // Communication / collab
  'slack.com':                'Slack',
  'teams.microsoft.com':      'Microsoft Teams',
  'zoom.us':                  'Zoom',
  'webex.com':                'Webex',
  'meet.jit.si':              'Jitsi Meet',
  'whereby.com':              'Whereby',
  'outlook.live.com':         'Outlook',
  'outlook.office.com':       'Outlook',
  'outlook.office365.com':    'Outlook',
  'mail.yahoo.com':           'Yahoo Mail',
  // Project management
  'notion.so':                'Notion',
  'notion.com':               'Notion',
  'atlassian.net':            'Jira',
  'trello.com':               'Trello',
  'asana.com':                'Asana',
  'monday.com':               'Monday.com',
  'linear.app':               'Linear',
  'airtable.com':             'Airtable',
  'clickup.com':              'ClickUp',
  'basecamp.com':             'Basecamp',
  // Design
  'figma.com':                'Figma',
  'canva.com':                'Canva',
  'miro.com':                 'Miro',
  'lucidchart.com':           'Lucidchart',
  'excalidraw.com':           'Excalidraw',
  'draw.io':                  'Diagrams.net',
  'adobe.com':                'Adobe',
  'sketch.com':               'Sketch',
  'invisionapp.com':          'InVision',
  // Finance / Accounting
  'xero.com':                 'Xero',
  'quickbooks.intuit.com':    'QuickBooks',
  'freshbooks.com':           'FreshBooks',
  'myob.com':                 'MYOB',
  'wave.com':                 'Wave Accounting',
  'sage.com':                 'Sage',
  // CRM / Marketing
  'hubspot.com':              'HubSpot',
  'salesforce.com':           'Salesforce',
  'mailchimp.com':            'Mailchimp',
  // Cloud / DevOps
  'console.aws.amazon.com':   'AWS Console',
  'aws.amazon.com':           'AWS',
  'portal.azure.com':         'Azure',
  'azure.microsoft.com':      'Azure',
  'heroku.com':               'Heroku',
  'vercel.com':               'Vercel',
  'netlify.com':              'Netlify',
  'render.com':               'Render',
  'railway.app':              'Railway',
  // Dev tools
  'postman.com':              'Postman',
  'codepen.io':               'CodePen',
  'codesandbox.io':           'CodeSandbox',
  'replit.com':               'Replit',
  'jsfiddle.net':             'JSFiddle',
  'github.dev':               'GitHub Codespaces',
  // Storage
  'dropbox.com':              'Dropbox',
  'box.com':                  'Box',
  'onedrive.live.com':        'OneDrive',
  'sharepoint.com':           'SharePoint',
  // Reading / Learning
  'medium.com':               'Medium',
  'dev.to':                   'DEV Community',
  'news.ycombinator.com':     'Hacker News',
  'producthunt.com':          'Product Hunt',
  'w3schools.com':            'W3Schools',
  'freecodecamp.org':         'freeCodeCamp',
  'udemy.com':                'Udemy',
  'coursera.org':             'Coursera',
};

// ── Domain → productivity category ────────────────────────────────────────────
// Used for hybrid AI+domain classification. Domain-level truth overrides AI intent.

export const DOMAIN_CATEGORY: Record<string, 'productive' | 'neutral' | 'distraction'> = {
  // Version control
  'github.com':               'productive',
  'gist.github.com':          'productive',
  'raw.githubusercontent.com':'productive',
  'gitlab.com':               'productive',
  'bitbucket.org':            'productive',
  // Q&A / Dev docs
  'stackoverflow.com':        'productive',
  'stackexchange.com':        'productive',
  'developer.mozilla.org':    'productive',
  'mdn.io':                   'productive',
  'npmjs.com':                'productive',
  'pypi.org':                 'productive',
  'crates.io':                'productive',
  'pkg.go.dev':               'productive',
  'bundlephobia.com':         'productive',
  'npmtrends.com':            'productive',
  // Google work tools
  'docs.google.com':          'productive',
  'sheets.google.com':        'productive',
  'slides.google.com':        'productive',
  'forms.google.com':         'productive',
  'drive.google.com':         'productive',
  'mail.google.com':          'productive',
  'calendar.google.com':      'productive',
  'meet.google.com':          'productive',
  'classroom.google.com':     'neutral',
  'analytics.google.com':     'productive',
  'console.cloud.google.com': 'productive',
  'cloud.google.com':         'productive',
  'google.com':               'neutral',
  // AI assistants
  'chat.openai.com':          'productive',
  'openai.com':               'productive',
  'claude.ai':                'productive',
  'anthropic.com':            'productive',
  'gemini.google.com':        'productive',
  'copilot.microsoft.com':    'productive',
  'bard.google.com':          'productive',
  'perplexity.ai':            'productive',
  'phind.com':                'productive',
  'you.com':                  'neutral',
  // Social media — distraction
  'facebook.com':             'distraction',
  'twitter.com':              'distraction',
  'x.com':                    'distraction',
  'instagram.com':            'distraction',
  'linkedin.com':             'productive',
  'tiktok.com':               'distraction',
  'reddit.com':               'distraction',
  'pinterest.com':            'distraction',
  'snapchat.com':             'distraction',
  'discord.com':              'neutral',
  'discord.gg':               'neutral',
  // Entertainment — distraction
  'youtube.com':              'distraction',
  'youtu.be':                 'distraction',
  'netflix.com':              'distraction',
  'twitch.tv':                'distraction',
  'spotify.com':              'neutral',
  'soundcloud.com':           'distraction',
  'primevideo.com':           'distraction',
  // Communication / collab
  'slack.com':                'productive',
  'teams.microsoft.com':      'productive',
  'zoom.us':                  'productive',
  'webex.com':                'productive',
  'meet.jit.si':              'productive',
  'whereby.com':              'productive',
  'outlook.live.com':         'productive',
  'outlook.office.com':       'productive',
  'outlook.office365.com':    'productive',
  'mail.yahoo.com':           'neutral',
  // Project management
  'notion.so':                'productive',
  'notion.com':               'productive',
  'atlassian.net':            'productive',
  'trello.com':               'productive',
  'asana.com':                'productive',
  'monday.com':               'productive',
  'linear.app':               'productive',
  'airtable.com':             'productive',
  'clickup.com':              'productive',
  'basecamp.com':             'productive',
  // Design
  'figma.com':                'productive',
  'canva.com':                'productive',
  'miro.com':                 'productive',
  'lucidchart.com':           'productive',
  'excalidraw.com':           'productive',
  'draw.io':                  'productive',
  'adobe.com':                'productive',
  'sketch.com':               'productive',
  'invisionapp.com':          'productive',
  // Finance / Accounting
  'xero.com':                 'productive',
  'quickbooks.intuit.com':    'productive',
  'freshbooks.com':           'productive',
  'myob.com':                 'productive',
  'wave.com':                 'productive',
  'sage.com':                 'productive',
  // CRM / Marketing
  'hubspot.com':              'productive',
  'salesforce.com':           'productive',
  'mailchimp.com':            'productive',
  // Cloud / DevOps
  'console.aws.amazon.com':   'productive',
  'aws.amazon.com':           'productive',
  'portal.azure.com':         'productive',
  'azure.microsoft.com':      'productive',
  'heroku.com':               'productive',
  'vercel.com':               'productive',
  'netlify.com':              'productive',
  'render.com':               'productive',
  'railway.app':              'productive',
  // Dev tools
  'postman.com':              'productive',
  'codepen.io':               'productive',
  'codesandbox.io':           'productive',
  'replit.com':               'productive',
  'jsfiddle.net':             'productive',
  'github.dev':               'productive',
  // Storage
  'dropbox.com':              'productive',
  'box.com':                  'productive',
  'onedrive.live.com':        'productive',
  'sharepoint.com':           'productive',
  // Reading / Learning
  'medium.com':               'neutral',
  'dev.to':                   'neutral',
  'news.ycombinator.com':     'neutral',
  'producthunt.com':          'neutral',
  'w3schools.com':            'productive',
  'freecodecamp.org':         'productive',
  'udemy.com':                'productive',
  'coursera.org':             'productive',
};

// ── Domain extraction ──────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  if (!url) return '';
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(normalized).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[0].toLowerCase().replace(/^www\./, '');
  }
}

// ── Primary name resolver ──────────────────────────────────────────────────────
// Converts raw telemetry fields into a human-readable service/application name.
// Priority order: URL domain → window title keyword → process/app name fallback.

export function resolveName(
  appName: string,
  url?: string,
  windowTitle?: string,
  processName?: string,
): string {
  // 1. URL-based resolution (most accurate)
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      if (DOMAIN_NAMES[domain]) return DOMAIN_NAMES[domain];
      // Subdomain fallback: "app.xero.com" → look up "xero.com"
      const parts = domain.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join('.');
        if (DOMAIN_NAMES[suffix]) return DOMAIN_NAMES[suffix];
      }
      // Unknown domain — format the base hostname nicely
      if (parts.length >= 2) {
        const base = parts[parts.length - 2];
        return base.charAt(0).toUpperCase() + base.slice(1);
      }
    }
  }

  // 2. Window title keyword matching (helps for browser windows without URL)
  if (windowTitle) {
    const t = windowTitle.toLowerCase();
    for (const [domain, name] of Object.entries(DOMAIN_NAMES)) {
      const keyword = domain.split('.')[0];
      if (keyword.length > 3 && t.includes(keyword)) return name;
    }
  }

  // 3. App / process name fallback
  const raw = processName || appName || '';
  if (!raw || raw.toLowerCase() === 'unknown') return 'Unknown';
  return raw
    .replace(/\.exe$/i, '')
    .replace(/\s*(Helper|Renderer|Host|Service|Worker|Extension)$/i, '')
    .trim() || 'Unknown';
}

// ── Activity intent map ────────────────────────────────────────────────────────
// Maps AI-generated activity_type values to manager-readable labels and colors.

const INTENT_MAP: Record<string, { label: string; color: string }> = {
  productive:    { label: 'Productive work',           color: 'text-blue-400'    },
  coding:        { label: 'Writing code',               color: 'text-cyan-400'    },
  writing:       { label: 'Writing / documentation',    color: 'text-teal-400'    },
  reading:       { label: 'Reading documentation',      color: 'text-green-400'   },
  research:      { label: 'Research / browsing',        color: 'text-amber-400'   },
  design:        { label: 'Design work',                color: 'text-pink-400'    },
  review:        { label: 'Code / document review',     color: 'text-cyan-400'    },
  testing:       { label: 'Testing / QA',               color: 'text-green-400'   },
  accounting:    { label: 'Accounting tasks',           color: 'text-emerald-400' },
  meeting:       { label: 'Meeting / call',             color: 'text-purple-400'  },
  communication: { label: 'Communication / messaging',  color: 'text-indigo-400'  },
  browsing:      { label: 'General browsing',           color: 'text-gray-400'    },
  distraction:   { label: 'Distraction / browsing',    color: 'text-red-400'     },
  video:         { label: 'Watching videos',            color: 'text-red-400'     },
  social:        { label: 'Social media',               color: 'text-red-400'     },
  idle:          { label: 'Idle / inactive',            color: 'text-gray-500'    },
};

export function resolveActivityIntent(activityType: string): { label: string; color: string } {
  return INTENT_MAP[activityType.toLowerCase().trim()] ?? { label: activityType, color: 'text-gray-400' };
}

// ── App categorization ─────────────────────────────────────────────────────────

const DISTRACTION_TERMS = new Set([
  'youtube', 'facebook', 'twitter/x', 'instagram', 'reddit', 'tiktok',
  'netflix', 'twitch', 'pinterest', 'snapchat', '9gag', 'prime video', 'soundcloud',
]);
const PRODUCTIVE_TERMS = new Set([
  'github', 'gitlab', 'bitbucket', 'vs code', 'cursor', 'visual studio',
  'terminal', 'figma', 'canva', 'slack', 'notion', 'jira', 'confluence',
  'trello', 'linear', 'google docs', 'google sheets', 'google drive', 'google cloud',
  'xero', 'quickbooks', 'freshbooks', 'myob', 'postman', 'aws', 'azure',
  'chatgpt', 'claude ai', 'zoom', 'microsoft teams', 'webex', 'outlook',
  'gmail', 'stack overflow', 'mdn docs', 'vercel', 'netlify',
]);

export function categorizeResolved(
  resolvedName: string,
  url?: string,
): 'productive' | 'neutral' | 'distraction' {
  // 1. URL domain → DOMAIN_CATEGORY lookup (most authoritative)
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      if (DOMAIN_CATEGORY[domain]) return DOMAIN_CATEGORY[domain];
      const parts = domain.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join('.');
        if (DOMAIN_CATEGORY[suffix]) return DOMAIN_CATEGORY[suffix];
      }
    }
  }
  // 2. Resolved name term matching (for process/app names without URL)
  const n = resolvedName.toLowerCase();
  for (const d of DISTRACTION_TERMS) if (n.includes(d)) return 'distraction';
  for (const p of PRODUCTIVE_TERMS)  if (n.includes(p)) return 'productive';
  return 'neutral';
}

// ── Activity color for timeline bars ──────────────────────────────────────────

export function activityBarColor(activityType: string): string {
  const t = activityType.toLowerCase();
  if (t === 'distraction' || t === 'video' || t === 'social') return '#ef4444';
  if (t === 'idle') return '#374151';
  return '#3b82f6'; // productive/neutral
}

// ── Process → Lucide icon ──────────────────────────────────────────────────────

function getProcessIcon(name: string, size: number): React.ReactElement {
  const n = name.toLowerCase();
  const cls = 'shrink-0 text-gray-400';

  if (n.includes('chrome') || n.includes('browser'))                      return <Chrome          className={cls} width={size} height={size} />;
  if (n.includes('edge') || n.includes('firefox') || n.includes('safari'))return <Globe           className={cls} width={size} height={size} />;
  if (n.includes('code') || n.includes('vscode') || n.includes('cursor') ||
      n.includes('devenv') || n.includes('vim') || n.includes('intellij'))  return <Code2           className={cls} width={size} height={size} />;
  if (n.includes('terminal') || n.includes('cmd') || n.includes('powershell') ||
      n.includes('bash') || n === 'wt')                                    return <Terminal        className={cls} width={size} height={size} />;
  if (n.includes('figma'))                                                 return <Figma           className={cls} width={size} height={size} />;
  if (n.includes('slack'))                                                 return <Slack           className={cls} width={size} height={size} />;
  if (n.includes('teams') || n.includes('discord'))                       return <MessageSquare   className={cls} width={size} height={size} />;
  if (n.includes('zoom') || n.includes('webex'))                          return <Video           className={cls} width={size} height={size} />;
  if (n.includes('outlook'))                                               return <Mail            className={cls} width={size} height={size} />;
  if (n.includes('excel') || n.includes('sheets'))                        return <FileSpreadsheet className={cls} width={size} height={size} />;
  if (n.includes('word') || n.includes('docs') || n.includes('notion'))   return <FileText        className={cls} width={size} height={size} />;
  if (n.includes('spotify') || n.includes('music'))                       return <Music           className={cls} width={size} height={size} />;
  if (n.includes('docker'))                                                return <Box             className={cls} width={size} height={size} />;
  if (n.includes('postman'))                                               return <Zap             className={cls} width={size} height={size} />;
  if (n.includes('github'))                                                return <Github          className={cls} width={size} height={size} />;
  if (n.includes('claude') || n.includes('chatgpt') || n.includes('openai'))
                                                                           return <BrainCircuit    className={cls} width={size} height={size} />;
  if (n.includes('explorer') || n.includes('finder'))                     return <FolderOpen      className={cls} width={size} height={size} />;
  if (n.includes('camera') || n.includes('screenshot'))                   return <Camera          className={cls} width={size} height={size} />;
  if (n.includes('timer'))                                                 return <Clock           className={cls} width={size} height={size} />;
  if (n.includes('canva') || n.includes('miro') || n.includes('design'))  return <Layers          className={cls} width={size} height={size} />;
  if (n.includes('book') || n.includes('pdf') || n.includes('read'))      return <BookOpen        className={cls} width={size} height={size} />;
  return <Monitor className={cls} width={size} height={size} />;
}

// ── AppIcon component ──────────────────────────────────────────────────────────
// Priority 1: favicon loaded from URL domain (Google S2 API)
// Priority 2: lucide-react icon matched from process/app name
// Priority 3: Monitor fallback (always renders something)

export const AppIcon: React.FC<{
  resolvedName: string;
  url?: string;
  processName?: string;
  size?: number;
}> = ({ resolvedName, url, processName, size = 16 }) => {
  const domain = url ? extractDomain(url) : '';
  const [imgFailed, setImgFailed] = useState(false);

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

  return getProcessIcon(processName || resolvedName, size);
};

// ── Switch type classifier ─────────────────────────────────────────────────────
// Infers the type of app switch from process/app names.

export function getSwitchType(from: string, to: string): string {
  const BROWSERS = ['chrome', 'firefox', 'edge', 'safari', 'opera', 'browser'];
  const EDITORS  = ['code', 'vscode', 'cursor', 'vim', 'neovim', 'intellij',
                    'devenv', 'sublime', 'webstorm', 'pycharm', 'rider'];
  const fromL = from.toLowerCase();
  const toL   = to.toLowerCase();
  const fromBrowser = BROWSERS.some(b => fromL.includes(b));
  const toBrowser   = BROWSERS.some(b => toL.includes(b));
  const fromEditor  = EDITORS.some(e => fromL.includes(e));
  const toEditor    = EDITORS.some(e => toL.includes(e));
  if (fromBrowser && toBrowser) return 'Browser tab';
  if (fromEditor  && toEditor)  return 'IDE switch';
  return 'App switch';
}
