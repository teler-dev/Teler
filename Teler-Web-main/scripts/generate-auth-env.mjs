import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';

async function readHiddenPassword(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Set TELER_DASHBOARD_PASSWORD when running without an interactive terminal.');
  }

  stdout.write(prompt);
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();

  return await new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Cancelled'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

const username = process.argv[2]?.trim();
if (!username) {
  console.error('Usage: node scripts/generate-auth-env.mjs <username>');
  process.exit(1);
}

const password = process.env.TELER_DASHBOARD_PASSWORD
  ?? await readHiddenPassword('Dashboard password (hidden): ');

if (password.length < 12) {
  console.error('Use a dashboard password with at least 12 characters.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

console.log('\nAdd these SERVER-SIDE variables to Vercel (do not prefix them with VITE_):');
console.log(`TELER_DASHBOARD_USERNAME=${username}`);
console.log(`TELER_DASHBOARD_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${hash.toString('hex')}`);
console.log(`TELER_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
