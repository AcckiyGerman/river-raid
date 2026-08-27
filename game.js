'use strict';
/* ============================================================
   RIVER RAID — Amiga-style remake, browser/mobile edition
   v2: 8 weapons w/ ammo, themed stages, animated water,
   clouds, shadows, wakes, screen shake, engine drone + music.
   ============================================================ */

const W = 480, H = 720;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const pauseBtn = document.getElementById('pauseBtn');
const bombBtn = document.getElementById('bombBtn');
const muteBtn = document.getElementById('muteBtn');

/* ---------- canvas scaling ---------- */
let viewScale = 1;
function resize() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  viewScale = s;
  canvas.style.width = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
}
window.addEventListener('resize', resize);
resize();

/* ---------- RNG / utils ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const irnd = (a, b) => (a + Math.random() * (b - a + 1)) | 0;
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
function hash1(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); return (n >>> 0); }
function hex2rgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbStr(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
function rgbaStr(a, al) { return 'rgba(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ',' + al + ')'; }

/* ---------- stage themes (per-stage color grade + water mood) ---------- */
/* index = (stage-1) % THEMES.length */
const THEMES = [
  { name: 'DEN',    grade: null, waterTop: [46, 79, 194], shimmer: [150, 190, 255], cloud: 0.10 },
  { name: 'VEČER',  grade: 'rgba(255,130,50,0.13)', waterTop: [30, 55, 140], shimmer: [255, 200, 140], cloud: 0.12 },
  { name: 'NOC',    grade: 'rgba(16,22,90,0.32)',   waterTop: [14, 26, 90],  shimmer: [130, 160, 230], cloud: 0.16 },
  { name: 'PODZIM', grade: 'rgba(255,170,70,0.11)', waterTop: [40, 66, 150], shimmer: [240, 220, 180], cloud: 0.10 },
];
function theme() { return THEMES[(Math.max(1, stage) - 1) % THEMES.length]; }

/* ---------- sprites (pixel templates) ---------- */
function makeSprite(rows, pal, scale) {
  scale = scale || 2;
  const w = rows[0].length * scale, h = rows.length * scale;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = pal[ch];
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  return { canvas: c, w, h };
}
/* mirror-symmetric template: right half is the mirror of the left */
function mirror(rows) {
  return rows.map(r => {
    const out = [...r];
    const w = out.length;
    for (let x = 0; x < (w + 1) >> 1; x++) out[w - 1 - x] = out[x];
    return out.join('');
  });
}
const SPR = {
  player: makeSprite(mirror([
    '.....1.....',
    '.....11....',
    '.....11....',
    '....2112...',
    '....2112...',
    '....2112...',
    '....2112...',
    '.33.2112...',
    '.3331112...',
    '1111111112.',
    '1211111112.',
    '..1111112..',
    '..311112...',
    '...11112...',
    '..411114...']),
    { '1': '#eceef2', '2': '#9aa2b0', '3': '#3a4656', '4': '#ff6a4a' }, 2),
  boat: makeSprite(mirror([
    '....1....',
    '....1....',
    '...111...',
    '..12221..',
    '..12221..',
    '..11111..',
    '...111...',
    '....1....']),
    { '1': '#d8d8dc', '2': '#3c4048' }, 2),
  ship: makeSprite(mirror([
    '......1......',
    '.....111.....',
    '....11111....',
    '...2222222...',
    '..222222222..',
    '.22111111122.',
    '.22111111122.',
    '.22133333122.',
    '.22111111122.',
    '..222222222..',
    '...2211122...',
    '....21112....',
    '.....111.....']),
    { '1': '#b8b8c4', '2': '#454550', '3': '#7a7a8c' }, 2),
  barge: makeSprite(mirror([
    '...111111...',
    '..12222221..',
    '.1233333321.',
    '.1234444321.',
    '.1233333321.',
    '.1222222221.',
    '.1234444321.',
    '.1233333321.',
    '.1222222221.',
    '..12222221..',
    '...111111...']),
    { '1': '#5a4a3a', '2': '#7a6a52', '3': '#8a5a2a', '4': '#b8834a' }, 2),
  plane: makeSprite(mirror([
    '.....1.....',
    '.....1.....',
    '....111....',
    '....131....',
    '....131....',
    '....111....',
    '1.2111111.2',
    '11211111121',
    '22211111122',
    '.2111111112',
    '.2111111112',
    '...11111...',
    '....111....',
    '.....1.....',
    '.....1.....']),
    { '1': '#d85a4a', '2': '#7a2a22', '3': '#2a2438' }, 2),
  jet: makeSprite(mirror([
    '.....1.....',
    '.....1.....',
    '.....1.....',
    '....111....',
    '..211112...',
    '.22111122..',
    '2221111122.',
    '..2111112..',
    '....111....',
    '...4.1.4...']),
    { '1': '#6a7a8c', '2': '#3a4656', '3': '#c8d0dc', '4': '#ff8c2a' }, 2),
  heli: makeSprite([
    '.......3.......',
    '.......1.......',
    '.......1.......',
    '......111......',
    '.......1.......',
    '......111......',
    '.....21112.....',
    '.....21112.....',
    '......111......',
    '.......1.......'],
    { '1': '#8ab4d8', '2': '#2c4258', '3': '#30343c' }, 2),
  tank: makeSprite(mirror([
    '..222222222..',
    '..211111122..',
    '..211111122..',
    '..211444122..',
    '..211444122..',
    '..211444122..',
    '..211111122..',
    '..222444222..',
    '..222444222..',
    '.....444.....']),
    { '1': '#77803c', '2': '#3a3a32', '3': '#4c5526', '4': '#2a2a24' }, 2),
};
/* badges (power-ups + weapon crates), 16x16 */
function badge(color, text) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#10142a'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = color; g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#312008';
  g.font = 'bold 11px "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 8, 9);
  return c;
}
const PU_SPR = {
  life: SPR.player.canvas,
  triple: badge('#ffd24a', '3X'),
  rapid: badge('#ff8c2a', 'FF'),
  shield: badge('#4a9aff', 'S'),
  gem: badge('#57e86a', '$'),
};

/* ---------- audio ---------- */
let ac = null, noiseBuf = null, muted = false;
let masterGain = null, musicGain = null, engineNodes = null;
function audioInit() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    masterGain = ac.createGain(); masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ac.destination);
    musicGain = ac.createGain(); musicGain.gain.value = 0.55;
    musicGain.connect(masterGain);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}
function beep(freq, dur, type, vol, slide, delay, dest) {
  if (!ac || muted) return;
  type = type || 'square'; vol = vol || 0.12; delay = delay || 0;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(dest || masterGain);
  o.start(t0); o.stop(t0 + dur);
}
function boom(dur, vol, f) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.7 + Math.random() * 0.4;
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f || 900;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol || 0.4, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(masterGain);
  s.start(t0); s.stop(t0 + dur);
}
function noiseHit(dur, vol, fType, f0, f1) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = fType || 'bandpass';
  fl.frequency.setValueAtTime(f0, t0);
  if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
  fl.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(masterGain);
  s.start(t0); s.stop(t0 + dur);
}

/* --- engine drone --- */
function engineStart() {
  if (!ac || engineNodes) return;
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 62;
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 93;
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420;
  const g = ac.createGain(); g.gain.value = 0.022;
  o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(masterGain);
  o1.start(); o2.start();
  engineNodes = { o1, o2, g, fl };
}
function engineTune() {
  if (!engineNodes) return;
  const low = player && player.fuel < 20;
  const wob = low ? Math.sin(time * 26) * 14 : Math.sin(time * 6) * 3;
  engineNodes.o1.frequency.value = 58 + scroll * 0.14 + wob;
  engineNodes.o2.frequency.value = (58 + scroll * 0.14) * 1.5 + wob * 1.5;
  engineNodes.g.gain.value = low && ((time * 9 | 0) % 3 === 0) ? 0.008 : 0.022;
}
function engineStop() {
  if (!engineNodes) return;
  try { engineNodes.o1.stop(); engineNodes.o2.stop(); } catch (e) {}
  engineNodes = null;
}

/* --- chiptune music loop (lookahead scheduler) --- */
let musNext = 0, musStep = 0;
const BASS = [0, 0, 7, 0, 5, 0, 7, 3, 0, 0, 7, 0, 10, 0, 8, 7];
const LEAD = [12, 15, 19, 15, 22, 19, 15, 12, 14, 17, 19, 17, 24, 19, 17, 15,
              12, 15, 19, 22, 19, 17, 15, 14, 12, 12, 15, 19, 17, 15, 12, 10];
