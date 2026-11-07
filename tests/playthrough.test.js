// Un "bot" recorre cada capítulo de verdad (física incluida): recoge todas las
// polillas y sale por la grieta. Así comprobamos que ningún nivel queda bloqueado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update } from '../src/game.js';
import { roomyGrid } from '../src/cave.js';
import { bfsGrid } from '../src/geometry.js';
import { CHAPTERS } from '../src/story.js';

function fieldTo(g, roomy, x, y) {
  return bfsGrid(roomy, g.cave.width, g.cave.height, Math.floor(x), Math.floor(y));
}

// Siguiente casilla del camino más corto (8 vecinos sin cortar esquinas).
function nextCell(g, roomy, field, x, y) {
  const w = g.cave.width;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  let best = null;
  let bestD = field[ty * w + tx];
  if (bestD < 0) return null;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + ox;
    const ny = ty + oy;
    const d = field[ny * w + nx];
    if (d < 0) continue;
    if (ox && oy && (field[ty * w + nx] < 0 || field[ny * w + tx] < 0)) continue;
    if (d < bestD) { bestD = d; best = { x: nx + 0.5, y: ny + 0.5, d }; }
  }
  return best;
}

function goTo(g, roomy, target, maxSeconds = 120) {
  const field = fieldTo(g, roomy, target.x, target.y);
  const dt = 1 / 60;
  let stuck = 0;
  let lastD = Infinity;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const p = g.player;
    const dTarget = Math.hypot(target.x - p.x, target.y - p.y);
    if (g.status !== 'playing' || (target.kind === 'moth' && target.ref.collected)) return true;
    let aim = nextCell(g, roomy, field, p.x, p.y);
    if (!aim || aim.d === 0 || dTarget < 1.2) aim = target;
    let ax = aim.x - p.x;
    let ay = aim.y - p.y;
    const m = Math.hypot(ax, ay) || 1;
    ax /= m;
    ay /= m;
    update(g, { ax, ay, pulse: false, quiet: dTarget < 2 }, dt);
    // atasco: la distancia por los pasillos (no en línea recta) deja de bajar
    if (i % 60 === 0) {
      const w = g.cave.width;
      const dPath = field[Math.floor(g.player.y) * w + Math.floor(g.player.x)];
      if (dPath >= lastD) stuck++; else stuck = 0;
      lastD = Math.min(lastD, dPath);
      if (stuck > 8) return false;
    }
  }
  return false;
}

for (let ch = 0; ch < CHAPTERS.length; ch++) {
  test(`capítulo ${ch + 1} se puede completar volando (3 semillas)`, () => {
    for (const seed of [101, 202, 303]) {
      const g = createGame(seed, ch);
      g.creatures = []; // solo comprobamos el recorrido
      const roomy = roomyGrid(g.cave);
      for (const m of g.moths) {
        const ok = goTo(g, roomy, { x: m.hx, y: m.hy, kind: 'moth', ref: m });
        assert.ok(ok && m.collected, `semilla ${seed}: no pudo llegar a la polilla ${m.id}`);
      }
      assert.equal(g.exit.open, true);
      const ok = goTo(g, roomy, { x: g.exit.x, y: g.exit.y, kind: 'exit' });
      assert.ok(ok, `semilla ${seed}: no pudo llegar a la grieta`);
      assert.equal(g.status, 'won', `semilla ${seed}: no ganó`);
    }
  });
}
