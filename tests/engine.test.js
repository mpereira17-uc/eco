// Pruebas del motor (sin navegador): node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { generateCave, roomyGrid } from '../src/cave.js';
import {
  raycast, lineOfSight, bfsGrid, moveCircle, circleHitsWall, sampleField, distanceField, stepDownField, WALL,
} from '../src/geometry.js';
import { createGame, update, emitPulse, CONFIG, pulseLoudness } from '../src/game.js';
import { CHAPTERS, chapterFor } from '../src/story.js';

const idle = { ax: 0, ay: 0, pulse: false, quiet: false };

test('el generador aleatorio es determinista', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  const c = mulberry32(43);
  assert.notEqual(mulberry32(42)(), c());
});

test('la misma semilla produce la misma cueva', () => {
  const a = generateCave(1234, CHAPTERS[1].params);
  const b = generateCave(1234, CHAPTERS[1].params);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.deepEqual(a.moths, b.moths);
  assert.deepEqual(a.exit, b.exit);
});

for (let ch = 0; ch < CHAPTERS.length + 2; ch++) {
  test(`capítulo ${ch + 1}: todas las polillas y la salida son alcanzables (10 semillas)`, () => {
    const params = chapterFor(ch).params;
    for (let seed = 1; seed <= 10; seed++) {
      const cave = generateCave(seed * 9973 + ch, params);
      const { width: w, height: h } = cave;
      // bordes de roca
      for (let x = 0; x < w; x++) { assert.equal(cave.grid[x], WALL); assert.equal(cave.grid[(h - 1) * w + x], WALL); }
      // la rejilla coincide con el campo suave
      for (let i = 0; i < w * h; i++) {
        if (cave.grid[i] !== WALL) assert.ok(cave.field[i] < 0.5, 'casilla abierta con roca en el campo');
      }
      const roomy = roomyGrid(cave);
      const dist = bfsGrid(roomy, w, h, Math.floor(cave.start.x), Math.floor(cave.start.y));
      const reach = (p) => dist[Math.floor(p.y) * w + Math.floor(p.x)] >= 0;
      assert.ok(reach(cave.exit), `salida inalcanzable (semilla ${seed})`);
      for (const m of cave.moths) assert.ok(reach(m), `polilla inalcanzable (semilla ${seed})`);
      assert.equal(cave.moths.length, params.moths);
      assert.equal(cave.creatures.length, params.creatures);
      for (const c of cave.creatures) assert.ok(Math.hypot(c.x - cave.start.x, c.y - cave.start.y) >= 9, 'Oyente demasiado cerca del inicio');
    }
  });
}

test('raycast: impacta dentro del alcance y la normal mira hacia el rayo', () => {
  const cave = generateCave(77, CHAPTERS[0].params);
  const { x, y } = cave.start;
  let hits = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hit = raycast(cave, x, y, dx, dy, 40);
    if (!hit) continue;
    hits++;
    assert.ok(hit.dist > 0 && hit.dist <= 40);
    assert.ok(sampleField(cave, hit.x + dx * 0.02, hit.y + dy * 0.02) >= 0.45, 'el impacto no está en la roca');
    assert.ok(sampleField(cave, hit.x - dx * 0.1, hit.y - dy * 0.1) < 0.5, 'antes del impacto debería haber aire');
    assert.ok(hit.nx * dx + hit.ny * dy < 0.3, 'la normal debería oponerse al rayo');
  }
  assert.ok(hits > 50, 'la cueva es cerrada: casi todos los rayos deberían chocar');
});

test('raycast respeta el alcance máximo', () => {
  const cave = generateCave(5, CHAPTERS[0].params);
  const hit = raycast(cave, cave.start.x, cave.start.y, 1, 0, 0.01);
  assert.equal(hit, null);
});

