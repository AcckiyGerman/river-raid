'use strict';
/* ============================================================
   RIVER RAID — Amiga-style remake, browser/mobile edition
   Top-down: plane flies up the river, shoot boats/ships/planes/
   helicopters/tanks-on-bridges. Touch drag = fly, hold = fire.
   ============================================================ */

const W = 480, H = 720;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const pauseBtn = document.getElementById('pauseBtn');
const bombBtn = document.getElementById('bombBtn');

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
/* mirror-symmetric template: right half is the mirror of the left,
   so silhouettes stay clean instead of hand-drawn asymmetry */
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
    '....212....']),
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
/* power-up badges (16x16) */
function badge(color, text) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#10142a'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = color; g.fillRect(1, 1, 14, 14);
  g.fillStyle = '#10142a';
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
function audioInit() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}
function beep(freq, dur, type, vol, slide, delay) {
  if (!ac || muted) return;
  type = type || 'square'; vol = vol || 0.12; delay = delay || 0;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur);
}
function boom(dur, vol, f) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f || 900;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol || 0.4, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(ac.destination);
  s.start(t0); s.stop(t0 + dur);
}
const sfx = {
  shoot:  () => beep(950, 0.06, 'square', 0.05, -600),
  boomS:  () => { boom(0.35, 0.35, 1400); beep(120, 0.25, 'sawtooth', 0.12, -70); },
  boomB:  () => { boom(0.7, 0.5, 800); beep(80, 0.5, 'sawtooth', 0.18, -50); },
  bomb:   () => { boom(1.3, 0.6, 500); beep(60, 1.0, 'sawtooth', 0.2, -30); },
  fuel:   () => beep(1500, 0.05, 'square', 0.05),
  fuelFull: () => { beep(1200, 0.07, 'square', 0.07); beep(1600, 0.1, 'square', 0.07, 0, 0.09); },
  stage:  () => { beep(520, 0.1, 'square', 0.1); beep(660, 0.1, 'square', 0.1, 0, 0.11); beep(880, 0.16, 'square', 0.1, 0, 0.22); },
  tshoot: () => beep(380, 0.08, 'square', 0.05, -220),
  warn:   () => beep(300, 0.12, 'square', 0.08),
  pickup: () => { beep(700, 0.06, 'square', 0.06); beep(1050, 0.08, 'square', 0.06, 0, 0.06); },
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
    const k = (1 - Math.cos(t * Math.PI)) / 2; // cosine ease
    return { cx: a.cx + (b.cx - a.cx) * k, half: a.half + (b.half - a.half) * k };
  }
};

/* ---------- terrain scroll buffer ---------- */
const HB = 1024; // buffer height (covers H + 256 top margin + 48 bottom)
const TOPM = 256; // buffer rows above screen top
const ter = document.createElement('canvas');
ter.width = W; ter.height = HB;
const terCtx = ter.getContext('2d');

function paintRow(buf, wy) {
  // wy = worldY of this buffer row (buffer row 0 = top of buffer = oldest/bottom-ish)
  const b = river.sample(wy);
  const left = b.cx - b.half, right = b.cx + b.half;
  // sand base
  const stripe = hash1(wy >> 2);
  const sand = (stripe & 7) === 0 ? '#c8a94e' : ((stripe & 3) === 0 ? '#b8983f' : '#c2a047');
  buf.fillStyle = sand;
  buf.fillRect(0, 0, W, 1);
  // water
  buf.fillStyle = '#2e4fc2';
  buf.fillRect(left, 0, right - left, 1);
  // waves
  const h2 = hash1(wy * 7 + 13);
  if ((h2 & 7) === 0) {
    buf.fillStyle = '#4a6fe0';
    const wx = left + ((h2 >> 4) % Math.max(1, (right - left - 14)));
    buf.fillRect(wx, 0, 10, 1);
  }
  // bank edges
  buf.fillStyle = '#8a6a2a';
  buf.fillRect(left - 1, 0, 2, 1);
  buf.fillRect(right - 1, 0, 2, 1);
}

/* Bank decorations (houses, trees, bushes, grass). Drawn in a SECOND pass
   after the sand rows, because a decor sprite spans multiple rows and would
   be overpainted by the sand of the rows it extends into. Deterministic per
   worldY, so they scroll with the banks. */
