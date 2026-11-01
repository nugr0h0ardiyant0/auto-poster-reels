// Sambung potongan video, campur musik + SFX + narasi, lalu encode ulang untuk Instagram Reels/Story.
//
//   node ci/gabung.mjs <film> <folder-potongan>   -> out/<film>/reel.mp4
//
// Potongan (000.mp4, 001.mp4, ...) dibuat render.mjs --range dengan pengaturan encode yang sama,
// jadi disambung tanpa encode ulang. Level mix dari "mix" di film.json, sama seperti tools/buat_reel.py.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FPS = 30;
const [film, dir] = process.argv.slice(2);
if (!film || !dir) { console.error('usage: node ci/gabung.mjs <film> <folder-potongan>'); process.exit(1); }

function run(cmd, args) {
  console.log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const cfg = JSON.parse(fs.readFileSync(path.join(film, 'film.json'), 'utf8'));
const fmt = (cfg.formats || ['16x9'])[0];
const out = path.join('out', film);
fs.mkdirSync(out, { recursive: true });

const parts = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort();
if (!parts.length) { console.error(`tidak ada potongan .mp4 di ${dir}`); process.exit(1); }
const list = path.join(out, 'potongan.txt');
fs.writeFileSync(list, parts.map((f) => `file '${path.resolve(dir, f).replace(/\\/g, '/')}'`).join('\n') + '\n');
const video = path.join(out, `video_${fmt}.mp4`);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);

const probe = spawnSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0',
  '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', video], { encoding: 'utf8' });
const got = Number(probe.stdout.trim()), want = Math.round(Number(cfg.duration || 15) * FPS);
console.log(`${parts.length} potongan, ${got} frame (seharusnya ${want})`);
if (got !== want) { console.error('jumlah frame tidak cocok: ada potongan yang hilang atau dobel'); process.exit(1); }

// Narasi disimpan di repo sebagai FLAC (lebih kecil); mix.mjs membaca vo.wav.
const flac = path.join(film, 'audio', 'vo.flac'), wav = path.join(film, 'audio', 'vo.wav');
if (fs.existsSync(flac) && !fs.existsSync(wav)) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', flac, '-c:a', 'pcm_s16le', wav]);
}

const level = { music_db: -12, sfx_db: -1, vo_db: 2, ...(cfg.mix || {}) };
run('node', [path.join('skill', 'scripts', 'mix.mjs'), film, '--music-db', String(level.music_db),
  '--sfx-db', String(level.sfx_db), '--vo-db', String(level.vo_db)]);

// Profil yang aman untuk Instagram: H.264 High, yuv420p, 30 fps, AAC 48 kHz, moov di depan.
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(out, 'final.mp4'),
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-preset', 'slow', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', path.join(out, 'reel.mp4')]);
console.log(`-> ${path.join(out, 'reel.mp4')}`);
