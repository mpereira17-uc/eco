// Renderizado: frentes de onda, ecos con resplandor, mapa de memoria, modelos y efectos.

import { CONFIG, pulseRange } from './game.js';
import { drawBat, drawOyente, drawMoth, drawCrystal, drawRift } from './models.js';
import { mulberry32 } from './rng.js';

const TAU = Math.PI * 2;
const MEM_PX = 14; // píxeles por casilla en el lienzo de memoria
const DANGER = [255, 84, 104];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Contornos de las paredes: "marching squares" sobre el campo de densidad,
// con interpolación lineal para que las curvas sean suaves.
export function buildContours(cave) {
  const { width: w, height: h } = cave;
  const f = cave.field || cave.grid;
  const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : f[y * w + x]);
  const cells = new Array((w - 1) * (h - 1));
  const lerpPt = (x0, y0, v0, x1, y1, v1) => {
    const t = Math.abs(v1 - v0) < 1e-6 ? 0.5 : (0.5 - v0) / (v1 - v0);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = v(x, y);
      const b = v(x + 1, y);
      const c = v(x + 1, y + 1);
      const d = v(x, y + 1);
      const code = ((a >= 0.5) << 3) | ((b >= 0.5) << 2) | ((c >= 0.5) << 1) | (d >= 0.5 ? 1 : 0);
      if (code === 0 || code === 15) { cells[y * (w - 1) + x] = null; continue; }
      const x0 = x + 0.5;
      const y0 = y + 0.5;
      const T = () => lerpPt(x0, y0, a, x0 + 1, y0, b);
      const R = () => lerpPt(x0 + 1, y0, b, x0 + 1, y0 + 1, c);
      const B = () => lerpPt(x0, y0 + 1, d, x0 + 1, y0 + 1, c);
      const L = () => lerpPt(x0, y0, a, x0, y0 + 1, d);
      let segs;
      switch (code) {
        case 1: case 14: segs = [L(), B()]; break;
        case 2: case 13: segs = [B(), R()]; break;
        case 3: case 12: segs = [L(), R()]; break;
        case 4: case 11: segs = [T(), R()]; break;
        case 5: segs = [L(), T(), B(), R()]; break;
        case 6: case 9: segs = [T(), B()]; break;
        case 7: case 8: segs = [L(), T()]; break;
        case 10: segs = [T(), R(), L(), B()]; break;
        default: segs = null;
      }
      cells[y * (w - 1) + x] = segs;
    }
  }
  return cells;
}