const SEMI = (n) => 110 * Math.pow(2, n / 12);
function musicSchedule() {
  if (!ac || muted || state !== ST.PLAY) return;
  const spb = 0.117; // ~128 bpm 8ths
  while (musNext < ac.currentTime + 0.25) {
    const t = musNext;
    const bs = BASS[musStep % 16];
    beep(SEMI(bs), 0.16, 'square', 0.05, 0, t - ac.currentTime, musicGain);
    if (musStep % 2 === 1) beep(SEMI(bs + 12), 0.07, 'square', 0.018, 0, t - ac.currentTime, musicGain);
    const ld = LEAD[musStep % 32];
    if (ld % 3 !== 2) beep(SEMI(ld), 0.1, 'triangle', 0.055, 0, t - ac.currentTime, musicGain);
    if (musStep % 2 === 0 && ac && noiseBuf) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.016, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.03);
      s.connect(fl); fl.connect(g); g.connect(musicGain);
      s.start(t); s.stop(t + 0.04);
    }
    musNext += spb; musStep++;
  }
}
function musicReset() { if (ac) { musNext = ac.currentTime + 0.05; musStep = 0; } }

const sfx = {
  shoot:  () => beep(950, 0.06, 'square', 0.05, -600),
  shootDouble: () => { beep(900, 0.05, 'square', 0.045, -500); beep(1150, 0.05, 'square', 0.04, -500, 0.03); },
  shootSpread: () => { noiseHit(0.08, 0.14, 'highpass', 1800); beep(500, 0.07, 'square', 0.05, -250); },
  shootLaser: () => { beep(1700, 0.09, 'sawtooth', 0.05, -1300); beep(2400, 0.05, 'sine', 0.04, -1600); },
  shootMissile: () => { noiseHit(0.22, 0.16, 'bandpass', 500, 2400); beep(220, 0.18, 'sawtooth', 0.05, 300); },
  shootFlak: () => { noiseHit(0.06, 0.2, 'bandpass', 900, 400); beep(650, 0.05, 'square', 0.06, -350); },
  shootNapalm: () => { noiseHit(0.18, 0.12, 'bandpass', 2600, 600); },
  shootTorpedo: () => { beep(300, 0.1, 'sine', 0.07, 140); noiseHit(0.1, 0.06, 'lowpass', 700); },
  flakBurst: () => { noiseHit(0.12, 0.22, 'bandpass', 2400, 500); beep(150, 0.1, 'square', 0.08, -80); },
  napalmHit: () => { noiseHit(0.4, 0.14, 'lowpass', 900, 250); },
  boomS:  () => { boom(0.35, 0.35, 1400); beep(120, 0.25, 'sawtooth', 0.12, -70); },
  boomB:  () => { boom(0.7, 0.5, 800); beep(80, 0.5, 'sawtooth', 0.18, -50); },
  bomb:   () => { boom(1.3, 0.6, 500); beep(60, 1.0, 'sawtooth', 0.2, -30); },
  fuel:   () => beep(1500, 0.05, 'square', 0.05),
  fuelFull: () => { beep(1200, 0.07, 'square', 0.07); beep(1600, 0.1, 'square', 0.07, 0, 0.09); },
  stage:  () => { beep(520, 0.1, 'square', 0.1); beep(660, 0.1, 'square', 0.1, 0, 0.11); beep(880, 0.16, 'square', 0.1, 0, 0.22); },
  tshoot: () => beep(380, 0.08, 'square', 0.05, -220),
  warn:   () => beep(300, 0.12, 'square', 0.08),
  pickup: () => { beep(700, 0.06, 'square', 0.06); beep(1050, 0.08, 'square', 0.06, 0, 0.06); },
  weapon: () => { beep(600, 0.05, 'square', 0.06); beep(900, 0.05, 'square', 0.06, 0, 0.05); beep(1300, 0.09, 'square', 0.06, 0, 0.1); },
};

/* ---------- river (banks) ---------- */
const river = {
  pts: [],
  init() {
    this.pts = [];
    let y = -3000, cx = W / 2, half = 110;
    while (y < 3000) {
      this.pts.push({ y, cx, half });
      y += 140;
      cx = clamp(cx + rnd(-80, 80), 140, W - 140);
      half = clamp(half + rnd(-35, 35), 72, 148);
    }
  },
  ensure(yMax) {
    let last = this.pts[this.pts.length - 1];
    while (last.y < yMax) {
      const ny = last.y + 140;
      const cx = clamp(last.cx + rnd(-80, 80), 140, W - 140);
      const half = clamp(last.half + rnd(-35, 35), 72, 148);
      last = { y: ny, cx, half };
      this.pts.push(last);
    }
  },
  ensureLow(yMin) {
    let first = this.pts[0];
    while (first.y > yMin) {
      const ny = first.y - 140;
      const cx = clamp(first.cx + rnd(-80, 80), 140, W - 140);
      const half = clamp(first.half + rnd(-35, 35), 72, 148);
      this.pts.unshift({ y: ny, cx, half });
      first = this.pts[0];
    }
  },
  trim(yMin) {
    while (this.pts.length > 4 && this.pts[0].y < yMin) this.pts.shift();
  },
  trimHigh(yMax) {
    while (this.pts.length > 4 && this.pts[this.pts.length - 1].y > yMax) this.pts.pop();
  },
  sample(y) {
    const pts = this.pts;
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].y <= y) i++;
    const a = pts[i], b = pts[i + 1];
    const t = clamp((y - a.y) / (b.y - a.y), 0, 1);
    const k = (1 - Math.cos(t * Math.PI)) / 2;
    return { cx: a.cx + (b.cx - a.cx) * k, half: a.half + (b.half - a.half) * k };
  }
};

/* ---------- terrain scroll buffer ---------- */
const HB = 1024;
const TOPM = 256;
const ter = document.createElement('canvas');
ter.width = W; ter.height = HB;
const terCtx = ter.getContext('2d');

function paintRow(buf, wy) {
  const b = river.sample(wy);
  const left = b.cx - b.half, right = b.cx + b.half;
  const stripe = hash1(wy >> 2);
  const sand = (stripe & 7) === 0 ? '#c8a94e' : ((stripe & 3) === 0 ? '#b8983f' : '#c2a047');
  buf.fillStyle = sand;
  buf.fillRect(0, 0, W, 1);
  buf.fillStyle = '#2e4fc2';
  buf.fillRect(left, 0, right - left, 1);
  const h2 = hash1(wy * 7 + 13);
  if ((h2 & 7) === 0) {
    buf.fillStyle = '#4a6fe0';
    const wx = left + ((h2 >> 4) % Math.max(1, (right - left - 14)));
    buf.fillRect(wx, 0, 10, 1);
  }
  buf.fillStyle = '#8a6a2a';
  buf.fillRect(left - 1, 0, 2, 1);
  buf.fillRect(right - 1, 0, 2, 1);
  // shoreline reeds: dark green dashes hugging the banks
  const h3 = hash1(wy * 17 + 5);
  if ((h3 & 3) === 0) {
    buf.fillStyle = '#4a7a30';
    if ((h3 >> 6) & 1) buf.fillRect(left - 4 - (h3 % 3), 0, 3, 1);
    else buf.fillRect(right + 2 + (h3 % 3), 0, 3, 1);
  }
  // tiny wildflowers on the sand
  const h4 = hash1(wy * 31 + 77);
  if ((h4 & 63) === 0) {
    const fx = (h4 >> 7) % W;
    if (fx < left - 6 || fx > right + 6) {
      buf.fillStyle = (h4 >> 12) & 1 ? '#e8d8f0' : '#e8a8c0';
      buf.fillRect(fx, 0, 2, 1);
    }
  }
}

/* Bank decorations — second pass after sand rows (sprites span rows).
   Deterministic per worldY so they scroll with the banks. */
