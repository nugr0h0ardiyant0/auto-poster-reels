// Pesan dari Nomor Lama (3 menit): pure function of time. window.seek(t) paints frame t (lib/motion.js).
// 60 BPM grid, so u (beats) == seconds. Every cue is found by sentence text in narasi.json (the ElevenLabs
// narration timings written by tools/buat_reel.py); audio/score.py uses the same lookups, so picture,
// score and voice agree. docs/shotlist.md is the plan.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, kf, springU, SPRING, font, layout, glyph, text, fill, rrect, noise1, hash01, mulberry32 } = M;

const NAR = await fetch('narasi.json').then((r) => r.json());
function kal(frag) {
  const k = NAR.kalimat.find((s) => s.teks.includes(frag));
  if (!k) throw new Error(`kalimat tidak ada di narasi.json: ${frag}`);
  return k;
}
const at = (frag) => kal(frag).mulai;      // speech onset of the sentence
const end = (frag) => kal(frag).selesai;   // speech end
const SCN = (name) => NAR.scenes.find((s) => s.adegan === name);

// ------------------------------------------------------------------ cues (seconds)
const T = {};
T.wake = 0.2;                                          // the phone buzzes and lights up on frame 0
T.chat = at('Kamu membuka obrolan') - 0.15;            // the notification opens out into the chat
T.lastMsg = at('Aku di kamarmu');                      // Raka's last message lights up as it is read
T.unread = at('Malam itu kamu pulang');                // scroll down your unanswered messages
T.today = at('Sekarang, di bawah pesan itu');          // on to HARI INI and the new photo
T.photo1 = at('Isinya cuma satu foto');                // photo 1 starts downloading
T.sharp1 = end('Foto itu terbuka pelan-pelan');
T.into1 = at('Kamar tidurmu') - 0.15;                  // zoom into photo 1 ...
T.full1 = end('Kamar tidurmu') + 0.45;                 // ... until it fills the frame: we are in the room
T.reveal = at('Dari dalam lemari') - 0.3;              // dolly back out of the wardrobe
T.creak = at('Dari dalam lemari') + 2.0;
T.sleeper = at('Dan di ranjang itu');                  // push toward the bed
T.turn = at('Kamu menoleh ke lemari') - 0.35;          // reverse: the wardrobe, seen from the bed
T.stare = at('Celah gelap');
T.torch = end('Kamu menyalakan senter') - 0.25;
T.step = at('Kamu melangkah pelan');
T.open = end('Kamu melangkah pelan') - 0.75;
T.sweep = at('Tidak ada siapa-siapa');
T.close = at('Kamu menutupnya kembali') + 0.5;
T.torchOff = end('Kamu menutupnya kembali') + 0.45;
T.phone2 = at('Kamu menghela napas') - 0.35;
T.buzz2 = end('Lalu ponselmu bergetar lagi') + 0.1;
T.photo2 = at('Foto kedua') - 0.1;
T.sharp2 = at('Foto kedua') + 1.1;
T.into2 = at('Kali ini, kamu yang ada di foto') - 0.25;
T.full2 = T.into2 + 1.3;
T.fingers = at('bawah ranjang.');
T.callCut = at('Tanganmu gemetar') - 0.3;
T.dial = end('Kamu menekan tombol panggil') - 0.1;
T.tones = ['pertama', 'kedua', 'ketiga'].map((w) => end(`Nada sambung ${w}`) + 0.06);
T.hear = at('Lalu kamu mendengarnya') - 0.3;
T.ringOn = end('Lalu kamu mendengarnya') + 0.08;
T.flinch = at('Kamu tidak berani menunduk') + 0.6;
T.run = at('Kamu berlari keluar kamar') - 0.25;
T.flicker = at('Lampu di ujungnya berkedip') + 0.4;
T.lampOff = end('lalu padam') - 0.15;
T.ringOff = at('Dering itu berhenti') - 0.15;
T.stop = T.ringOff - 0.2;
T.listen = at('Lalu dari kamarmu');
T.doorShut = end('Menutup.') + 0.12;
T.phone3 = T.doorShut + 0.55;
T.photo3 = at('Foto ketiga') - 0.1;
T.sharp3 = at('Foto ketiga') + 1.0;
T.into3 = at('Lorong ini') - 0.2;
T.full3 = T.into3 + 1.2;
T.back = at('Punggungmu');
T.phone4 = at('Kamu berhenti') - 0.35;
T.typing = at('nomor itu sedang mengetik') + 0.3;
T.msg = at('Jangan lihat ke belakang') - 0.15;
T.off = end('Jangan lihat ke belakang') + 0.9;         // screen times out: the reflection
T.title = T.off + 1.1;

// Phone buzzes (the sound is in score.py) and the lamp's dying flicker (on-intervals after T.flicker).
const BUZZ = [[0.0, 0.38], [T.buzz2, 0.45], [T.buzz2 + 0.55, 0.3], [T.phone3, 0.45], [T.phone3 + 0.55, 0.3]];
const FLICK = [[0, 0.12], [0.3, 0.38], [0.7, 1.02], [1.25, 1.3], [1.42, 1.5]];

const C = {
  black: '#030305', wood: '#07080b', wall: '#0b1019', floor: '#07090d',
  paper: '#e8e3da', dim: '#8a93a1', bubble: '#1d2530', mine: '#1f3a33',
  accent: '#d3202a',
};
const DISPLAY = 'Display', UI = 'UI';

// Every visual accent: [beat, label, sfx, opts]. sfx.mjs voices them; buzzes, creaks, rings, steps
// and the lamp are synthesized in score.py from the same cues.
const HITS = [
  [T.wake, 'screen wakes', 'blip', { pitch: 'B5', gain: 0.16 }],
  [T.wake + 0.13, 'notification', 'blip', { pitch: 'E6', gain: 0.13 }],
  [T.chat, 'chat opens', 'tick', { gain: 0.14 }],
  [T.sharp1, 'photo 1 sharp', 'click', { gain: 0.1 }],
  [T.full1 - 0.15, 'into photo 1', 'whoosh', { len: 1.6, from: 160, to: 760, gain: 0.16 }],
  [T.full1, 'room fills frame', 'sub', { len: 1.8, gain: 0.32 }],
  [T.reveal + 1.6, 'dolly out of wardrobe', 'whoosh', { len: 3.2, from: 700, to: 110, gain: 0.12 }],
  [T.turn, 'reverse on the wardrobe', 'sub', { len: 1.2, gain: 0.2 }],
  [T.torch, 'torch on', 'click', { gain: 0.16 }],
  [T.torchOff, 'torch off', 'click', { gain: 0.14 }],
  [T.photo2, 'photo 2 lands', 'blip', { pitch: 'E6', gain: 0.09 }],
  [T.sharp2, 'photo 2 sharp', 'click', { gain: 0.1 }],
  [T.full2 - 0.15, 'into photo 2', 'whoosh', { len: 1.4, from: 160, to: 700, gain: 0.16 }],
  [T.full2, 'under the bed', 'sub', { len: 1.8, gain: 0.34 }],
  [T.dial, 'call', 'tick', { gain: 0.14 }],
  [T.hear, 'cut to the room', 'sub', { len: 1.2, gain: 0.22 }],
  [T.run, 'run', 'whoosh', { len: 0.8, from: 300, to: 900, gain: 0.12 }],
  [T.photo3, 'photo 3 lands', 'blip', { pitch: 'E6', gain: 0.09 }],
  [T.sharp3, 'photo 3 sharp', 'click', { gain: 0.1 }],
  [T.full3 - 0.15, 'into photo 3', 'whoosh', { len: 1.4, from: 160, to: 700, gain: 0.16 }],
  [T.full3, 'behind you', 'sub', { len: 2.0, gain: 0.36 }],
  [T.msg, 'message lands', 'blip', { pitch: 'E6', gain: 0.09 }],
  [T.off, 'screen off', 'click', { gain: 0.12 }],
  [T.title, 'title', 'bell', { pitch: 'D5', gain: 0.07, verb: 0.9 }],
];

// ------------------------------------------------------------------ geometry + camera
// The phone lies centred in the frame at camera zoom 1; its screen has its own local coordinates.
const PH = { x: 210, y: 280, w: 660, h: 1360, r: 74 };
const SCR = { x: PH.x + 22, y: PH.y + 22, w: PH.w - 44, h: PH.h - 44, r: 54 };
const HEAD = 160, FOOT = 112;                       // chat header and input bar (screen local)
const PW = 324, PHH = 576;                           // photo bubbles are 9:16: they fill the frame at Z_FILL
const Z_FILL = W / PW;
const ANCHOR = 658;                                  // screen-local y that sits at world y 960
const PHOTO_CX = SCR.x + 24 + 6 + PW / 2;            // world x of a photo bubble's centre
const L = Math.log;

function camera(ctx, keys, u, ease = E.inOutSine) {
  const [cx, cy, lz] = kf(u, keys, ease);
  const z = Math.exp(lz);
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
  return z;
}
// Zooms into a photo ease in-out cubic, everything else drifts on a sine.
const camEase = (u, into) => (u > into ? E.inOutCubic : E.inOutSine);

