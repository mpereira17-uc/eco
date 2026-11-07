// Simulación del juego, sin dependencias del DOM: se puede ejecutar en Node para pruebas.

import { mulberry32, range } from './rng.js';
import { generateCave } from './cave.js';
import {
  raycast, lineOfSight, distanceField, fieldAt, stepDownField, moveCircle,
} from './geometry.js';
import { chapterFor } from './story.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

export const CONFIG = {
  soundSpeed: 24, // casillas por segundo del frente de onda
  echoLife: 3.6,
  rays: 320,
  pulseMinRange: 7,
  pulseMaxRange: 22,
  loudMin: 7,
  loudMax: 30,
  chargeTime: 1.1,
  cooldown: 0.3,
  playerRadius: 0.28,
  creatureRadius: 0.3,
  accel: 24,
  accelQuiet: 10,
  maxSpeed: 4.8,
  maxSpeedQuiet: 1.9,
  drag: 2.6,
  crystalPower: 0.72,
  crystalCooldown: 2.5,
  catchDist: 0.62,
  collectDist: 0.8,
  exitDist: 0.85,
  huntSpeed: 3.5,
  investigateSpeed: 2.6,
  wanderSpeed: 1.1,
};

export function caveSeedFor(seed, chapterIndex) {
  return (seed ^ Math.imul(chapterIndex + 1, 0x9e3779b1)) >>> 0;
}

export function createGame(seed, chapterIndex = 0) {
  const chapter = chapterFor(chapterIndex);
  const caveSeed = caveSeedFor(seed, chapterIndex);
  const cave = generateCave(caveSeed, chapter.params);
  const rng = mulberry32(caveSeed ^ 0xabcdef);
  return {
    seed,
    chapterIndex,
    chapter,
    cave,
    rng,
    time: 0,
    status: 'playing',
    player: {
      x: cave.start.x, y: cave.start.y, vx: 0, vy: 0, r: CONFIG.playerRadius,
      facing: 0, flap: 0, quiet: false, bumpNoise: 0, moving: false,
    },
    charge: 0,
    charging: false,
    cooldown: 0,
    pulses: [],
    scheduled: [],
    echoes: [],
    known: new Uint8Array(cave.width * cave.height),
    moths: cave.moths.map((m, i) => ({
      id: i, hx: m.x, hy: m.y, x: m.x, y: m.y, phase: rng() * TAU, collected: false, glow: 0, visible: false,
    })),
    crystals: cave.crystals.map((c, i) => ({ id: i, x: c.x, y: c.y, lastRing: -99, angle: rng() * TAU })),
    exit: { x: cave.exit.x, y: cave.exit.y, open: false, revealed: false, visible: false, openedAt: -1 },
    creatures: cave.creatures.map((c, i) => ({
      id: i, x: c.x, y: c.y, vx: 0, vy: 0, r: CONFIG.creatureRadius,
      state: 'sleep', timer: range(rng, 3, 10), heading: rng() * TAU, field: null, target: null,
      lastHeard: -99, repath: 0, hearCheck: rng() * 0.15, step: rng() * TAU, alertAt: -99,
    })),
    collected: 0,
    needed: cave.moths.length,
    noise: 0,
    danger: 0,
    nearest: Infinity,
    visCheck: 0,
    stats: { pulses: 0, time: 0 },
    killer: -1,
    events: [],
  };
}

export function pulseRange(power) {
  return lerp(CONFIG.pulseMinRange, CONFIG.pulseMaxRange, power);
}

export function pulseLoudness(power) {
  return lerp(CONFIG.loudMin, CONFIG.loudMax, power);
}