function paintDecorAt(buf, wy, row, left, right) {
  if (row + 14 >= HB) return;
  const hd = hash1(wy * 29 + 101);
  const dr = hd % 384;
  if (dr >= 30) return; // ~7.8% of rows carry decor
  let side = (hd >> 8) & 1;
  if (side && W - right < 26) side = 0;
  if (!side && left < 26) side = 1;
  let x;
  if (side) {
    const span = W - right - 20;
    if (span <= 4) return;
    x = right + 8 + ((hd >> 5) % span);
  } else {
    const span = left - 20;
    if (span <= 4) return;
    x = 4 + ((hd >> 5) % span);
  }
  buf.save();
  buf.translate(0, row);
  paintDecor(buf, dr, x);
  buf.restore();
}
function paintDecor(buf, dr, x) {
  if (dr < 2) {
    // house: roof ridge, walls, door + windows
    buf.fillStyle = '#a03a2a'; buf.fillRect(x - 2, 0, 18, 1);
    buf.fillStyle = '#b84a34'; buf.fillRect(x - 1, 1, 16, 1);
    buf.fillStyle = '#d8c090'; buf.fillRect(x, 2, 14, 6);
    buf.fillStyle = '#7a4a20'; buf.fillRect(x + 6, 5, 3, 3);
    buf.fillStyle = '#7ac8f0'; buf.fillRect(x + 1, 3, 3, 2);
    buf.fillRect(x + 10, 3, 3, 2);
  } else if (dr < 9) {
    // tree with drop shadow
    buf.fillStyle = 'rgba(0,0,0,0.15)'; buf.fillRect(x + 1, 12, 9, 2);
    buf.fillStyle = '#5a3a18'; buf.fillRect(x + 3, 8, 3, 5);
    buf.fillStyle = '#2f7a1f'; buf.fillRect(x, 3, 9, 6);
    buf.fillStyle = '#3f9a2a'; buf.fillRect(x + 1, 1, 7, 4);
    buf.fillStyle = '#57b53a'; buf.fillRect(x + 2, 0, 4, 2);
  } else if (dr < 15) {
    // pine
    buf.fillStyle = '#4a3a20'; buf.fillRect(x + 3, 9, 2, 4);
    buf.fillStyle = '#1f5a26'; buf.fillRect(x, 6, 8, 3);
    buf.fillStyle = '#26702e'; buf.fillRect(x + 1, 3, 6, 3);
    buf.fillStyle = '#2f8438'; buf.fillRect(x + 2, 1, 4, 2);
  } else if (dr < 22) {
    // bush
    buf.fillStyle = '#3a7a24'; buf.fillRect(x, 2, 7, 3);
    buf.fillStyle = '#4a9a30'; buf.fillRect(x + 1, 1, 5, 2);
    buf.fillStyle = '#2a5a18'; buf.fillRect(x + 2, 4, 3, 1);
  } else if (dr < 26) {
    // rock with shadow
    buf.fillStyle = 'rgba(0,0,0,0.18)'; buf.fillRect(x, 4, 6, 1);
    buf.fillStyle = '#8a8a92'; buf.fillRect(x, 1, 5, 3);
    buf.fillStyle = '#a8a8b0'; buf.fillRect(x + 1, 1, 2, 1);
  } else if (dr < 28) {
    // haystack
    buf.fillStyle = '#c8a040'; buf.fillRect(x, 1, 6, 3);
    buf.fillStyle = '#e0bc58'; buf.fillRect(x + 1, 0, 4, 1);
  } else {
    // grass tuft
    buf.fillStyle = '#4a8a2a';
    buf.fillRect(x, 0, 1, 3);
    buf.fillRect(x + 2, 1, 1, 2);
    buf.fillRect(x + 4, 0, 1, 2);
  }
}

let bufTopWorld = 0;
let terRem = 0;
function paintBufferRows(fromRow, toRow) {
  for (let r = fromRow; r < toRow; r++) {
    terCtx.save();
    terCtx.translate(0, r);
    paintRow(terCtx, bufTopWorld + r);
    terCtx.restore();
  }
  for (let r = fromRow; r < toRow; r++) {
    const wy = bufTopWorld + r;
    const b = river.sample(wy);
    paintDecorAt(terCtx, wy, r, b.cx - b.half, b.cx + b.half);
  }
}
function initTerrain(camTop) {
  bufTopWorld = camTop - TOPM;
  terRem = 0;
  river.ensureLow(bufTopWorld - 120);
  paintBufferRows(0, HB);
}
function scrollTerrain(d) {
  if (d <= 0) return;
  terRem += d;
  d = Math.floor(terRem);
  terRem -= d;
  if (d < 1) return;
  d = Math.min(d, HB - 8);
  bufTopWorld -= d;
  river.ensureLow(bufTopWorld - 120);
  river.trimHigh(bufTopWorld + HB + 200);
  terCtx.drawImage(ter, 0, 0, W, HB - d, 0, d, W, HB - d);
  paintBufferRows(0, d);
}

/* ---------- weapons ---------- */
const WEAPONS = {
  vulcan:  { name: 'VULCAN',  icon: 'V', color: '#d8d8e8', ammo: Infinity, cd: 0.16, dmg: 1 },
  double:  { name: 'DOUBLE',  icon: 'D', color: '#ffe650', ammo: 60, cd: 0.14, dmg: 1 },
  spread:  { name: 'SPREAD',  icon: 'S', color: '#ff8c2a', ammo: 45, cd: 0.24, dmg: 1 },
  laser:   { name: 'LASER',   icon: 'L', color: '#57e8ff', ammo: 120, cd: 0.11, dmg: 1 },
  missile: { name: 'MISSILE', icon: 'M', color: '#ff5a4a', ammo: 14, cd: 0.42, dmg: 3 },
  flak:    { name: 'FLAK',    icon: 'F', color: '#c8a0ff', ammo: 26, cd: 0.3,  dmg: 2 },
  napalm:  { name: 'NAPALM',  icon: 'N', color: '#ff5af0', ammo: 20, cd: 0.4,  dmg: 1 },
  torpedo: { name: 'TORPEDO', icon: 'T', color: '#8affff', ammo: 12, cd: 0.45, dmg: 4 },
};
const WORDER = ['double', 'spread', 'laser', 'missile', 'flak', 'napalm', 'torpedo'];
let weapon = 'vulcan', ammo = Infinity;
for (const k in WEAPONS) PU_SPR[k] = badge(WEAPONS[k].color, WEAPONS[k].icon);

/* ---------- game state ---------- */
const ST = { TITLE: 0, PLAY: 1, DYING: 2, OVER: 3, PAUSE: 4 };
let state = ST.TITLE;

let camTop, scroll, stage, stageDist;
let score, hiScore, lives, bombs;
let player, bullets, tbullets, enemies, fuels, bridges, particles, powerups, fires, popups, clouds;
let spawnAcc, bridgeAcc, fuelAcc, fuelBeepT;
let dieT, banner, bannerT;
let tripleT = 0, rapidT = 0, shieldT = 0;
let shake = 0, flashT = 0;
let time = 0;

const PU_TABLE = [
  ['gem', 26], ['life', 6], ['triple', 14], ['rapid', 14], ['shield', 12],
];
function rollPowerup() {
  let total = 0;
  for (const p of PU_TABLE) total += p[1];
  let r = Math.random() * total;
  for (const p of PU_TABLE) { r -= p[1]; if (r <= 0) return p[0]; }
  return 'gem';
}
function rollWeaponCrate() {
  // prefer weapons the player doesn't already carry; heavier guns rarer early
  let pool = WORDER.slice(0, Math.min(WORDER.length, 3 + stage));
  return pool[irnd(0, pool.length - 1)];
}

hiScore = +(localStorage.getItem('rr_hiscore') || 0);

function resetGame() {
  score = 0; lives = 3; bombs = 2;
  stage = 1; stageDist = 0;
  scroll = 130;
  bullets = []; tbullets = []; enemies = []; fuels = []; bridges = [];
  particles = []; powerups = []; fires = []; popups = [];
  spawnAcc = 300; bridgeAcc = 1500; fuelAcc = 700; fuelBeepT = 0;
  dieT = 0; banner = 'STAGE 1'; bannerT = 2;
  camTop = 0;
  tripleT = 0; rapidT = 0; shieldT = 0;
  weapon = 'vulcan'; ammo = Infinity;
  shake = 0; flashT = 0;
  clouds = [];
  for (let i = 0; i < 7; i++)
    clouds.push({ x: rnd(0, W), y: rnd(-H, H), r: rnd(38, 90), vx: rnd(-8, 8) });
  river.init();
  initTerrain(camTop);
  player = { x: river.sample(H - 100).cx, y: H - 110, inv: 2, fuel: 100, fireCd: 0, tilt: 0, muzzle: 0, wakeT: 0 };
}

/* ---------- juice helpers ---------- */
function addShake(n) { shake = Math.min(14, shake + n); }
function popup(x, y, s, color) {
  popups.push({ x, y, s, c: color || '#fff', life: 1.1 });
}