function paintDecorAt(buf, wy, row, left, right) {
  if (row + 12 >= HB) return; // sprite must fit in the buffer (extends down)
  const hd = hash1(wy * 29 + 101);
  const dr = hd % 512;
  if (dr >= 28) return; // ~5.5% of rows carry a decor item
  let side = (hd >> 8) & 1;
  if (side && W - right < 26) side = 0; // not enough sand on the right
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
    // house: red roof, light walls, door + windows
    buf.fillStyle = '#a03a2a'; buf.fillRect(x - 2, 0, 18, 1);
    buf.fillStyle = '#b84a34'; buf.fillRect(x - 1, 1, 16, 1);
    buf.fillStyle = '#d8c090'; buf.fillRect(x, 2, 14, 6);
    buf.fillStyle = '#7a4a20'; buf.fillRect(x + 6, 5, 3, 3);
    buf.fillStyle = '#7ac8f0'; buf.fillRect(x + 1, 3, 3, 2);
    buf.fillRect(x + 10, 3, 3, 2);
  } else if (dr < 8) {
    // tree: trunk + layered crown
    buf.fillStyle = '#5a3a18'; buf.fillRect(x + 3, 8, 3, 5);
    buf.fillStyle = '#2f7a1f'; buf.fillRect(x, 3, 9, 6);
    buf.fillStyle = '#3f9a2a'; buf.fillRect(x + 1, 1, 7, 4);
    buf.fillStyle = '#57b53a'; buf.fillRect(x + 2, 0, 4, 2);
  } else if (dr < 20) {
    // bush
    buf.fillStyle = '#3a7a24'; buf.fillRect(x, 2, 7, 3);
    buf.fillStyle = '#4a9a30'; buf.fillRect(x + 1, 1, 5, 2);
    buf.fillStyle = '#2a5a18'; buf.fillRect(x + 2, 4, 3, 1);
  } else {
    // grass tuft
    buf.fillStyle = '#4a8a2a';
    buf.fillRect(x, 0, 1, 3);
    buf.fillRect(x + 2, 1, 1, 2);
    buf.fillRect(x + 4, 0, 1, 2);
  }
}

let bufTopWorld = 0; // worldY of buffer row 0 (smallest worldY)
let terRem = 0; // fractional scroll remainder (keeps buffer locked to camTop)
function paintBufferRows(fromRow, toRow) {
  // pass 1: sand/water/edges
  for (let r = fromRow; r < toRow; r++) {
    terCtx.save();
    terCtx.translate(0, r);
    paintRow(terCtx, bufTopWorld + r);
    terCtx.restore();
  }
  // pass 2: decor (multi-row sprites) over the sand
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
  // flying upstream: world moves DOWN on screen -> buffer content shifts down,
  // fresh rows appear at the top of the buffer (smallest worldY)
  bufTopWorld -= d;
  river.ensureLow(bufTopWorld - 120);
  river.trimHigh(bufTopWorld + HB + 200);
  terCtx.drawImage(ter, 0, 0, W, HB - d, 0, d, W, HB - d);
  paintBufferRows(0, d);
}

/* ---------- game state ---------- */
const ST = { TITLE: 0, PLAY: 1, DYING: 2, OVER: 3, PAUSE: 4 };
let state = ST.TITLE;
let prevState = ST.TITLE;

let camTop, scroll, stage, stageDist;
let score, hiScore, lives, bombs;
let player, bullets, tbullets, enemies, fuels, bridges, particles, powerups;
let spawnAcc, bridgeAcc, fuelAcc, fuelBeepT;
let dieT, banner, bannerT;
let tripleT = 0, rapidT = 0, shieldT = 0; // active power-up timers
let time = 0;

/* power-up drop table: [type, weight] */
const PU_TABLE = [
  ['gem', 30],      // +150 points (common)
  ['life', 6],      // +1 life (rare)
  ['triple', 16],   // triple shot 10s
  ['rapid', 16],    // rapid fire 10s
  ['shield', 12],   // shield 8s
];
function rollPowerup() {
  let total = 0;
  for (const p of PU_TABLE) total += p[1];
  let r = Math.random() * total;
  for (const p of PU_TABLE) { r -= p[1]; if (r <= 0) return p[0]; }
  return 'gem';
}