test('línea de visión: un punto se ve a sí mismo y la roca bloquea', () => {
  const cave = generateCave(11, CHAPTERS[0].params);
  const { x, y } = cave.start;
  assert.ok(lineOfSight(cave, x, y, x, y));
  // a través de todo el mapa casi seguro hay roca
  assert.equal(lineOfSight(cave, 1.5, 1.5, cave.width - 1.5, cave.height - 1.5), false);
});

test('moveCircle nunca deja un cuerpo dentro de la roca', () => {
  const cave = generateCave(321, CHAPTERS[2].params);
  const rng = mulberry32(9);
  const body = { x: cave.start.x, y: cave.start.y, vx: 0, vy: 0, r: CONFIG.playerRadius };
  for (let i = 0; i < 4000; i++) {
    body.vx += (rng() - 0.5) * 6;
    body.vy += (rng() - 0.5) * 6;
    const sp = Math.hypot(body.vx, body.vy);
    if (sp > 6) { body.vx *= 6 / sp; body.vy *= 6 / sp; }
    moveCircle(cave, body, 1 / 60);
    assert.equal(circleHitsWall(cave, body.x, body.y, body.r), false, `atravesó la roca en el paso ${i}`);
  }
});

test('el campo de distancia lleva hasta el objetivo', () => {
  const cave = generateCave(99, CHAPTERS[1].params);
  const target = cave.exit;
  const field = distanceField(cave, target.x, target.y);
  let p = { x: cave.start.x, y: cave.start.y };
  let reached = false;
  for (let i = 0; i < 2000; i++) {
    const nxt = stepDownField(cave, field, p.x, p.y);
    assert.ok(nxt, 'se perdió el camino');
    p = nxt;
    if (nxt.d === 0) { reached = true; break; }
  }
  assert.ok(reached, 'no llegó al objetivo');
  assert.equal(Math.floor(p.x), Math.floor(target.x));
  assert.equal(Math.floor(p.y), Math.floor(target.y));
});

test('un grito crea ecos y despierta a los Oyentes que lo oyen', () => {
  const g = createGame(2024, 1);
  const c = g.creatures[0];
  // ponemos a Eco cerca del Oyente con línea abierta por los pasillos
  const field = distanceField(g.cave, c.x, c.y);
  let best = null;
  for (let i = 0; i < field.length; i++) {
    if (field[i] >= 6 && field[i] <= 10) { best = i; break; }
  }
  assert.ok(best !== null);
  g.player.x = (best % g.cave.width) + 0.5;
  g.player.y = Math.floor(best / g.cave.width) + 0.5;
  for (const o of g.creatures) if (o !== c) { o.x = 1e3; o.y = 1e3; }
  emitPulse(g, g.player.x, g.player.y, 1, 'player');
  assert.ok(g.echoes.length > 100, 'debería haber muchos ecos');
  assert.ok(g.echoes.every((e) => e.born >= g.time));
  assert.equal(c.state, 'investigate');
  assert.deepEqual(c.target, { x: g.player.x, y: g.player.y });
  assert.ok(g.events.some((e) => e.type === 'pulse'));
  assert.ok(g.events.some((e) => e.type === 'alert'));
});

test('un chasquido débil no se oye lejos', () => {
  const g = createGame(2024, 1);
  const c = g.creatures[0];
  const field = distanceField(g.cave, g.player.x, g.player.y);
  const d = field[Math.floor(c.y) * g.cave.width + Math.floor(c.x)];
  assert.ok(d > pulseLoudness(0), 'el Oyente empieza fuera del alcance de un chasquido');
  emitPulse(g, g.player.x, g.player.y, 0, 'player');
  assert.notEqual(c.state, 'investigate');
});

test('cargar y soltar el grito emite un pulso proporcional', () => {
  const g = createGame(7, 0);
  for (let i = 0; i < 30; i++) update(g, { ...idle, pulse: true }, 1 / 60);
  assert.ok(g.charging && g.charge > 0.4 && g.charge < 0.5);
  const ev = update(g, idle, 1 / 60);
  const pulse = ev.find((e) => e.type === 'pulse');
  assert.ok(pulse);
  assert.ok(Math.abs(pulse.power - g.pulses[0].power) < 1e-9);
  assert.equal(g.stats.pulses, 1);
});