export function emitPulse(g, ox, oy, power, source = 'player', sourceId = -1) {
  const { cave } = g;
  const rangeTiles = pulseRange(power);
  const loud = pulseLoudness(power);
  const life = CONFIG.echoLife * (0.75 + 0.25 * power);
  const speed = CONFIG.soundSpeed;
  const n = CONFIG.rays;
  const dists = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hit = raycast(cave, ox, oy, dx, dy, rangeTiles);
    if (hit) {
      dists[i] = hit.dist;
      g.echoes.push({
        kind: 'wall', x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, tx: hit.tx, ty: hit.ty,
        born: g.time + hit.dist / speed, life, dist: hit.dist, range: rangeTiles, source,
      });
      g.known[hit.ty * cave.width + hit.tx] = 1;
    } else {
      dists[i] = rangeTiles;
    }
    sum += dists[i];
  }
  g.pulses.push({ x: ox, y: oy, t0: g.time, range: rangeTiles, power, dists, source });

  const reveal = (kind, ent, extra = {}) => {
    const d = Math.hypot(ent.x - ox, ent.y - oy);
    if (d > rangeTiles || !lineOfSight(cave, ox, oy, ent.x, ent.y)) return -1;
    g.echoes.push({ kind, x: ent.x, y: ent.y, born: g.time + d / speed, life: life * 1.1, dist: d, range: rangeTiles, ref: ent.id, source, ...extra });
    return d;
  };

  for (const m of g.moths) if (!m.collected) reveal('moth', m);
  for (const c of g.creatures) {
    const moving = Math.hypot(c.vx, c.vy) > 0.15;
    reveal('creature', c, { heading: moving ? Math.atan2(c.vy, c.vx) : c.heading, state: c.state, step: c.step });
  }
  if (reveal('exit', g.exit, { open: g.exit.open }) >= 0) g.exit.revealed = true;
  for (const cr of g.crystals) {
    if (source === 'crystal' && cr.id === sourceId) continue;
    const d = reveal('crystal', cr);
    if (d >= 0 && g.time - cr.lastRing > CONFIG.crystalCooldown) {
      const at = g.time + d / speed;
      cr.lastRing = at;
      g.scheduled.push({ at, x: cr.x, y: cr.y, power: CONFIG.crystalPower, id: cr.id });
    }
  }

  // ¿Quién lo oye? El sonido recorre la cueva por los pasillos, no a través de la roca.
  const field = distanceField(cave, ox, oy, Math.ceil(loud));
  for (const c of g.creatures) {
    const d = fieldAt(cave, field, c.x, c.y);
    if (d < 0 || d > loud) continue;
    if (c.state === 'hunt') {
      if (source === 'player') { c.lastHeard = g.time; continue; }
      if (g.time - c.lastHeard < 0.8) continue; // aún te oye a ti, no se distrae
    }
    if (c.state !== 'investigate' || source === 'player' || !c.target) {
      g.events.push({ type: 'alert', id: c.id, x: c.x, y: c.y, source });
    }
    c.state = 'investigate';
    c.field = field;
    c.target = { x: ox, y: oy };
    c.timer = 14;
    c.alertAt = g.time;
  }

  // 8 sectores para espacializar los ecos en el audio (0 = derecha, en sentido horario en pantalla)
  const sectors = [];
  const per = n / 8;
  for (let s = 0; s < 8; s++) {
    let acc = 0;
    let hits = 0;
    for (let i = Math.floor(s * per); i < Math.floor((s + 1) * per); i++) {
      acc += dists[i];
      if (dists[i] < rangeTiles - 1e-3) hits++;
    }
    sectors.push({ angle: ((s + 0.5) / 8) * TAU, dist: acc / per, hit: hits / per });
  }
  g.events.push({
    type: 'pulse', x: ox, y: oy, power, source, range: rangeTiles,
    openness: sum / n / rangeTiles, meanDist: sum / n, sectors,
    dx: ox - g.player.x, dy: oy - g.player.y,
  });
  if (source === 'player') g.stats.pulses++;
}

function steer(body, dx, dy, speedTarget, dt, k = 5) {
  const d = Math.hypot(dx, dy);
  const tx = d > 1e-6 ? (dx / d) * speedTarget : 0;
  const ty = d > 1e-6 ? (dy / d) * speedTarget : 0;
  const a = Math.min(1, dt * k);
  body.vx += (tx - body.vx) * a;
  body.vy += (ty - body.vy) * a;
}