function spawnExplosion(x, y, big) {
  const n = big ? 30 : 18;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), sp = rnd(30, big ? 230 : 150);
    particles.push({
      kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rnd(0.35, big ? 0.9 : 0.6), max: 0.9,
      c: ['#ffd24a', '#ff8c2a', '#e84a1a', '#fff2c8'][irnd(0, 3)],
      s: rnd(2, big ? 6 : 4)
    });
  }
  const sm = big ? 14 : 8;
  for (let i = 0; i < sm; i++) {
    const a = rnd(0, Math.PI * 2), sp = rnd(8, big ? 55 : 35);
    particles.push({
      kind: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 26,
      life: rnd(0.7, 1.4), max: 1.4,
      c: ['#5a5a64', '#787882', '#42424c'][irnd(0, 2)],
      s: rnd(4, big ? 9 : 6), grow: rnd(4, 9)
    });
  }
  particles.push({ kind: 'ring', x, y, life: 0.35, max: 0.35, r: big ? 8 : 5, rG: big ? 260 : 160 });
  addShake(big ? 5 : 2.4);
}
function spawnFoam(x, y, big) {
  for (let i = 0; i < (big ? 2 : 1); i++)
    particles.push({
      kind: 'foam', x: x + rnd(-4, 4), y: y + rnd(0, 6), vx: rnd(-6, 6), vy: rnd(20, 45),
      life: rnd(0.4, 0.8), max: 0.8, s: rnd(2, big ? 5 : 3)
    });
}

/* ---------- spawning ---------- */
function spawnEnemy() {
  const y = camTop - 60;
  const b = river.sample(y);
  const left = b.cx - b.half + 18, right = b.cx + b.half - 18;
  const x = rnd(left, right);
  const r = Math.random();
  let e;
  if (r < 0.22) e = { t: 'boat', x, w: y, sv: rnd(45, 95), vx: rnd(-14, 14), hw: 11, hh: 8, pts: 30, hp: 1 };
  else if (r < 0.40) e = { t: 'ship', x, w: y, sv: rnd(8, 30), vx: rnd(-6, 6), hw: 15, hh: 12, pts: 50, hp: 3 };
  else if (r < 0.55) e = { t: 'plane', x, w: y, sv: rnd(60, 115), vx: rnd(-24, 24), hw: 12, hh: 15, pts: 100, hp: 1 };
  else if (r < 0.70) e = { t: 'heli', x, w: y, sv: rnd(10, 26), vx: 0, ph: rnd(0, 6), hw: 12, hh: 11, pts: 150, hp: 1 };
  else if (r < 0.84 && stage >= 2) e = { t: 'jet', x, w: y, sv: rnd(150, 210), vx: rnd(-10, 10), hw: 11, hh: 12, pts: 120, hp: 1 };
  else if (stage >= 3 && r < 0.94) e = { t: 'barge', x, w: y, sv: rnd(6, 16), vx: rnd(-4, 4), hw: 13, hh: 11, pts: 200, hp: 6 };
  else e = { t: 'heli', x, w: y, sv: rnd(10, 26), vx: 0, ph: rnd(0, 6), hw: 12, hh: 11, pts: 150, hp: 1 };
  e.water = e.t === 'boat' || e.t === 'ship' || e.t === 'barge';
  e.wakeT = 0;
  enemies.push(e);
}
function spawnBridge() {
  const y = camTop - 80;
  bridges.push({ w: y, h: 36 });
  enemies.push({ t: 'tank', x: 60, w: y, sv: 0, vx: 42, hw: 12, hh: 9, pts: 100, hp: 2, onBridge: true, cd: rnd(0.5, 1.4) });
  enemies.push({ t: 'tank', x: W - 60, w: y, sv: 0, vx: -42, hw: 12, hh: 9, pts: 100, hp: 2, onBridge: true, cd: rnd(0.5, 1.4) });
}
function spawnFuel() {
  const y = camTop - 60;
  const b = river.sample(y);
  const side = Math.random() < 0.5 ? 0 : 1;
  fuels.push({ w: y, side, x: side ? b.cx + b.half : b.cx - b.half, zw: 52, hh: 24 });
}

function killEnemy(e, byBomb, drop) {
  const sy = e.w - camTop;
  spawnExplosion(e.x, sy, e.t === 'ship' || e.t === 'tank' || e.t === 'barge');
  e.t === 'ship' || e.t === 'barge' ? sfx.boomB() : sfx.boomS();
  const pts = e.pts + (byBomb ? 50 : 0);
  score += pts;
  popup(e.x, sy, '+' + pts, '#ffe650');
  e.dead = true;
  if (drop !== false && !byBomb) {
    if (weapon === 'vulcan' ? Math.random() < 0.20 : Math.random() < 0.14) {
      if (powerups.length < 5)
        powerups.push({ w: e.w, x: e.x, type: rollWeaponCrate(), gun: true, ph: rnd(0, 6) });
    } else if (Math.random() < 0.16 && powerups.length < 5) {
      powerups.push({ w: e.w, x: e.x, type: rollPowerup(), ph: rnd(0, 6) });
    }
  }
}

function applyPowerup(type) {
  if (type === 'gem') { score += 150; popup(player.x, player.y - 24, '+150', '#57e86a'); }
  else if (type === 'life') lives = Math.min(5, lives + 1);
  else if (type === 'triple') tripleT = 10;
  else if (type === 'rapid') rapidT = 10;
  else if (type === 'shield') shieldT = 8;
  sfx.pickup();
}
function applyWeaponCrate(key) {
  const wd = WEAPONS[key];
  if (key === weapon && ammo !== Infinity) ammo = Math.min(wd.ammo, ammo + Math.ceil(wd.ammo * 0.5));
  else { weapon = key; ammo = wd.ammo; }
  const wname = wd.name;
  popup(player.x, player.y - 24, wname + '!', wd.color);
  sfx.weapon();
}

/* ---------- firing ---------- */
function nearestEnemy(x, y) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead) continue;
    const sy = e.w - camTop;
    if (sy > y + 20) continue; // only aim ahead (up the screen)
    const d = Math.abs(e.x - x) * 2 + Math.abs(sy - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function fire() {
  const px = player.x, py = player.y;
  const W1 = WEAPONS[weapon];
  if (ammo !== Infinity) {
    if (ammo <= 0) { weapon = 'vulcan'; ammo = Infinity; }
    else ammo--;
  }
  player.muzzle = 0.06;
  const rapid = rapidT > 0;
  switch (weapon) {
    case 'vulcan':
      bullets.push({ kind: 'vulcan', x: px, y: py - 18, vx: 0, vy: -560, d: 1 });
      if (tripleT > 0) {
        bullets.push({ kind: 'vulcan', x: px - 12, y: py - 12, vx: 0, vy: -560, d: 1 });
        bullets.push({ kind: 'vulcan', x: px + 12, y: py - 12, vx: 0, vy: -560, d: 1 });
      }
      sfx.shoot();
      break;
    case 'double':
      bullets.push({ kind: 'bolt', x: px - 6, y: py - 16, vx: 0, vy: -620, d: 1 });
      bullets.push({ kind: 'bolt', x: px + 6, y: py - 16, vx: 0, vy: -620, d: 1 });
      sfx.shootDouble();
      break;
    case 'spread': {
      const n = tripleT > 0 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.24;
        bullets.push({ kind: 'pellet', x: px, y: py - 14, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, d: 1 });
      }
      sfx.shootSpread();
      break;
    }
    case 'laser':
      bullets.push({ kind: 'laser', x: px, y: py - 20, vx: 0, vy: -900, d: 1, pierce: true });
      sfx.shootLaser();
      break;
    case 'missile':
      bullets.push({ kind: 'missile', x: px, y: py - 16, a: -Math.PI / 2, sp: 330, d: 3, fuse: 0 });
      sfx.shootMissile();
      break;
    case 'flak':
      bullets.push({ kind: 'flak', x: px, y: py - 16, vx: 0, vy: -520, d: 2, traveled: 0 });
      sfx.shootFlak();
      break;
    case 'napalm':
      bullets.push({ kind: 'napalm', x: px, y: py - 14, vx: rnd(-30, 30), vy: -300, d: 1, traveled: 0 });
      sfx.shootNapalm();
      break;
    case 'torpedo':
      bullets.push({ kind: 'torpedo', x: px, y: py - 16, vx: 0, vy: -430, d: 4, wakeT: 0 });
      sfx.shootTorpedo();
      break;
  }
  player.fireCd = rapid ? W1.cd * 0.55 : W1.cd;
}

