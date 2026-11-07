// Generación procedural de cuevas con autómata celular, más colocación de
// inicio, salida, polillas (notas), cristales resonantes y Oyentes.

import { mulberry32, shuffle } from './rng.js';
import { WALL, OPEN, bfsGrid, raycast, sampleField } from './geometry.js';

function countWalls(grid, w, h, x, y) {
  let n = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny * w + nx] === WALL) n++;
    }
  }
  return n;
}

function automatonStep(grid, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { out[i] = WALL; continue; }
      const n = countWalls(grid, w, h, x, y);
      out[i] = n > 4 ? WALL : n < 4 ? OPEN : grid[i];
    }
  }
  return out;
}

// Etiqueta regiones abiertas (4-conexas) y deja solo la mayor.
export function keepLargestRegion(grid, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let bestLabel = -1;
  let bestSize = 0;
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (grid[s] === WALL || label[s] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    label[s] = next;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i / w) | 0;
      const ns = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of ns) {
        if (j >= 0 && grid[j] !== WALL && label[j] < 0) { label[j] = next; queue[tail++] = j; }
      }
    }
    if (tail > bestSize) { bestSize = tail; bestLabel = next; }
    next++;
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = label[i] === bestLabel ? OPEN : WALL;
  return { grid: out, size: bestSize };
}

// Encuentra todas las regiones abiertas 4-conexas. Devuelve listas de índices.
function findRegions(grid, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const regions = [];
  for (let s = 0; s < w * h; s++) {
    if (grid[s] === WALL || label[s] >= 0) continue;
    const id = regions.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    label[s] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i / w) | 0;
      const ns = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of ns) {
        if (j >= 0 && grid[j] !== WALL && label[j] < 0) { label[j] = id; queue[tail++] = j; }
      }
    }
    regions.push(Array.from(queue.subarray(0, tail)));
  }
  return regions;
}

function carveDisc(grid, w, h, cx, cy, r) {
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      if (ox * ox + oy * oy > r * r + 0.5) continue;
      const x = cx + ox;
      const y = cy + oy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      grid[y * w + x] = OPEN;
    }
  }
}

// Túnel serpenteante entre dos puntos: un paseo aleatorio sesgado hacia el destino.
function carveTunnel(grid, w, h, a, b, rng) {
  let x = a.x;
  let y = a.y;
  const radius = rng() < 0.35 ? 2 : 1;
  for (let guard = 0; guard < 2000; guard++) {
    carveDisc(grid, w, h, x, y, radius);
    if (x === b.x && y === b.y) return;
    if (rng() < 0.72) {
      const dx = b.x - x;
      const dy = b.y - y;
      if (Math.abs(dx) > Math.abs(dy) ? rng() < 0.8 : rng() < 0.2) x += Math.sign(dx);
      else y += Math.sign(dy);
    } else {
      const d = Math.floor(rng() * 4);
      x += d === 0 ? 1 : d === 1 ? -1 : 0;
      y += d === 2 ? 1 : d === 3 ? -1 : 0;
      x = Math.max(2, Math.min(w - 3, x));
      y = Math.max(2, Math.min(h - 3, y));
    }
  }
}

// Conecta las cámaras con túneles (árbol de expansión mínima + algunos bucles para escapar).
function connectChambers(grid, w, h, rng, minSize = 16) {
  const regions = findRegions(grid, w, h).filter((r) => {
    if (r.length >= minSize) return true;
    for (const i of r) grid[i] = WALL;
    return false;
  });
  if (regions.length <= 1) return;
  const samples = regions.map((r) => {
    const pts = [];
    const n = Math.min(48, r.length);
    for (let k = 0; k < n; k++) {
      const i = r[Math.floor(rng() * r.length)];
      pts.push({ x: i % w, y: (i / w) | 0 });
    }
    return pts;
  });
  const closest = (a, b) => {
    let best = null;
    let bd = Infinity;
    for (const p of samples[a]) {
      for (const q of samples[b]) {
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < bd) { bd = d; best = [p, q]; }
      }
    }
    return { d: bd, pair: best };
  };
  const pairs = [];
  for (let a = 0; a < regions.length; a++) {
    for (let b = a + 1; b < regions.length; b++) pairs.push({ a, b, ...closest(a, b) });
  }
  pairs.sort((p, q) => p.d - q.d);
  const parent = regions.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const extra = [];
  for (const p of pairs) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra !== rb) { parent[ra] = rb; carveTunnel(grid, w, h, p.pair[0], p.pair[1], rng); }
    else extra.push(p);
  }
  // Bucles: rutas alternativas para despistar a los Oyentes.
  const loops = Math.max(1, Math.floor(regions.length / 3));
  for (let k = 0; k < loops && k < extra.length; k++) {
    const p = extra[k * 2] || extra[k];
    if (p && p.d < 30 * 30) carveTunnel(grid, w, h, p.pair[0], p.pair[1], rng);
  }
}