function updatePlayer(g, input, dt) {
  const p = g.player;
  let ax = input.ax || 0;
  let ay = input.ay || 0;
  const m = Math.hypot(ax, ay);
  if (m > 1) { ax /= m; ay /= m; }
  const quiet = !!input.quiet;
  const acc = quiet ? CONFIG.accelQuiet : CONFIG.accel;
  const max = quiet ? CONFIG.maxSpeedQuiet : CONFIG.maxSpeed;
  p.vx += ax * acc * dt;
  p.vy += ay * acc * dt;
  const drag = Math.exp(-CONFIG.drag * dt);
  p.vx *= drag;
  p.vy *= drag;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > max) {
    const s = lerp(speed, max, Math.min(1, dt * 8)) / speed;
    p.vx *= s;
    p.vy *= s;
  }
  const impact = moveCircle(g.cave, p, dt, 0.3);
  if (impact > 2.2) {
    g.events.push({ type: 'bump', x: p.x, y: p.y, power: impact });
    p.bumpNoise = Math.max(p.bumpNoise, 3 + impact);
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 0.2) p.facing = Math.atan2(p.vy, p.vx);
  p.moving = m > 0.1;
  p.quiet = quiet;
  p.flap += dt * (quiet ? 3.2 : p.moving ? 11 : 6.5);
  const base = p.moving ? (quiet ? 0.9 : 2.6 + sp * 0.45) : (quiet ? 0.5 : 1.2);
  p.bumpNoise = Math.max(0, p.bumpNoise - dt * 8);
  g.noise = Math.max(base, p.bumpNoise);

  g.cooldown -= dt;
  if (input.pulse && g.cooldown <= 0) {
    g.charging = true;
    g.charge = Math.min(1, g.charge + dt / CONFIG.chargeTime);
  } else if (g.charging && !input.pulse) {
    emitPulse(g, p.x, p.y, g.charge, 'player');
    g.charging = false;
    g.charge = 0;
    g.cooldown = CONFIG.cooldown;
  }
}

function updateMoths(g, dt, checkVis) {
  const p = g.player;
  const t = g.time;
  for (const m of g.moths) {
    if (m.collected) continue;
    m.x = m.hx + Math.sin(t * 1.7 + m.phase) * 0.22 + Math.sin(t * 0.6 + m.phase * 2) * 0.12;
    m.y = m.hy + Math.cos(t * 1.3 + m.phase) * 0.18;
    const cycle = (t * 0.45 + m.phase / TAU) % 1;
    m.glow = cycle < 0.14 ? Math.sin((cycle / 0.14) * Math.PI) : 0;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (checkVis) m.visible = d < 18 && lineOfSight(g.cave, p.x, p.y, m.x, m.y);
    if (d < CONFIG.collectDist) {
      m.collected = true;
      g.collected++;
      g.events.push({ type: 'moth', index: g.collected - 1, x: m.x, y: m.y, id: m.id });
      if (g.collected >= g.needed && !g.exit.open) {
        g.exit.open = true;
        g.exit.openedAt = g.time;
        g.events.push({ type: 'exitOpen', x: g.exit.x, y: g.exit.y });
      }
    }
  }
}