/* ---------- input ---------- */
const keys = {};
let pointerDown = false, pointerLast = null;

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / viewScale, y: (e.clientY - r.top) / viewScale };
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audioInit();
  const p = canvasPos(e);
  if (state === ST.TITLE) { resetGame(); musicReset(); engineStart(); state = ST.PLAY; return; }
  if (state === ST.OVER) { state = ST.TITLE; return; }
  if (state !== ST.PLAY) return;
  pointerDown = true;
  pointerLast = p;
});
window.addEventListener('pointermove', (e) => {
  if (!pointerDown || state !== ST.PLAY) return;
  const p = canvasPos(e);
  const dx = (p.x - pointerLast.x) * 1.6, dy = (p.y - pointerLast.y) * 1.6;
  player.x += dx; player.y += dy;
  player.tilt = clamp(player.tilt + dx * 0.012, -0.5, 0.5);
  pointerLast = p;
});
window.addEventListener('pointerup', () => { pointerDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  audioInit();
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === ST.TITLE) { resetGame(); musicReset(); engineStart(); state = ST.PLAY; }
    else if (state === ST.OVER) state = ST.TITLE;
  }
  if (e.code === 'KeyB' || e.code === 'KeyX') useBomb();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

pauseBtn.addEventListener('click', () => { audioInit(); togglePause(); });
bombBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); audioInit(); useBomb(); });
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); audioInit(); toggleMute(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === ST.PLAY) togglePause();
});

function togglePause() {
  if (state === ST.PLAY) { state = ST.PAUSE; pauseBtn.textContent = '▶'; engineStop(); }
  else if (state === ST.PAUSE) { state = ST.PLAY; pauseBtn.textContent = '❚❚'; audioInit(); engineStart(); musicReset(); }
}
function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  muteBtn.textContent = muted ? '🔇' : '🔊';
}

function useBomb() {
  if (state !== ST.PLAY || bombs <= 0) return;
  bombs--;
  sfx.bomb();
  flashT = 0.28;
  addShake(9);
  for (const e of enemies) {
    const sy = e.w - camTop;
    if (sy > -40 && sy < H + 40 && !e.dead) killEnemy(e, true);
  }
  for (const tb of tbullets) if (tb.y > 0 && tb.y < H) tb.dead = true;
}

/* ---------- update ---------- */
function crash() {
  state = ST.DYING;
  dieT = 1.8;
  sfx.boomB();
  spawnExplosion(player.x, player.y, true);
  spawnExplosion(player.x + 8, player.y + 6, false);
}
function respawn() {
  lives--;
  if (lives <= 0) {
    if (score > hiScore) { hiScore = score; localStorage.setItem('rr_hiscore', hiScore); }
    state = ST.OVER;
    engineStop();
    return;
  }
  const b = river.sample(H - 110);
  player.x = b.cx; player.y = H - 110; player.inv = 2.5;
  player.fuel = Math.max(player.fuel, 55);
  for (const tb of tbullets) tb.dead = true;
  tbullets = tbullets.filter(t => !t.dead);
  for (const e of enemies) {
    if (!e.dead && Math.abs(e.w - (camTop + player.y)) < 420) {
      spawnExplosion(e.x, e.w - camTop, false);
      e.dead = true;
    }
  }
  state = ST.PLAY;
}

