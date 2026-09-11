'use strict';

const { getPool } = require('../db');

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sourceList(value) {
  return Array.isArray(value) ? value.slice(0, 8) : [];
}

function createAiAnalysesRouter(express) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const question = text(req.body?.question, 8_000);
    const answer = text(req.body?.answer, 32_000);
    const provider = text(req.body?.provider, 80);
    const model = text(req.body?.model, 200);
    const sources = sourceList(req.body?.sources);
    const requestedSessionId = text(req.body?.session_id, 80).replace(/^control:/, '');
    if (!question || !answer || !provider || !model) {
      return res.status(400).json({ error: 'question, answer, provider and model are required' });
    }
    try {
      let sessionId = null;
      if (/^[a-f0-9-]{36}$/i.test(requestedSessionId)) {
        const session = await pool.query(
          'select id from app.work_sessions where id=$1 and organization_id=$2 limit 1',
          [requestedSessionId, req.authUser.organization.id],
        );
        if (!session.rowCount) return res.status(404).json({ error: 'Session not found' });
        sessionId = session.rows[0].id;
      }
      const result = await pool.query(
        `insert into app.ai_analyses
          (organization_id,user_profile_id,session_id,provider,model,question,answer,sources)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         returning id,organization_id,session_id,provider,model,question,answer,sources,created_at`,
        [req.authUser.organization.id, req.authUser.id, sessionId, provider, model, question, answer, JSON.stringify(sources)],
      );
      return res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      console.error('[ai-analyses/create]', error.message);
      return res.status(500).json({ error: 'Unable to save AI analysis' });
    }
  });

  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    try {
      const result = await pool.query(
        `select id,session_id,provider,model,question,answer,sources,created_at
           from app.ai_analyses where organization_id=$1 order by created_at desc limit $2`,
        [req.authUser.organization.id, limit],
      );
      return res.json({ data: result.rows });
    } catch (error) {
      console.error('[ai-analyses/list]', error.message);
      return res.status(500).json({ error: 'Unable to load AI analyses' });
    }
  });
  return router;
}

module.exports = { createAiAnalysesRouter };
