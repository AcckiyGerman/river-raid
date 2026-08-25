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

const SPR = {
  player: makeSprite([
    '......1......','......1......','.....111.....','.....111.....',
    '....11111....','....11111....','...1111111...','..111111111..',
    '.11111111111.','.21111111112.','.21133331112.','.21111111112.',
    '..111111111..','...1111111...','....11111....','......1......','......1......'],
    { '1': '#e8e8e8', '2': '#8a9099', '3': '#2a3038' }, 2),
  boat: makeSprite([
    '....11....','....11....','..111111..','..122221..',
    '..122221..','..111111..','...1111...','....11....'],
    { '1': '#c8c8c8', '2': '#4a4a52' }, 2),
  ship: makeSprite([
    '....222222....','...22222222...','..2222222222..','..22222222222..',
    '.222111111112.','.222111111112.','.222333333312.','.222333333312.',
    '.222111111112.','..22211111122..','...222111222...','....221122....'],
    { '1': '#b8b8c0', '2': '#454550', '3': '#6e6e7e' }, 2),
  plane: makeSprite([
    '......1......','......1......','.....111.....','....11111....',
    '...1111111...','..111111111..','.11111111111.','.21111111112.',
    '.21111111112.','..111111111..','...1111111...','....11111....',
    '.....111.....','......1......','......1......'],
    { '1': '#c85a5a', '2': '#6e2424' }, 2),
  heli: makeSprite([
    '.....111.....','....11111....','...1113311...','...1113311...',
    '..111333311..','..111111111..','..111111111..','...1111111...',
    '....11111....','.....111.....','......1......','......1......'],
    { '1': '#7aa8c8', '3': '#26384a' }, 2),
  tank: makeSprite([
    '.2.11111.2.','.2.11111.2.','22111111122','22133333122',
    '22111111122','22111111122','.2.11111.2.','.2.11111.2.',
    '.2..111..2.','....111.....'],
    { '1': '#77803c', '2': '#3a3a32', '3': '#4c5526' }, 2),
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
  warn:   () => beep(300, 0.12, 'square', 0.08),
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
  // rocks / bushes on sand
  const h3 = hash1(wy * 13 + 29);
  if ((h3 & 15) === 0) {
    const side = (h3 >> 3) & 1;
    let rx = side ? right + 8 + ((h3 >> 5) % Math.max(1, W - right - 12))
                  : 4 + ((h3 >> 5) % Math.max(1, left - 12));
    if (side === 0 && rx + 3 > left - 4) rx = 2;
    if (side === 1 && rx < right + 2) rx = W - 5;
    buf.fillStyle = (h3 & 2) ? '#9a7a30' : '#7a5a20';
    buf.fillRect(rx, 0, 3, 1);
  }
}

let bufTopWorld = 0; // worldY of buffer row 0 (smallest worldY)
function initTerrain(camTop) {
  bufTopWorld = camTop - TOPM;
  river.ensureLow(bufTopWorld - 120);
  for (let r = 0; r < HB; r++) {
    terCtx.save();
    terCtx.translate(0, r);
    paintRow(terCtx, bufTopWorld + r);
    terCtx.restore();
  }
}
function scrollTerrain(d) {
  if (d <= 0) return;
  d = Math.min(d, HB - 8);
  d = Math.floor(d);
  if (d < 1) return;
  // flying upstream: world moves DOWN on screen -> buffer content shifts down,
  // fresh rows appear at the top of the buffer (smallest worldY)
  bufTopWorld -= d;
  river.ensureLow(bufTopWorld - 120);
  river.trimHigh(bufTopWorld + HB + 200);
  terCtx.drawImage(ter, 0, 0, W, HB - d, 0, d, W, HB - d);
  for (let r = 0; r < d; r++) {
    terCtx.save();
    terCtx.translate(0, r);
    paintRow(terCtx, bufTopWorld + r);
    terCtx.restore();
  }
}

/* ---------- game state ---------- */
const ST = { TITLE: 0, PLAY: 1, DYING: 2, OVER: 3, PAUSE: 4 };
let state = ST.TITLE;
let prevState = ST.TITLE;

let camTop, scroll, stage, stageDist;
let score, hiScore, lives, bombs;
let player, bullets, enemies, fuels, bridges, particles;
let spawnAcc, bridgeAcc, fuelAcc, fuelBeepT;
let dieT, banner, bannerT;
let time = 0;

hiScore = +(localStorage.getItem('rr_hiscore') || 0);

function resetGame() {
  score = 0; lives = 3; bombs = 2;
  stage = 1; stageDist = 0;
  scroll = 130;
  bullets = []; enemies = []; fuels = []; bridges = []; particles = [];
  spawnAcc = 300; bridgeAcc = 1500; fuelAcc = 700; fuelBeepT = 0;
  dieT = 0; banner = 'STAGE 1'; bannerT = 2;
  camTop = 0;
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
  const b = river.sample(y);
  const left = b.cx - b.half, right = b.cx + b.half;
  bridges.push({ w: y, h: 36 });
  enemies.push({ t: 'tank', x: left + 46, w: y + 6, sv: 0, vx: 0, hw: 10, hh: 10, pts: 100, onBridge: true });
  enemies.push({ t: 'tank', x: right - 46, w: y + 6, sv: 0, vx: 0, hw: 10, hh: 10, pts: 100, onBridge: true });
}