test('reunir todas las polillas abre la grieta y llegar a ella gana', () => {
  const g = createGame(55, 0);
  for (const c of g.creatures) { c.x = 1e3; c.y = 1e3; }
  for (const m of g.moths) {
    g.player.x = m.x;
    g.player.y = m.y;
    update(g, idle, 1 / 60);
  }
  assert.equal(g.collected, g.needed);
  assert.equal(g.exit.open, true);
  g.player.x = g.exit.x;
  g.player.y = g.exit.y;
  const ev = update(g, idle, 1 / 60);
  assert.equal(g.status, 'won');
  assert.ok(ev.some((e) => e.type === 'win'));
});

test('si un Oyente te alcanza, mueres', () => {
  const g = createGame(55, 0);
  const c = g.creatures[0];
  c.x = g.player.x + 0.3;
  c.y = g.player.y;
  const ev = update(g, idle, 1 / 60);
  assert.equal(g.status, 'dead');
  assert.ok(ev.some((e) => e.type === 'death'));
});

test('el ruido cerca de un Oyente lo pone a cazar; planear en silencio no', () => {
  const g = createGame(2025, 1);
  const c = g.creatures[0];
  for (const o of g.creatures) if (o !== c) { o.x = 1e3; o.y = 1e3; }
  // colocamos a Eco a ~2.5 casillas con visión directa
  let placed = false;
  for (let a = 0; a < 16 && !placed; a++) {
    const x = c.x + Math.cos(a) * 2.5;
    const y = c.y + Math.sin(a) * 2.5;
    if (!circleHitsWall(g.cave, x, y, 0.3) && lineOfSight(g.cave, c.x, c.y, x, y)) { g.player.x = x; g.player.y = y; placed = true; }
  }
  assert.ok(placed);
  c.state = 'wander';
  c.timer = 99;
  const quietG = structuredCloneGame(g);
  for (let i = 0; i < 30; i++) update(quietG, { ax: 0, ay: 0, pulse: false, quiet: true }, 1 / 60);
  assert.notEqual(quietG.creatures[0].state, 'hunt', 'planeando no debería oírte');
  // un golpe contra la roca o un aleteo fuerte se oye
  g.player.bumpNoise = 6;
  for (let i = 0; i < 12; i++) update(g, idle, 1 / 60);
  assert.equal(c.state, 'hunt');
});

test('las cadenas de cristales terminan', () => {
  const g = createGame(31337, 4);
  for (const c of g.creatures) { c.x = 1e3; c.y = 1e3; }
  // grito máximo desde cada cristal
  for (const cr of g.crystals) emitPulse(g, cr.x, cr.y, 1, 'player');
  let steps = 0;
  while (g.scheduled.length && steps < 60 * 20) { update(g, idle, 1 / 60); steps++; }
  assert.equal(g.scheduled.length, 0, 'la resonancia no se detiene');
});

test('misma semilla y mismas entradas producen la misma partida', () => {
  const run = () => {
    const g = createGame(4242, 2);
    const r = mulberry32(1);
    for (let i = 0; i < 900; i++) {
      update(g, { ax: Math.sin(i / 40), ay: Math.cos(i / 55), pulse: r() < 0.3, quiet: i % 200 < 50 }, 1 / 60);
    }
    return { p: [g.player.x, g.player.y], c: g.creatures.map((c) => [c.x, c.y, c.state]), status: g.status, pulses: g.stats.pulses };
  };
  assert.deepEqual(run(), run());
});

// copia profunda de una partida (las Float32Array y funciones se reconstruyen)
function structuredCloneGame(g) {
  const copy = createGame(g.seed, g.chapterIndex);
  copy.player = { ...g.player };
  copy.creatures = g.creatures.map((c) => ({ ...c }));
  copy.rng = mulberry32(1);
  return copy;
}
