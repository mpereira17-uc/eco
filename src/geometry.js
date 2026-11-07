// Geometría sobre la rejilla de la cueva: raycasting, campos de distancia y colisiones.
// Coordenadas del mundo en unidades de casilla: la casilla (tx, ty) ocupa [tx, tx+1) x [ty, ty+1).

export const WALL = 1;
export const OPEN = 0;

export function tileIndex(cave, tx, ty) {
  return ty * cave.width + tx;
}

export function isWallTile(cave, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= cave.width || ty >= cave.height) return true;
  return cave.grid[ty * cave.width + tx] === WALL;
}

// Densidad de roca interpolada (bilineal) entre los centros de las casillas.
// < 0.5 es aire, >= 0.5 es roca. Si la cueva no trae campo suave, se usa la rejilla.
export function sampleField(cave, x, y) {
  const f = cave.field || cave.grid;
  const w = cave.width;
  const h = cave.height;
  const u = x - 0.5;
  const v = y - 0.5;
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const fx = u - i0;
  const fy = v - j0;
  const inX0 = i0 >= 0 && i0 < w;
  const inX1 = i0 + 1 >= 0 && i0 + 1 < w;
  const inY0 = j0 >= 0 && j0 < h;
  const inY1 = j0 + 1 >= 0 && j0 + 1 < h;
  const a = inX0 && inY0 ? f[j0 * w + i0] : 1;
  const b = inX1 && inY0 ? f[j0 * w + i0 + 1] : 1;
  const c = inX0 && inY1 ? f[(j0 + 1) * w + i0] : 1;
  const d = inX1 && inY1 ? f[(j0 + 1) * w + i0 + 1] : 1;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function isWallAt(cave, x, y) {
  return sampleField(cave, x, y) >= 0.5;
}

export function fieldNormal(cave, x, y) {
  const e = 0.06;
  const gx = sampleField(cave, x + e, y) - sampleField(cave, x - e, y);
  const gy = sampleField(cave, x, y + e) - sampleField(cave, x, y - e);
  const m = Math.hypot(gx, gy) || 1;
  // la normal apunta hacia el aire (contra el gradiente de roca)
  return { nx: -gx / m, ny: -gy / m };
}

// Marcha sobre el campo de densidad: devuelve el primer punto donde la roca empieza.
export function raycast(cave, ox, oy, dx, dy, maxDist) {
  let prev = 0;
  let t = 0;
  let v = sampleField(cave, ox, oy);
  if (v >= 0.5) return { dist: 0, x: ox, y: oy, nx: -dx, ny: -dy, tx: Math.floor(ox), ty: Math.floor(oy) };
  while (t < maxDist) {
    const step = Math.min(0.7, Math.max(0.045, (0.5 - v) * 1.4));
    prev = t;
    t = Math.min(maxDist, t + step);
    v = sampleField(cave, ox + dx * t, oy + dy * t);
    if (v >= 0.5) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (sampleField(cave, ox + dx * mid, oy + dy * mid) >= 0.5) hi = mid;
        else lo = mid;
      }
      const x = ox + dx * hi;
      const y = oy + dy * hi;
      const n = fieldNormal(cave, x, y);
      return {
        dist: hi, x, y, nx: n.nx, ny: n.ny,
        tx: Math.floor(x + dx * 0.3), ty: Math.floor(y + dy * 0.3),
      };
    }
    if (t >= maxDist) break;
  }
  return null;
}

export function lineOfSight(cave, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  return raycast(cave, ax, ay, dx / d, dy / d, d) === null;
}

// BFS de 4 vecinos sobre la rejilla. Devuelve Int32Array con distancias en pasos (-1 inalcanzable).
export function bfsGrid(grid, width, height, sx, sy, maxDist = Infinity) {
  const dist = new Int32Array(width * height).fill(-1);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return dist;
  const start = sy * width + sx;
  if (grid[start] === WALL) return dist;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) { const j = i - 1; if (dist[j] < 0 && grid[j] !== WALL) { dist[j] = d + 1; queue[tail++] = j; } }
    if (x < width - 1) { const j = i + 1; if (dist[j] < 0 && grid[j] !== WALL) { dist[j] = d + 1; queue[tail++] = j; } }
    if (y > 0) { const j = i - width; if (dist[j] < 0 && grid[j] !== WALL) { dist[j] = d + 1; queue[tail++] = j; } }
    if (y < height - 1) { const j = i + width; if (dist[j] < 0 && grid[j] !== WALL) { dist[j] = d + 1; queue[tail++] = j; } }
  }
  return dist;
}

export function distanceField(cave, x, y, maxDist = Infinity) {
  return bfsGrid(cave.grid, cave.width, cave.height, Math.floor(x), Math.floor(y), maxDist);
}

export function fieldAt(cave, field, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= cave.width || ty >= cave.height) return -1;
  return field[ty * cave.width + tx];
}

// Siguiente punto (centro de casilla) que baja por el campo de distancia.
export function stepDownField(cave, field, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const w = cave.width;
  const cur = fieldAt(cave, field, x, y);
  if (cur < 0) return null;
  if (cur === 0) return { x: tx + 0.5, y: ty + 0.5, d: 0 };
  let best = null;
  let bestD = cur;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [ox, oy] of dirs) {
    const nx = tx + ox;
    const ny = ty + oy;
    if (isWallTile(cave, nx, ny)) continue;
    if (ox !== 0 && oy !== 0 && (isWallTile(cave, tx + ox, ty) || isWallTile(cave, tx, ty + oy))) continue;
    const d = field[ny * w + nx];
    if (d < 0) continue;
    // las diagonales cuentan como algo más largas para preferir caminos rectos
    const score = d + (ox !== 0 && oy !== 0 ? 0.4 : 0);
    if (score < bestD) { bestD = score; best = { x: nx + 0.5, y: ny + 0.5, d }; }
  }
  return best;
}

const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);

export function circleHitsWall(cave, x, y, r) {
  if (sampleField(cave, x, y) >= 0.5) return true;
  for (const [cx, cy] of RING) if (sampleField(cave, x + cx * r, y + cy * r) >= 0.5) return true;
  return false;
}

// Mueve un cuerpo circular con sub-pasos y rebote. Devuelve la velocidad de impacto (0 si no chocó).
export function moveCircle(cave, body, dt, bounce = 0.25) {
  const speed = Math.max(Math.abs(body.vx), Math.abs(body.vy));
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.08));
  const h = dt / steps;
  let impact = 0;
  for (let s = 0; s < steps; s++) {
    const nx = body.x + body.vx * h;
    if (circleHitsWall(cave, nx, body.y, body.r)) {
      impact = Math.max(impact, Math.abs(body.vx));
      body.vx *= -bounce;
    } else {
      body.x = nx;
    }
    const ny = body.y + body.vy * h;
    if (circleHitsWall(cave, body.x, ny, body.r)) {
      impact = Math.max(impact, Math.abs(body.vy));
      body.vy *= -bounce;
    } else {
      body.y = ny;
    }
  }
  return impact;
}