function makeGrain(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const r = mulberry32(1234);
  for (let i = 0; i < size * size; i++) {
    const v = (r() * 255) | 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export class Renderer {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d');
    this.glowCanvas = document.createElement('canvas');
    this.gctx = this.glowCanvas.getContext('2d');
    this.settings = settings;
    this.grain = makeGrain();
    this.cam = { x: 0, y: 0, shake: 0, init: false };
    this.particles = [];
    this.flash = { a: 0, color: [255, 255, 255] };
    this.game = null;
    this.frameTimes = [];
    this.quality = 1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.cw = w;
    this.ch = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.layerScale = this.quality >= 1 ? 0.5 : 0.35;
    this.layer.width = Math.max(1, Math.round(this.canvas.width * this.layerScale));
    this.layer.height = Math.max(1, Math.round(this.canvas.height * this.layerScale));
    this.glowCanvas.width = this.layer.width;
    this.glowCanvas.height = this.layer.height;
    this.tile = clamp(Math.min(w / 34, h / 19), 24, 58);
    this.vignette = null;
  }

  // Prepara los recursos de una cueva nueva.
  prepare(g) {
    this.game = g;
    const { cave } = g;
    this.contours = buildContours(cave);
    this.memory = new Uint8Array(cave.width * cave.height);
    this.known = null; // rectángulo de casillas ya oídas (para encuadrar el mapa)
    this.cellDrawn = new Uint8Array((cave.width - 1) * (cave.height - 1));
    this.mem = document.createElement('canvas');
    this.mem.width = cave.width * MEM_PX;
    this.mem.height = cave.height * MEM_PX;
    this.mctx = this.mem.getContext('2d');
    this.decorByTile = new Map();
    for (const d of cave.decor) {
      const key = d.ty * cave.width + d.tx;
      if (!this.decorByTile.has(key)) this.decorByTile.set(key, []);
      this.decorByTile.get(key).push(d);
    }
    // motas de polvo suspendidas que brillan cuando pasa la onda
    const r = mulberry32(cave.seed ^ 0x5eed);
    this.dust = [];
    for (let y = 0; y < cave.height; y++) {
      for (let x = 0; x < cave.width; x++) {
        if (cave.grid[y * cave.width + x]) continue;
        if (r() < 0.55) this.dust.push({ x: x + r(), y: y + r(), s: 0.5 + r() });
      }
    }
    this.seenMoths = new Set();
    this.seenCrystals = new Set();
    this.particles = [];
    this.cam.init = false;
    this.footsteps = [];
    this.lastStep = new Map();
  }

  // ─── memoria: lo que Eco ya ha "visto" queda dibujado como un mapa ───
  remember(tx, ty) {
    const g = this.game;
    const { width: w, height: h } = g.cave;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    const idx = ty * w + tx;
    if (this.memory[idx]) return;
    this.memory[idx] = 1;
    const k = this.known;
    if (!k) this.known = { x0: tx, y0: ty, x1: tx + 1, y1: ty + 1 };
    else { k.x0 = Math.min(k.x0, tx); k.y0 = Math.min(k.y0, ty); k.x1 = Math.max(k.x1, tx + 1); k.y1 = Math.max(k.y1, ty + 1); }
    const m = this.mctx;
    const pal = g.chapter.palette;
    m.save();
    m.scale(MEM_PX, MEM_PX);
    m.lineCap = 'round';
    // contornos de las celdas alrededor: un trazo ancho y tenue + uno fino
    const path = new Path2D();
    let any = false;
    for (let cy = ty - 1; cy <= ty + 1; cy++) {
      for (let cx = tx - 1; cx <= tx + 1; cx++) {
        if (cx < 0 || cy < 0 || cx >= w - 1 || cy >= h - 1) continue;
        const ci = cy * (w - 1) + cx;
        if (this.cellDrawn[ci]) continue;
        const segs = this.contours[ci];
        if (!segs) continue;
        this.cellDrawn[ci] = 1;
        any = true;
        for (let s = 0; s < segs.length; s += 2) {
          path.moveTo(segs[s][0], segs[s][1]);
          path.lineTo(segs[s + 1][0], segs[s + 1][1]);
        }
      }
    }
    if (any) {
      m.strokeStyle = rgba(pal.echo, 0.06);
      m.lineWidth = 0.32;
      m.stroke(path);
      m.strokeStyle = rgba(pal.echo, 0.36);
      m.lineWidth = 0.06;
      m.stroke(path);
    }
    // estalactitas y estalagmitas
    const decor = this.decorByTile.get(idx);
    if (decor) {
      m.beginPath();
      for (const d of decor) {
        const dirY = d.kind === 'stalactite' ? 1 : -1;
        m.moveTo(d.x - d.w / 2, d.y);
        m.quadraticCurveTo(d.x - d.w * 0.1, d.y + dirY * d.len * 0.6, d.x, d.y + dirY * d.len);
        m.quadraticCurveTo(d.x + d.w * 0.1, d.y + dirY * d.len * 0.6, d.x + d.w / 2, d.y);
      }
      m.fillStyle = rgba(pal.deep, 0.5);
      m.fill();
      m.strokeStyle = rgba(pal.echo, 0.3);
      m.lineWidth = 0.04;
      m.stroke();
    }
    m.restore();
  }

  addParticles(x, y, n, color, speed = 2, life = 1.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 0.03 + Math.random() * 0.05 });
    }
  }

  // Reacciona a los eventos del juego con efectos visuales.
  onEvents(events) {
    const g = this.game;
    for (const e of events) {
      if (e.type === 'bump') this.cam.shake = Math.max(this.cam.shake, Math.min(0.25, e.power * 0.04));
      else if (e.type === 'moth') {
        this.addParticles(e.x, e.y, 40, g.chapter.palette.accent, 3, 1.4);
        this.flash = { a: 0.22, color: g.chapter.palette.accent };
      } else if (e.type === 'exitOpen') this.flash = { a: 0.35, color: [220, 240, 255] };
      else if (e.type === 'death') {
        this.cam.shake = 0.6;
        this.flash = { a: 0.55, color: DANGER };
        this.addParticles(e.x, e.y, 60, DANGER, 4, 1.6);
      } else if (e.type === 'win') {
        this.flash = { a: 0.8, color: [235, 245, 255] };
        this.addParticles(e.x, e.y, 80, [230, 240, 255], 3, 2);
      } else if (e.type === 'crystal') this.addParticles(e.x, e.y, 14, [210, 190, 255], 1.6, 0.8);
      else if (e.type === 'pulse' && e.source === 'player') this.cam.shake = Math.max(this.cam.shake, 0.02 + e.power * 0.08);
    }
  }

  worldToScreen(x, y) {
    const S = this.tile;
    return { x: (x - this.cam.x) * S + this.cw / 2, y: (y - this.cam.y) * S + this.ch / 2 };
  }

  updateCamera(g, dt, offset = { x: 0, y: 0 }) {
    const p = g.player;
    const tx = p.x + p.vx * 0.35 + offset.x;
    const ty = p.y + p.vy * 0.35 + offset.y;
    if (!this.cam.init) { this.cam.x = tx; this.cam.y = ty; this.cam.init = true; }
    const k = 1 - Math.exp(-dt * 4);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 1.6);
  }

  render(g, dt, opts = {}) {
    const t0 = performance.now();
    const ctx = this.ctx;
    const { dpr } = this;
    const S = this.tile;
    const pal = g.chapter.palette;
    this.updateCamera(g, dt, opts.cameraOffset);

    // ecos que acaban de "llegar" pasan a la memoria
    for (const e of g.echoes) {
      if (e.kind === 'wall' && g.time >= e.born && !e.mem) {
        e.mem = true;
        this.remember(e.tx, e.ty);
      } else if (g.time >= e.born) {
        if (e.kind === 'moth') this.seenMoths.add(e.ref);
        else if (e.kind === 'crystal') this.seenCrystals.add(e.ref);
      }
    }

    const shakeOn = this.settings.shake !== false;
    const sh = shakeOn ? this.cam.shake : 0;
    const sx = (Math.random() - 0.5) * sh * S;
    const sy = (Math.random() - 0.5) * sh * S;
    const ox = this.cw / 2 - this.cam.x * S + sx;
    const oy = this.ch / 2 - this.cam.y * S + sy;
    const view = {
      x0: this.cam.x - this.cw / 2 / S - 2,
      y0: this.cam.y - this.ch / 2 / S - 2,
      x1: this.cam.x + this.cw / 2 / S + 2,
      y1: this.cam.y + this.ch / 2 / S + 2,
    };
    const inView = (x, y, m = 1) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

    // 1. fondo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.fog;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. mapa de memoria
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mem, ox, oy, g.cave.width * S, g.cave.height * S);

    // 3. ecos: una capa a media resolución difuminada (resplandor) + el trazo nítido encima
    if (this.settings.glow !== false && this.quality >= 1) {
      const L = this.lctx;
      const ls = this.layerScale * dpr;
      L.setTransform(1, 0, 0, 1, 0, 0);
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, this.layer.width, this.layer.height);
      L.setTransform(ls * S, 0, 0, ls * S, ox * ls, oy * ls);
      L.globalCompositeOperation = 'lighter';
      L.lineCap = 'round';
      L.lineJoin = 'round';
      this.drawEchoScene(L, g, pal, inView, 1.6);
      const G = this.gctx;
      G.setTransform(1, 0, 0, 1, 0, 0);
      G.globalCompositeOperation = 'source-over';
      G.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
      G.filter = `blur(${(8 * dpr * this.layerScale).toFixed(1)}px)`;
      G.drawImage(this.layer, 0, 0);
      G.filter = 'none';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.layer, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr * S, 0, 0, dpr * S, ox * dpr, oy * dpr);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawEchoScene(ctx, g, pal, inView, 1);

    // 4. luces propias (polillas, cristales vibrando, la grieta abierta) y pasos
    ctx.setTransform(dpr * S, 0, 0, dpr * S, ox * dpr, oy * dpr);
    this.drawLights(ctx, g, pal, inView);
    ctx.globalCompositeOperation = 'source-over';
    this.drawFootsteps(ctx, g, dt, inView);

    // 5. Eco
    this.drawPlayer(ctx, g, pal);

    // 6. partículas
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 2.5);
      p.vy *= Math.exp(-dt * 2.5);
      const a = p.life / p.max;
      ctx.fillStyle = rgba(p.color, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 7. post-proceso
    this.drawPost(ctx, g, dt, opts);

    // calidad adaptativa
    const ft = performance.now() - t0;
    this.frameTimes.push(ft);
    if (this.frameTimes.length > 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 13 && this.quality > 0) { this.quality = 0; this.resize(); }
    }
  }

  drawEchoScene(L, g, pal, inView, widthMul) {
    this.widthMul = widthMul;
    this.drawWavefronts(L, g, pal, inView);
    this.drawEchoes(L, g, pal, inView);
    this.drawEchoEntities(L, g, pal, inView);
  }

  drawWavefronts(L, g, pal, inView) {
    const speed = CONFIG.soundSpeed;
    for (const pl of g.pulses) {
      const r = (g.time - pl.t0) * speed;
      if (r <= 0 || r > pl.range + 0.5) continue;
      const fade = 1 - r / (pl.range + 0.5);
      const n = pl.dists.length;
      const col = pl.source === 'crystal' ? [200, 180, 255] : pal.echo;
      for (const [off, aMul, wid] of [[0, 1, 0.05], [-0.35, 0.45, 0.12], [-0.8, 0.2, 0.2]]) {
        const rr = r + off;
        if (rr <= 0) continue;
        L.beginPath();
        let pen = false;
        for (let i = 0; i <= n; i++) {
          const k = i % n;
          if (rr < pl.dists[k]) {
            const a = (k / n) * TAU;
            const x = pl.x + Math.cos(a) * rr;
            const y = pl.y + Math.sin(a) * rr;
            if (pen) L.lineTo(x, y); else { L.moveTo(x, y); pen = true; }
          } else pen = false;
        }
        L.strokeStyle = rgba(col, 0.8 * fade * aMul * (0.55 + pl.power * 0.45));
        L.lineWidth = wid * this.widthMul;
        L.stroke();
      }
      // polvo iluminado al paso de la onda
      L.fillStyle = rgba(col, 0.5 * fade);
      L.beginPath();
      for (const d of this.dust) {
        if (!inView(d.x, d.y)) continue;
        const dx = d.x - pl.x;
        const dy = d.y - pl.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dist - r) > 0.5) continue;
        let a = Math.atan2(dy, dx);
        if (a < 0) a += TAU;
        const k = Math.floor((a / TAU) * n) % n;
        if (dist > pl.dists[k]) continue;
        const s = 0.025 * d.s * (1 - Math.abs(dist - r) / 0.5);
        L.moveTo(d.x + s, d.y);
        L.arc(d.x, d.y, s, 0, TAU);
      }
      L.fill();
    }
  }

  drawEchoes(L, g, pal, inView) {
    const buckets = 7;
    const paths = Array.from({ length: buckets }, () => new Path2D());
    const fresh = new Path2D();
    let anyFresh = false;
    const now = g.time;
    for (const e of g.echoes) {
      if (e.kind !== 'wall' || now < e.born) continue;
      if (!inView(e.x, e.y)) continue;
      const age = (now - e.born) / e.life;
      let a = Math.pow(1 - age, 1.6) * (1 - 0.55 * (e.dist / e.range));
      if (a <= 0.02) continue;
      const len = 0.16 + 0.1 * (1 - e.dist / e.range);
      const tx = -e.ny * len;
      const ty = e.nx * len;
      const b = Math.min(buckets - 1, Math.floor(a * buckets));
      paths[b].moveTo(e.x - tx, e.y - ty);
      paths[b].lineTo(e.x + tx, e.y + ty);
      if (now - e.born < 0.12) {
        anyFresh = true;
        fresh.moveTo(e.x - tx * 0.6, e.y - ty * 0.6);
        fresh.lineTo(e.x + tx * 0.6, e.y + ty * 0.6);
      }
    }
    L.lineWidth = 0.065 * this.widthMul;
    for (let b = 0; b < buckets; b++) {
      L.strokeStyle = rgba(pal.echo, ((b + 0.5) / buckets) * 0.95);
      L.stroke(paths[b]);
    }
    if (anyFresh) {
      L.strokeStyle = 'rgba(255,255,255,0.85)';
      L.lineWidth = 0.08 * this.widthMul;
      L.stroke(fresh);
    }
  }

  drawEchoEntities(L, g, pal, inView) {
    const now = g.time;
    for (const e of g.echoes) {
      if (e.kind === 'wall' || now < e.born || !inView(e.x, e.y, 2)) continue;
      const age = (now - e.born) / e.life;
      const a = Math.pow(1 - age, 1.4);
      if (a <= 0.02) continue;
      L.save();
      L.translate(e.x, e.y);
      if (e.kind === 'creature') {
        L.rotate(e.heading);
        L.scale(1.35, 1.35);
        drawOyente(L, { mode: 'echo', color: DANGER, alpha: a, step: e.step, t: e.born, state: e.state, lineWidth: 0.03 });
      } else if (e.kind === 'crystal') {
        drawCrystal(L, { id: e.ref, alpha: a * 0.9, ring: 0, t: now });
      } else if (e.kind === 'exit') {
        drawRift(L, { t: now, open: g.exit.open ? 0.6 : 0, alpha: a, color: [210, 235, 255] });
      } else if (e.kind === 'moth') {
        L.fillStyle = rgba(pal.accent, 0.5 * a);
        L.beginPath();
        L.arc(0, 0, 0.18, 0, TAU);
        L.fill();
      }
      L.restore();
    }
  }

  drawLights(ctx, g, pal, inView) {
    const now = g.time;
    const p = g.player;
    ctx.globalCompositeOperation = 'lighter';
    for (const m of g.moths) {
      if (m.collected || !inView(m.x, m.y, 2)) continue;
      const near = clamp(1 - Math.hypot(m.x - p.x, m.y - p.y) / 2.6, 0, 1);
      const blink = m.visible ? m.glow : 0;
      let echoA = 0;
      for (const e of g.echoes) {
        if (e.kind === 'moth' && e.ref === m.id && now >= e.born) echoA = Math.max(echoA, 1 - (now - e.born) / e.life);
      }
      const a = Math.max(blink, near, echoA * 0.9);
      if (a <= 0.02) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(1.6, 1.6);
      drawMoth(ctx, { t: now, phase: m.phase, glow: Math.max(blink, 0.3), alpha: a, color: pal.accent });
      ctx.restore();
    }
    for (const cr of g.crystals) {
      const since = now - cr.lastRing;
      if (since < 0 || since > 1.6 || !inView(cr.x, cr.y, 2)) continue;
      const ring = Math.pow(1 - since / 1.6, 2);
      ctx.save();
      ctx.translate(cr.x, cr.y);
      ctx.rotate(cr.angle * 0.1);
      drawCrystal(ctx, { id: cr.id, ring, t: now, alpha: 1 });
      ctx.restore();
    }
    if (g.exit.open && (g.exit.visible || Math.hypot(g.exit.x - p.x, g.exit.y - p.y) < 4)) {
      const k = clamp((now - g.exit.openedAt) / 1.5, 0, 1);
      ctx.save();
      ctx.translate(g.exit.x, g.exit.y);
      drawRift(ctx, { t: now, open: easeOut(k), alpha: 1 });
      ctx.restore();
    }
  }

  // Los pasos de los Oyentes se ven como ondas tenues: los oyes aunque no los veas.
  drawFootsteps(ctx, g, dt, inView) {
    if (this.settings.footsteps === false) return;
    const p = g.player;
    for (const c of g.creatures) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const moving = Math.hypot(c.vx, c.vy) > 0.3;
      const last = this.lastStep.get(c.id) ?? 0;
      if (moving && d < 11 && Math.floor(c.step / Math.PI) !== last) {
        this.lastStep.set(c.id, Math.floor(c.step / Math.PI));
        this.footsteps.push({ x: c.x + (Math.random() - 0.5) * 0.3, y: c.y + (Math.random() - 0.5) * 0.3, t: 0, a: clamp(1 - d / 11, 0, 1) * (c.state === 'hunt' ? 1 : 0.6) });
      }
    }
    ctx.lineWidth = 0.035;
    for (let i = this.footsteps.length - 1; i >= 0; i--) {
      const f = this.footsteps[i];
      f.t += dt;
      if (f.t > 0.9) { this.footsteps.splice(i, 1); continue; }
      if (!inView(f.x, f.y)) continue;
      const k = f.t / 0.9;
      ctx.strokeStyle = rgba(DANGER, 0.35 * f.a * (1 - k));
      ctx.beginPath();
      ctx.arc(f.x, f.y, 0.1 + k * 0.6, 0, TAU);
      ctx.stroke();
    }
  }

  drawPlayer(ctx, g, pal) {
    const p = g.player;
    if (g.status === 'dead') return;
    ctx.save();
    ctx.translate(p.x, p.y);
    // halo muy tenue para orientarse en la oscuridad
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.3);
    hg.addColorStop(0, rgba(pal.echo, 0.1));
    hg.addColorStop(1, rgba(pal.echo, 0));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, 0, 1.3, 0, TAU);
    ctx.fill();
    // alcance del grito mientras se carga
    if (g.charging) {
      const r = pulseRange(g.charge);
      ctx.setLineDash([0.15, 0.25]);
      ctx.strokeStyle = rgba(pal.echo, 0.12 + g.charge * 0.18);
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(pal.echo, 0.85);
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(0, 0, 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * g.charge);
      ctx.stroke();
      if (g.charge >= 1) {
        ctx.strokeStyle = rgba([255, 255, 255], 0.4 + 0.4 * Math.sin(g.time * 20));
        ctx.beginPath();
        ctx.arc(0, 0, 0.7, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.rotate(p.facing);
    ctx.scale(1.3, 1.3);
    const glide = p.quiet ? 1 : 0;
    this.glide = (this.glide ?? 0) + (glide - (this.glide ?? 0)) * 0.15;
    drawBat(ctx, { flap: p.flap, glide: this.glide, charge: g.charging ? g.charge : 0, rim: pal.echo, lineWidth: 0.02 });
    ctx.restore();
  }

  drawPost(ctx, g, dt, opts) {
    const { dpr } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) {
      const v = document.createElement('canvas');
      v.width = W;
      v.height = H;
      const x = v.getContext('2d');
      const gr = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.85)');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      this.vignette = v;
    }
    ctx.drawImage(this.vignette, 0, 0);

    // peligro: bordes rojos que laten como un corazón
    const danger = opts.danger ?? g.danger;
    if (danger > 0.05 && g.status === 'playing') {
      const beat = Math.pow(Math.max(0, Math.sin(g.time * (4 + danger * 6))), 8);
      const a = danger * (0.18 + 0.22 * beat);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, rgba(DANGER, a));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.flash.a > 0.001) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(this.flash.color, this.flash.a * 0.35);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      this.flash.a *= Math.exp(-dt * 3);
    }

    if (this.settings.grain !== false) {
      ctx.globalAlpha = 0.045;
      ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(this.grain, 'repeat');
      const offX = (Math.random() * 256) | 0;
      const offY = (Math.random() * 256) | 0;
      ctx.translate(-offX, -offY);
      ctx.fillStyle = pat;
      ctx.fillRect(offX, offY, W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    void dpr;
  }

  // Mapa de lo explorado para la pantalla de pausa.
  drawMap(canvas, g) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Encuadre: lo ya oído más la posición actual, con margen. Al principio el mapa
    // se ve de cerca y se va alejando a medida que exploras la cueva.
    const cw = g.cave.width;
    const ch = g.cave.height;
    const p = g.player;
    const k = this.known || { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    let x0 = Math.min(k.x0, p.x) - 5;
    let y0 = Math.min(k.y0, p.y) - 5;
    let x1 = Math.max(k.x1, p.x) + 5;
    let y1 = Math.max(k.y1, p.y) + 5;
    const minW = Math.min(cw, 30);
    const minH = Math.min(ch, 20);
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    const s = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.94;
    const ox = W / 2 - ((x0 + x1) / 2) * s;
    const oy = H / 2 - ((y0 + y1) / 2) * s;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.mem, ox, oy, cw * s, ch * s);
    ctx.drawImage(this.mem, ox, oy, cw * s, ch * s);
    const pal = g.chapter.palette;
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox + x * s, oy + y * s, r, 0, TAU); ctx.fill(); };
    for (const m of g.moths) if (!m.collected && this.seenMoths.has(m.id)) dot(m.x, m.y, 4, rgba(pal.accent, 0.9));
    for (const c of g.crystals) if (this.seenCrystals.has(c.id)) dot(c.x, c.y, 3, 'rgba(200,180,255,0.8)');
    if (g.exit.revealed || g.exit.open) dot(g.exit.x, g.exit.y, 5, g.exit.open ? 'rgba(230,245,255,1)' : 'rgba(180,200,220,0.6)');
    dot(p.x, p.y, 5, rgba(pal.echo, 1));
    ctx.strokeStyle = rgba(pal.echo, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox + p.x * s, oy + p.y * s, 9 + 3 * Math.sin(performance.now() / 200), 0, TAU);
    ctx.stroke();
  }
}
