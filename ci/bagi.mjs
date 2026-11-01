// Bagi film jadi potongan render untuk matrix GitHub Actions. Batas potongan jatuh tepat di frame,
// jadi potongan yang disambung sama dengan render utuh.
//
//   node ci/bagi.mjs <film> [detik-per-potongan]   -> baris potongan=[...] dan format=... ($GITHUB_OUTPUT)

import fs from 'node:fs';
import path from 'node:path';

const FPS = 30;
const MAKS = 20; // job bersamaan di GitHub Free

const [film, per = '8'] = process.argv.slice(2);
if (!film) { console.error('usage: node ci/bagi.mjs <film> [detik-per-potongan]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(film, 'film.json'), 'utf8'));
const dur = Number(cfg.duration || 15);
const frames = Math.round(dur * FPS);
const n = Math.max(1, Math.min(MAKS, Math.ceil(dur / Math.max(1, Number(per) || 8))));

const potongan = Array.from({ length: n }, (_, i) => {
  const fa = Math.round((frames * i) / n), fb = Math.round((frames * (i + 1)) / n);
  return { i, a: fa / FPS, b: i === n - 1 ? dur : fb / FPS, label: `${(fa / FPS).toFixed(1)}-${(fb / FPS).toFixed(1)} s` };
});
console.log(`potongan=${JSON.stringify(potongan)}`);
console.log(`format=${(cfg.formats || ['16x9'])[0]}`);
