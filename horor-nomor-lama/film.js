// Pesan dari Nomor Lama: pure function of time. window.seek(t) paints frame t (see lib/motion.js).
// 60 BPM grid, so u (beats) == seconds. Every cue comes from narasi.json (the ElevenLabs narration
// timings written by tools/buat_reel.py), so the picture follows the voice. docs/shotlist.md is the plan.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, kf, springU, SPRING, font, layout, glyph, text, fill, rrect, noise1, hash01, mulberry32, bump } = M;

const NAR = await fetch('narasi.json').then((r) => r.json());
const K = NAR.kalimat.map((k) => k.mulai);       // speech onset of each sentence
const KE = NAR.kalimat.map((k) => k.selesai);    // speech end of each sentence
const SC = NAR.scenes;

// Cues (seconds). The same derivations live in audio/score.py, so sound and picture agree.
const T_WAKE = 0.2;                   // the phone buzzes and the screen lights up on frame 0
const T_CHAT = K[2] - 0.05;           // "Isinya cuma satu foto." : chat opens
const T_SHARP = K[2] + 1.25;          // photo finishes loading
const T_FULL = K[3] + 1.2;            // "Kamar tidurmu." : photo fills the frame, we are in the room
const T_REVEAL = K[5] - 0.4;          // "Dari dalam lemari" : dolly back out of the wardrobe
const T_CREAK = K[5] + 1.9;           // the right door slides a little wider
const T_CUT2 = SC[2].mulai - 0.95;    // hard cut back to the phone on the first buzz
const BUZZ = [[0.0, 0.38], [SC[2].mulai - 0.95, 0.42], [SC[2].mulai - 0.45, 0.32], [KE[6] + 0.12, 0.45], [KE[6] + 0.65, 0.3]];
const T_TYPING = K[7] - 0.1;          // "Satu pesan baru." : typing indicator
const T_MSG = K[9] - 0.15;            // the message lands just before "Jangan"
const T_OFF = KE[9] + 0.9;            // screen times out: the reflection
const T_TITLE = T_OFF + 1.1;          // title card

const C = {
  black: '#030305', wood: '#07080b', wall: '#0b1019', floor: '#07090d',
  moon: '#9fb4d8', paper: '#e8e3da', dim: '#8a93a1', ui: '#121821', bubble: '#1d2530',
  accent: '#d3202a',
};
const DISPLAY = 'Display', UI = 'UI';

// Every visual accent: [beat, label, sfx, opts]. sfx.mjs voices them; the buzzes and drones are in score.py.
const HITS = [
  [T_WAKE, 'screen wakes', 'blip', { pitch: 'B5', gain: 0.16 }],
  [T_WAKE + 0.13, 'notification', 'blip', { pitch: 'E6', gain: 0.13 }],
  [K[1], 'super 1: Dari nomor yang sudah mati'],
  [T_CHAT, 'chat opens', 'tick', { gain: 0.14 }],
  [T_SHARP, 'photo sharp', 'click', { gain: 0.1 }],
  [T_FULL - 0.15, 'into the photo', 'whoosh', { len: 1.6, from: 160, to: 760, gain: 0.16 }],
  [T_FULL, 'room fills frame', 'sub', { len: 1.8, gain: 0.32 }],
  [K[4], 'super 2: Diambil dari sudut yang mustahil'],
  [T_REVEAL + 1.6, 'dolly out of wardrobe', 'whoosh', { len: 3.2, from: 700, to: 110, gain: 0.12 }],
  [T_CREAK, 'door slides', 'thud', { pitch: 95, to: 55, gain: 0.1 }],
  [T_CUT2, 'cut to phone (buzz in score)'],
  [T_TYPING, 'typing'],
  [T_MSG, 'message lands', 'blip', { pitch: 'E6', gain: 0.09 }],
  [T_OFF, 'screen off', 'click', { gain: 0.12 }],
  [T_TITLE, 'title', 'bell', { pitch: 'D5', gain: 0.07, verb: 0.9 }],
];

