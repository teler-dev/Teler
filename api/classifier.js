'use strict';

/**
 * classifier.js — Unified activity classifier for TELER backend.
 *
 * Single source of truth for timeline segment classification.
 * Imported by server.js; mirrors DOMAIN_CATEGORY kept in
 * Teler-Web-main/components/dashboard/activityUtils.tsx for the frontend.
 *
 * Priority order:
 *   1. URL/domain lookup   → classifiedBy: 'domain'
 *   2. Window-title/app-name keyword match → classifiedBy: 'name'
 *   3. Default neutral     → classifiedBy: 'fallback'
 *
 * Idle detection takes priority over all three.
 */

// ── Domain → category table ───────────────────────────────────────────────────
// Keep in sync with DOMAIN_CATEGORY in activityUtils.tsx.

const DOMAIN_CATEGORY = {
  // Version control
  'github.com':                 'productive',
  'gist.github.com':            'productive',
  'raw.githubusercontent.com':  'productive',
  'gitlab.com':                 'productive',
  'bitbucket.org':              'productive',
  // Q&A / Dev docs
  'stackoverflow.com':          'productive',
  'stackexchange.com':          'productive',
  'developer.mozilla.org':      'productive',
  'mdn.io':                     'productive',
  'npmjs.com':                  'productive',
  'pypi.org':                   'productive',
  'crates.io':                  'productive',
  'pkg.go.dev':                 'productive',
  'bundlephobia.com':           'productive',
  'npmtrends.com':              'productive',
  // Google work tools
  'docs.google.com':            'productive',
  'sheets.google.com':          'productive',
  'slides.google.com':          'productive',
  'forms.google.com':           'productive',
  'drive.google.com':           'productive',
  'mail.google.com':            'productive',
  'calendar.google.com':        'productive',
  'meet.google.com':            'productive',
  'classroom.google.com':       'neutral',
  'analytics.google.com':       'productive',
  'console.cloud.google.com':   'productive',
  'cloud.google.com':           'productive',
  'google.com':                 'neutral',
  // AI assistants
  'chat.openai.com':            'productive',
  'openai.com':                 'productive',
  'claude.ai':                  'productive',
  'anthropic.com':              'productive',
  'gemini.google.com':          'productive',
  'copilot.microsoft.com':      'productive',
  'bard.google.com':            'productive',
  'perplexity.ai':              'productive',
  'phind.com':                  'productive',
  'you.com':                    'neutral',
  // Social media — distraction
  'facebook.com':               'distraction',
  'twitter.com':                'distraction',
  'x.com':                      'distraction',
  'instagram.com':              'distraction',
  'linkedin.com':               'productive',
  'tiktok.com':                 'distraction',
  'reddit.com':                 'distraction',
  'pinterest.com':              'distraction',
  'snapchat.com':               'distraction',
  'discord.com':                'neutral',
  'discord.gg':                 'neutral',
  // Entertainment — distraction
  'youtube.com':                'distraction',
  'youtu.be':                   'distraction',
  'netflix.com':                'distraction',
  'twitch.tv':                  'distraction',
  'spotify.com':                'neutral',
  'soundcloud.com':             'distraction',
  'primevideo.com':             'distraction',
  // Communication / collab
  'slack.com':                  'productive',
  'teams.microsoft.com':        'productive',
  'zoom.us':                    'productive',
  'webex.com':                  'productive',
  'meet.jit.si':                'productive',
  'whereby.com':                'productive',
  'outlook.live.com':           'productive',
  'outlook.office.com':         'productive',
  'outlook.office365.com':      'productive',
  'mail.yahoo.com':             'neutral',
  // Project management
  'notion.so':                  'productive',
  'notion.com':                 'productive',
  'atlassian.net':              'productive',
  'trello.com':                 'productive',
  'asana.com':                  'productive',
  'monday.com':                 'productive',
  'linear.app':                 'productive',
  'airtable.com':               'productive',
  'clickup.com':                'productive',
  'basecamp.com':               'productive',
  // Design
  'figma.com':                  'productive',
  'canva.com':                  'productive',
  'miro.com':                   'productive',
  'lucidchart.com':             'productive',
  'excalidraw.com':             'productive',
  'draw.io':                    'productive',
  'adobe.com':                  'productive',
  'sketch.com':                 'productive',
  'invisionapp.com':            'productive',
  // Finance / Accounting
  'xero.com':                   'productive',
  'quickbooks.intuit.com':      'productive',
  'freshbooks.com':             'productive',
  'myob.com':                   'productive',
  'wave.com':                   'productive',
  'sage.com':                   'productive',
  // CRM / Marketing
  'hubspot.com':                'productive',
  'salesforce.com':             'productive',
  'mailchimp.com':              'productive',
  // Cloud / DevOps
  'console.aws.amazon.com':     'productive',
  'aws.amazon.com':             'productive',
  'portal.azure.com':           'productive',
  'azure.microsoft.com':        'productive',
  'heroku.com':                 'productive',
  'vercel.com':                 'productive',
  'netlify.com':                'productive',
  'render.com':                 'productive',
  'railway.app':                'productive',
  // Dev tools
  'postman.com':                'productive',
  'codepen.io':                 'productive',
  'codesandbox.io':             'productive',
  'replit.com':                 'productive',
  'jsfiddle.net':               'productive',
  'github.dev':                 'productive',
  // Storage
  'dropbox.com':                'productive',
  'box.com':                    'productive',
  'onedrive.live.com':          'productive',
  'sharepoint.com':             'productive',
  // Reading / Learning
  'medium.com':                 'neutral',
  'dev.to':                     'neutral',
  'news.ycombinator.com':       'neutral',
  'producthunt.com':            'neutral',
  'w3schools.com':              'productive',
  'freecodecamp.org':           'productive',
  'udemy.com':                  'productive',
  'coursera.org':               'productive',
};

