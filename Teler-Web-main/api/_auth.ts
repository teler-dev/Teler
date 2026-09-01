import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const COOKIE_NAME = '__Host-teler_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SCRYPT_KEY_LENGTH = 64;

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', requiredEnv('TELER_SESSION_SECRET'))
    .update(value)
    .digest('base64url');
}

function safeEqualText(left: string, right: string): boolean {
  const leftHash = createHmac('sha256', 'teler-constant-time-compare').update(left).digest();
  const rightHash = createHmac('sha256', 'teler-constant-time-compare').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};

  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUsername = requiredEnv('TELER_DASHBOARD_USERNAME');
  const stored = requiredEnv('TELER_DASHBOARD_PASSWORD_HASH');
  const [algorithm, saltHex, hashHex] = stored.split('$');

  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    throw new Error('TELER_DASHBOARD_PASSWORD_HASH must use scrypt$saltHex$hashHex format');
  }

  const expectedHash = Buffer.from(hashHex, 'hex');
  if (expectedHash.length !== SCRYPT_KEY_LENGTH) {
    throw new Error('TELER_DASHBOARD_PASSWORD_HASH has an invalid hash length');
  }

  const actualHash = scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });

  return safeEqualText(username, expectedUsername) && timingSafeEqual(actualHash, expectedHash);
}

export function createSessionToken(username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function readSession(request: Request): SessionPayload | null {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
  if (!token) return null;

  const [encodedPayload, suppliedSignature, extra] = token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if (payload.iat > now + 60 || payload.exp <= now || payload.exp - payload.iat > SESSION_TTL_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function noStoreJson(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function unauthorized(): Response {
  return noStoreJson({ error: 'Unauthorized' }, 401);
}

export function generatePasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