function hasClearance(grid, w, h, x, y, r = 1) {
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || grid[ny * w + nx] === WALL) return false;
    }
  }
  return true;
}

function pickSpread(cands, count, minSep, avoid, rng) {
  const chosen = [];
  let sep = minSep;
  const pool = shuffle(cands.slice(), rng);
  while (chosen.length < count && sep >= 1) {
    for (const c of pool) {
      if (chosen.length >= count) break;
      if (chosen.includes(c)) continue;
      const ok = chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= sep)
        && avoid.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= o.sep);
      if (ok) chosen.push(c);
    }
    sep *= 0.7;
  }
  return chosen;
}

// Campo de densidad suave: la rejilla binaria difuminada con un poco de ruido
// para que las paredes sean orgánicas en vez de escalonadas.
export function buildField(grid, w, h, rng = null, opts = {}) {
  const passes = opts.blur ?? 2;
  const noiseAmp = opts.noise ?? 0.12;
  let f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = grid[i];
  const at = (src, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : src[y * w + x]);
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) tmp[y * w + x] = (at(f, x - 1, y) + 2 * at(f, x, y) + at(f, x + 1, y)) / 4;
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[y * w + x] = (at(tmp, x, y - 1) + 2 * at(tmp, x, y) + at(tmp, x, y + 1)) / 4;
    }
    f = out;
  }
  if (rng && noiseAmp > 0) {
    // ruido de valor de baja frecuencia (celdas de 4) para irregularidad rocosa
    const cell = 4;
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const lattice = new Float32Array(gw * gh);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng() - 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / cell;
        const v = y / cell;
        const i0 = Math.floor(u);
        const j0 = Math.floor(v);
        const fx = u - i0;
        const fy = v - j0;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const L = (i, j) => lattice[j * gw + i];
        const n = (L(i0, j0) * (1 - sx) + L(i0 + 1, j0) * sx) * (1 - sy) + (L(i0, j0 + 1) * (1 - sx) + L(i0 + 1, j0 + 1) * sx) * sy;
        f[y * w + x] += n * noiseAmp * 2;
      }
    }
  }
  for (let x = 0; x < w; x++) { f[x] = 1; f[(h - 1) * w + x] = 1; }
  for (let y = 0; y < h; y++) { f[y * w] = 1; f[y * w + w - 1] = 1; }
  return f;
}

// Estalactitas y estalagmitas ancladas al contorno real de la roca.
function buildDecor(cave, rng) {
  const { width: w, height: h, grid } = cave;
  const decor = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] !== OPEN) continue;
      const cx = x + 0.2 + rng() * 0.6;
      const cy = y + 0.5;
      if (grid[(y - 1) * w + x] === WALL && rng() < 0.3) {
        const hit = raycast(cave, cx, cy, 0, -1, 1.6);
        if (hit && hit.ny > 0.6) decor.push({ kind: 'stalactite', x: hit.x, y: hit.y + 0.02, len: 0.35 + rng() * 0.9, w: 0.12 + rng() * 0.18, tx: hit.tx, ty: hit.ty });
      } else if (grid[(y + 1) * w + x] === WALL && rng() < 0.16) {
        const hit = raycast(cave, cx, cy, 0, 1, 1.6);
        if (hit && hit.ny < -0.6) decor.push({ kind: 'stalagmite', x: hit.x, y: hit.y - 0.02, len: 0.25 + rng() * 0.6, w: 0.14 + rng() * 0.2, tx: hit.tx, ty: hit.ty });
      }
    }
  }
  return decor;
}

