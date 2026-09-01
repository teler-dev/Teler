const crypto = require('crypto');
const express = require('express');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = Math.max(1, Number(process.env.AUTH_SESSION_DAYS) || 30);
const JOB_ROLES = new Set(['general', 'developer', 'designer', 'manager', 'accountant', 'qa']);
const attempts = new Map();

function authRateLimit(req, res, next) {
  const now = Date.now();
  if (attempts.size > 10_000) {
    for (const [storedKey, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(storedKey);
    }
  }
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > 20) {
    res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  }
  return next();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugify(value) {
  const base = String(value || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length >= 2 ? base : 'workspace';
}

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, saltText, hashText] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicAccount(row) {
  return {
    id: row.user_profile_id,
    authUserId: row.auth_user_id,
    email: row.email_normalized,
    displayName: row.display_name,
    jobRole: row.job_role,
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      slug: row.organization_slug,
      role: row.member_role,
    },
  };
}

async function issueSession(client, userProfileId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await client.query(
    `insert into app.user_auth_sessions
       (user_profile_id, token_hash, expires_at, user_agent)
     values ($1, $2, $3, $4)`,
    [userProfileId, tokenHash(token), expiresAt, String(req.get('user-agent') || '').slice(0, 500)]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

const ACCOUNT_QUERY = `
  select p.id as user_profile_id, p.auth_user_id, p.display_name,
         c.email_normalized, m.organization_id, m.role as member_role,
         o.name as organization_name, o.slug as organization_slug,
         e.job_role
    from app.user_profiles p
    join app.user_credentials c on c.user_profile_id = p.id
    join app.organization_memberships m on m.user_profile_id = p.id
      and m.status = 'active'
    join app.organizations o on o.id = m.organization_id
      and o.status = 'active'
    join app.employees e on e.organization_id = m.organization_id
      and e.external_key = p.id::text
   where p.id = $1
   order by m.joined_at asc
   limit 1`;

function createAuthRouter(pool) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (pool) return next();
    return res.status(503).json({ error: 'Authentication database is not configured' });
  });

  router.post('/signup', authRateLimit, async (req, res) => {
    const displayName = String(req.body?.displayName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const organizationName = String(req.body?.organizationName || `${displayName}'s workspace`).trim();
    const jobRole = String(req.body?.jobRole || '').trim().toLowerCase();

    if (displayName.length < 2 || displayName.length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
    }
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must contain at least 8 characters' });
    }
    if (organizationName.length < 2 || organizationName.length > 160) {
      return res.status(400).json({ error: 'Workspace name must be between 2 and 160 characters' });
    }
    if (!JOB_ROLES.has(jobRole)) {
      return res.status(400).json({ error: 'Select a valid job role' });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('begin');
      const passwordHash = await hashPassword(password);
      const authUserId = `teler:${crypto.randomUUID()}`;
      const profileResult = await client.query(
        `insert into app.user_profiles (auth_user_id, display_name)
         values ($1, $2) returning id`,
        [authUserId, displayName]
      );
      const profileId = profileResult.rows[0].id;
      await client.query(
        `insert into app.user_credentials (user_profile_id, email_normalized, password_hash)
         values ($1, $2, $3)`,
        [profileId, email, passwordHash]
      );

      const orgResult = await client.query(
        `insert into app.organizations (slug, name)
         values ($1, $2) returning id, slug, name`,
        [`${slugify(organizationName)}-${crypto.randomBytes(3).toString('hex')}`, organizationName]
      );
      const organization = orgResult.rows[0];
      await client.query(
        `insert into app.organization_memberships (organization_id, user_profile_id, role)
         values ($1, $2, 'owner')`,
        [organization.id, profileId]
      );
      await client.query(
         `insert into app.employees
           (organization_id, external_key, display_name, email_normalized, job_role)
         values ($1, $2, $3, $4, $5)`,
        [organization.id, profileId, displayName, email, jobRole]
      );

      const session = await issueSession(client, profileId, req);
      await client.query('commit');
      return res.status(201).json({
        ...session,
        user: {
          id: profileId,
          authUserId,
          email,
          displayName,
          jobRole,
          organization: { id: organization.id, name: organization.name, slug: organization.slug, role: 'owner' },
        },
      });
    } catch (error) {
      if (client) await client.query('rollback');
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
      console.error('[auth/signup]', error);
      return res.status(500).json({ error: 'Could not create account' });
    } finally {
      if (client) client.release();
    }
  });

  router.post('/login', authRateLimit, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!validEmail(email) || !password) return res.status(400).json({ error: 'Email and password are required' });

    let client;
    try {
      client = await pool.connect();
      const credentials = await client.query(
        `select user_profile_id, password_hash from app.user_credentials
          where email_normalized = $1 and disabled_at is null`,
        [email]
      );
      const record = credentials.rows[0];
      if (!record || !(await verifyPassword(password, record.password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const accountResult = await client.query(ACCOUNT_QUERY, [record.user_profile_id]);
      if (!accountResult.rows[0]) return res.status(403).json({ error: 'No active workspace membership found' });
      const session = await issueSession(client, record.user_profile_id, req);
      await client.query(
        `update app.user_credentials set last_login_at = now() where user_profile_id = $1`,
        [record.user_profile_id]
      );
      return res.json({ ...session, user: publicAccount(accountResult.rows[0]) });
    } catch (error) {
      console.error('[auth/login]', error);
      return res.status(500).json({ error: 'Could not sign in' });
    } finally {
      if (client) client.release();
    }
  });

  async function requireUser(req, res, next) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const sessionResult = await pool.query(
        `select user_profile_id from app.user_auth_sessions
          where token_hash = $1 and revoked_at is null and expires_at > now()`,
        [tokenHash(token)]
      );
      if (!sessionResult.rows[0]) return res.status(401).json({ error: 'Session expired' });
      req.auth = { token, userProfileId: sessionResult.rows[0].user_profile_id };
      return next();
    } catch (error) {
      console.error('[auth/session]', error);
      return res.status(500).json({ error: 'Could not validate session' });
    }
  }

  router.get('/me', requireUser, async (req, res) => {
    try {
      const result = await pool.query(ACCOUNT_QUERY, [req.auth.userProfileId]);
      if (!result.rows[0]) return res.status(403).json({ error: 'Account is no longer active' });
      return res.json({ user: publicAccount(result.rows[0]) });
    } catch (error) {
      console.error('[auth/me]', error);
      return res.status(500).json({ error: 'Could not load account' });
    }
  });

  router.post('/logout', requireUser, async (req, res) => {
    try {
      await pool.query(
        `update app.user_auth_sessions set revoked_at = now() where token_hash = $1`,
        [tokenHash(req.auth.token)]
      );
      return res.status(204).end();
    } catch (error) {
      console.error('[auth/logout]', error);
      return res.status(500).json({ error: 'Could not sign out' });
    }
  });

  return router;
}

module.exports = { createAuthRouter, hashPassword, verifyPassword };