// ------------------------------------------------------------------ geometry
// The phone lies centred in the frame at camera zoom 1; its screen has its own local coordinates.
const PH = { x: 210, y: 280, w: 660, h: 1360, r: 74 };
const SCR = { x: PH.x + 22, y: PH.y + 22, w: PH.w - 44, h: PH.h - 44, r: 54 };
const PHOTO = { x: 30, y: 246, w: 324, h: 576 };          // 9:16, so it fills the frame exactly at zoom 3.333
const PHOTO_C = [SCR.x + PHOTO.x + PHOTO.w / 2, SCR.y + PHOTO.y + PHOTO.h / 2];
const Z_FILL = W / PHOTO.w;
const SCROLL2 = -300;                                      // chat scrolled up in scene 3
const TYPE_Y = 930;                                        // typing / message bubble (screen local)

// Camera keys [t, [cx, cy, ln zoom]]: interpolated in log zoom, so pushes read as a steady dolly.
const L = Math.log;
const CAM1 = [
  [0, [540, 960, L(1.0)]],
  [K[1] - 0.3, [540, 905, L(1.28)]],
  [T_CHAT, [540, 872, L(1.78)]],
  [T_CHAT + 0.9, [450, 800, L(1.55)]],
  [K[3], [440, 815, L(1.62)]],
  [T_FULL, [PHOTO_C[0], PHOTO_C[1], L(Z_FILL)]],
];
const msgCx = SCR.x + 24 + 215, msgCy = SCR.y + SCROLL2 + TYPE_Y + 40;
const CAM2 = [
  [T_CUT2, [440, 800, L(1.62)]],
  [K[7], [445, 830, L(1.66)]],
  [K[8], [455, msgCy - 90, L(1.78)]],
  [T_MSG, [500, msgCy - 70, L(1.85)]],
  [T_TITLE, [500, msgCy - 120, L(2.0)]],
];
function camera(ctx, keys, u, ease = E.inOutSine) {
  const [cx, cy, lz] = kf(u, keys, ease);
  const z = Math.exp(lz);
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
  return z;
}

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
function buzzAmp(u) {
  let a = 0;
  for (const [s, len] of BUZZ) a = Math.max(a, prog(u, s, s + 0.03) * (1 - prog(u, s + len - 0.05, s + len)));
  return a;
}