function update(dt) {
  time += dt;
  shake = Math.max(0, shake - dt * 22);
  flashT = Math.max(0, flashT - dt);
  if (player) player.tilt *= (1 - dt * 6);

  if (state === ST.DYING) {
    dieT -= dt;
    const dd = scroll * dt * 0.3;
    camTop -= dd;
    scrollTerrain(dd);
    updateParticles(dt);
    if (dieT <= 0) respawn();
    return;
  }
  if (state !== ST.PLAY) return;

  engineTune();
  musicSchedule();

  // stage progression
  stageDist += scroll * dt;
  if (stageDist > 5000) {
    stageDist = 0;
    stage++;
    scroll = Math.min(260, 130 + (stage - 1) * 22);
    banner = 'STAGE ' + stage; bannerT = 2.2;
    sfx.stage();
    musicReset();
  }

  const dCam = scroll * dt;
  camTop -= dCam;
  scrollTerrain(dCam);

  // clouds drift
  for (const c of clouds) {
    c.y += (scroll * 0.35 + 12) * dt;
    c.x += c.vx * dt;
    if (c.y - c.r > H) { c.y = -c.r - rnd(0, 200); c.x = rnd(0, W); }
  }

  // --- player movement (keyboard) ---
  const psp = 300;
  let kvx = 0;
  if (keys.ArrowLeft || keys.KeyA) { player.x -= psp * dt; kvx = -1; }
  if (keys.ArrowRight || keys.KeyD) { player.x += psp * dt; kvx = 1; }
  if (kvx) player.tilt = clamp(player.tilt + kvx * dt * 3.5, -0.5, 0.5);
  if (keys.ArrowUp || keys.KeyW) player.y -= psp * dt;
  if (keys.ArrowDown || keys.KeyS) player.y += psp * dt;
  player.x = clamp(player.x, 16, W - 16);
  player.y = clamp(player.y, H * 0.42, H - 56);
  if (player.inv > 0) player.inv -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;

  // engine exhaust
  if ((time * 30 | 0) !== ((time - dt) * 30 | 0))
    particles.push({ kind: 'smoke', x: player.x + rnd(-2, 2), y: player.y + 16, vx: rnd(-6, 6), vy: rnd(30, 50),
      life: 0.3, max: 0.3, c: 'rgba(200,205,215,0.5)', s: 2, grow: 6 });

  // fuel
  player.fuel -= 2.1 * dt;
  if (player.fuel <= 0) { player.fuel = 0; crash(); return; }
  fuelBeepT -= dt;
  if (player.fuel < 20 && fuelBeepT <= 0) { sfx.warn(); fuelBeepT = 1; }

  // firing
  player.fireCd -= dt;
  const wantFire = pointerDown || keys.Space;
  if (wantFire && player.fireCd <= 0) {
    let n = 0; for (const b of bullets) if (!b.dead) n++;
    if (n < 6) fire();
    else player.fireCd = 0.03;
  }

  // --- bullets ---
  for (const b of bullets) {
    if (b.dead) continue;
    if (b.kind === 'missile') {
      b.fuse += dt;
      const tgt = nearestEnemy(b.x, b.y);
      if (tgt) {
        const ta = Math.atan2((tgt.w - camTop) - b.y, tgt.x - b.x);
        let da = ta - b.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        b.a += clamp(da, -3.2 * dt, 3.2 * dt);
      }
      b.sp = Math.min(420, b.sp + 260 * dt);
      b.x += Math.cos(b.a) * b.sp * dt;
      b.y += Math.sin(b.a) * b.sp * dt;
      if ((time * 40 | 0) !== ((time - dt) * 40 | 0))
        particles.push({ kind: 'smoke', x: b.x, y: b.y + 6, vx: rnd(-8, 8), vy: rnd(10, 30), life: 0.35, max: 0.35, c: '#c8c8d0', s: 3, grow: 8 });
    } else {
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      if (b.traveled !== undefined) b.traveled += Math.abs(b.vy) * dt;
    }
    if (b.kind === 'torpedo') {
      b.wakeT -= dt;
      if (b.wakeT <= 0) { spawnFoam(b.x, b.y + 8, false); b.wakeT = 0.04; }
    }
    // flak airburst
    if (b.kind === 'flak') {
      let boomNow = b.traveled > 250;
      if (!boomNow) for (const e of enemies) {
        if (e.dead) continue;
        const sy = e.w - camTop;
        if (Math.abs(e.x - b.x) < 36 && Math.abs(sy - b.y) < 36) { boomNow = true; break; }
      }
      if (boomNow) {
        b.dead = true;
        sfx.flakBurst();
        spawnExplosion(b.x, b.y, false);
        addShake(1.5);
        for (const e of enemies) {
          if (e.dead) continue;
          const sy = e.w - camTop;
          if (Math.abs(e.x - b.x) < e.hw + 46 && Math.abs(sy - b.y) < e.hh + 46) hitEnemy(e, b.d);
        }
      }
    }
    // napalm lands -> fire pool
    if (b.kind === 'napalm' && b.traveled > 180) {
      b.dead = true;
      fires.push({ w: camTop + b.y, x: b.x, r: 30, life: 2.8, tick: 0 });
      sfx.napalmHit();
      spawnExplosion(b.x, b.y, false);
    }
    if (b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) b.dead = true;
  }

  // spawns
  spawnAcc += dCam;
  const gap = Math.max(220, 430 - (stage - 1) * 20) * rnd(0.8, 1.2);
  if (spawnAcc > gap && enemies.length < 10) { spawnAcc = 0; spawnEnemy(); }
  bridgeAcc += dCam;
  if (bridgeAcc > 2600 + rnd(0, 900)) { bridgeAcc = 0; spawnBridge(); }
  fuelAcc += dCam;
  if (fuelAcc > 1300) {
    let hasFuel = false;
    for (const f of fuels) if (f.w > camTop - 100) hasFuel = true;
    if (!hasFuel) { fuelAcc = 0; spawnFuel(); }
  }

  // enemies
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.onBridge) {
      e.x += e.vx * dt;
      if (e.x < 40) { e.x = 40; e.vx = Math.abs(e.vx); }
      if (e.x > W - 40) { e.x = W - 40; e.vx = -Math.abs(e.vx); }
      const tsy = e.w - camTop;
      if (tsy > 60 && tsy < H - 40) {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = rnd(0.9, 1.9);
          tbullets.push({ x: e.x, y: tsy + 10, dead: false });
          sfx.tshoot();
        }
      }
    } else {
      const speed = (e.sv || 0) + scroll;
      e.w += speed * dt;
      if (e.t === 'heli') e.x += Math.sin(time * 2.2 + e.ph) * 55 * dt;
      else if (e.vx) e.x += e.vx * dt;
      if (e.water || e.t === 'heli' || e.t === 'plane' || e.t === 'jet') {
        const eb = river.sample(e.w);
        e.x = clamp(e.x, eb.cx - eb.half + 12, eb.cx + eb.half - 12);
      }
      if (e.water) {
        e.wakeT -= dt;
        if (e.wakeT <= 0) {
          const sy = e.w - camTop;
          if (sy > 0 && sy < H) spawnFoam(e.x, sy + e.hh, e.t !== 'boat');
          e.wakeT = e.t === 'barge' || e.t === 'ship' ? 0.06 : 0.12;
        }
      }
    }
    if (e.water) {
      for (const br of bridges)
        if (Math.abs(e.w - br.w) < 26) { e.dead = true; break; }
    }
    // fire pools burn water units
    for (const f of fires) {
      if (f.life <= 0 || !e.water) continue;
      if (Math.abs(e.w - f.w) < f.r + e.hh && Math.abs(e.x - f.x) < f.r + e.hw) {
        f.tick = (f.tick || 0) - dt;
        if (f.tick <= 0) { f.tick = 0.35; hitEnemy(e, 1); if (e.dead) break; }
      }
    }
    // bullets vs enemy
    const sy = e.w - camTop;
    if (!e.dead) for (const b of bullets) {
      if (b.dead || b.kind === 'flak' || b.kind === 'napalm') continue;
      if (b.kind === 'torpedo' && !e.water) continue;
      if (Math.abs(b.x - e.x) < e.hw + 3 && Math.abs(b.y - sy) < e.hh + 5) {
        if (!b.pierce) b.dead = true;
        hitEnemy(e, b.d);
        if (e.dead) break;
      }
    }
    // enemy vs player
    if (!e.dead && player.inv <= 0) {
      if (Math.abs(e.x - player.x) < e.hw + 9 && Math.abs(sy - player.y) < e.hh + 10) {
        if (shieldT > 0) killEnemy(e, false, false);
        else { killEnemy(e, false, false); crash(); return; }
      }
    }
    if (e.w > camTop + H + 140 || e.w < camTop - 500) e.dead = true;
  }
  enemies = enemies.filter(e => !e.dead);
  bullets = bullets.filter(b => !b.dead);

  // tank bullets
  for (const tb of tbullets) {
    tb.y += 380 * dt;
    if (tb.y > H + 20) tb.dead = true;
    if (!tb.dead && player.inv <= 0 &&
        Math.abs(tb.x - player.x) < 10 && Math.abs(tb.y - player.y) < 13) {
      tb.dead = true;
      if (shieldT <= 0) { crash(); return; }
    }
  }
  tbullets = tbullets.filter(b => !b.dead);

  if (tripleT > 0) tripleT -= dt;
  if (rapidT > 0) rapidT -= dt;
  if (shieldT > 0) shieldT -= dt;

  // power-ups & crates
  for (const p of powerups) {
    const sy = p.w - camTop;
    if (sy > H + 40) { p.dead = true; continue; }
    if (Math.abs(p.x - player.x) < 22 && Math.abs(sy - player.y) < 24) {
      p.dead = true;
      if (p.gun) applyWeaponCrate(p.type);
      else applyPowerup(p.type);
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // fire pools (world coords)
  for (const f of fires) {
    f.life -= dt;
    if ((time * 18 | 0) !== ((time - dt) * 18 | 0)) {
      const sy = f.w - camTop;
      if (sy > -20 && sy < H + 20)
        particles.push({ kind: 'flame', x: f.x + rnd(-f.r, f.r) * 0.7, y: sy + rnd(-6, 6),
          vx: rnd(-10, 10), vy: rnd(-50, -20), life: rnd(0.25, 0.5), max: 0.5,
          c: ['#ffd24a', '#ff8c2a', '#e84a1a'][irnd(0, 2)], s: rnd(3, 6) });
    }
  }
  fires = fires.filter(f => f.life > 0 && f.w > camTop - 120);

  // fuels
  for (const f of fuels) {
    const sy = f.w - camTop;
    const fx = f.side ? f.x - 10 : f.x - 42;
    if (player.inv <= 0 && overlap(player.x - 10, player.y - 12, 20, 24, fx, sy - 24, 52, 48)) {
      if (player.fuel < 100) {
        player.fuel = Math.min(100, player.fuel + 45 * dt);
        fuelBeepT -= dt;
        if (fuelBeepT <= 0) { sfx.fuel(); fuelBeepT = 0.12; }
        if (player.fuel >= 100) sfx.fuelFull();
      }
    }
    if (sy > H + 80) f.dead = true;
  }
  fuels = fuels.filter(f => !f.dead);
  bridges = bridges.filter(br => br.w > camTop - 100 && br.w < camTop + H + 160);

  updateParticles(dt);
  for (const p of popups) { p.life -= dt; p.y -= 26 * dt; }
  popups = popups.filter(p => p.life > 0);
  if (bannerT > 0) bannerT -= dt;
}

function hitEnemy(e, d) {
  if (e.dead) return;
  e.hp -= d;
  if (e.hp <= 0) { killEnemy(e, false); return; }
  // damage feedback: flash + small puff
  e.flash = 0.09;
  particles.push({ kind: 'spark', x: e.x + rnd(-4, 4), y: e.w - camTop + rnd(-4, 4),
    vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.2, max: 0.2, c: '#fff2c8', s: 2 });
  if (e.hp <= (e.t === 'barge' ? 2 : 1) && Math.random() < 0.5)
    particles.push({ kind: 'smoke', x: e.x, y: e.w - camTop, vx: rnd(-8, 8), vy: -30,
      life: 0.6, max: 0.6, c: '#42424c', s: 3, grow: 6 });
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'spark' || p.kind === 'flame') p.vy += 60 * dt;
    if (p.kind === 'smoke') p.vy -= 30 * dt;
    if (p.grow) p.s += p.grow * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 260) particles.splice(0, particles.length - 260);
}