function updateCreatures(g, dt) {
  const p = g.player;
  const { cave, rng } = g;
  let danger = 0;
  let nearest = Infinity;
  for (const c of g.creatures) {
    const dPl = Math.hypot(p.x - c.x, p.y - c.y);
    nearest = Math.min(nearest, dPl);

    c.hearCheck -= dt;
    if (c.hearCheck <= 0) {
      c.hearCheck = 0.15;
      const hearR = g.noise * (c.state === 'sleep' ? 0.6 : 1) + 0.4;
      if ((dPl < hearR && lineOfSight(cave, c.x, c.y, p.x, p.y)) || dPl < 1.0) {
        if (c.state !== 'hunt') g.events.push({ type: 'hunt', id: c.id, x: c.x, y: c.y });
        c.state = 'hunt';
        c.lastHeard = g.time;
      }
    }

    switch (c.state) {
      case 'sleep':
        steer(c, 0, 0, 0, dt, 3);
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'wander'; c.timer = range(rng, 5, 11); }
        break;
      case 'wander':
        c.heading += (rng() - 0.5) * 3 * dt;
        steer(c, Math.cos(c.heading), Math.sin(c.heading), CONFIG.wanderSpeed, dt, 3);
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'sleep'; c.timer = range(rng, 4, 10); }
        break;
      case 'listen':
        steer(c, 0, 0, 0, dt, 4);
        c.timer -= dt;
        if (c.timer <= 0) { c.state = 'wander'; c.timer = range(rng, 4, 9); }
        break;
      case 'investigate': {
        c.timer -= dt;
        const nxt = c.field ? stepDownField(cave, c.field, c.x, c.y) : null;
        const dT = c.target ? Math.hypot(c.target.x - c.x, c.target.y - c.y) : 0;
        if (!nxt || (nxt.d === 0 && dT < 1.2) || c.timer <= 0) {
          c.state = 'listen';
          c.timer = range(rng, 2, 4);
        } else {
          steer(c, nxt.x - c.x, nxt.y - c.y, CONFIG.investigateSpeed, dt);
        }
        break;
      }
      case 'hunt': {
        const hearing = g.time - c.lastHeard < 0.6;
        c.repath -= dt;
        if (hearing && c.repath <= 0) {
          c.repath = 0.3;
          c.field = distanceField(cave, p.x, p.y, 60);
          c.target = { x: p.x, y: p.y };
        }
        const nxt = c.field ? stepDownField(cave, c.field, c.x, c.y) : null;
        if (g.time - c.lastHeard > 3.5 || (!hearing && (!nxt || nxt.d === 0))) {
          c.state = 'listen';
          c.timer = range(rng, 2.5, 4.5);
        } else if (nxt) {
          // en la última casilla va directo a la presa
          const tx = nxt.d === 0 && hearing ? p.x : nxt.x;
          const ty = nxt.d === 0 && hearing ? p.y : nxt.y;
          steer(c, tx - c.x, ty - c.y, CONFIG.huntSpeed, dt, 6);
        } else if (hearing) {
          steer(c, p.x - c.x, p.y - c.y, CONFIG.huntSpeed, dt, 6);
        }
        break;
      }
      default:
        break;
    }

    const impact = moveCircle(cave, c, dt, 0.1);
    const sp = Math.hypot(c.vx, c.vy);
    // si se atasca contra la roca persiguiendo algo, se sacude hacia un lado
    if ((c.state === 'investigate' || c.state === 'hunt') && sp < 0.25) {
      c.stuck = (c.stuck || 0) + dt;
      if (c.stuck > 1) { c.vx += (rng() - 0.5) * 4; c.vy += (rng() - 0.5) * 4; c.stuck = 0; }
    } else c.stuck = 0;
    if (c.state === 'wander' && impact > 0) c.heading += Math.PI * (0.6 + rng() * 0.8);
    else if (sp > 0.2) c.heading = Math.atan2(c.vy, c.vx);
    c.step += sp * dt * 3.2;

    const threat = c.state === 'hunt' ? 1 : c.state === 'investigate' ? 0.55 : c.state === 'listen' ? 0.35 : 0.12;
    danger = Math.max(danger, threat * Math.max(0, 1 - dPl / 14));

    if (dPl < CONFIG.catchDist && g.status === 'playing') {
      g.status = 'dead';
      g.killer = c.id;
      g.events.push({ type: 'death', id: c.id, x: p.x, y: p.y });
    }
  }
  g.danger = danger;
  g.nearest = nearest;
}

export function update(g, input, dt) {
  dt = Math.min(dt, 0.05);
  g.events = [];
  g.time += dt;

  if (g.status === 'playing') {
    g.stats.time += dt;
    updatePlayer(g, input, dt);

    for (let i = g.scheduled.length - 1; i >= 0; i--) {
      const s = g.scheduled[i];
      if (s.at <= g.time) {
        g.scheduled.splice(i, 1);
        g.events.push({ type: 'crystal', x: s.x, y: s.y, id: s.id });
        emitPulse(g, s.x, s.y, s.power, 'crystal', s.id);
      }
    }

    g.visCheck -= dt;
    const checkVis = g.visCheck <= 0;
    if (checkVis) g.visCheck = 0.12;
    updateMoths(g, dt, checkVis);
    if (checkVis && g.exit.open) {
      const p = g.player;
      g.exit.visible = Math.hypot(g.exit.x - p.x, g.exit.y - p.y) < 24 && lineOfSight(g.cave, p.x, p.y, g.exit.x, g.exit.y);
    }
    for (const cr of g.crystals) cr.angle += dt * 0.3;
    updateCreatures(g, dt);

    if (g.status === 'playing' && g.exit.open) {
      const p = g.player;
      if (Math.hypot(g.exit.x - p.x, g.exit.y - p.y) < CONFIG.exitDist) {
        g.status = 'won';
        g.events.push({ type: 'win', x: p.x, y: p.y });
      }
    }
  } else {
    const p = g.player;
    p.vx *= 0.9;
    p.vy *= 0.9;
  }

  const speed = CONFIG.soundSpeed;
  g.pulses = g.pulses.filter((pl) => g.time - pl.t0 < pl.range / speed + 1.2);
  g.echoes = g.echoes.filter((e) => g.time - e.born < e.life);
  return g.events;
}
