'use strict';

const crypto = require('crypto');
const express = require('express');
const { getPool } = require('./db');
const { createIngestionRouter } = require('./modules/ingestion');
const { createSessionsRouter } = require('./modules/v1-sessions');
const { createAnalyticsRouter } = require('./modules/v1-analytics');
const { createAlertsRouter, createAlertRulesRouter } = require('./modules/v1-alerts');
const { createDirectoryRouter } = require('./modules/v1-directory');
const { createTasksRouter } = require('./modules/v1-tasks');
const { createReportsRouter } = require('./modules/v1-reports');
const { createSettingsRouter } = require('./modules/v1-settings');

const PORT = Number(process.env.PORT) || 7001;
const API_TOKEN = (process.env.API_TOKEN || '').trim();
const SYNC_TOKEN = (process.env.SYNC_TOKEN || '').trim() || API_TOKEN;

function tokenMatches(presented, expected) {
  if (!expected) return true;
  const a = Buffer.from(String(presented || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireBearer(expected) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (tokenMatches(presented, expected)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

function captureLegacyApp() {
  let captured = null;
  const originalListen = express.application.listen;
  express.application.listen = function interceptedListen() {
    captured = this;
    return { close() {} };
  };
  try { require('./server'); }
  finally { express.application.listen = originalListen; }
  if (!captured) throw new Error('Unable to capture legacy TELER Express app');
  return { app: captured, listen: originalListen };
}

async function databaseHealth() {
  const pool = getPool();
  if (!pool) return { database: 'disabled', worker_queue: null };
  try {
    const result = await pool.query(`select count(*)::int as depth from app.background_jobs where status in ('pending','retrying','running')`);
    return { database: 'ok', worker_queue: result.rows[0]?.depth ?? 0 };
  } catch { return { database: 'unavailable', worker_queue: null }; }
}

const legacy = captureLegacyApp();
const front = express();
front.disable('x-powered-by');
front.set('trust proxy', 'loopback');
front.get('/api/v1/health', async (req, res) => res.json({ status: 'ok', auth: Boolean(API_TOKEN), architecture: 'modular-monolith-v1', ...(await databaseHealth()) }));

const v1 = express.Router();
v1.use(express.json({ limit: '20mb' }));
v1.use('/ingest', requireBearer(SYNC_TOKEN), createIngestionRouter(express));
v1.use('/', requireBearer(API_TOKEN), createDirectoryRouter(express));
v1.use('/sessions', requireBearer(API_TOKEN), createSessionsRouter(express));
v1.use('/analytics', requireBearer(API_TOKEN), createAnalyticsRouter(express));
v1.use('/alerts', requireBearer(API_TOKEN), createAlertsRouter(express));
v1.use('/alert-rules', requireBearer(API_TOKEN), createAlertRulesRouter(express));
v1.use('/tasks', requireBearer(API_TOKEN), createTasksRouter(express));
v1.use('/reports', requireBearer(API_TOKEN), createReportsRouter(express));
v1.use('/settings', requireBearer(API_TOKEN), createSettingsRouter(express));
front.use('/api/v1', v1);

front.use(legacy.app);
legacy.listen.call(front, PORT, '127.0.0.1', () => {
  console.log(`\n  TELER modular API -> http://127.0.0.1:${PORT}`);
  console.log('  v1              -> /api/v1 (PostgreSQL + worker)');
  console.log('  legacy fallback -> enabled\n');
});