/* ---------- draw ---------- */
function txt(s, x, y, size, color, align) {
  ctx.font = 'bold ' + size + 'px "Courier New", monospace';
  ctx.textAlign = align || 'left';
  ctx.fillStyle = '#000';
  ctx.fillText(s, x + 2, y + 2);
  ctx.fillStyle = color || '#fff';
  ctx.fillText(s, x, y);
}
function shadowEllipse(x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWaterFX() {
  // animated shimmer over the baked water: sample the river column per strip
  const th = theme();
  const [sr, sg, sb] = th.shimmer;
  ctx.save();
  for (let y = 0; y < H; y += 14) {
    const wy = camTop + y;
    const b = river.sample(wy);
    const left = b.cx - b.half, right = b.cx + b.half;
    const n = hash1((wy >> 2) * 13 + ((time * 2) | 0));
    const k = (n % 4);
    for (let i = 0; i < k; i++) {
      const wx = left + ((n >> (3 + i * 5)) % Math.max(1, right - left - 12));
      const wob = Math.sin(time * 2.2 + y * 0.11 + i * 2.1) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(' + sr + ',' + sg + ',' + sb + ',' + (0.10 + wob * 0.22) + ')';
      ctx.fillRect(wx, y + (wob * 3 | 0), 8 + (wob * 6 | 0), 2);
    }
  }
  ctx.restore();
}
function drawClouds() {
  const al = theme().cloud;
  for (const c of clouds) {
    ctx.fillStyle = 'rgba(6,8,30,' + al + ')';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r, c.r * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.r * 0.5, c.y + c.r * 0.2, c.r * 0.6, c.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (state === ST.TITLE) { drawTitle(); return; }
  if (state === ST.OVER) { drawOver(); return; }

  // screen shake
  if (shake > 0.3) ctx.translate(rnd(-shake, shake) * 0.5, rnd(-shake, shake) * 0.5);

  // terrain
  ctx.drawImage(ter, 0, TOPM, W, H, 0, 0, W, H);
  drawWaterFX();
  drawClouds();

  // fuels (red tank depot with pulsing glow)
  const pulse = (Math.sin(time * 4) + 1) / 2;
  for (const f of fuels) {
    const sy = f.w - camTop;
    if (sy < -60 || sy > H + 60) continue;
    const zx = f.side ? f.x - 10 : f.x - 42;
    ctx.fillStyle = 'rgba(255,230,80,' + (0.22 + pulse * 0.18) + ')';
    ctx.fillRect(zx, sy - 24, 52, 48);
    ctx.strokeStyle = '#ffe650'; ctx.lineWidth = 2;
    ctx.strokeRect(zx, sy - 24, 52, 48);
    const sx = f.side ? f.x + 14 : f.x - 66;
    ctx.fillStyle = 'rgba(0,0,10,0.3)';
    ctx.fillRect(sx + 3, sy + 12, 52, 6);
    ctx.fillStyle = '#b81a1a';
    ctx.fillRect(sx, sy - 16, 52, 32);
    ctx.fillStyle = '#d83a2a';
    ctx.fillRect(sx + 2, sy - 14, 48, 12);
    ctx.strokeStyle = '#7a1010'; ctx.strokeRect(sx + 0.5, sy - 15.5, 51, 31);
    ctx.fillStyle = '#ffe0c8';
    ctx.fillRect(sx + 4, sy - 12, 44, 2);
    txt('FUEL', sx + 26, sy + 6, 13, '#fff', 'center');
  }

  // fire pools (world)
  for (const f of fires) {
    const sy = f.w - camTop;
    if (sy < -40 || sy > H + 40) continue;
    const a = clamp(f.life / 2.8, 0, 1);
    ctx.fillStyle = 'rgba(255,90,20,' + (0.25 * a) + ')';
    ctx.beginPath(); ctx.arc(f.x, sy, f.r * (1 + pulse * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,180,60,' + (0.35 * a) + ')';
    ctx.beginPath(); ctx.arc(f.x, sy, f.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  // bridges: concrete road bridge with rails + lane dashes + shadow
  for (const br of bridges) {
    const sy = br.w - camTop;
    if (sy < -60 || sy > H + 60) continue;
    ctx.fillStyle = 'rgba(0,0,20,0.25)';
    ctx.fillRect(0, sy + 16, W, 8);
    ctx.fillStyle = '#565b66';
    ctx.fillRect(0, sy - 18, W, 36);
    ctx.fillStyle = '#6b7180';
    ctx.fillRect(0, sy - 13, W, 26);
    ctx.fillStyle = '#454a55';
    ctx.fillRect(0, sy - 18, W, 3);
    ctx.fillRect(0, sy + 15, W, 3);
    ctx.fillStyle = '#ffd24a';
    for (let x = 10; x < W; x += 46) ctx.fillRect(x, sy - 1, 22, 2);
    ctx.fillStyle = '#dfe3ea';
    for (let x = 4; x < W; x += 14) { ctx.fillRect(x, sy - 16, 8, 2); ctx.fillRect(x, sy + 14, 8, 2); }
  }

  // enemies with shadows
  for (const e of enemies) {
    const sy = e.w - camTop;
    if (sy < -50 || sy > H + 50) continue;
    let spr;
    if (e.t === 'boat') spr = SPR.boat;
    else if (e.t === 'ship') spr = SPR.ship;
    else if (e.t === 'barge') spr = SPR.barge;
    else if (e.t === 'plane') spr = SPR.plane;
    else if (e.t === 'jet') spr = SPR.jet;
    else if (e.t === 'heli') spr = SPR.heli;
    else spr = SPR.tank;
    shadowEllipse(e.x, sy + spr.h / 2 - 1, spr.w * 0.4, 3.5);
    ctx.drawImage(spr.canvas, Math.round(e.x - spr.w / 2), Math.round(sy - spr.h / 2));
    if (e.flash > 0) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(spr.canvas, Math.round(e.x - spr.w / 2), Math.round(sy - spr.h / 2));
      ctx.globalAlpha = 1;
      e.flash = 0;
    }
    if (e.t === 'heli') {
      ctx.strokeStyle = 'rgba(220,225,235,0.9)';
      ctx.lineWidth = 3;
      const a = time * 14;
      const cxr = e.x, cyr = sy - 10;
      ctx.beginPath();
      ctx.moveTo(cxr - Math.cos(a) * 16, cyr - Math.sin(a) * 4);
      ctx.lineTo(cxr + Math.cos(a) * 16, cyr + Math.sin(a) * 4);
      ctx.stroke();
    }
    if (e.t === 'jet' && (time * 20 | 0) % 2) {
      ctx.fillStyle = '#ff8c2a';
      ctx.fillRect(Math.round(e.x - 1), Math.round(sy + spr.h / 2 - 2), 3, 5);
    }
  }

  // bullets per weapon
  for (const b of bullets) {
    const bx = Math.round(b.x), by = Math.round(b.y);
    switch (b.kind) {
      case 'vulcan':
        ctx.fillStyle = 'rgba(255,255,220,0.35)'; ctx.fillRect(bx - 3, by - 2, 6, 14);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx - 2, by, 4, 10);
        break;
      case 'bolt':
        ctx.fillStyle = 'rgba(255,230,80,0.35)'; ctx.fillRect(bx - 3, by - 2, 6, 16);
        ctx.fillStyle = '#ffe650'; ctx.fillRect(bx - 1, by, 3, 12);
        break;
      case 'pellet':
        ctx.fillStyle = '#ffd0a0'; ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'laser':
        ctx.fillStyle = 'rgba(90,230,255,0.3)'; ctx.fillRect(bx - 3, by - 26, 6, 34);
        ctx.fillStyle = '#57e8ff'; ctx.fillRect(bx - 1, by - 24, 2, 32);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx, by - 24, 1, 32);
        break;
      case 'missile':
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a + Math.PI / 2);
        ctx.fillStyle = '#d8d8e0'; ctx.fillRect(-2, -8, 4, 14);
        ctx.fillStyle = '#ff5a4a'; ctx.fillRect(-2, -8, 4, 4);
        ctx.fillStyle = '#ff8c2a'; ctx.fillRect(-2, 6, 4, 4);
        ctx.restore();
        break;
      case 'flak':
        ctx.fillStyle = '#c8a0ff'; ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(bx - 1, by - 1, 2, 2);
        break;
      case 'napalm':
        ctx.fillStyle = '#ff5af0'; ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill();
        break;
      case 'torpedo':
        ctx.fillStyle = '#c8dce8'; ctx.fillRect(bx - 2, by - 8, 4, 16);
        ctx.fillStyle = '#8affff'; ctx.fillRect(bx - 2, by - 8, 4, 4);
        break;
    }
  }

  // power-ups / crates (bobbing badges with glow ring)
  for (const p of powerups) {
    const sy = p.w - camTop + Math.sin(time * 3 + p.ph) * 4;
    if (sy < -30 || sy > H + 30) continue;
    const spr = PU_SPR[p.type] || PU_SPR.gem;
    ctx.strokeStyle = p.gun ? WEAPONS[p.type].color : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, sy, 11 + Math.sin(time * 5 + p.ph) * 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.drawImage(spr, Math.round(p.x - 8), Math.round(sy - 8));
  }

  // tank bullets (glowing)
  for (const tb of tbullets) {
    const tx = Math.round(tb.x), ty = Math.round(tb.y);
    ctx.fillStyle = 'rgba(255,140,40,0.35)'; ctx.fillRect(tx - 3, ty - 2, 6, 13);
    ctx.fillStyle = '#ffb04a'; ctx.fillRect(tx - 2, ty, 4, 9);
    ctx.fillStyle = '#ffe6c8'; ctx.fillRect(tx - 1, ty + 1, 2, 3);
  }

  // player
  if (state === ST.PLAY && (player.inv <= 0 || (time * 10 | 0) % 2 === 0)) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt * 0.4);
    shadowEllipse(0, SPR.player.h / 2 + 2, 12, 3);
    if (player.muzzle > 0) {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(0, -SPR.player.h / 2 - 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -SPR.player.h / 2 - 5, 2, 6);
    }
    ctx.drawImage(SPR.player.canvas, -SPR.player.w / 2, -SPR.player.h / 2);
    ctx.restore();
    if (shieldT > 0) {
      ctx.strokeStyle = (time * 6 | 0) % 2 ? '#4a9aff' : '#9ad2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // particles
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'ring') {
      const rr = p.r + (1 - p.life / p.max) * p.rG;
      ctx.strokeStyle = 'rgba(255,240,200,' + (a * 0.8) + ')';
      ctx.lineWidth = 2 * a + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = p.kind === 'smoke' ? a * 0.6 : p.kind === 'foam' ? a * 0.7 : 1;
    ctx.fillStyle = p.c;
    if (p.kind === 'flame' || p.kind === 'spark' || p.kind === 'smoke') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2 + 0.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
  }
  ctx.globalAlpha = 1;

  // floating score popups
  for (const p of popups) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    txt(p.s, p.x, p.y, 13, p.c, 'center');
  }
  ctx.globalAlpha = 1;

  // per-stage color grade
  const gr = theme().grade;
  if (gr) { ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
  // bomb flash
  if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,240,' + (flashT * 2.2) + ')'; ctx.fillRect(0, 0, W, H); }

  ctx.setTransform(1, 0, 0, 1, 0, 0); // HUD ignores shake

  // HUD
  ctx.fillStyle = 'rgba(0,0,10,0.55)';
  ctx.fillRect(0, 0, W, 34);
  txt('SCORE ' + String(score).padStart(6, '0'), 10, 23, 17, '#fff');
  txt('HI ' + String(hiScore).padStart(6, '0'), W / 2, 23, 15, '#ffe650', 'center');
  txt('STAGE ' + stage, W - 10, 23, 15, '#8aff8a', 'right');
  // fuel bar
  ctx.fillStyle = 'rgba(0,0,10,0.55)';
  ctx.fillRect(8, H - 26, 172, 20);
  ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
  ctx.strokeRect(8.5, H - 25.5, 171, 19);
  const fw = (164 * player.fuel) / 100;
  ctx.fillStyle = player.fuel < 20 ? ((time * 4 | 0) % 2 ? '#ff3a2a' : '#8a1a0a') : '#3aff5a';
  ctx.fillRect(12, H - 22, fw, 13);
  txt('FUEL', 8, H - 30, 11, '#aaa');
  // lives
  for (let i = 0; i < lives; i++)
    ctx.drawImage(SPR.player.canvas, W - 24 - i * 26, H - 40, 18, 24);
  // weapon box (center bottom)
  const WD = WEAPONS[weapon];
  const bw = 108;
  ctx.fillStyle = 'rgba(0,0,10,0.6)';
  ctx.fillRect(W / 2 - bw / 2, H - 28, bw, 22);
  ctx.strokeStyle = WD.color; ctx.lineWidth = 1.5;
  ctx.strokeRect(W / 2 - bw / 2 + 0.5, H - 27.5, bw - 1, 21);
  ctx.drawImage(PU_SPR[weapon], W / 2 - bw / 2 + 4, H - 25, 16, 16);
  txt(WD.name, W / 2 - bw / 2 + 25, H - 13, 12, WD.color);
  txt(ammo === Infinity ? '∞' : String(ammo), W / 2 + bw / 2 - 6, H - 13, 13, '#fff', 'right');
  // active power-up timers
  const act = [];
  if (tripleT > 0) act.push(['3X', tripleT, '#ffd24a']);
  if (rapidT > 0) act.push(['FF', rapidT, '#ff8c2a']);
  if (shieldT > 0) act.push(['S', shieldT, '#4a9aff']);
  for (let i = 0; i < act.length; i++) {
    const [lbl, t, col] = act[i];
    ctx.fillStyle = col;
    ctx.fillRect(W / 2 - 54 + i * 40, H - 50, 34, 16);
    ctx.fillStyle = '#10142a';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(lbl + ' ' + Math.ceil(t), W / 2 - 37 + i * 40, H - 38);
  }
  // bombs (above the life icons, no overlap)
  txt('BOMB x' + bombs, W - 10, H - 46, 13, '#ffb04a', 'right');

  // banner
  if (bannerT > 0) {
    const bn = banner + (theme().name ? ' · ' + theme().name : '');
    txt(bn, W / 2, H / 2 - 40, 26, '#fff', 'center');
  }

  if (state === ST.PAUSE) {
    ctx.fillStyle = 'rgba(0,0,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    txt('ПАУЗА', W / 2, H / 2, 34, '#fff', 'center');
    txt('нажми паузу чтобы продолжить', W / 2, H / 2 + 34, 15, '#ccc', 'center');
  }
}