// Casillas por las que cabe Eco (radio ~0.3) según el campo suave.
export function roomyGrid(cave, r = 0.32) {
  const { width: w, height: h, grid } = cave;
  const out = new Uint8Array(w * h).fill(WALL);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] !== OPEN) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      let ok = sampleField(cave, cx, cy) < 0.5;
      for (let k = 0; k < 8 && ok; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (sampleField(cave, cx + Math.cos(a) * r, cy + Math.sin(a) * r) >= 0.5) ok = false;
      }
      if (ok) out[y * w + x] = OPEN;
    }
  }
  return out;
}

export function generateCave(seed, opts = {}) {
  const width = opts.width ?? 80;
  const height = opts.height ?? 52;
  const fill = opts.fill ?? 0.46;
  const mothCount = opts.moths ?? 4;
  const creatureCount = opts.creatures ?? 2;
  const crystalCount = opts.crystals ?? 0;

  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32((seed >>> 0) + attempt * 7919);
    let grid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        grid[y * width + x] = border || rng() < fill ? WALL : OPEN;
      }
    }
    for (let s = 0; s < 5; s++) grid = automatonStep(grid, width, height);
    connectChambers(grid, width, height, rng);
    grid = keepLargestRegion(grid, width, height).grid;

    // Rejilla definitiva a partir del campo suave, para que física, sonido y dibujo coincidan.
    const field = buildField(grid, width, height, rng);
    for (let i = 0; i < width * height; i++) grid[i] = field[i] >= 0.5 ? WALL : OPEN;
    const region = keepLargestRegion(grid, width, height);
    grid = region.grid;
    for (let i = 0; i < width * height; i++) if (grid[i] === WALL && field[i] < 0.5) field[i] = 1;
    if (region.size < width * height * 0.26) continue;
    const cave = { width, height, grid, field };

    // Solo casillas holgadas: allí caben Eco, las polillas y los Oyentes.
    const roomy = roomyGrid(cave);
    const cands = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (hasClearance(roomy, width, height, x, y, 1) && field[y * width + x] < 0.3) cands.push({ x, y });
      }
    }
    if (cands.length < 50) continue;

    // Inicio: el extremo más alejado de un punto aleatorio, para alargar el recorrido.
    const probe = cands[Math.floor(rng() * cands.length)];
    const probeDist = bfsGrid(roomy, width, height, probe.x, probe.y);
    let start = probe;
    for (const c of cands) if (probeDist[c.y * width + c.x] > probeDist[start.y * width + start.x]) start = c;

    const dist = bfsGrid(roomy, width, height, start.x, start.y);
    const reachable = cands.filter((c) => dist[c.y * width + c.x] >= 0);
    let exit = start;
    let maxD = 0;
    for (const c of reachable) {
      const d = dist[c.y * width + c.x];
      if (d > maxD) { maxD = d; exit = c; }
    }
    if (maxD < Math.max(width, height) * 0.7) continue;

    const dOf = (c) => dist[c.y * width + c.x];
    const mothCands = reachable.filter((c) => dOf(c) > maxD * 0.18 && dOf(c) < maxD * 0.97);
    const moths = pickSpread(mothCands, mothCount, 12, [{ ...exit, sep: 5 }, { ...start, sep: 8 }], rng);
    if (moths.length < mothCount) continue;

    const creatureCands = reachable.filter((c) => dOf(c) > Math.max(16, maxD * 0.25));
    const creatures = pickSpread(creatureCands, creatureCount, 14, [{ ...start, sep: 14 }], rng);
    if (creatures.length < creatureCount) continue;

    const crystalCands = reachable.filter((c) => dOf(c) > 8);
    const crystals = pickSpread(crystalCands, crystalCount, 10,
      [...moths.map((m) => ({ ...m, sep: 3 })), { ...exit, sep: 4 }, { ...start, sep: 6 }], rng);

    const center = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
    return {
      seed,
      width,
      height,
      grid,
      field,
      start: center(start),
      exit: center(exit),
      moths: moths.map(center),
      creatures: creatures.map(center),
      crystals: crystals.map(center),
      decor: buildDecor(cave, rng),
      pathLength: maxD,
      attempt,
    };
  }
  throw new Error(`No se pudo generar una cueva para la semilla ${seed}`);
}