hiScore = +(localStorage.getItem('rr_hiscore') || 0);

function resetGame() {
  score = 0; lives = 3; bombs = 2;
  stage = 1; stageDist = 0;
  scroll = 130;
  bullets = []; tbullets = []; enemies = []; fuels = []; bridges = [];
  particles = []; powerups = [];
  spawnAcc = 300; bridgeAcc = 1500; fuelAcc = 700; fuelBeepT = 0;
  dieT = 0; banner = 'STAGE 1'; bannerT = 2;
  camTop = 0;
  tripleT = 0; rapidT = 0; shieldT = 0;
  river.init();
  initTerrain(camTop);
  player = { x: river.sample(H - 100).cx, y: H - 110, inv: 2, fuel: 100, fireCd: 0 };
}

function spawnExplosion(x, y, big) {
  const n = big ? 30 : 18;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), sp = rnd(30, big ? 220 : 150);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rnd(0.35, big ? 0.9 : 0.6), max: 0.9,
      c: [' #ffd24a'.trim(), '#ff8c2a', '#e84a1a', '#fff2c8'][irnd(0, 3)],
      s: rnd(2, big ? 6 : 4)
    });
  }
}

function spawnEnemy() {
  const y = camTop - 60;
  const b = river.sample(y);
  const left = b.cx - b.half + 18, right = b.cx + b.half - 18;
  const x = rnd(left, right);
  const r = Math.random();
  let e;
  if (r < 0.28) e = { t: 'boat', x, w: y, sv: rnd(45, 95), vx: rnd(-14, 14), hw: 11, hh: 8, pts: 30 };
  else if (r < 0.52) e = { t: 'ship', x, w: y, sv: rnd(8, 30), vx: rnd(-6, 6), hw: 15, hh: 12, pts: 50 };
  else if (r < 0.80) e = { t: 'plane', x, w: y, sv: rnd(60, 115), vx: rnd(-24, 24), hw: 12, hh: 15, pts: 100 };
  else e = { t: 'heli', x, w: y, sv: rnd(10, 26), vx: 0, ph: rnd(0, 6), hw: 12, hh: 11, pts: 150 };
  e.water = e.t === 'boat' || e.t === 'ship';
  enemies.push(e);
}

function spawnBridge() {
  const y = camTop - 80;
  bridges.push({ w: y, h: 36 });
  enemies.push({ t: 'tank', x: 60, w: y, sv: 0, vx: 42, hw: 12, hh: 9, pts: 100, onBridge: true, cd: rnd(0.5, 1.4) });
  enemies.push({ t: 'tank', x: W - 60, w: y, sv: 0, vx: -42, hw: 12, hh: 9, pts: 100, onBridge: true, cd: rnd(0.5, 1.4) });
}

function spawnFuel() {
  const y = camTop - 60;
  const b = river.sample(y);
  const side = Math.random() < 0.5 ? 0 : 1;
  fuels.push({ w: y, side, x: side ? b.cx + b.half : b.cx - b.half, zw: 52, hh: 24 });
}

function killEnemy(e, byBomb, drop) {
  const sy = e.w - camTop;
  spawnExplosion(e.x, sy, e.t === 'ship' || e.t === 'tank');
  e.t === 'ship' ? sfx.boomB() : sfx.boomS();
  score += e.pts + (byBomb ? 50 : 0);
  e.dead = true;
  // sometimes a power-up drops where the enemy died (bombs don't drop)
  if (drop !== false && !byBomb && Math.random() < 0.22 && powerups.length < 4)
    powerups.push({ w: e.w, x: e.x, type: rollPowerup(), ph: rnd(0, 6) });
}

function applyPowerup(type) {
  sfx.pickup();
  if (type === 'gem') score += 150;
  else if (type === 'life') lives = Math.min(5, lives + 1);
  else if (type === 'triple') tripleT = 10;
  else if (type === 'rapid') rapidT = 10;
  else if (type === 'shield') shieldT = 8;
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
  if (state === ST.TITLE) { resetGame(); state = ST.PLAY; return; }
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
  pointerLast = p;
});
window.addEventListener('pointerup', () => { pointerDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  audioInit();
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === ST.TITLE) { resetGame(); state = ST.PLAY; }
    else if (state === ST.OVER) state = ST.TITLE;
  }
  if (e.code === 'KeyB' || e.code === 'KeyX') useBomb();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