function drawTitle() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);
  // decorative river strip with animated shimmer
  ctx.fillStyle = '#2e4fc2';
  ctx.fillRect(120, 0, 240, H);
  for (let y = 10; y < H; y += 26) {
    const wob = Math.sin(time * 1.7 + y * 0.07) * 0.5 + 0.5;
    ctx.fillStyle = 'rgba(150,190,255,' + (0.12 + wob * 0.25) + ')';
    ctx.fillRect(150 + ((y * 7) % 140), y + wob * 4, 14, 3);
    ctx.fillRect(250 + ((y * 13) % 90), y + 8 - wob * 3, 10, 2);
  }
  // a boat and a ship cruising the title river
  const by = (time * 40) % (H + 60) - 30;
  ctx.drawImage(SPR.ship.canvas, 210, H - by, 40, 30);
  ctx.drawImage(SPR.boat.canvas, 170, (time * 55) % (H + 40) - 20, 24, 20);
  txt('RIVER', W / 2, 170, 64, '#ffe650', 'center');
  txt('RAID', W / 2, 238, 64, '#8aff8a', 'center');
  ctx.drawImage(SPR.player.canvas, W / 2 - 20, 276, 40, 48);
  if (hiScore > 0) txt('РЕКОРД: ' + hiScore, W / 2, 360, 18, '#ffe650', 'center');
  txt('управление: веди пальцем · огонь — держа', W / 2, 400, 15, '#ccc', 'center');
  // arsenal
  txt('АРСЕНАЛ: ящики с врагов', W / 2, 440, 15, '#8aff8a', 'center');
  const wk = ['vulcan', ...WORDER];
  const x0 = W / 2 - (wk.length * 30) / 2 + 7;
  for (let i = 0; i < wk.length; i++) ctx.drawImage(PU_SPR[wk[i]], x0 + i * 30, 452);
  txt('V D S L M F N T — боезапас кончается', W / 2, 486, 13, '#9aa2b0', 'center');
  txt('усилки: 3X FF S $ + жизнь', W / 2, 508, 13, '#9aa2b0', 'center');
  // enemies row
  ctx.drawImage(SPR.boat.canvas, 90, 560, 24, 20);
  ctx.drawImage(SPR.ship.canvas, 140, 555, 40, 30);
  ctx.drawImage(SPR.barge.canvas, 200, 552, 32, 28);
  ctx.drawImage(SPR.plane.canvas, 250, 548, 30, 38);
  ctx.drawImage(SPR.jet.canvas, 300, 552, 30, 28);
  ctx.drawImage(SPR.heli.canvas, 350, 556, 30, 28);
  if ((time * 2 | 0) % 2 === 0) txt('НАЖМИ, ЧТОБЫ НАЧАТЬ', W / 2, 664, 20, '#fff', 'center');
}

function drawOver() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);
  txt('GAME OVER', W / 2, 240, 52, '#ff5a4a', 'center');
  txt('СЧЁТ: ' + score, W / 2, 320, 26, '#fff', 'center');
  txt('РЕКОРД: ' + hiScore, W / 2, 356, 20, '#ffe650', 'center');
  txt('дошли до этапа ' + stage, W / 2, 396, 18, '#8aff8a', 'center');
  if ((time * 2 | 0) % 2 === 0) txt('НАЖМИ, ЧТОБЫ В МЕНЮ', W / 2, 480, 20, '#fff', 'center');
}

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (state === ST.TITLE || state === ST.OVER) time += dt;
  update(dt);
  draw();
  pauseBtn.style.display = (state === ST.PLAY || state === ST.PAUSE) ? 'flex' : 'none';
  bombBtn.style.display = state === ST.PLAY ? 'flex' : 'none';
  muteBtn.style.display = state === ST.TITLE ? 'none' : 'flex';
}
requestAnimationFrame(frame);