// ── Name-keyword list (derived from DOMAIN_CATEGORY, built once at load) ─────
// Longer keywords first so more-specific matches win over shorter ones.
const NAME_KEYWORDS = Object.entries(DOMAIN_CATEGORY)
  .map(([domain, cat]) => {
    const kw = domain.split('.')[0];
    return kw.length > 3 ? { kw, cat } : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.kw.length - a.kw.length);

// ── Domain extractor ──────────────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return '';
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[0].toLowerCase().replace(/^www\./, '');
  }
}

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a window/app.
 *
 * @param {string} windowTitle  raw active_window from tracker event
 * @param {string} [url]        active_url if available
 * @returns {{ type: 'productive'|'neutral'|'distraction'|'idle',
 *             classifiedBy: 'domain'|'name'|'fallback' }}
 */
function classifyWindow(windowTitle, url) {
  const w = (windowTitle || '').toLowerCase().trim();

  // Idle / lock — highest priority, before any domain lookup
  if (!w || w === 'unknown' || w.includes('idle') ||
      w.includes('lock screen') || w.includes('screensaver')) {
    return { type: 'idle', classifiedBy: 'fallback' };
  }

  // 1. URL domain lookup
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      if (DOMAIN_CATEGORY[domain]) {
        return { type: DOMAIN_CATEGORY[domain], classifiedBy: 'domain' };
      }
      // Subdomain fallback: "app.xero.com" → check "xero.com"
      const parts = domain.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join('.');
        if (DOMAIN_CATEGORY[suffix]) {
          return { type: DOMAIN_CATEGORY[suffix], classifiedBy: 'domain' };
        }
      }
    }
  }

  // 2. Window title / app name keyword match
  for (const { kw, cat } of NAME_KEYWORDS) {
    if (w.includes(kw)) {
      return { type: cat, classifiedBy: 'name' };
    }
  }

  // 3. Fallback
  return { type: 'neutral', classifiedBy: 'fallback' };
}

module.exports = { classifyWindow, extractDomain, DOMAIN_CATEGORY };