function spawnFuel() {
  const y = camTop - 60;
  const b = river.sample(y);
  const side = Math.random() < 0.5 ? 0 : 1;
  fuels.push({ w: y, side, x: side ? b.cx + b.half : b.cx - b.half, zw: 52, hh: 24 });
}

function killEnemy(e, byBomb) {
  const sy = e.w - camTop;
  spawnExplosion(e.x, sy, e.t === 'ship' || e.t === 'tank');
  e.t === 'ship' ? sfx.boomB() : sfx.boomS();
  score += e.pts + (byBomb ? 50 : 0);
  e.dead = true;
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
    scrollTerrain(scroll * dt * 0.3);
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

  // bank collision
  const pb = river.sample(camTop + player.y);
  const pl = pb.cx - pb.half, pr = pb.cx + pb.half;
  if (player.x - 9 < pl + 3 || player.x + 9 > pr - 3) { crash(); return; }

  // fuel
  player.fuel -= 2.1 * dt;
  if (player.fuel <= 0) { player.fuel = 0; crash(); return; }
  fuelBeepT -= dt;
  if (player.fuel < 20 && fuelBeepT <= 0) { sfx.warn(); fuelBeepT = 1; }

  // firing
  player.fireCd -= dt;
  const wantFire = pointerDown || keys.Space;
  if (wantFire && player.fireCd <= 0) {
    player.fireCd = 0.18;
    let n = 0; for (const b of bullets) if (!b.dead) n++;
    if (n < 2) {
      bullets.push({ x: player.x, y: player.y - 18, dead: false });
      sfx.shoot();
    }
  }

  // bullets (screen space, fly up)
  for (const b of bullets) {
    b.y -= 560 * dt;
    if (b.y < -20) b.dead = true;
    // bridge blocks bullets
    if (!b.dead) for (const br of bridges) {
      const by = br.w - camTop;
      const rb = river.sample(br.w);
      if (b.y > by - 20 && b.y < by + 20 && b.x > rb.cx - rb.half - 8 && b.x < rb.cx + rb.half + 8) {
        b.dead = true;
        spawnExplosion(b.x, by, false);
        break;
      }
    }
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
  const ppy = camTop + player.y;
  for (const e of enemies) {
    if (e.dead) continue;
    const speed = (e.sv || 0) + scroll;
    e.w += speed * dt;
    if (e.t === 'heli') e.x += Math.sin(time * 2.2 + e.ph) * 55 * dt;
    else if (e.vx) e.x += e.vx * dt;
    if (e.water || e.t === 'heli' || e.t === 'plane') {
      const eb = river.sample(e.w);
      e.x = clamp(e.x, eb.cx - eb.half + 12, eb.cx + eb.half - 12);
    }
    // water enemies vanish at bridges
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
        killEnemy(e, false);
        crash();
        return;
      }
    }
    // cleanup
    if (e.w > camTop + H + 140 || e.w < camTop - 500) e.dead = true;
  }
  enemies = enemies.filter(e => !e.dead);
  bullets = bullets.filter(b => !b.dead);

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

  // bridge vs player (solid)
  if (player.inv <= 0) for (const br of bridges) {
    const by = br.w - camTop;
    const rb = river.sample(br.w);
    if (overlap(player.x - 8, player.y - 12, 16, 24,
                rb.cx - rb.half - 8, by - 20, (rb.half * 2) + 16, 40)) {
      crash(); return;
    }
  }

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

  // bridges
  for (const br of bridges) {
    const sy = br.w - camTop;
    if (sy < -60 || sy > H + 60) continue;
    const rb = river.sample(br.w);
    const L = rb.cx - rb.half - 10, R = rb.cx + rb.half + 10;
    ctx.fillStyle = '#7a4a1e';
    ctx.fillRect(L, sy - 18, R - L, 36);
    ctx.fillStyle = '#9a6a33';
    ctx.fillRect(L, sy - 14, R - L, 28);
    ctx.fillStyle = '#5a3414';
    for (let x = L + 8; x < R; x += 16) ctx.fillRect(x, sy - 14, 3, 28);
    ctx.fillStyle = '#c89a5a';
    ctx.fillRect(L, sy - 18, R - L, 4);
    ctx.fillStyle = '#3a2008';
    ctx.fillRect(L, sy + 14, R - L, 4);
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

  // player
  if (state === ST.PLAY && (player.inv <= 0 || (time * 10 | 0) % 2 === 0)) {
    ctx.drawImage(SPR.player.canvas, Math.round(player.x - SPR.player.w / 2), Math.round(player.y - SPR.player.h / 2));
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
  txt('управление: веди пальцем по экрану', W / 2, 600, 16, '#ccc', 'center');
  txt('удержание — огонь · кнопка бомбы внизу', W / 2, 624, 16, '#ccc', 'center');
  if (hiScore > 0) txt('РЕКОРД: ' + hiScore, W / 2, 570, 18, '#ffe650', 'center');
  if ((time * 2 | 0) % 2 === 0) txt('НАЖМИ, ЧТОБЫ НАЧАТЬ', W / 2, 672, 20, '#fff', 'center');
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
