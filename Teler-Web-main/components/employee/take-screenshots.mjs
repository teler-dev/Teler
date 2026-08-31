/**
 * take-screenshots.mjs
 * Captures each of the 5 EmployeeApp states as individual PNGs.
 * Run with: node take-screenshots.mjs
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlFile  = path.join(__dirname, 'screenshot-states.html');
const outDir    = __dirname;

const STATES = [
  { name: 'login',       x: 24,                   label: 'Login'        },
  { name: 'idle',        x: 24 + 480 + 20,         label: 'Idle'         },
  { name: 'running',     x: 24 + (480 + 20) * 2,   label: 'Running'      },
  { name: 'break-hover', x: 24 + (480 + 20) * 3,   label: 'Break Hover'  },
  { name: 'break',       x: 24 + (480 + 20) * 4,   label: 'On Break'     },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 5 * (480 + 20) + 48, height: 680 });
await page.goto(`file:///${htmlFile.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

for (const s of STATES) {
  const outPath = path.join(outDir, `state-${s.name}.png`);
  await page.screenshot({
    path:    outPath,
    clip:    { x: s.x, y: 24, width: 480, height: 600 },
  });
  console.log(`  ✓  ${s.label}  →  state-${s.name}.png`);
}

await browser.close();
console.log('\nDone.');
