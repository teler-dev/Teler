import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.teler-local');
const config = JSON.parse(fs.readFileSync(path.join(local, 'config.json'), 'utf8'));
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(config.password, salt, 64).toString('hex');
const env = {
  ...process.env,
  DATABASE_URL: config.databaseUrl,
  PORT: '7001',
  DATA_ROOT: path.join(local, 'server-data'),
  API_TOKEN: config.apiToken,
  SYNC_TOKEN: config.syncToken,
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
  TELER_API_BASE: 'http://127.0.0.1:7001',
  TELER_API_TOKEN: config.apiToken,
  TELER_SYNC_TOKEN: config.syncToken,
  TELER_DATA_ROOT: path.join(local, 'tracker-data'),
  TELER_DATA_BASE: path.join(local, 'tracker-data'),
  TELER_SETTINGS_FILE: path.join(local, 'desktop.ini'),
  TELER_DASHBOARD_USERNAME: config.email,
  TELER_DASHBOARD_PASSWORD_HASH: `scrypt$${salt.toString('hex')}$${hash}`,
  TELER_SESSION_SECRET: config.sessionSecret,
  VITE_API_BASE: '',
  VITE_ORGANIZATION_KEY: config.organizationSlug || 'COMP_DEV_001',
};
const commands = {
  api: [process.execPath, [path.join(root, 'api/server-entry.js')], root],
  worker: [process.execPath, [path.join(root, 'api/index-worker.js')], root],
  web: [process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], path.join(root, 'Teler-Web-main')],
  desktop: [path.join(root, '.venv/bin/python'), ['-u', path.join(root, 'main.py')], root],
  sync: [process.execPath, [path.join(root, 'tools/sync-agent.js'), '--once'], root],
};
const command = commands[process.argv[2]];
if (!command) throw new Error('Usage: node tools/run-local.mjs api|worker|web|desktop|sync');
const logPath = path.join(local, `${process.argv[2]}.log`);
const log = fs.openSync(logPath, 'a', 0o600);
console.log(`Local ${process.argv[2]} log: ${logPath}`);
const child = spawn(command[0], command[1], { cwd: command[2], env, stdio: ['ignore', log, log] });
fs.closeSync(log);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', (code, signal) => {
  if (signal) console.error(`Local ${process.argv[2]} exited with signal ${signal}`);
  process.exit(code ?? 1);
});