pauseBtn.addEventListener('click', () => { audioInit(); togglePause(); });
bombBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); audioInit(); useBomb(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === ST.PLAY) togglePause();
});

function togglePause() {
  if (state === ST.PLAY) { state = ST.PAUSE; pauseBtn.textContent = '▶'; }
  else if (state === ST.PAUSE) { state = ST.PLAY; pauseBtn.textContent = '❚❚'; }
}
function toggleMute() { muted = !muted; bombBtn.dataset.muted = muted; }

function useBomb() {
  if (state !== ST.PLAY || bombs <= 0) return;
  bombs--;
  sfx.bomb();
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
    return;
  }
  const b = river.sample(H - 110);
  player.x = b.cx; player.y = H - 110; player.inv = 2.5;
  player.fuel = Math.max(player.fuel, 55);
  for (const tb of tbullets) tb.dead = true;
  tbullets = tbullets.filter(t => !t.dead);
  // clear threats near spawn
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

  // stage progression
  stageDist += scroll * dt;
  if (stageDist > 5000) {
    stageDist = 0;
    stage++;
    scroll = Math.min(260, 130 + (stage - 1) * 22);
    banner = 'STAGE ' + stage; bannerT = 2.2;
    sfx.stage();
  }

  // flying upstream: camera worldY decreases (upstream = -worldY)
  const dCam = scroll * dt;
  camTop -= dCam;
  scrollTerrain(dCam);

  // --- player movement (keyboard) ---
  const psp = 300;
  if (keys.ArrowLeft || keys.KeyA) player.x -= psp * dt;
  if (keys.ArrowRight || keys.KeyD) player.x += psp * dt;
  if (keys.ArrowUp || keys.KeyW) player.y -= psp * dt;
  if (keys.ArrowDown || keys.KeyS) player.y += psp * dt;
  player.x = clamp(player.x, 16, W - 16);
  player.y = clamp(player.y, H * 0.42, H - 56);
  if (player.inv > 0) player.inv -= dt;

  // (plane flies over the banks — no crash on sand; sand is where fuel is)

  // fuel
  player.fuel -= 2.1 * dt;
  if (player.fuel <= 0) { player.fuel = 0; crash(); return; }
  fuelBeepT -= dt;
  if (player.fuel < 20 && fuelBeepT <= 0) { sfx.warn(); fuelBeepT = 1; }

  // firing
  player.fireCd -= dt;
  const wantFire = pointerDown || keys.Space;
  if (wantFire && player.fireCd <= 0) {
    player.fireCd = rapidT > 0 ? 0.09 : 0.18;
    let n = 0; for (const b of bullets) if (!b.dead) n++;
    if (n < 4) {
      bullets.push({ x: player.x, y: player.y - 18, dead: false });
      if (tripleT > 0) {
        bullets.push({ x: player.x - 12, y: player.y - 12, dead: false });
        bullets.push({ x: player.x + 12, y: player.y - 12, dead: false });
      }
      sfx.shoot();
    }
  }

  // bullets (screen space, fly up) — bridges don't block them
  for (const b of bullets) {
    b.y -= 560 * dt;
    if (b.y < -20) b.dead = true;
  }

  // spawns
  spawnAcc += dCam;
  const gap = Math.max(240, 440 - (stage - 1) * 20) * rnd(0.8, 1.2);
  if (spawnAcc > gap && enemies.length < 9) { spawnAcc = 0; spawnEnemy(); }
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
      // tanks are bolted to the bridge (fixed worldY = bridge w, which
      // scrolls with the camera); only x patrols left/right
      e.x += e.vx * dt;
      if (e.x < 40) { e.x = 40; e.vx = Math.abs(e.vx); }
      if (e.x > W - 40) { e.x = W - 40; e.vx = -Math.abs(e.vx); }
      // tanks fire down the river at the player
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
      if (e.water || e.t === 'heli' || e.t === 'plane') {
        const eb = river.sample(e.w);
        e.x = clamp(e.x, eb.cx - eb.half + 12, eb.cx + eb.half - 12);
      }
    }
    // water enemies vanish at bridges (bridge spans the whole river)
    if (e.water) {
      for (const br of bridges)
        if (Math.abs(e.w - br.w) < 26) { e.dead = true; break; }
    }
    // bullets vs enemy
    const sy = e.w - camTop;
    if (!e.dead) for (const b of bullets) {
      if (b.dead) continue;
      if (Math.abs(b.x - e.x) < e.hw + 3 && Math.abs(b.y - sy) < e.hh + 5) {
        b.dead = true;
        killEnemy(e, false);
        break;
      }
    }
    // enemy vs player
    if (!e.dead && player.inv <= 0) {
      if (Math.abs(e.x - player.x) < e.hw + 9 && Math.abs(sy - player.y) < e.hh + 10) {
        if (shieldT > 0) killEnemy(e, false, false); // shield eats the hit
        else { killEnemy(e, false, false); crash(); return; }
      }
    }
    // cleanup
    if (e.w > camTop + H + 140 || e.w < camTop - 500) e.dead = true;
  }
  enemies = enemies.filter(e => !e.dead);
  bullets = bullets.filter(b => !b.dead);

  // tank bullets (fly down the river, toward the player)
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

  // power-up timers
  if (tripleT > 0) tripleT -= dt;
  if (rapidT > 0) rapidT -= dt;
  if (shieldT > 0) shieldT -= dt;

  // power-ups: bob, pickup, cleanup (they scroll with the world)
  for (const p of powerups) {
    const sy = p.w - camTop;
    if (sy > H + 40) { p.dead = true; continue; }
    if (Math.abs(p.x - player.x) < 22 && Math.abs(sy - player.y) < 24) {
      p.dead = true;
      applyPowerup(p.type);
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // fuels: refuel + cleanup
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

  // (bridges are flyable: plane flies over them, no solid collision)

  updateParticles(dt);
  if (bannerT > 0) bannerT -= dt;
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 60 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
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

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (state === ST.TITLE) { drawTitle(); return; }
  if (state === ST.OVER) { drawOver(); return; }

  // terrain
  ctx.drawImage(ter, 0, TOPM, W, H, 0, 0, W, H);

  // fuels
  for (const f of fuels) {
    const sy = f.w - camTop;
    if (sy < -60 || sy > H + 60) continue;
    const zx = f.side ? f.x - 10 : f.x - 42;
    ctx.fillStyle = 'rgba(255,230,80,0.35)';
    ctx.fillRect(zx, sy - 24, 52, 48);
    ctx.strokeStyle = '#ffe650'; ctx.lineWidth = 2;
    ctx.strokeRect(zx, sy - 24, 52, 48);
    const sx = f.side ? f.x + 14 : f.x - 66;
    ctx.fillStyle = '#1a2a6a';
    ctx.fillRect(sx, sy - 16, 52, 32);
    ctx.strokeStyle = '#8899ff'; ctx.strokeRect(sx, sy - 16, 52, 32);
    txt('FUEL', sx + 26, sy + 6, 14, '#fff', 'center');
  }

  // bridges (span the full screen width — flyable overhead)
  for (const br of bridges) {
    const sy = br.w - camTop;
    if (sy < -60 || sy > H + 60) continue;
    ctx.fillStyle = '#6a3f18';
    ctx.fillRect(0, sy - 18, W, 36);
    ctx.fillStyle = '#8a5a28';
    ctx.fillRect(0, sy - 14, W, 28);
    ctx.fillStyle = '#5a3414';
    for (let x = 8; x < W; x += 16) ctx.fillRect(x, sy - 14, 3, 28);
    ctx.fillStyle = '#b8834a';
    ctx.fillRect(0, sy - 18, W, 4);
    ctx.fillStyle = '#3a2008';
    ctx.fillRect(0, sy + 14, W, 4);
  }

  // enemies
  for (const e of enemies) {
    const sy = e.w - camTop;
    if (sy < -50 || sy > H + 50) continue;
    let spr;
    if (e.t === 'boat') spr = SPR.boat;
    else if (e.t === 'ship') spr = SPR.ship;
    else if (e.t === 'plane') spr = SPR.plane;
    else if (e.t === 'heli') spr = SPR.heli;
    else spr = SPR.tank;
    ctx.drawImage(spr.canvas, Math.round(e.x - spr.w / 2), Math.round(sy - spr.h / 2));
    if (e.t === 'heli') {
      // rotor
      ctx.strokeStyle = 'rgba(220,225,235,0.9)';
      ctx.lineWidth = 3;
      const a = time * 14;
      const cxr = e.x, cyr = sy - 10;
      ctx.beginPath();
      ctx.moveTo(cxr - Math.cos(a) * 16, cyr - Math.sin(a) * 4);
      ctx.lineTo(cxr + Math.cos(a) * 16, cyr + Math.sin(a) * 4);
      ctx.stroke();
    }
  }

  // bullets
  ctx.fillStyle = '#fff';
  for (const b of bullets) ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y), 4, 10);

  // power-ups (bobbing badges)
  for (const p of powerups) {
    const sy = p.w - camTop + Math.sin(time * 3 + p.ph) * 4;
    if (sy < -30 || sy > H + 30) continue;
    ctx.drawImage(PU_SPR[p.type] || PU_SPR.gem, Math.round(p.x - 8), Math.round(sy - 8));
  }

  // tank bullets (orange, flying down)
  ctx.fillStyle = '#ffb04a';
  for (const tb of tbullets) ctx.fillRect(Math.round(tb.x) - 2, Math.round(tb.y), 4, 9);

  // player
  if (state === ST.PLAY && (player.inv <= 0 || (time * 10 | 0) % 2 === 0)) {
    ctx.drawImage(SPR.player.canvas, Math.round(player.x - SPR.player.w / 2), Math.round(player.y - SPR.player.h / 2));
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
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  ctx.globalAlpha = 1;

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
  // active power-up timers
  const act = [];
  if (tripleT > 0) act.push(['3X', tripleT, '#ffd24a']);
  if (rapidT > 0) act.push(['FF', rapidT, '#ff8c2a']);
  if (shieldT > 0) act.push(['S', shieldT, '#4a9aff']);
  for (let i = 0; i < act.length; i++) {
    const [lbl, t, col] = act[i];
    ctx.fillStyle = col;
    ctx.fillRect(10 + i * 40, H - 26, 34, 16);
    ctx.fillStyle = '#10142a';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(lbl + ' ' + Math.ceil(t), 27 + i * 40, H - 14);
  }
  // bombs
  txt('BOMB x' + bombs, W - 10, H - 30, 13, '#ffb04a', 'right');

  // banner
  if (bannerT > 0) txt(banner, W / 2, H / 2 - 40, 30, '#fff', 'center');

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
  // decorative river strip
  ctx.fillStyle = '#2e4fc2';
  ctx.fillRect(120, 0, 240, H);
  ctx.fillStyle = '#4a6fe0';
  for (let y = 30; y < H; y += 46) ctx.fillRect(150 + ((y * 7) % 140), y, 12, 3);
  txt('RIVER', W / 2, 190, 64, '#ffe650', 'center');
  txt('RAID', W / 2, 258, 64, '#8aff8a', 'center');
  ctx.drawImage(SPR.player.canvas, W / 2 - 20, 300, 40, 48);
  ctx.drawImage(SPR.boat.canvas, 150, 430, 24, 20);
  ctx.drawImage(SPR.ship.canvas, 300, 470, 40, 30);
  ctx.drawImage(SPR.plane.canvas, 170, 530, 30, 38);
  ctx.drawImage(SPR.heli.canvas, 320, 545, 30, 28);
  txt('управление: веди пальцем по экрану', W / 2, 588, 16, '#ccc', 'center');
  txt('удержание — огонь · кнопка бомбы внизу', W / 2, 610, 16, '#ccc', 'center');
  // power-up legend
  ctx.drawImage(PU_SPR.gem, 116, 628);
  ctx.drawImage(PU_SPR.triple, 172, 628);
  ctx.drawImage(PU_SPR.rapid, 228, 628);
  ctx.drawImage(PU_SPR.shield, 284, 628);
  ctx.drawImage(PU_SPR.life, 340, 628);
  txt('усилки падают с убитых врагов', W / 2, 662, 14, '#8aff8a', 'center');
  if (hiScore > 0) txt('РЕКОРД: ' + hiScore, W / 2, 380, 18, '#ffe650', 'center');
  if ((time * 2 | 0) % 2 === 0) txt('НАЖМИ, ЧТОБЫ НАЧАТЬ', W / 2, 692, 20, '#fff', 'center');
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
}
requestAnimationFrame(frame);