// ------------------------------------------------------------------ helpers
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function glow(ctx, x, y, r, color, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function poly(ctx, pts, style) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (style) { ctx.fillStyle = style; ctx.fill(); }
}
function buzzAmp(u) {
  let a = 0;
  for (const [s, len] of BUZZ) a = Math.max(a, prog(u, s, s + 0.03) * (1 - prog(u, s + len - 0.05, s + len)));
  return a;
}
function lampLevel(u) {
  if (u < T.flicker) return 0.55;
  if (u >= T.lampOff) return 0;
  const d = u - T.flicker;
  return FLICK.some(([a, b]) => d >= a && d < b) ? 0.8 : 0.04;
}
// A hanging garment: hook on the rail at (hx, top), swinging by ang (radians) about the hook.
function garment(ctx, hx, top, w, len, ang, fillStyle, rim) {
  ctx.save(); ctx.translate(hx, top); ctx.rotate(ang);
  ctx.strokeStyle = '#05060a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12, 16, 0, 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(w / 2, 72);
  ctx.bezierCurveTo(w / 2 + 6, len * 0.4, w / 2 + 16, len * 0.8, w / 2 + 18, len);
  ctx.bezierCurveTo(w / 4, len + 24, -w / 4, len - 14, -w / 2 - 18, len);
  ctx.bezierCurveTo(-w / 2 - 16, len * 0.8, -w / 2 - 6, len * 0.4, -w / 2, 72); ctx.closePath();
  ctx.fillStyle = fillStyle; ctx.fill();
  if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 5;
  for (let i = 1; i < 4; i++) {
    const x = lerp(-w / 2, w / 2, i / 4);
    ctx.beginPath(); ctx.moveTo(x, 90); ctx.quadraticCurveTo(x + 8, len * 0.6, x * 1.1, len); ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ the room (from inside the wardrobe)
// wz: wardrobe (foreground) zoom, large = doors out of frame. bz: room (background) zoom: parallax.
// o.sleeper: someone asleep in the bed. o.nightPhone: the phone glowing on the nightstand.
// o.ring: a phone ringing under the bed (0..1), o.ringU: its ring clock.
function drawRoom(ctx, u, wz, bz, creak = 0, o = {}) {
  const { sleeper = true, nightPhone = true, ring = 0 } = o;
  ctx.save();
  ctx.translate(540, 1000); ctx.scale(bz, bz); ctx.translate(-540, -1000);
  ctx.fillStyle = vgrad(ctx, -200, 1250, [[0, '#0d1220'], [1, C.wall]]); ctx.fillRect(-400, -400, 1880, 1650);
  ctx.fillStyle = vgrad(ctx, 1250, 2200, [[0, '#0a0d13'], [1, C.floor]]); ctx.fillRect(-400, 1250, 1880, 1100);
  ctx.strokeStyle = 'rgba(150,170,200,0.05)'; ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(540 + i * 60, 1250); ctx.lineTo(540 + i * 330, 2300); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-400, 1244, 1880, 10);

  // window with the moon behind it
  const wx = 140, wy = 400, ww = 380, wh = 650;
  ctx.fillStyle = vgrad(ctx, wy, wy + wh, [[0, '#4d6488'], [0.5, '#2c3c58'], [1, '#1a2438']]);
  ctx.fillRect(wx, wy, ww, wh);
  glow(ctx, 420, 520, 260, 'rgba(190,210,240,0.9)', 0.55);
  ctx.beginPath(); ctx.arc(420, 520, 38, 0, M.TAU); ctx.fillStyle = 'rgba(230,236,245,0.85)'; ctx.fill();
  ctx.fillStyle = '#05070b';
  ctx.fillRect(wx + ww / 2 - 7, wy, 14, wh); ctx.fillRect(wx, wy + wh * 0.42, ww, 14);
  ctx.lineWidth = 18; ctx.strokeStyle = '#06080c'; ctx.strokeRect(wx, wy, ww, wh);
  ctx.fillStyle = '#0a0d14'; ctx.fillRect(wx - 30, wy + wh + 9, ww + 60, 22);

  // moonbeam across the floor and the bed
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const beam = ctx.createLinearGradient(330, 1060, 760, 1800);
  beam.addColorStop(0, 'rgba(159,180,216,0.16)'); beam.addColorStop(1, 'rgba(159,180,216,0)');
  ctx.fillStyle = beam;
  ctx.beginPath(); ctx.moveTo(wx + 10, wy + wh); ctx.lineTo(wx + ww, wy + wh); ctx.lineTo(1000, 1900); ctx.lineTo(430, 1960); ctx.closePath(); ctx.fill();
  ctx.restore();

  // curtains, swaying a little at the hem
  const curtain = (x0, x1, side) => {
    const sway = 10 * noise1(u * 0.35, side === 'l' ? 4 : 7) + 6 * Math.sin(u * 0.8 + (side === 'l' ? 0 : 2));
    ctx.beginPath(); ctx.moveTo(x0, 360);
    for (let i = 0; i <= 12; i++) { const y = 360 + i * 70, f = i / 12; ctx.lineTo(x1 + sway * f * f + 10 * Math.sin(i * 1.7), y); }
    ctx.lineTo(x0 + sway * 0.8, 1200); ctx.closePath();
    ctx.fillStyle = '#0d1320'; ctx.fill();
    ctx.strokeStyle = 'rgba(159,180,216,0.10)'; ctx.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      const fx = lerp(x0, x1, k / 4);
      ctx.beginPath(); ctx.moveTo(fx, 370); ctx.quadraticCurveTo(fx + 6, 800, fx + sway * 0.6 * (k / 4), 1190); ctx.stroke();
    }
  };
  curtain(70, 200, 'l'); curtain(560, 450, 'r');
  ctx.fillStyle = '#05070a'; ctx.fillRect(40, 350, 560, 16);

  // nightstand, with the phone glowing on it while you sleep
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(420, 1170, 140, 170);
  ctx.fillStyle = '#121927'; ctx.fillRect(412, 1160, 156, 16);
  if (nightPhone) {
    const pulse = 0.8 + 0.2 * Math.sin(u * 2.1);
    glow(ctx, 486, 1160, 150, 'rgba(170,200,255,0.9)', 0.32 * pulse);
    ctx.fillStyle = '#d6e4ff'; ctx.fillRect(458, 1150, 56, 10);
  }

  // the bed: headboard, mattress, pillow, and (in the photo) someone asleep under the blanket
  ctx.fillStyle = '#0e131d'; rrect(ctx, 590, 990, 520, 270, 30); ctx.fill();
  ctx.strokeStyle = 'rgba(159,180,216,0.12)'; ctx.lineWidth = 3; ctx.stroke();
  poly(ctx, [[600, 1200], [1120, 1200], [1160, 1620], [450, 1620]], vgrad(ctx, 1200, 1620, [[0, '#1c2536'], [1, '#111724']]));
  ctx.beginPath(); ctx.ellipse(720, 1205, 110, 36, -0.05, 0, M.TAU); ctx.fillStyle = '#2b3549'; ctx.fill();
  if (sleeper) {
    ctx.beginPath(); ctx.ellipse(700, 1190, 54, 40, 0.2, 0, M.TAU); ctx.fillStyle = '#06080c'; ctx.fill();
    const breath = 1 + 0.025 * Math.sin((M.TAU * u) / 4.2);
    ctx.save(); ctx.translate(0, 1420); ctx.scale(1, breath); ctx.translate(0, -1420);
    ctx.beginPath(); ctx.moveTo(560, 1420); ctx.bezierCurveTo(640, 1230, 820, 1215, 920, 1260);
    ctx.bezierCurveTo(1030, 1300, 1120, 1330, 1170, 1420); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 1220, 1420, [[0, '#33405a'], [1, '#18202f']]); ctx.fill();
    ctx.restore();
  } else {
    // the blanket thrown back toward the foot of the bed
    ctx.beginPath(); ctx.moveTo(880, 1300); ctx.bezierCurveTo(960, 1270, 1080, 1290, 1150, 1360);
    ctx.lineTo(1170, 1560); ctx.bezierCurveTo(1060, 1600, 940, 1560, 860, 1520); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 1280, 1560, [[0, '#2c3850'], [1, '#161d2b']]); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(450, 1620, 720, 30);
  ctx.fillStyle = '#080b11'; ctx.fillRect(450, 1650, 720, 260);
  // the dark under the bed: a phone ringing in it, screen up, buzzing against the floorboards
  if (ring > 0) {
    const rt = (u - T.ringOn) % 1.6, on = rt < 1.1 ? 1 : 0.35;
    const jit = rt < 1.1 ? 3 * noise1(u * 120, 71) : 0;
    glow(ctx, 820, 1830, 300, 'rgba(150,185,255,0.9)', 0.42 * ring * on);
    ctx.save(); ctx.globalAlpha = ring;
    ctx.fillStyle = `rgba(214,228,255,${0.55 + 0.45 * on})`; ctx.fillRect(792 + jit, 1846, 64, 8);
    ctx.restore();
  }

  // dust drifting in the moonbeam
  for (let i = 0; i < 46; i++) {
    const bx = lerp(200, 900, hash01(i, 11)), by = lerp(950, 1800, hash01(i, 12));
    const x = bx + 40 * noise1(u * 0.12 + i, 13), y = by + 50 * noise1(u * 0.09 + i * 3, 14) - u * 4;
    const a = 0.25 + 0.35 * (0.5 + 0.5 * noise1(u * 0.6 + i, 15));
    ctx.fillStyle = `rgba(200,215,240,${a * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, 1.6 + hash01(i, 16) * 1.8, 0, M.TAU); ctx.fill();
  }
  ctx.restore();

  if (wz > 5) return;
  // ---- the wardrobe around the camera (foreground)
  ctx.save();
  ctx.translate(540, 960); ctx.scale(wz, wz); ctx.translate(-540, -960);
  const g = 215, lx = 540 - g, rx = 540 + g + creak;
  const door = (x0, x1, edgeX, dir) => {
    ctx.fillStyle = C.wood; ctx.fillRect(x0, -3000, x1 - x0, 8000);
    ctx.strokeStyle = 'rgba(120,130,150,0.035)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = edgeX - dir * (40 + i * 23);
      ctx.beginPath(); ctx.moveTo(x, -400); ctx.bezierCurveTo(x + 6, 400, x - 6, 1200, x + 3, 2400); ctx.stroke();
    }
    const e = ctx.createLinearGradient(edgeX - dir * 26, 0, edgeX, 0);
    e.addColorStop(0, '#07090d'); e.addColorStop(1, '#1d2533');
    ctx.fillStyle = e; ctx.fillRect(Math.min(edgeX, edgeX - dir * 26), -3000, 26, 8000);
    ctx.fillStyle = 'rgba(159,180,216,0.35)'; ctx.fillRect(edgeX - (dir > 0 ? 2 : 0), -3000, 2, 8000);
  };
  door(-3000, lx, lx, 1);
  door(rx, 4000, rx, -1);
  ctx.fillStyle = C.wood; ctx.fillRect(-3000, -3000, 7000, 3000 + 200); ctx.fillRect(-3000, 1680, 7000, 3000);
  ctx.fillStyle = 'rgba(159,180,216,0.12)'; ctx.fillRect(lx, 1680, rx - lx, 3);
  ctx.fillStyle = '#030405'; ctx.fillRect(-3000, 236, 7000, 16);
  ctx.fillStyle = 'rgba(159,180,216,0.14)'; ctx.fillRect(lx, 251, rx - lx, 2);
  const coat = (hookX, l, r, bottom, flare, rimX) => {
    ctx.strokeStyle = '#05060a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hookX, 252); ctx.quadraticCurveTo(hookX + 14, 270, hookX, 300); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hookX, 300); ctx.lineTo(r, 340);
    ctx.bezierCurveTo(r + 6, 600, r + flare, bottom - 200, r + flare, bottom);
    ctx.bezierCurveTo((l + r) / 2, bottom + 30, (l + r) / 2, bottom - 20, l - flare, bottom);
    ctx.bezierCurveTo(l - flare, bottom - 200, l - 6, 600, l, 340); ctx.closePath();
    ctx.fillStyle = '#030305'; ctx.fill();
    ctx.save(); ctx.clip();
    const rim = ctx.createLinearGradient(rimX - 60, 0, rimX, 0);
    rim.addColorStop(0, 'rgba(159,180,216,0)'); rim.addColorStop(1, 'rgba(159,180,216,0.16)');
    ctx.fillStyle = rim; ctx.fillRect(rimX - 60, 300, 60, bottom);
    ctx.restore();
  };
  coat(lx - 70, lx - 200, lx + 36, 1380, 30, lx + 36);
  coat(rx + 90, rx - 18, rx + 210, 920, 12, rx - 18);
  ctx.restore();
}

// ------------------------------------------------------------------ the wardrobe, seen from the bed
// theta: right door angle (0 shut, ~0.42 ajar, >1.57 swung past square). o.stare: a glint in the gap.
// o.blanket: how much of the bed's edge is still in the bottom of frame (1 = sitting up in bed).
const WX0 = 330, WX1 = 870, WXM = 600, WY0 = 300, WY1 = 1520;
function drawWardrobe(ctx, u, theta, o = {}) {
  const { stare = 0, blanket = 1, swing = 0 } = o;
  // back wall, the corner on the left, the floor
  ctx.fillStyle = vgrad(ctx, -200, 1560, [[0, '#090d15'], [1, '#0d121c']]); ctx.fillRect(-800, -800, 2700, 2400);
  poly(ctx, [[-800, -800], [170, 120], [170, 1560], [-800, 2300]], '#0b1019');
  poly(ctx, [[170, 1560], [1900, 1560], [1900, 2800], [-800, 2800], [-800, 2300]], vgrad(ctx, 1560, 2400, [[0, '#090c12'], [1, '#05070a']]));
  ctx.strokeStyle = 'rgba(150,170,200,0.05)'; ctx.lineWidth = 2;
  for (let i = -10; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(600 + i * 70, 1560); ctx.lineTo(600 + i * 300, 2800); ctx.stroke(); }
  ctx.fillStyle = '#06080c'; ctx.fillRect(170, 1530, 1730, 30);
  // moonlight from the window off to the left: a slanted patch on the wall and on the floor
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  poly(ctx, [[175, 520], [300, 560], [300, 1300], [175, 1380]], 'rgba(159,180,216,0.08)');
  poly(ctx, [[200, 1580], [660, 1600], [860, 1950], [260, 1930]], 'rgba(159,180,216,0.10)');
  ctx.restore();

  // wardrobe carcass: side panel, interior, rail and clothes (seen when the right door opens)
  poly(ctx, [[WX0 - 34, WY0 - 30], [WX0, WY0], [WX0, WY1 + 30], [WX0 - 34, WY1 + 48]], '#100c09');
  ctx.fillStyle = '#030305'; ctx.fillRect(WX0, WY0, WX1 - WX0, WY1 - WY0 + 30);
  ctx.fillStyle = '#0a0a0e'; ctx.fillRect(WX0 + 6, 430, WX1 - WX0 - 12, 10);
  const sw = (k) => swing * Math.sin(u * 2.3 + k * 1.7) * Math.exp(-0.25 * k);
  garment(ctx, 640, 440, 150, 760, 0.05 * sw(0), '#15161b', 'rgba(150,160,180,0.04)');
  garment(ctx, 720, 440, 130, 520, 0.07 * sw(1), '#1b1714', 'rgba(150,160,180,0.04)');
  garment(ctx, 800, 440, 120, 880, 0.06 * sw(2), '#111318', 'rgba(150,160,180,0.04)');
  if (stare > 0) {
    // a hanger hook catching light in the gap: there and gone
    const f = stare * (0.6 + 0.4 * noise1(u * 3, 81));
    glow(ctx, WXM + 16, 452, 30, 'rgba(220,230,255,0.9)', 0.5 * f);
    ctx.fillStyle = `rgba(230,236,250,${0.8 * f})`; ctx.beginPath(); ctx.arc(WXM + 16, 452, 2.6, 0, M.TAU); ctx.fill();
  }
  // cornice and plinth
  ctx.fillStyle = '#120e0b'; ctx.fillRect(WX0 - 30, WY0 - 56, WX1 - WX0 + 60, 56);
  ctx.fillStyle = 'rgba(159,180,216,0.10)'; ctx.fillRect(WX0 - 30, WY0 - 4, WX1 - WX0 + 60, 3);
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(WX0 - 12, WY1 + 10, WX1 - WX0 + 24, 30);
  ctx.fillRect(WX0 + 10, WY1 + 40, 26, 22); ctx.fillRect(WX1 - 36, WY1 + 40, 26, 22);
  // the moon from the left catches the wardrobe's front edge and washes its lower corner
  ctx.fillStyle = 'rgba(159,180,216,0.2)'; ctx.fillRect(WX0 - 36, WY0 - 32, 3, WY1 - WY0 + 80);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  poly(ctx, [[WX0, 1100], [WX0 + 260, 1300], [WX0 + 260, WY1 + 10], [WX0, WY1 + 10]], 'rgba(159,180,216,0.05)');
  ctx.restore();

  const panel = (x0, x1, y0, y1) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(159,180,216,0.06)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8);
  };
  // left door, shut
  ctx.fillStyle = vgrad(ctx, WY0, WY1, [[0, '#17120e'], [1, '#0f0c0a']]); ctx.fillRect(WX0, WY0, WXM - WX0, WY1 - WY0 + 10);
  panel(WX0 + 40, WXM - 40, WY0 + 50, 860); panel(WX0 + 40, WXM - 40, 920, WY1 - 50);
  ctx.fillStyle = '#3a3128'; ctx.beginPath(); ctx.arc(WXM - 28, 900, 7, 0, M.TAU); ctx.fill();
  // right door on its hinge at WX1: the free edge swings toward us and grows in perspective
  const w = WX1 - WXM, c = Math.cos(theta), s = Math.sin(theta);
  const xf = WX1 - w * c, grow = 80 * s;
  const face = c >= 0 ? vgrad(ctx, WY0, WY1, [[0, '#17120e'], [1, '#0e0b09']]) : '#0b0907';
  poly(ctx, [[WX1, WY0], [xf, WY0 - grow], [xf, WY1 + 10 + grow], [WX1, WY1 + 10]], face);
  ctx.save(); ctx.globalAlpha = 0.6 * clamp(s); poly(ctx, [[WX1, WY0], [xf, WY0 - grow], [xf, WY1 + 10 + grow], [WX1, WY1 + 10]], '#000'); ctx.restore();
  // the door's edge (its thickness) catches the moon
  const ex = xf - (c >= 0 ? 14 * s : -14 * s);
  poly(ctx, [[xf, WY0 - grow], [ex, WY0 - grow + 4], [ex, WY1 + 6 + grow], [xf, WY1 + 10 + grow]], 'rgba(120,130,155,0.35)');
  if (c > 0.2) {
    ctx.fillStyle = '#3a3128'; ctx.beginPath(); ctx.arc(lerp(WX1, xf, 0.9), 900, 7 + 4 * s, 0, M.TAU); ctx.fill();
  }

  // the edge of your bed in the bottom of frame: you are sitting up in it
  if (blanket > 0) {
    const by = 1640 + (1 - blanket) * 700;
    ctx.beginPath(); ctx.moveTo(-800, by + 60);
    ctx.bezierCurveTo(-200, by - 40, 300, by + 30, 700, by - 10);
    ctx.bezierCurveTo(1100, by - 50, 1500, by + 40, 1900, by);
    ctx.lineTo(1900, 2800); ctx.lineTo(-800, 2800); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, by - 40, by + 400, [[0, '#1b2333'], [1, '#090c12']]); ctx.fill();
    ctx.strokeStyle = 'rgba(159,180,216,0.10)'; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(-200 + k * 380, by + 30); ctx.quadraticCurveTo(-120 + k * 380, by + 200, -260 + k * 400, by + 420); ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ torchlight
// The scene is drawn once into an offscreen canvas, then a brightened copy is shown through a soft
// circle where the phone's light falls. tor = {x, y, r, a} in frame pixels.
let SC_CV, SC_CTX, LIT_CV, LIT_CTX;
function torchlit(ctx, drawScene, tor) {
  if (!tor || tor.a <= 0) { drawScene(ctx); return; }
  const m = ctx.getTransform();
  SC_CTX.setTransform(m); SC_CTX.globalAlpha = 1; drawScene(SC_CTX); SC_CTX.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(SC_CV, 0, 0);
  LIT_CTX.globalCompositeOperation = 'copy';
  LIT_CTX.filter = 'brightness(3.2)'; LIT_CTX.drawImage(SC_CV, 0, 0); LIT_CTX.filter = 'none';
  LIT_CTX.globalCompositeOperation = 'destination-in';
  const g = LIT_CTX.createRadialGradient(tor.x, tor.y, 0, tor.x, tor.y, tor.r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  LIT_CTX.fillStyle = g; LIT_CTX.fillRect(0, 0, W, H);
  LIT_CTX.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = tor.a; ctx.drawImage(LIT_CV, 0, 0); ctx.globalAlpha = 1;
  glow(ctx, tor.x, tor.y, tor.r * 1.4, 'rgba(255,240,215,0.5)', 0.12 * tor.a);
  ctx.restore();
}

// ------------------------------------------------------------------ under the bed (photo 2)
// Camera on the floor under the bed: slats overhead, the blanket's hem, and across the room the
// wardrobe and your own legs, lit by the torch you are holding.
function drawKolong(ctx, u) {
  const HZ = 1000;
  ctx.fillStyle = vgrad(ctx, 300, HZ, [[0, '#0b0f18'], [1, '#0f1520']]); ctx.fillRect(-600, -600, 2280, HZ + 600);
  ctx.fillStyle = vgrad(ctx, HZ, 2600, [[0, '#0d1118'], [1, '#05070a']]); ctx.fillRect(-600, HZ, 2280, 1700);
  ctx.strokeStyle = 'rgba(150,170,200,0.06)'; ctx.lineWidth = 2;
  for (let i = -16; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(540 + i * 16, HZ); ctx.lineTo(540 + i * 190, 2600); ctx.stroke(); }
  for (let k = 0; k < 9; k++) { const y = HZ + 14 * 1.62 ** k; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-600, y, 2280, 2 + k); }
  // the wardrobe across the room, its lower half
  ctx.fillStyle = '#0e0b12'; ctx.fillRect(380, 300, 340, HZ - 290);
  ctx.fillStyle = '#08070a'; ctx.fillRect(548, 300, 4, HZ - 300);
  ctx.fillStyle = '#0a090c'; ctx.fillRect(372, HZ - 8, 356, 16);
  // torchlight thrown on the wardrobe doors and pooled on the floor at your feet
  glow(ctx, 560, 720, 300, 'rgba(255,235,200,0.9)', 0.32);
  glow(ctx, 560, HZ + 40, 260, 'rgba(255,235,200,0.9)', 0.18);
  // your legs, standing at the wardrobe (cut off by the bed frame above)
  const sway = 3 * noise1(u * 0.4, 91);
  ctx.save(); ctx.translate(sway, 0);
  const leg = (x, lean) => {
    poly(ctx, [[x - 34, 300], [x + 34, 300], [x + 30 + lean, HZ + 20], [x - 26 + lean, HZ + 20]], '#07080b');
    ctx.fillStyle = 'rgba(255,235,200,0.10)'; ctx.fillRect(x + 22 + lean * 0.6, 520, 6, HZ - 520);
    ctx.beginPath(); ctx.ellipse(x + 8 + lean, HZ + 30, 46, 16, 0, 0, M.TAU); ctx.fillStyle = '#16151a'; ctx.fill();
  };
  leg(500, -4); leg(615, 6);
  ctx.restore();
  // dust under the bed, close to the lens
  ctx.fillStyle = 'rgba(120,125,135,0.18)';
  [[290, 1420, 34], [840, 1650, 46], [120, 1780, 28]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, M.TAU); ctx.fill(); });
  // overhead: the bed's underside, slats, the frame rail, and the hem of the blanket hanging over it
  poly(ctx, [[-600, -600], [1680, -600], [1680, 520], [-600, 560]], '#030305');
  ctx.fillStyle = 'rgba(120,130,150,0.06)';
  [60, 180, 280, 360, 420, 468].forEach((y, i) => ctx.fillRect(-600, y, 2280, 10 + i * 2));
  ctx.fillStyle = '#07070a'; poly(ctx, [[-600, 520], [1680, 500], [1680, 580], [-600, 610]], '#07070a');
  ctx.fillStyle = 'rgba(159,180,216,0.12)'; poly(ctx, [[-600, 606], [1680, 576], [1680, 580], [-600, 610]], 'rgba(159,180,216,0.12)');
  ctx.beginPath(); ctx.moveTo(760, 575);
  for (let i = 0; i <= 10; i++) { const x = 760 + i * 40; ctx.lineTo(x, 660 + 18 * Math.sin(i * 1.3) + 6 * noise1(u * 0.3 + i, 92)); }
  ctx.lineTo(1680, 680); ctx.lineTo(1680, 575); ctx.closePath(); ctx.fillStyle = '#0d1018'; ctx.fill();
  // the photographer's own fingertips on the floor, bottom left, curled at the very edge of the frame
  ctx.save(); ctx.translate(70, 1930); ctx.rotate(0.5);
  [[0, 150], [54, 185], [108, 172], [158, 128]].forEach(([x, len]) => {
    ctx.save(); ctx.translate(x, 0);
    rrect(ctx, -23, -len, 46, len + 90, 23);
    ctx.fillStyle = vgrad(ctx, -len, 60, [[0, '#4a4950'], [1, '#18171c']]); ctx.fill();
    rrect(ctx, -14, -len + 8, 28, 32, 12); ctx.fillStyle = 'rgba(165,165,175,0.32)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-15, -len * 0.42); ctx.quadraticCurveTo(0, -len * 0.42 + 6, 15, -len * 0.42); ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

// ------------------------------------------------------------------ the hallway (one-point perspective)
// o.z: camera depth along the corridor, o.dx/o.dy: head bob, o.turn: 0..1 starting to look back,
// o.lamp: ceiling lamp at the far end, o.figure: your own back, very close (photo 3).
function drawLorong(ctx, u, o = {}) {
  const { z = 0, dx = 0, dy = 0, turn = 0, lamp = 0, figure = false } = o;
  const f = 760, cx = 540 + dx - 160 * turn, cy = 860 + dy;
  const P = (X, Y, Z) => { const d = Math.max(0.12, Z - z); return [cx + (X * f) / d, cy + (Y * f) / d]; };
  const XW = 0.6, YF = 1.0, YC = -0.62, ZE = 12;
  const near = z + 0.12;
  const quad = (a, b, c, d, style) => poly(ctx, [a, b, c, d], style);
  ctx.save();
  if (turn) { ctx.translate(540, 960); ctx.rotate(0.03 * turn); ctx.translate(-540, -960); }
  fill(ctx, '#030405');
  const lp = P(0, YC + 0.1, 10);
  // end wall, ceiling, floor, side walls
  const wallA = (zz) => clamp(0.25 + 0.75 * lamp * (1 - Math.abs(zz - 10) / 9));
  quad(P(-XW, YC, ZE), P(XW, YC, ZE), P(XW, YF, ZE), P(-XW, YF, ZE), `rgba(44,40,42,${0.45 + 0.55 * lamp})`);
  quad(P(-XW, YC, near), P(XW, YC, near), P(XW, YC, ZE), P(-XW, YC, ZE), '#0c0c10');
  quad(P(-XW, YF, near), P(XW, YF, near), P(XW, YF, ZE), P(-XW, YF, ZE), vgrad(ctx, cy, H, [[0, '#15141a'], [1, '#0b0b0e']]));
  quad(P(-XW, YC, near), P(-XW, YC, ZE), P(-XW, YF, ZE), P(-XW, YF, near), '#18171d');
  quad(P(XW, YC, near), P(XW, YC, ZE), P(XW, YF, ZE), P(XW, YF, near), '#141319');
  // wallpaper: faint vertical stripes along both walls
  ctx.strokeStyle = 'rgba(160,150,140,0.035)'; ctx.lineWidth = 2;
  for (let zz = Math.ceil((near + 0.1) * 5) / 5; zz < ZE; zz += 0.2) {
    for (const s of [-1, 1]) { const a = P(s * XW, YC, zz), b = P(s * XW, YF - 0.1, zz); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  }
  // lamp light pooling down the corridor
  if (lamp > 0) {
    const pool = P(0, YF, 9.4);
    glow(ctx, lp[0], lp[1], 1500 / Math.max(1, 10 - z), 'rgba(255,214,160,0.9)', 0.7 * lamp);
    glow(ctx, pool[0], pool[1], 1700 / Math.max(1, 9.4 - z), 'rgba(255,214,160,0.8)', 0.5 * lamp);
  }
  // moonlight through a window on the left wall near the end: the only light once the lamp dies
  const wa = P(-XW, -0.35, 8.8), wb = P(-XW, 0.25, 9.6);
  quad(P(-XW, -0.35, 8.8), P(-XW, -0.35, 9.6), P(-XW, 0.25, 9.6), P(-XW, 0.25, 8.8), 'rgba(110,135,180,0.55)');
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  quad(P(-XW, YF, 8.9), P(-0.1, YF, 9.4), P(0.15, YF, 10.4), P(-XW, YF, 10.1), 'rgba(110,135,180,0.18)');
  ctx.restore();
  glow(ctx, (wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, 160, 'rgba(140,165,210,0.8)', 0.18);
  // floorboards and skirting
  ctx.strokeStyle = 'rgba(150,160,180,0.05)'; ctx.lineWidth = 2;
  for (let i = -5; i <= 5; i++) { const a = P(i * 0.11, YF, near), b = P(i * 0.11, YF, ZE); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  for (const s of [-1, 1]) {
    const a = P(s * XW, YF - 0.08, near), b = P(s * XW, YF - 0.08, ZE);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  // doors along the walls (one left ajar, black inside), and a picture frame
  const door = (s, z0, z1, ajar) => {
    if (z1 < near) return;
    const za = Math.max(z0, near);
    quad(P(s * XW, -0.32, za), P(s * XW, -0.32, z1), P(s * XW, YF, z1), P(s * XW, YF, za), ajar ? '#020203' : '#141118');
    ctx.strokeStyle = `rgba(150,140,130,${0.08 + 0.12 * wallA(z0)})`; ctx.lineWidth = 3;
    ctx.beginPath(); [P(s * XW, YF, za), P(s * XW, -0.32, za), P(s * XW, -0.32, z1), P(s * XW, YF, z1)].forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
  };
  door(-1, 3.0, 3.9, false); door(1, 5.0, 5.9, true); door(-1, 6.6, 7.4, false);
  if (2.9 > near) quad(P(XW, -0.3, 2.2), P(XW, -0.3, 2.9), P(XW, 0.1, 2.9), P(XW, 0.1, 2.2), '#08070a');
  // the lamp itself
  const lt = P(0, YC, 10), lb = P(0, YC + 0.08, 10);
  ctx.strokeStyle = '#030304'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...lt); ctx.lineTo(...lb); ctx.stroke();
  ctx.beginPath(); ctx.arc(lp[0], lp[1], 60 / Math.max(1, 10 - z), 0, M.TAU);
  ctx.fillStyle = lamp > 0.1 ? `rgba(255,230,190,${0.5 + 0.5 * lamp})` : '#141416'; ctx.fill();
  // darkness thickens toward the camera when the lamp is out
  const fog = ctx.createRadialGradient(cx, cy, 80, cx, cy, 1300);
  fog.addColorStop(0, 'rgba(0,0,0,0)'); fog.addColorStop(1, `rgba(0,0,0,${0.45 - 0.3 * lamp})`);
  ctx.fillStyle = fog; ctx.fillRect(-200, -200, W + 400, H + 400);

  if (figure) {
    // your back, a step in front of the lens: messy hair, ears, neck, shoulders, the phone's glow
    // spilling round your head from the front
    ctx.save(); ctx.translate(560, 1300);
    glow(ctx, 0, -90, 480, 'rgba(150,185,255,0.8)', 0.26);
    ctx.fillStyle = '#010102';
    ctx.beginPath(); ctx.moveTo(-640, 900); ctx.bezierCurveTo(-620, 260, -420, 150, -90, 122);
    ctx.lineTo(90, 116); ctx.bezierCurveTo(420, 130, 600, 230, 640, 900); ctx.closePath(); ctx.fill();
    ctx.fillRect(-72, -20, 144, 170);
    [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * 122, -112, 22, 40, s * 0.2, 0, M.TAU); ctx.fill(); });
    ctx.filter = 'blur(3px)';
    const head = new Path2D();
    for (let k = 0; k <= 72; k++) {
      const a = Math.PI + (k / 72) * Math.PI, tuft = 6 + 9 * hash01(k, 95) * (0.6 + 0.4 * Math.sin(k * 0.7));
      const x = Math.cos(a) * (128 + tuft), y = -130 + Math.sin(a) * (160 + tuft);
      k ? head.lineTo(x, y) : head.moveTo(x, y);
    }
    head.ellipse(0, -130, 128, 160, 0, 0, Math.PI);
    ctx.fill(head);
    ctx.strokeStyle = 'rgba(150,185,255,0.28)'; ctx.lineWidth = 3; ctx.stroke(head);
    ctx.beginPath(); ctx.moveTo(-620, 600); ctx.bezierCurveTo(-590, 250, -420, 156, -110, 124); ctx.stroke();
    ctx.filter = 'none';
    ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ the phone
function drawSurface(ctx, lum) {
  fill(ctx, C.black);
  ctx.save();
  ctx.fillStyle = '#0a0b0e'; ctx.fillRect(-2000, -2000, 5000, 6000);
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 3;
  for (let i = 0; i < 70; i++) {
    const y = -400 + i * 42 + 10 * hash01(i, 21);
    ctx.beginPath(); ctx.moveTo(-600, y); ctx.bezierCurveTo(200, y + 20 * hash01(i, 22), 900, y - 14, 1700, y + 8); ctx.stroke();
  }
  ctx.restore();
  glow(ctx, 540, 960, 1150, 'rgba(120,150,210,0.8)', 0.55 * lum);
}
function phoneBody(ctx) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  rrect(ctx, PH.x, PH.y, PH.w, PH.h, PH.r); ctx.fillStyle = '#101216'; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(180,195,220,0.18)'; ctx.lineWidth = 3; rrect(ctx, PH.x + 2, PH.y + 2, PH.w - 4, PH.h - 4, PH.r - 2); ctx.stroke();
}
function statusBar(ctx, clock) {
  text(ctx, clock, 40, 52, font(26, 600, UI), C.paper);
  ctx.fillStyle = C.paper;
  rrect(ctx, SCR.w - 84, 32, 44, 22, 5); ctx.fill();
  ctx.fillRect(SCR.w - 38, 39, 4, 8);
  for (let i = 0; i < 4; i++) ctx.fillRect(SCR.w - 150 + i * 11, 52 - (i + 1) * 5, 7, (i + 1) * 5);
}
function avatar(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.fillStyle = '#2a313c'; ctx.fill();
  text(ctx, 'R', x, y + r * 0.36, font(r * 1.05, 600, UI), '#8b95a5', 'center');
}
function drawCameraGlyph(ctx, x, y, color) {
  ctx.fillStyle = color; rrect(ctx, x, y + 4, 32, 22, 5); ctx.fill(); ctx.fillRect(x + 9, y, 13, 6);
  ctx.beginPath(); ctx.arc(x + 16, y + 15, 6, 0, M.TAU); ctx.fillStyle = '#262e3c'; ctx.fill();
}
const clockAt = (u) => (u < T.phone2 ? '00.00' : u < T.phone3 ? '00.02' : '00.03');

function lockScreen(ctx, u) {
  ctx.fillStyle = vgrad(ctx, 0, SCR.h, [[0, '#121a2b'], [1, '#05070b']]); ctx.fillRect(0, 0, SCR.w, SCR.h);
  statusBar(ctx, '00.00');
  text(ctx, '00.00', SCR.w / 2, 330, font(168, 400, UI), C.paper, 'center', -4);
  text(ctx, 'Minggu, 1 November', SCR.w / 2, 392, font(32, 400, UI), C.dim, 'center');
  const k = springU(u, T.wake + 0.13, SPRING.gentle);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.4);
  ctx.translate(0, (1 - k) * -140);
  rrect(ctx, 24, 470, SCR.w - 48, 200, 34); ctx.fillStyle = 'rgba(38,46,60,0.92)'; ctx.fill();
  avatar(ctx, 80, 540, 30);
  text(ctx, 'Pesan  ·  sekarang', 126, 532, font(24, 400, UI), C.dim);
  text(ctx, 'Raka', 126, 572, font(36, 600, UI), C.paper);
  drawCameraGlyph(ctx, 54, 614, C.dim);
  text(ctx, 'Foto', 98, 636, font(29, 400, UI), C.dim);
  ctx.restore();
}

// ---- the conversation: one chat for the whole film; items with `from` arrive during it
const CHAT = [
  { kind: 'chip', text: 'SABTU, 19 OKTOBER 2024' },
  { kind: 'msg', side: 'L', text: 'Udah di depan rumahmu nih', time: '21.12' },
  { kind: 'msg', side: 'L', text: 'Kuncinya masih di bawah pot kan?', time: '21.12' },
  { kind: 'msg', side: 'R', text: 'Iya. Masuk aja, aku masih di jalan', time: '21.15', tick: 2 },
  { kind: 'msg', side: 'L', text: 'Aku di kamarmu.', time: '21.47', id: 'last1' },
  { kind: 'msg', side: 'L', text: 'Cepat pulang.', time: '21.47', id: 'last2' },
  { kind: 'msg', side: 'R', text: 'Rak?', time: '22.31', tick: 1 },
  { kind: 'msg', side: 'R', text: 'Kamu di mana?', time: '22.32', tick: 1 },
  { kind: 'msg', side: 'R', text: 'Angkat teleponnya', time: '22.40', tick: 1 },
  { kind: 'msg', side: 'R', text: 'Raka??', time: '23.58', tick: 1, id: 'unread' },
  { kind: 'chip', text: 'HARI INI', id: 'today' },
  { kind: 'photo', id: 'p1', img: 'kamar', time: '00.00', load: T.photo1, sharp: T.sharp1, into: T.into1, full: T.full1 },
  { kind: 'photo', id: 'p2', img: 'kolong', time: '00.02', from: T.photo2, load: T.photo2, sharp: T.sharp2, into: T.into2, full: T.full2 },
  { kind: 'photo', id: 'p3', img: 'lorong', time: '00.03', from: T.photo3, load: T.photo3, sharp: T.sharp3, into: T.into3, full: T.full3 },
  { kind: 'typing', id: 'typing', from: T.typing, to: T.msg },
  { kind: 'msg', side: 'L', text: 'Jangan lihat ke belakang.', time: '00.03', id: 'final', from: T.msg, slot: 'typing' },
];
const MSG_F = font(29, 400, UI), TIME_F = font(18, 400, UI);
let CL = null;
function chatLayout(ctx) {
  if (CL) return CL;
  const byId = {};
  let y = 24, prev = null;
  const items = CHAT.map((it) => {
    const L = { ...it };
    if (it.kind === 'chip') {
      y += prev ? 26 : 0; L.y = y; L.h = 44; y += 44 + 18;
    } else if (it.kind === 'msg') {
      L.lines = wrap(ctx, it.text, MSG_F, 380);
      ctx.font = MSG_F;
      const tw = Math.max(...L.lines.map((l) => ctx.measureText(l).width));
      L.w = tw + 44 + (it.tick ? 104 : 76); L.h = L.lines.length * 40 + 34;
      L.x = it.side === 'L' ? 24 : SCR.w - 24 - L.w;
      if (it.slot) L.y = byId[it.slot].y;
      else { y += prev && prev.kind === 'msg' && prev.side === it.side ? 8 : 18; L.y = y; }
      y = L.y + L.h;
    } else if (it.kind === 'photo') {
      y += 18; L.y = y; L.x = 24; L.w = PW + 12; L.h = PHH + 12; y += L.h;
    } else if (it.kind === 'typing') {
      y += 18; L.y = y; L.x = 24; L.w = 140; L.h = 76;
    }
    if (L.id) byId[L.id] = L;
    prev = L;
    return L;
  });
  CL = { items, byId };
  return CL;
}
// scroll that puts an item's centre at a screen-local y (ANCHOR sits at world y 960 on the phone camera)
const toAnchor = (id, a = ANCHOR) => HEAD + CL.byId[id].y + CL.byId[id].h / 2 - a;
let SCROLL = null;
function scrollAt(u) {
  if (!SCROLL) {
    SCROLL = [
      [0, toAnchor('last2', 600)], [T.lastMsg + 1.5, toAnchor('last2', 600)],
      [T.unread, toAnchor('unread', 760)], [T.unread + 3, toAnchor('unread', 760)],
      [T.today + 0.2, toAnchor('p1')], [T.phone2, toAnchor('p1')],
      [T.photo2 + 0.1, toAnchor('p1')], [T.photo2 + 1.0, toAnchor('p2')],
      [T.phone3, toAnchor('p2')], [T.photo3 + 0.1, toAnchor('p2')], [T.photo3 + 1.0, toAnchor('p3')],
      [T.phone4, toAnchor('p3', 420)], [T.typing - 0.6, toAnchor('p3', 420)], [T.typing, toAnchor('typing', 700)],
    ];
  }
  return kf(u, SCROLL, E.inOutCubic);
}

function bubbleMsg(ctx, L, u, hi = 0) {
  const k = L.from ? springU(u, L.from, SPRING.snappy) : 1;
  if (k <= 0) return;
  ctx.save();
  ctx.translate(L.x, L.y + L.h); ctx.scale(lerp(0.9, 1, k), lerp(0.9, 1, k)); ctx.translate(0, -L.h);
  ctx.globalAlpha *= clamp(k * 1.5);
  rrect(ctx, 0, 0, L.w, L.h, 24); ctx.fillStyle = L.side === 'L' ? C.bubble : C.mine; ctx.fill();
  if (hi > 0) { ctx.strokeStyle = `rgba(232,227,218,${0.5 * hi})`; ctx.lineWidth = 3; ctx.stroke(); }
  L.lines.forEach((line, i) => text(ctx, line, 22, 46 + i * 40, MSG_F, C.paper));
  const tx = L.w - (L.tick ? 48 : 18);
  text(ctx, L.time, tx, L.h - 14, TIME_F, C.dim, 'right');
  if (L.tick) {
    ctx.strokeStyle = L.tick === 2 ? '#5fb8e8' : C.dim; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let j = 0; j < L.tick; j++) {
      const ox = L.w - 40 + j * 9;
      ctx.beginPath(); ctx.moveTo(ox, L.h - 22); ctx.lineTo(ox + 5, L.h - 17); ctx.lineTo(ox + 14, L.h - 28); ctx.stroke();
    }
  }
  ctx.restore();
}

function bubblePhoto(ctx, L, u) {
  const k = L.from ? springU(u, L.from, SPRING.snappy) : 1;
  if (k <= 0) return;
  const px = L.x + 6, py = L.y + 6;
  ctx.save();
  ctx.translate(L.x, L.y + L.h); ctx.scale(lerp(0.92, 1, k), lerp(0.92, 1, k)); ctx.translate(-L.x, -(L.y + L.h));
  ctx.globalAlpha *= clamp(k * 1.5);
  rrect(ctx, L.x, L.y, L.w, L.h, 24); ctx.fillStyle = C.bubble; ctx.fill();
  const rad = 18 * (1 - E.inQuad(prog(u, L.into, L.full)));
  ctx.save(); rrect(ctx, px, py, PW, PHH, rad); ctx.clip();
  const b = 22 * (1 - E.inOutCubic(prog(u, L.load + 0.3, L.sharp)));
  if (b > 0.3) ctx.filter = `blur(${b.toFixed(1)}px)`;
  ctx.drawImage(PHOTOS[L.img], px, py, PW, PHH);
  ctx.filter = 'none';
  ctx.restore();
  if (u < L.sharp + 0.2) {
    // download ring: an arrow before the download starts, then the ring filling
    const cx = px + PW / 2, cy = py + PHH / 2, a = 1 - prog(u, L.sharp, L.sharp + 0.2);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, M.TAU); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(232,227,218,0.25)'; ctx.stroke();
    if (u >= L.load) {
      const p = prog(u, L.load + 0.25, L.sharp);
      ctx.beginPath(); ctx.arc(cx, cy, 44, -Math.PI / 2, -Math.PI / 2 + M.TAU * E.outCubic(p)); ctx.strokeStyle = C.paper; ctx.stroke();
    } else {
      ctx.strokeStyle = C.paper; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 16); ctx.moveTo(cx - 14, cy + 3); ctx.lineTo(cx, cy + 17); ctx.lineTo(cx + 14, cy + 3); ctx.stroke();
    }
    ctx.restore();
  }
  text(ctx, L.time, px + PW - 14, py + PHH - 16, font(22, 400, UI), 'rgba(232,227,218,0.85)', 'right');
  ctx.restore();
}

function chatScreen(ctx, u) {
  const cl = chatLayout(ctx);
  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0, 0, SCR.w, SCR.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HEAD, SCR.w, SCR.h - HEAD - FOOT); ctx.clip();
  ctx.translate(0, HEAD - scrollAt(u));
  const hi = clamp((u - T.lastMsg + 0.2) / 0.4) * (1 - prog(u, T.unread, T.unread + 1));
  for (const L of cl.items) {
    if (L.from && u < L.from) continue;
    if (L.kind === 'chip') {
      ctx.font = font(21, 600, UI); const w = ctx.measureText(L.text).width + 40;
      rrect(ctx, (SCR.w - w) / 2, L.y, w, L.h, 14); ctx.fillStyle = '#18202a'; ctx.fill();
      text(ctx, L.text, SCR.w / 2, L.y + 30, font(21, 600, UI), C.dim, 'center', 1);
    } else if (L.kind === 'msg') {
      bubbleMsg(ctx, L, u, L.id === 'last1' || L.id === 'last2' ? hi : 0);
    } else if (L.kind === 'photo') {
      bubblePhoto(ctx, L, u);
    } else if (L.kind === 'typing' && u < L.to) {
      const k = springU(u, L.from, SPRING.snappy);
      ctx.save(); ctx.translate(L.x, L.y); ctx.scale(lerp(0.85, 1, k), lerp(0.85, 1, k)); ctx.globalAlpha *= clamp(k * 1.5);
      rrect(ctx, 0, 0, L.w, L.h, 30); ctx.fillStyle = C.bubble; ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ph = 0.5 + 0.5 * Math.sin(u * 7 - i * 0.9);
        ctx.beginPath(); ctx.arc(38 + i * 32, 38 - ph * 6, 8, 0, M.TAU); ctx.fillStyle = `rgba(232,227,218,${0.35 + 0.5 * ph})`; ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
  // input bar
  ctx.fillStyle = '#121821'; ctx.fillRect(0, SCR.h - FOOT, SCR.w, FOOT);
  rrect(ctx, 22, SCR.h - FOOT + 20, SCR.w - 120, 62, 31); ctx.fillStyle = '#1c242f'; ctx.fill();
  text(ctx, 'Ketik pesan', 54, SCR.h - FOOT + 60, font(26, 400, UI), '#5c6573');
  ctx.beginPath(); ctx.arc(SCR.w - 54, SCR.h - FOOT + 51, 31, 0, M.TAU); ctx.fillStyle = '#2a3a35'; ctx.fill();
  // header on top
  ctx.fillStyle = '#151b24'; ctx.fillRect(0, 0, SCR.w, HEAD);
  statusBar(ctx, clockAt(u));
  ctx.strokeStyle = C.paper; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(48, 100); ctx.lineTo(34, 114); ctx.lineTo(48, 128); ctx.stroke();
  avatar(ctx, 106, 114, 32);
  text(ctx, 'Raka', 154, 108, font(30, 600, UI), C.paper);
  const online = [T.photo2, T.photo3].some((p) => u > p - 1.6 && u < p + 2.2);
  const status = u >= T.typing && u < T.msg + 0.4 ? 'sedang mengetik...' : online ? 'online' : 'terakhir dilihat 2 tahun lalu';
  text(ctx, status, 154, 140, font(23, 400, UI), status === 'terakhir dilihat 2 tahun lalu' ? C.dim : C.paper);
}

function callScreen(ctx, u) {
  ctx.fillStyle = vgrad(ctx, 0, SCR.h, [[0, '#17202c'], [1, '#06080b']]); ctx.fillRect(0, 0, SCR.w, SCR.h);
  statusBar(ctx, clockAt(u));
  text(ctx, 'Panggilan suara', SCR.w / 2, 230, font(24, 400, UI), C.dim, 'center');
  text(ctx, 'Raka', SCR.w / 2, 318, font(64, 600, UI), C.paper, 'center');
  text(ctx, u < T.tones[0] - 0.1 ? 'Memanggil...' : 'Berdering...', SCR.w / 2, 370, font(28, 400, UI), C.dim, 'center');
  for (const tk of T.tones) {
    const p = prog(u, tk, tk + 1.7);
    if (p > 0 && p < 1) {
      ctx.beginPath(); ctx.arc(SCR.w / 2, 640, 130 + 230 * E.outCubic(p), 0, M.TAU);
      ctx.strokeStyle = `rgba(232,227,218,${0.3 * (1 - p)})`; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  avatar(ctx, SCR.w / 2, 640, 130);
  [[148, '#232b36'], [468, '#232b36']].forEach(([x, c]) => { ctx.beginPath(); ctx.arc(x, 1040, 50, 0, M.TAU); ctx.fillStyle = c; ctx.fill(); });
  ctx.strokeStyle = C.paper; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(130, 1030); ctx.lineTo(142, 1030); ctx.lineTo(158, 1016); ctx.lineTo(158, 1064); ctx.lineTo(142, 1050); ctx.lineTo(130, 1050); ctx.closePath(); ctx.stroke();
  rrect(ctx, 458, 1012, 20, 36, 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(468, 1040, 20, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(SCR.w / 2, 1170, 60, 0, M.TAU); ctx.fillStyle = '#c8302f'; ctx.fill();
  ctx.save(); ctx.translate(SCR.w / 2, 1172); ctx.rotate(2.36);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, 24, -0.9, 0.9); ctx.stroke();
  ctx.restore();
}

function drawPhone(ctx, u, mode) {
  phoneBody(ctx);
  ctx.save();
  ctx.translate(SCR.x, SCR.y);
  rrect(ctx, 0, 0, SCR.w, SCR.h, SCR.r); ctx.clip();
  if (mode === 'lock') {
    // the screen dims while you stare at the name, and wakes when you tap it
    const dim = 0.6 * prog(u, at('Kamu sudah lama') - 0.3, at('Kamu sudah lama') + 0.6) * (1 - prog(u, T.chat - 0.35, T.chat - 0.2));
    const lum = E.outCubic(prog(u, T.wake, T.wake + 0.35)) * (1 - dim);
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, SCR.w, SCR.h);
    ctx.globalAlpha = lerp(0.16, 1, lum);
    lockScreen(ctx, u);
    ctx.globalAlpha = 1;
  } else if (mode === 'open') {
    const k = E.outCubic(prog(u, T.chat, T.chat + 0.45));
    chatScreen(ctx, u);
    if (k < 1) { ctx.save(); ctx.globalAlpha = 1 - k; lockScreen(ctx, u); ctx.restore(); }
  } else if (mode === 'chat') {
    chatScreen(ctx, u);
  } else if (mode === 'call') {
    const k = E.outCubic(prog(u, T.dial, T.dial + 0.35));
    chatScreen(ctx, u);
    ctx.save(); ctx.globalAlpha = k; callScreen(ctx, u); ctx.restore();
  } else if (mode === 'off') {
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, SCR.w, SCR.h);
    reflection(ctx, u);
  }
  ctx.restore();
}

// The dead screen is a black mirror: someone standing over your shoulder, there and barely there.
function reflection(ctx, u) {
  const a = E.inOutSine(prog(u, T.off + 0.05, T.off + 0.7)) * (0.9 + 0.1 * noise1(u * 9, 31));
  const sheen = ctx.createLinearGradient(0, 0, SCR.w, SCR.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, SCR.w, SCR.h);
  if (a <= 0) return;
  const grow = 1 + 0.05 * E.inOutSine(prog(u, T.off, T.title));
  ctx.save();
  ctx.globalAlpha = a;
  const back = ctx.createRadialGradient(260, 470, 20, 260, 520, 470);
  back.addColorStop(0, 'rgba(150,162,180,0.27)'); back.addColorStop(1, 'rgba(150,162,180,0)');
  ctx.fillStyle = back; ctx.fillRect(0, 0, SCR.w, SCR.h);
  ctx.translate(380, 600); ctx.scale(grow, grow); ctx.rotate(0.1);
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = 'rgba(1,1,2,0.94)';
  ctx.beginPath(); ctx.ellipse(0, -60, 54, 70, 0, 0, M.TAU); ctx.fill();
  ctx.fillRect(-22, 0, 44, 60);
  ctx.beginPath(); ctx.moveTo(-260, 900); ctx.bezierCurveTo(-250, 180, -170, 70, 0, 58);
  ctx.bezierCurveTo(170, 70, 250, 180, 260, 900); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-58, -80); ctx.bezierCurveTo(-74, 40, -70, 200, -92, 330);
  ctx.lineTo(92, 330); ctx.bezierCurveTo(70, 200, 74, 40, 58, -80); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ supers
function wrap(ctx, str, f, maxW) {
  ctx.font = f;
  const lines = []; let cur = '';
  for (const w of str.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function scrim(ctx, y0, y1, a) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(3,3,5,0)'); g.addColorStop(0.3, `rgba(3,3,5,${a})`);
  g.addColorStop(0.72, `rgba(3,3,5,${a})`); g.addColorStop(1, 'rgba(3,3,5,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
}
// A story super: glyphs rise into place like a failing light catching, then hold; they gutter out on exit.
function superText(ctx, u, str, uIn, uOut) {
  if (u < uIn || u > uOut + 0.6) return;
  const s = FORMAT.safe, size = 78, lh = 92;
  const f = font(size, 400, DISPLAY);
  const lines = wrap(ctx, str, f, s.w);
  const base = s.y + s.h - 40 - (lines.length - 1) * lh;
  const ex = prog(u, uOut, uOut + 0.5);
  ctx.save();
  scrim(ctx, base - size - 160, base + (lines.length - 1) * lh + 220, 0.72 * (1 - ex) * clamp((u - uIn) / 0.4));
  let j = 0;
  lines.forEach((line, li) => {
    const Lt = layout(ctx, line, f, 0);
    Lt.glyphs.forEach((g) => {
      const d = uIn + j * 0.022;
      const p = E.outQuint(prog(u, d, d + 1.1));
      j++;
      if (p <= 0) return;
      const settle = p >= 0.999 ? 1 : (hash01(Math.floor(u * 24) * 31 + j, 41) > 0.3 ? 1 : 0.25);
      const out = ex > 0 ? (hash01(Math.floor(u * 24) * 17 + j, 43) > ex ? 1 - ex * 0.6 : 0) : 1;
      ctx.globalAlpha = p * settle * out;
      glyph(ctx, g.ch, s.x + g.cx, base + li * lh + (1 - p) * 26, f, C.paper);
    });
  });
  ctx.restore();
}
// [scene, cue sentence, seconds on screen]: each scene's teks_layar lands on the line it echoes.
const SUPERS = [
  ['kunci', 'Dari nomor yang sudah dua tahun', 3.6],
  ['riwayat', 'Pesan terakhir Raka', 2.4],
  ['foto1', 'Isinya cuma satu foto', 2.6],
  ['dari_lemari', 'Dari dalam lemari', 3.4],
  ['lemari', 'Persis seperti di foto', 2.8],
  ['senter', 'Tidak ada siapa-siapa', 2.0],
  ['foto2', 'Foto kedua', 1.8],
  ['kolong', 'Diambil beberapa detik', 3.4],
  ['panggil', 'Nada sambung pertama', 2.4],
  ['dering', 'Dari bawah ranjangmu', 2.2],
  ['lorong', 'Rumah kembali sunyi', 2.4],
  ['foto3', 'Diambil dari jarak', 3.0],
  ['mengetik', 'nomor itu sedang mengetik', 2.4],
].map(([sc, cue, len]) => [SCN(sc).teks_layar, at(cue), at(cue) + len]);

// The last line: red, word by word, each word rising out from behind its own baseline.
const WORDS = [['Jangan', 0], ['lihat', 0.26], ['ke', 0.5], ['belakang.', 0.62]];
function finalLine(ctx, u) {
  const k0 = at('Jangan lihat ke belakang');
  if (u < k0 - 0.05 || u >= T.off) return;
  const s = FORMAT.safe, size = 128, f = font(size, 400, DISPLAY);
  const rows = [[WORDS[0], WORDS[1]], [WORDS[2], WORDS[3]]];
  const top = s.y + 120;
  ctx.save();
  scrim(ctx, top - 160, top + 2 * 150 + 220, 0.75 * clamp((u - k0 + 0.05) / 0.3));
  ctx.restore();
  rows.forEach((row, ri) => {
    const base = top + 130 + ri * 150;
    let x = s.x;
    row.forEach(([w, d]) => {
      const Lw = layout(ctx, w, f, -2);
      const k = springU(u, k0 + d, SPRING.gentle);
      if (k > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 10, base - size - 20, Lw.width + 40, size + 20 + Lw.desc + 6); ctx.clip();
        text(ctx, w, x, base + (1 - k) * (size + 30), f, C.accent, 'left', -2);
        ctx.restore();
      }
      x += Lw.width + size * 0.28;
    });
  });
}
function titleCard(ctx, u) {
  fill(ctx, C.black);
  const s = FORMAT.safe, size = 112, f = font(size, 400, DISPLAY);
  ['Pesan dari', 'Nomor Lama'].forEach((line, li) => {
    const Lt = layout(ctx, line, f, -1);
    const base = s.y + s.h * 0.5 + li * 128;
    Lt.glyphs.forEach((g, j) => {
      const p = E.outQuint(prog(u, T.title + 0.05 + li * 0.12 + j * 0.018, T.title + 0.75 + li * 0.12 + j * 0.018));
      if (p <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, base - size, W, size + Lt.desc + 4); ctx.clip();
      glyph(ctx, g.ch, s.x + g.cx, base + (1 - p) * (size * 0.9), f, C.paper);
      ctx.restore();
    });
  });
  const lp = E.outQuint(prog(u, T.title + 0.4, T.title + 1.0));
  ctx.fillStyle = C.accent; ctx.fillRect(s.x, s.y + s.h * 0.5 + 128 + 54, 140 * lp, 4);
}

// ------------------------------------------------------------------ shots
// Phone shots: [t, [cx, cy, ln zoom]]. Each ends on Z_FILL over a photo bubble when it cuts into one.
const PHONE_CAM = {
  A: [
    [0, [540, 960, L(1.0)]], [at('Dari nomor yang sudah dua') - 0.3, [540, 905, L(1.28)]],
    [at('Nomor Raka') - 0.2, [430, 868, L(2.3)]], [at('Sahabatmu') + 0.3, [440, 880, L(2.2)]],
    [at('Kamu sudah lama') + 1.0, [540, 940, L(1.12)]], [T.chat - 0.3, [540, 930, L(1.2)]],
    [T.chat + 0.9, [540, 960, L(1.5)]], [T.into1, [530, 960, L(1.56)]], [T.full1, [PHOTO_CX, 960, L(Z_FILL)]],
  ],
  B: [
    [T.phone2, [540, 960, L(1.5)]], [T.buzz2 - 0.3, [470, 990, L(1.75)]], [T.photo2 + 0.5, [540, 960, L(1.55)]],
    [T.into2, [530, 960, L(1.58)]], [T.full2, [PHOTO_CX, 960, L(Z_FILL)]],
  ],
  C: [[T.callCut, [540, 960, L(1.56)]], [T.dial, [540, 960, L(1.6)]], [T.dial + 0.6, [540, 900, L(1.32)]], [T.hear, [540, 880, L(1.4)]]],
  D: [[T.phone3, [540, 960, L(1.5)]], [T.into3, [530, 960, L(1.58)]], [T.full3, [PHOTO_CX, 960, L(Z_FILL)]]],
  E: [[T.phone4, [540, 960, L(1.5)]], [T.typing, [500, 1000, L(1.62)]], [T.msg, [500, 1010, L(1.8)]], [T.title, [500, 980, L(2.0)]]],
};
function phoneShot(ctx, u, keys, into, mode, tremble = 0) {
  ctx.save();
  camera(ctx, keys, u, camEase(u, into));
  const b = buzzAmp(u);
  if (b > 0) {
    ctx.translate(540, 960); ctx.rotate(0.006 * b * noise1(u * 90, 51)); ctx.translate(-540, -960);
    ctx.translate(7 * b * noise1(u * 140, 52), 7 * b * noise1(u * 140, 53));
  }
  if (tremble > 0) ctx.translate(4 * tremble * noise1(u * 30, 56), 4 * tremble * noise1(u * 30, 57));
  const lum = mode === 'lock' ? E.outCubic(prog(u, T.wake, T.wake + 0.35)) : mode === 'off' ? 0.03 : 1;
  drawSurface(ctx, lerp(0.06, 0.85, lum));
  drawPhone(ctx, u, mode);
  ctx.restore();
}

const PHOTOS = {};
M.film({
  fonts: [font(100, 400, DISPLAY), font(40, 400, UI), font(40, 600, UI)],
  hits: HITS,
  samples: 4,
  init() {
    makeGrain();
    const cv = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    SC_CV = cv(); SC_CTX = SC_CV.getContext('2d', { alpha: false });
    LIT_CV = cv(); LIT_CTX = LIT_CV.getContext('2d');
    // the three photos are stills of the live shots they cut into, taken at the cut
    PHOTOS.kamar = cv(); drawRoom(PHOTOS.kamar.getContext('2d', { alpha: false }), T.full1, 2.7, 1.12);
    PHOTOS.kolong = cv(); drawKolong(PHOTOS.kolong.getContext('2d', { alpha: false }), T.full2);
    PHOTOS.lorong = cv(); drawLorong(PHOTOS.lorong.getContext('2d', { alpha: false }), T.full3, { z: 0.6, figure: true });
  },
  draw(ctx, u) {
    if (u >= T.title) { titleCard(ctx, u); return; }

    if (u < T.full1) {
      // the phone in the dark, Raka's name, the old conversation, the new photo
      phoneShot(ctx, u, PHONE_CAM.A, T.into1, u < T.chat ? 'lock' : 'open');
    } else if (u < T.turn) {
      // inside photo 1, then out of the wardrobe, then toward the sleeper
      const wz = Math.exp(kf(u, [[T.full1, L(2.7)], [T.reveal, L(2.35)], [T.reveal + 3.2, L(1.0)]], E.inOutCubic));
      const bz = Math.exp(kf(u, [[T.full1, L(1.12)], [T.reveal, L(1.17)], [T.reveal + 3.2, L(1.0)]], E.inOutSine));
      const creak = 26 * E.inOutSine(prog(u, T.creak, T.creak + 1.1));
      ctx.save();
      camera(ctx, [[T.sleeper, [540, 960, 0]], [T.turn, [660, 1120, L(1.32)]]], u);
      drawRoom(ctx, u, wz, bz, creak);
      ctx.restore();
    } else if (u < T.phone2) {
      // the reverse: the real wardrobe, seen from the bed; then the torch, the door, the clothes
      const theta = kf(u, [[T.turn, 0.6], [T.open, 0.6], [T.open + 1.2, 1.75], [T.close, 1.75], [T.close + 0.9, 0]], E.inOutCubic);
      const swing = clamp((u - T.open) / 0.5) * Math.exp(-Math.max(0, u - T.open - 0.5) / 2.5) + 0.6 * clamp((u - T.close) / 0.4) * Math.exp(-Math.max(0, u - T.close) / 1.5);
      const stare = clamp((u - T.stare - 1.2) / 0.6) * (1 - prog(u, T.stare + 3.2, T.stare + 3.8));
      const blanket = 1 - E.inOutCubic(prog(u, T.step, T.step + 1.6));
      const keys = [
        [T.turn, [540, 960, L(1.0)]], [T.stare - 0.4, [555, 950, L(1.1)]], [T.stare + 3.2, [600, 700, L(1.75)]],
        [at('Padahal kamu yakin') + 0.6, [570, 860, L(1.3)]], [T.step, [570, 880, L(1.28)]],
        [T.open - 0.2, [610, 860, L(1.7)]], [T.open + 1.2, [640, 900, L(1.5)]], [T.close + 1.0, [600, 900, L(1.55)]],
        [T.phone2, [590, 900, L(1.6)]],
      ];
      const sweep = kf(u, [[T.sweep - 0.4, 0], [T.sweep + 0.5, -1], [T.sweep + 1.3, 1], [T.close, 0]], E.inOutSine);
      const ta = clamp((u - T.torch) / 0.08) * (1 - clamp((u - T.torchOff) / 0.06));
      const tor = ta > 0 ? { x: 540 + 300 * sweep + 14 * noise1(u * 1.3, 61), y: 980 + 16 * noise1(u * 1.1, 62), r: 520, a: ta } : null;
      const walk = u > T.step && u < T.open ? Math.sin((u - T.step) * 6.5) : 0;
      ctx.save();
      camera(ctx, keys, u);
      ctx.translate(0, 8 * walk);
      torchlit(ctx, (c) => drawWardrobe(c, u, theta, { stare, blanket, swing }), tor);
      ctx.restore();
    } else if (u < T.full2) {
      phoneShot(ctx, u, PHONE_CAM.B, T.into2, 'chat');
    } else if (u < T.callCut) {
      // inside photo 2: under the bed, looking at your own legs; then down to the fingers
      ctx.save();
      camera(ctx, [
        [T.full2, [540, 960, 0]], [at('Berdiri di depan lemari'), [545, 900, L(1.12)]],
        [at('Diambil beberapa detik') + 1, [550, 820, L(1.28)]], [T.fingers, [550, 860, L(1.25)]],
        [T.fingers + 1.6, [330, 1460, L(1.5)]], [T.callCut, [320, 1480, L(1.52)]],
      ], u);
      drawKolong(ctx, u);
      ctx.restore();
    } else if (u < T.hear) {
      phoneShot(ctx, u, PHONE_CAM.C, Infinity, u < T.dial ? 'chat' : 'call', 1 - prog(u, T.dial, T.dial + 0.5));
    } else if (u < T.run) {
      // the room again: under the bed, a phone ringing; you flinch back up and do not look
      const ring = clamp((u - T.ringOn) / 0.1);
      ctx.save();
      camera(ctx, [
        [T.hear, [540, 1000, L(1.0)]], [at('Dari bawah ranjangmu') + 1.0, [800, 1700, L(1.6)]],
        [T.flinch - 0.4, [790, 1690, L(1.62)]], [T.flinch + 0.25, [560, 1000, L(1.1)]], [T.run, [560, 990, L(1.12)]],
      ], u, u > T.flinch - 0.4 ? E.outCubic : E.inOutSine);
      drawRoom(ctx, u, 9, 1, 0, { sleeper: false, nightPhone: false, ring });
      ctx.restore();
    } else if (u < T.phone3) {
      // the hallway: running, the lamp dies, the ringing stops, you almost turn round
      const zz = 4.6 * E.outQuad(prog(u, T.run, T.stop));
      const speed = 1 - prog(u, T.stop - 1.5, T.stop);
      const phase = zz * 3.4 * Math.PI;
      const turn = kf(u, [[T.listen, 0], [end('terdengar pintu lemari') + 0.6, 0.8], [T.doorShut, 0.85], [T.doorShut + 0.3, 0]], E.inOutSine);
      drawLorong(ctx, u, { z: zz, dx: 14 * Math.sin(phase / 2) * speed, dy: 22 * Math.abs(Math.sin(phase)) * speed, turn, lamp: lampLevel(u) });
    } else if (u < T.full3) {
      phoneShot(ctx, u, PHONE_CAM.D, T.into3, 'chat');
    } else if (u < T.phone4) {
      // inside photo 3: the corridor, and your back, from a step behind you
      ctx.save();
      camera(ctx, [[T.full3, [540, 960, 0]], [T.back + 0.4, [560, 1120, L(1.28)]], [T.phone4, [560, 1080, L(1.4)]]], u);
      drawLorong(ctx, u, { z: 0.6, figure: true });
      ctx.restore();
    } else {
      phoneShot(ctx, u, PHONE_CAM.E, Infinity, u < T.off ? 'chat' : 'off');
      finalLine(ctx, u);
    }
    for (const [str, a, b] of SUPERS) superText(ctx, u, str, a, b);
  },
  post(ctx, u, t) {
    const v = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const tile = GRAIN[Math.floor(t * 30) % GRAIN.length];
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.11;
    const off = Math.floor(hash01(Math.floor(t * 30), 61) * 256);
    ctx.translate(-off, -off);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  },
});

const GRAIN = [];
function makeGrain() {
  for (let k = 0; k < 8; k++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), im = c.createImageData(256, 256), r = mulberry32(900 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.floor(r() * 255); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    c.putImageData(im, 0, 0); GRAIN.push(cv);
  }
}