// ------------------------------------------------------------------ the room (seen from inside the wardrobe)
// drawRoom paints the whole frame. wz: wardrobe (foreground) zoom, large = doors out of frame.
// bz: room (background) zoom. Foreground and background move at different rates: parallax.
function drawRoom(ctx, u, wz, bz, creak = 0) {
  ctx.save();
  ctx.translate(540, 1000); ctx.scale(bz, bz); ctx.translate(-540, -1000);
  // wall + floor
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
  ctx.fillStyle = '#0a0d14'; ctx.fillRect(wx - 30, wy + wh + 9, ww + 60, 22);       // sill

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
  ctx.fillStyle = '#05070a'; ctx.fillRect(40, 350, 560, 16);                      // rail

  // bedside table with the phone glowing on it (the message just arrived)
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(420, 1170, 140, 170);
  ctx.fillStyle = '#121927'; ctx.fillRect(412, 1160, 156, 16);
  const pulse = 0.8 + 0.2 * Math.sin(u * 2.1);
  glow(ctx, 486, 1160, 150, 'rgba(170,200,255,0.9)', 0.32 * pulse);
  ctx.fillStyle = '#d6e4ff'; ctx.fillRect(458, 1150, 56, 10);

  // the bed: headboard, mattress in perspective, pillow, and someone asleep under the blanket
  ctx.fillStyle = '#0e131d'; rrect(ctx, 590, 990, 520, 270, 30); ctx.fill();
  ctx.strokeStyle = 'rgba(159,180,216,0.12)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(600, 1200); ctx.lineTo(1120, 1200); ctx.lineTo(1160, 1620); ctx.lineTo(450, 1620); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 1200, 1620, [[0, '#1c2536'], [1, '#111724']]); ctx.fill();
  ctx.beginPath(); ctx.ellipse(720, 1205, 110, 36, -0.05, 0, M.TAU); ctx.fillStyle = '#2b3549'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(700, 1190, 54, 40, 0.2, 0, M.TAU); ctx.fillStyle = '#06080c'; ctx.fill();      // head
  const breath = 1 + 0.025 * Math.sin((M.TAU * u) / 4.2);
  ctx.save(); ctx.translate(0, 1420); ctx.scale(1, breath); ctx.translate(0, -1420);
  ctx.beginPath(); ctx.moveTo(560, 1420); ctx.bezierCurveTo(640, 1230, 820, 1215, 920, 1260);
  ctx.bezierCurveTo(1030, 1300, 1120, 1330, 1170, 1420); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 1220, 1420, [[0, '#33405a'], [1, '#18202f']]); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(450, 1620, 720, 30);
  ctx.fillStyle = '#080b11'; ctx.fillRect(450, 1650, 720, 260);

  // dust drifting in the moonbeam
  for (let i = 0; i < 46; i++) {
    const bx = lerp(200, 900, hash01(i, 11)), by = lerp(950, 1800, hash01(i, 12));
    const x = bx + 40 * noise1(u * 0.12 + i, 13), y = by + 50 * noise1(u * 0.09 + i * 3, 14) - u * 4;
    const a = 0.25 + 0.35 * (0.5 + 0.5 * noise1(u * 0.6 + i, 15));
    ctx.fillStyle = `rgba(200,215,240,${a * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, 1.6 + hash01(i, 16) * 1.8, 0, M.TAU); ctx.fill();
  }
  ctx.restore();

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
  // rails top and bottom of the opening
  ctx.fillStyle = C.wood; ctx.fillRect(-3000, -3000, 7000, 3000 + 200); ctx.fillRect(-3000, 1680, 7000, 3000);
  ctx.fillStyle = 'rgba(159,180,216,0.12)'; ctx.fillRect(lx, 1680, rx - lx, 3);
  // the hanging rail just inside, and clothes on it overlapping the edges of the opening
  ctx.fillStyle = '#030405'; ctx.fillRect(-3000, 236, 7000, 16);
  ctx.fillStyle = 'rgba(159,180,216,0.14)'; ctx.fillRect(lx, 251, rx - lx, 2);
  const garment = (hookX, l, r, bottom, flare, rimX) => {
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
    ctx.strokeStyle = 'rgba(159,180,216,0.06)'; ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      const x = lerp(l, r, i / 4);
      ctx.beginPath(); ctx.moveTo(x, 360); ctx.quadraticCurveTo(x + 10, bottom * 0.6, x + (i - 2) * flare * 0.5, bottom); ctx.stroke();
    }
    ctx.restore();
  };
  garment(lx - 70, lx - 200, lx + 36, 1380, 30, lx + 36);
  garment(rx + 90, rx - 18, rx + 210, 920, 12, rx - 18);
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

function lockScreen(ctx, u, lum) {
  ctx.fillStyle = vgrad(ctx, 0, SCR.h, [[0, '#121a2b'], [1, '#05070b']]); ctx.fillRect(0, 0, SCR.w, SCR.h);
  statusBar(ctx, '00.00');
  text(ctx, '00.00', SCR.w / 2, 330, font(168, 400, UI), C.paper, 'center', -4);
  text(ctx, 'Minggu, 1 November', SCR.w / 2, 392, font(32, 400, UI), C.dim, 'center');
  // notification card drops in from the top edge of the screen
  const k = springU(u, T_WAKE + 0.13, SPRING.gentle);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.4);
  ctx.translate(0, (1 - k) * -140);
  rrect(ctx, 24, 470, SCR.w - 48, 200, 34); ctx.fillStyle = 'rgba(38,46,60,0.92)'; ctx.fill();
  ctx.beginPath(); ctx.arc(76, 528, 28, 0, M.TAU); ctx.fillStyle = '#5b6b82'; ctx.fill();
  rrect(ctx, 62, 516, 28, 20, 6); ctx.fillStyle = C.paper; ctx.fill();               // message glyph
  ctx.beginPath(); ctx.moveTo(68, 535); ctx.lineTo(66, 543); ctx.lineTo(75, 535); ctx.fill();
  text(ctx, 'Pesan  ·  sekarang', 120, 538, font(25, 400, UI), C.dim);
  text(ctx, '+62 812-3307-1984', 52, 604, font(34, 600, UI), C.paper);
  drawCameraGlyph(ctx, 54, 628, C.dim);
  text(ctx, 'Foto', 98, 648, font(29, 400, UI), C.dim);
  ctx.restore();
}

function drawCameraGlyph(ctx, x, y, color) {
  ctx.fillStyle = color; rrect(ctx, x, y + 4, 32, 22, 5); ctx.fill(); ctx.fillRect(x + 9, y, 13, 6);
  ctx.beginPath(); ctx.arc(x + 16, y + 15, 6, 0, M.TAU); ctx.fillStyle = '#262e3c'; ctx.fill();
}

function chatScreen(ctx, u, IMG, scroll, status, roomCv) {
  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0, 0, SCR.w, SCR.h);
  ctx.save(); ctx.translate(0, scroll);
  text(ctx, 'HARI INI', SCR.w / 2, 214, font(22, 600, UI), C.dim, 'center', 2);
  // the photo bubble: the room itself, loading blurred and then sharp
  rrect(ctx, PHOTO.x - 6, PHOTO.y - 6, PHOTO.w + 12, PHOTO.h + 12, 24); ctx.fillStyle = C.bubble; ctx.fill();
  const zoomIn = prog(u, K[3], T_FULL);
  const rad = 18 * (1 - E.inQuad(zoomIn));
  ctx.save(); rrect(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, rad); ctx.clip();
  const b = 22 * (1 - E.inOutCubic(prog(u, T_CHAT + 0.3, T_SHARP)));
  if (b > 0.3) ctx.filter = `blur(${b.toFixed(1)}px)`;
  ctx.drawImage(roomCv, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
  ctx.filter = 'none';
  ctx.restore();
  if (u < T_SHARP + 0.2) {
    const p = prog(u, T_CHAT + 0.25, T_SHARP), a = 1 - prog(u, T_SHARP, T_SHARP + 0.2);
    const cx = PHOTO.x + PHOTO.w / 2, cy = PHOTO.y + PHOTO.h / 2;
    ctx.save(); ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, M.TAU); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(232,227,218,0.25)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 44, -Math.PI / 2, -Math.PI / 2 + M.TAU * E.outCubic(p)); ctx.strokeStyle = C.paper; ctx.stroke();
    ctx.restore();
  }
  text(ctx, '00.00', PHOTO.x + PHOTO.w - 14, PHOTO.y + PHOTO.h - 16, font(22, 400, UI), 'rgba(232,227,218,0.85)', 'right');

  // scene 3: typing dots, then the message
  if (u >= T_TYPING && u < T_MSG) {
    const k = springU(u, T_TYPING, SPRING.snappy);
    ctx.save(); ctx.translate(24, TYPE_Y); ctx.scale(lerp(0.85, 1, k), lerp(0.85, 1, k)); ctx.globalAlpha = clamp(k * 1.5);
    rrect(ctx, 0, 0, 140, 76, 30); ctx.fillStyle = C.bubble; ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ph = 0.5 + 0.5 * Math.sin(u * 7 - i * 0.9);
      ctx.beginPath(); ctx.arc(38 + i * 32, 38 - ph * 6, 8, 0, M.TAU); ctx.fillStyle = `rgba(232,227,218,${0.35 + 0.5 * ph})`; ctx.fill();
    }
    ctx.restore();
  }
  if (u >= T_MSG) {
    const k = springU(u, T_MSG, SPRING.snappy);
    const f = font(32, 400, UI), msg = 'Jangan lihat ke belakang.';
    ctx.font = f; const tw = ctx.measureText(msg).width;
    ctx.save(); ctx.translate(24, TYPE_Y + 76); ctx.scale(lerp(0.9, 1, k), lerp(0.9, 1, k)); ctx.translate(0, -76);
    ctx.globalAlpha = clamp(k * 1.5);
    rrect(ctx, 0, 0, tw + 116, 82, 26); ctx.fillStyle = C.bubble; ctx.fill();
    text(ctx, msg, 26, 52, f, C.paper);
    text(ctx, '00.03', tw + 100, 66, font(20, 400, UI), C.dim, 'right');
    ctx.restore();
  }
  ctx.restore();

  // header stays on top of the scrolled chat
  ctx.fillStyle = '#151b24'; ctx.fillRect(0, 0, SCR.w, 160);
  statusBar(ctx, u < T_CUT2 ? '00.00' : '00.03');
  ctx.strokeStyle = C.paper; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(48, 100); ctx.lineTo(34, 114); ctx.lineTo(48, 128); ctx.stroke();
  ctx.beginPath(); ctx.arc(106, 114, 32, 0, M.TAU); ctx.fillStyle = '#2a313c'; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(106, 114, 32, 0, M.TAU); ctx.clip();
  ctx.fillStyle = '#4a5361'; ctx.beginPath(); ctx.arc(106, 104, 12, 0, M.TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(106, 140, 22, 16, 0, 0, M.TAU); ctx.fill();
  ctx.restore();
  text(ctx, '+62 812-3307-1984', 154, 108, font(30, 600, UI), C.paper);
  text(ctx, status, 154, 140, font(23, 400, UI), status.startsWith('sedang') ? C.paper : C.dim);
}

function drawPhone(ctx, u, IMG, mode, roomCv) {
  phoneBody(ctx);
  ctx.save();
  ctx.translate(SCR.x, SCR.y);
  rrect(ctx, 0, 0, SCR.w, SCR.h, SCR.r); ctx.clip();
  if (mode === 'lock') {
    const lum = E.outCubic(prog(u, T_WAKE, T_WAKE + 0.35));
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, SCR.w, SCR.h);
    ctx.globalAlpha = lerp(0.16, 1, lum);
    lockScreen(ctx, u, lum);
    ctx.globalAlpha = 1;
  } else if (mode === 'chat1') {
    // the notification card opens out into the chat
    const k = E.outCubic(prog(u, T_CHAT, T_CHAT + 0.45));
    chatScreen(ctx, u, IMG, 0, 'terakhir dilihat 2 tahun lalu', roomCv);
    if (k < 1) {
      ctx.save(); ctx.globalAlpha = 1 - k;
      lockScreen(ctx, u, 1);
      ctx.restore();
    }
  } else if (mode === 'chat2') {
    const status = u >= T_TYPING && u < T_MSG + 0.4 ? 'sedang mengetik...' : 'terakhir dilihat 2 tahun lalu';
    chatScreen(ctx, u, IMG, SCROLL2, status, roomCv);
  } else if (mode === 'off') {
    ctx.fillStyle = '#020203'; ctx.fillRect(0, 0, SCR.w, SCR.h);
    reflection(ctx, u);
  }
  ctx.restore();
}

// The dead screen is a black mirror: a pale face over your shoulder, there and barely there.
function reflection(ctx, u) {
  const a = E.inOutSine(prog(u, T_OFF + 0.05, T_OFF + 0.7)) * (0.9 + 0.1 * noise1(u * 9, 31));
  const sheen = ctx.createLinearGradient(0, 0, SCR.w, SCR.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, SCR.w, SCR.h);
  if (a <= 0) return;
  // the room behind you, faintly reflected, and someone standing in it: a silhouette against the glow
  const grow = 1 + 0.05 * E.inOutSine(prog(u, T_OFF, T_TITLE));
  ctx.save();
  ctx.globalAlpha = a;
  const back = ctx.createRadialGradient(260, 470, 20, 260, 520, 470);
  back.addColorStop(0, 'rgba(150,162,180,0.27)'); back.addColorStop(1, 'rgba(150,162,180,0)');
  ctx.fillStyle = back; ctx.fillRect(0, 0, SCR.w, SCR.h);
  ctx.translate(380, 600); ctx.scale(grow, grow); ctx.rotate(0.1);
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = 'rgba(1,1,2,0.94)';
  ctx.beginPath(); ctx.ellipse(0, -60, 54, 70, 0, 0, M.TAU); ctx.fill();                      // head
  ctx.fillRect(-22, 0, 44, 60);                                                                // neck
  ctx.beginPath(); ctx.moveTo(-260, 900); ctx.bezierCurveTo(-250, 180, -170, 70, 0, 58);      // shoulders
  ctx.bezierCurveTo(170, 70, 250, 180, 260, 900); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-58, -80); ctx.bezierCurveTo(-74, 40, -70, 200, -92, 330);      // long hair, straight down
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

// The last line: red, word by word, each word rising out from behind its own baseline.
const WORDS = [['Jangan', 0], ['lihat', 0.26], ['ke', 0.5], ['belakang.', 0.62]];
function finalLine(ctx, u) {
  if (u < K[9] - 0.05 || u >= T_OFF) return;
  const s = FORMAT.safe, size = 128, f = font(size, 400, DISPLAY);
  const rows = [[WORDS[0], WORDS[1]], [WORDS[2], WORDS[3]]];
  const top = s.y + 120;
  ctx.save();
  scrim(ctx, top - 160, top + 2 * 150 + 220, 0.75 * clamp((u - K[9] + 0.05) / 0.3));
  ctx.restore();
  rows.forEach((row, ri) => {
    const base = top + 130 + ri * 150;
    let x = s.x;
    row.forEach(([w, d]) => {
      const Lw = layout(ctx, w, f, -2);
      const k = springU(u, K[9] + d, SPRING.gentle);
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
      const p = E.outQuint(prog(u, T_TITLE + 0.05 + li * 0.12 + j * 0.018, T_TITLE + 0.75 + li * 0.12 + j * 0.018));
      if (p <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, base - size, W, size + Lt.desc + 4); ctx.clip();
      glyph(ctx, g.ch, s.x + g.cx, base + (1 - p) * (size * 0.9), f, C.paper);
      ctx.restore();
    });
  });
  const lp = E.outQuint(prog(u, T_TITLE + 0.4, T_TITLE + 1.0));
  ctx.fillStyle = C.accent; ctx.fillRect(s.x, s.y + s.h * 0.5 + 128 + 54, 140 * lp, 4);
}

// ------------------------------------------------------------------ grain + vignette (after motion blur)
const GRAIN = [];
function makeGrain() {
  for (let k = 0; k < 8; k++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), im = c.createImageData(256, 256), r = mulberry32(900 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.floor(r() * 255); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    c.putImageData(im, 0, 0); GRAIN.push(cv);
  }
}

let roomCv = null, roomCtx = null;

M.film({
  fonts: [font(100, 400, DISPLAY), font(40, 400, UI), font(40, 600, UI)],
  hits: HITS,
  samples: 8,
  init() {
    makeGrain();
    roomCv = document.createElement('canvas'); roomCv.width = W; roomCv.height = H;
    roomCtx = roomCv.getContext('2d', { alpha: false });
  },
  draw(ctx, u, t, IMG) {
    if (u >= T_TITLE) { titleCard(ctx, u); return; }

    if (u < T_FULL) {
      // ---- scene 1: the phone in the dark, the message, the photo
      if (u >= T_CHAT - 0.1) drawRoom(roomCtx, u, 2.7, 1.12);
      const lum = u < T_CHAT ? E.outCubic(prog(u, T_WAKE, T_WAKE + 0.35)) : 1;
      ctx.save();
      camera(ctx, CAM1, u, u > K[3] ? E.inOutCubic : E.inOutSine);
      const b = buzzAmp(u);
      if (b > 0) ctx.translate(6 * b * noise1(u * 140, 54), 6 * b * noise1(u * 140, 55));
      drawSurface(ctx, lerp(0.06, 1, lum));
      drawPhone(ctx, u, IMG, u < T_CHAT ? 'lock' : 'chat1', roomCv);
      ctx.restore();
      superText(ctx, u, SC[0].teks_layar, K[1], K[3] - 0.3);
      return;
    }

    if (u < T_CUT2) {
      // ---- scene 2: inside the photo, then out of the wardrobe
      const wz = Math.exp(kf(u, [[T_FULL, L(2.7)], [T_REVEAL, L(2.35)], [T_REVEAL + 3.2, L(1.0)]], E.inOutCubic));
      const bz = Math.exp(kf(u, [[T_FULL, L(1.12)], [T_REVEAL, L(1.17)], [T_REVEAL + 3.2, L(1.0)], [T_CUT2, L(1.02)]], E.inOutSine));
      const creak = 26 * E.inOutSine(prog(u, T_CREAK, T_CREAK + 1.1));
      drawRoom(ctx, u, wz, bz, creak);
      superText(ctx, u, SC[1].teks_layar, K[4], T_CUT2 - 0.55);
      return;
    }

    // ---- scene 3: the phone buzzes again, someone is typing, the message, the dead screen
    const mode = u < T_OFF ? 'chat2' : 'off';
    if (mode === 'chat2') drawRoom(roomCtx, u, 2.7, 1.12);
    ctx.save();
    camera(ctx, CAM2, u);
    const b = buzzAmp(u);
    if (b > 0) {
      ctx.translate(540, 960); ctx.rotate(0.006 * b * noise1(u * 90, 51)); ctx.translate(-540, -960);
      ctx.translate(7 * b * noise1(u * 140, 52), 7 * b * noise1(u * 140, 53));
    }
    drawSurface(ctx, mode === 'off' ? 0.03 : 0.85);
    drawPhone(ctx, u, IMG, mode, roomCv);
    ctx.restore();
    finalLine(ctx, u);
  },
  post(ctx, u, t) {
    // vignette
    const v = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    // film grain, a different seeded tile every frame
    const tile = GRAIN[Math.floor(t * 30) % GRAIN.length];
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.11;
    const off = Math.floor(hash01(Math.floor(t * 30), 61) * 256);
    ctx.translate(-off, -off);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  },
});
