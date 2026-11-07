// Modelos vectoriales procedurales y animados.
// Todas las funciones dibujan en coordenadas locales: 1 unidad = 1 casilla,
// el origen es el centro de la criatura y +x es hacia donde mira.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const dir = (ang, len) => ({ x: Math.cos(ang) * len, y: Math.sin(ang) * len });
const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
const mix = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
const deg = (d) => (d * Math.PI) / 180;

function seeded(n) {
  let s = (n * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────── Eco, el murciélago ─────────────────────────────

function batWing(side, span, fold) {
  const s = side;
  const P = (p) => ({ x: p.x, y: p.y * s * span });
  const shoulder = { x: 0.06, y: 0.075 };
  const a = (open, closed) => deg(lerp(open, closed, fold));
  const elbow = add(shoulder, dir(a(112, 150), lerp(0.17, 0.15, fold)));
  const wrist = add(elbow, dir(a(68, 112), lerp(0.31, 0.24, fold)));
  const tip3 = add(wrist, dir(a(98, 165), lerp(0.38, 0.2, fold)));
  const tip4 = add(wrist, dir(a(134, 176), lerp(0.3, 0.18, fold)));
  const tip5 = add(wrist, dir(a(166, 186), lerp(0.25, 0.16, fold)));
  const thumb = add(wrist, dir(a(28, 60), 0.055));
  const hip = { x: -0.2, y: 0.055 };
  return {
    shoulder: P(shoulder), elbow: P(elbow), wrist: P(wrist), tip3: P(tip3), tip4: P(tip4),
    tip5: P(tip5), thumb: P(thumb), hip: P(hip),
  };
}

function scallop(ctx, from, to, toward, depth) {
  const m = mix(from, to, 0.5);
  const c = mix(m, toward, depth);
  ctx.quadraticCurveTo(c.x, c.y, to.x, to.y);
}

/**
 * o.flap: fase del aleteo (radianes) · o.glide: 0..1 · o.charge: 0..1
 * o.rim: color [r,g,b] de la luz de contorno · o.mode: 'game' | 'portrait'
 */
export function drawBat(ctx, o = {}) {
  const flap = o.flap ?? 0;
  const glide = o.glide ?? 0;
  const charge = o.charge ?? 0;
  const rim = o.rim ?? [140, 220, 255];
  const portrait = o.mode === 'portrait';
  const stroke = o.lineWidth ?? 0.012;

  // Proyección cenital del aleteo: la envergadura aparente se encoge en cada batida.
  const beat = Math.cos(flap);
  const span = lerp(0.42 + 0.58 * (0.5 + 0.5 * beat), 0.98, glide);
  const fold = lerp(0.18 + 0.4 * (0.5 - 0.5 * beat), 0.04, glide);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    const w = batWing(side, span, fold);
    // Membrana
    ctx.beginPath();
    ctx.moveTo(w.shoulder.x, w.shoulder.y);
    ctx.lineTo(w.elbow.x, w.elbow.y);
    ctx.lineTo(w.wrist.x, w.wrist.y);
    ctx.lineTo(w.tip3.x, w.tip3.y);
    scallop(ctx, w.tip3, w.tip4, w.wrist, 0.32);
    scallop(ctx, w.tip4, w.tip5, w.wrist, 0.3);
    scallop(ctx, w.tip5, w.hip, w.elbow, 0.28);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, w.tip3.x, w.tip3.y);
    g.addColorStop(0, portrait ? '#3a2a36' : 'rgba(40,30,44,0.96)');
    g.addColorStop(0.6, portrait ? '#4b3646' : 'rgba(58,42,60,0.9)');
    g.addColorStop(1, portrait ? '#2a1f2a' : 'rgba(36,26,40,0.85)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(rim, portrait ? 0.55 : 0.75);
    ctx.lineWidth = stroke;
    ctx.stroke();

    // Venas de la membrana
    ctx.beginPath();
    for (const tip of [w.tip3, w.tip4]) {
      const m = mix(w.wrist, tip, 0.55);
      ctx.moveTo(m.x, m.y);
      const q = mix(w.elbow, w.hip, 0.5);
      ctx.quadraticCurveTo(lerp(m.x, q.x, 0.5), lerp(m.y, q.y, 0.3), q.x, q.y);
    }
    ctx.strokeStyle = rgba(rim, 0.12);
    ctx.lineWidth = stroke * 0.6;
    ctx.stroke();

    // Huesos: brazo, antebrazo y dedos
    ctx.beginPath();
    ctx.moveTo(w.shoulder.x, w.shoulder.y);
    ctx.lineTo(w.elbow.x, w.elbow.y);
    ctx.lineTo(w.wrist.x, w.wrist.y);
    for (const tip of [w.tip3, w.tip4, w.tip5]) {
      ctx.moveTo(w.wrist.x, w.wrist.y);
      const k = mix(w.wrist, tip, 0.48);
      ctx.lineTo(k.x, k.y);
      ctx.lineTo(tip.x, tip.y);
    }
    ctx.moveTo(w.wrist.x, w.wrist.y);
    ctx.lineTo(w.thumb.x, w.thumb.y);
    ctx.strokeStyle = portrait ? '#8d7484' : 'rgba(150,125,145,0.9)';
    ctx.lineWidth = stroke * 1.25;
    ctx.stroke();
    // Garra del pulgar
    ctx.beginPath();
    ctx.arc(w.thumb.x, w.thumb.y, stroke * 1.4, 0, TAU);
    ctx.fillStyle = '#d9c6c9';
    ctx.fill();
  }

  // Uropatagio (membrana de la cola) y patas
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.06);
  ctx.quadraticCurveTo(-0.33, -0.1, -0.4, -0.02);
  ctx.quadraticCurveTo(-0.36, 0, -0.4, 0.02);
  ctx.quadraticCurveTo(-0.33, 0.1, -0.17, 0.06);
  ctx.closePath();
  ctx.fillStyle = portrait ? '#33242f' : 'rgba(46,34,48,0.92)';
  ctx.fill();
  ctx.strokeStyle = rgba(rim, 0.45);
  ctx.lineWidth = stroke * 0.8;
  ctx.stroke();
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(-0.18, 0.05 * s);
    ctx.lineTo(-0.29, 0.085 * s);
    ctx.lineTo(-0.32, 0.075 * s);
  }
  ctx.strokeStyle = '#9b8590';
  ctx.lineWidth = stroke;
  ctx.stroke();

  // Cuerpo con pelaje
  ctx.beginPath();
  ctx.ellipse(-0.04, 0, 0.17, 0.085, 0, 0, TAU);
  const bg = ctx.createRadialGradient(0.02, -0.02, 0.01, -0.04, 0, 0.18);
  bg.addColorStop(0, '#8a6a6e');
  bg.addColorStop(0.55, '#5a4249');
  bg.addColorStop(1, '#2e2229');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = rgba(rim, 0.55);
  ctx.lineWidth = stroke;
  ctx.stroke();
  // mechones de pelo
  ctx.beginPath();
  const fr = seeded(7);
  for (let i = 0; i < 14; i++) {
    const x = lerp(-0.18, 0.08, fr());
    const y = lerp(-0.06, 0.06, fr());
    ctx.moveTo(x, y);
    ctx.lineTo(x - 0.03, y + (fr() - 0.5) * 0.02);
  }
  ctx.strokeStyle = 'rgba(200,170,170,0.18)';
  ctx.lineWidth = stroke * 0.7;
  ctx.stroke();

  // Orejas grandes
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0.17, 0.035 * s);
    ctx.quadraticCurveTo(0.27, 0.13 * s, 0.33, 0.115 * s);
    ctx.quadraticCurveTo(0.3, 0.06 * s, 0.22, 0.015 * s);
    ctx.closePath();
    ctx.fillStyle = '#6b4c55';
    ctx.fill();
    ctx.strokeStyle = rgba(rim, 0.6);
    ctx.lineWidth = stroke * 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.2, 0.035 * s);
    ctx.quadraticCurveTo(0.265, 0.1 * s, 0.305, 0.1 * s);
    ctx.strokeStyle = 'rgba(230,170,180,0.45)';
    ctx.lineWidth = stroke * 0.8;
    ctx.stroke();
  }

  // Cabeza y hocico
  ctx.beginPath();
  ctx.ellipse(0.17, 0, 0.065, 0.055, 0, 0, TAU);
  const hg = ctx.createRadialGradient(0.19, -0.015, 0.005, 0.17, 0, 0.07);
  hg.addColorStop(0, '#9b7a7c');
  hg.addColorStop(1, '#4a363d');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.235, 0, 0.026, 0.024, 0, 0, TAU);
  ctx.fillStyle = '#7d5c62';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.255, -0.009, 0.006, 0, TAU);
  ctx.arc(0.255, 0.009, 0.006, 0, TAU);
  ctx.fillStyle = '#2a1c22';
  ctx.fill();
  // Ojitos que reflejan la luz
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(0.2, 0.03 * s, 0.009, 0, TAU);
    ctx.fillStyle = rgba(rim, 0.95);
    ctx.fill();
  }

  // Brillo de la garganta mientras carga el grito
  if (charge > 0.01) {
    const r = 0.06 + charge * 0.12;
    const cg = ctx.createRadialGradient(0.26, 0, 0, 0.26, 0, r);
    cg.addColorStop(0, rgba(rim, 0.6 * charge + 0.2));
    cg.addColorStop(1, rgba(rim, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0.26, 0, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ───────────────────────────── Oyente ─────────────────────────────

/**
 * Un murciélago antiguo y ciego que se arrastra sobre sus alas plegadas.
 * o.step: fase de la marcha · o.t: tiempo · o.state · o.mode: 'echo' | 'portrait'
 * o.color: color del eco [r,g,b] · o.alpha
 */
export function drawOyente(ctx, o = {}) {
  const step = o.step ?? 0;
  const t = o.t ?? 0;
  const state = o.state ?? 'wander';
  const echo = o.mode !== 'portrait';
  const color = o.color ?? [255, 90, 110];
  const alpha = o.alpha ?? 1;
  const lw = o.lineWidth ?? 0.018;
  const hunting = state === 'hunt';
  const listening = state === 'listen' || state === 'investigate';
  const jaw = hunting ? 0.55 + 0.45 * Math.sin(t * 14) : 0.1;
  // las orejas se abren al escuchar y se aplastan hacia atrás al cazar
  const earSpread = listening ? 0.22 + 0.08 * Math.sin(t * 9) : hunting ? -0.32 : 0.05 * Math.sin(t * 2.3);

  const strokeCol = echo ? rgba(color, 0.95 * alpha) : '#eadfd4';
  const boneCol = echo ? rgba(color, 0.85 * alpha) : '#d8cabe';
  const membraneCol = echo ? rgba(color, 0.1 * alpha) : 'rgba(70,52,58,0.92)';
  const membraneEdge = echo ? rgba(color, 0.55 * alpha) : '#9c8279';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;

  // Cola en látigo
  ctx.beginPath();
  ctx.moveTo(-0.4, 0);
  for (let i = 1; i <= 14; i++) {
    const k = i / 14;
    ctx.lineTo(-0.4 - k * 0.6, Math.sin(step * 0.8 + k * 4.5) * 0.09 * k);
  }
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = lw * 0.75;
  ctx.stroke();
  ctx.lineWidth = lw;

  // Alas plegadas como un manto: caminan apoyadas en las muñecas
  for (const s of [-1, 1]) {
    const ph = step + (s > 0 ? 0 : Math.PI);
    const reach = Math.sin(ph);
    const lift = Math.max(0, Math.cos(ph));
    const shoulder = { x: 0.12, y: 0.11 * s };
    const elbow = { x: -0.12 + reach * 0.05, y: (0.44 + lift * 0.05) * s };
    const wrist = { x: 0.2 + reach * 0.13, y: (0.42 - lift * 0.04) * s };
    const drape = { x: -0.3, y: 0.15 * s };
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.quadraticCurveTo(-0.3 + reach * 0.03, 0.36 * s, drape.x, drape.y);
    ctx.closePath();
    ctx.fillStyle = membraneCol;
    ctx.fill();
    ctx.strokeStyle = membraneEdge;
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    // dedos plegados dentro del manto
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const end = mix(elbow, drape, 0.25 + k * 0.25);
      ctx.moveTo(wrist.x, wrist.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.strokeStyle = echo ? rgba(color, 0.35 * alpha) : 'rgba(170,140,135,0.5)';
    ctx.lineWidth = lw * 0.6;
    ctx.stroke();
    // húmero y antebrazo
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.strokeStyle = boneCol;
    ctx.lineWidth = lw * 1.4;
    ctx.stroke();
    // garra del pulgar apoyada en el suelo
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      const a = deg(10 + k * 24) * s;
      ctx.moveTo(wrist.x, wrist.y);
      ctx.lineTo(wrist.x + Math.cos(a) * 0.1, wrist.y + Math.sin(a) * 0.1);
    }
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
    // pata trasera
    const hph = ph + Math.PI;
    const hip = { x: -0.32, y: 0.07 * s };
    const knee = { x: -0.34 + Math.sin(hph) * 0.04, y: 0.26 * s };
    const foot = { x: -0.5 + Math.sin(hph) * 0.1, y: 0.22 * s };
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.strokeStyle = boneCol;
    ctx.lineWidth = lw * 1.1;
    ctx.stroke();
  }
  ctx.lineWidth = lw;

  // Cuerpo con costillas marcadas
  ctx.beginPath();
  ctx.moveTo(0.2, 0);
  ctx.bezierCurveTo(0.16, 0.15, -0.2, 0.15, -0.44, 0.025);
  ctx.lineTo(-0.44, -0.025);
  ctx.bezierCurveTo(-0.2, -0.15, 0.16, -0.15, 0.2, 0);
  ctx.closePath();
  if (echo) ctx.fillStyle = rgba(color, 0.14 * alpha);
  else {
    const bg = ctx.createLinearGradient(0, -0.15, 0, 0.15);
    bg.addColorStop(0, '#d6cac0');
    bg.addColorStop(0.5, '#ac9e95');
    bg.addColorStop(1, '#776a64');
    ctx.fillStyle = bg;
  }
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = 0.08 - i * 0.075;
    const hw = 0.12 * Math.sin(((i + 1.2) / 7.5) * Math.PI) + 0.015;
    ctx.moveTo(x + 0.02, -hw);
    ctx.quadraticCurveTo(x - 0.035, 0, x + 0.02, hw);
  }
  ctx.strokeStyle = echo ? rgba(color, 0.45 * alpha) : 'rgba(90,75,70,0.55)';
  ctx.lineWidth = lw * 0.65;
  ctx.stroke();
  ctx.lineWidth = lw;

  // Cuello
  ctx.beginPath();
  ctx.moveTo(0.14, -0.05);
  ctx.quadraticCurveTo(0.22, -0.04, 0.26, -0.06);
  ctx.lineTo(0.26, 0.06);
  ctx.quadraticCurveTo(0.22, 0.04, 0.14, 0.05);
  ctx.closePath();
  ctx.fillStyle = echo ? rgba(color, 0.14 * alpha) : '#b9aba1';
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.stroke();

  // Orejas enormes en V, como antenas parabólicas
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(0.3, 0.045 * s);
    ctx.rotate((deg(-8) - earSpread) * -s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.08, 0.02 * s, 0.26, 0.12 * s, 0.25, 0.3 * s);
    ctx.bezierCurveTo(0.24, 0.42 * s, 0.06, 0.4 * s, -0.04, 0.28 * s);
    ctx.bezierCurveTo(-0.08, 0.2 * s, -0.06, 0.08 * s, 0, 0);
    ctx.closePath();
    if (echo) ctx.fillStyle = rgba(color, 0.2 * alpha);
    else {
      const eg = ctx.createLinearGradient(0, 0, 0.15, 0.36 * s);
      eg.addColorStop(0, '#e2c3ba');
      eg.addColorStop(0.7, '#b48e88');
      eg.addColorStop(1, '#8a6863');
      ctx.fillStyle = eg;
    }
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.stroke();
    // pliegues internos concéntricos
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      ctx.moveTo(0.01, 0.02 * s);
      ctx.bezierCurveTo(0.2 * f + 0.02, 0.06 * s, 0.22 * f, 0.3 * s * f + 0.02 * s, 0.06 * f, 0.32 * s * f + 0.02 * s);
    }
    ctx.strokeStyle = echo ? rgba(color, 0.5 * alpha) : 'rgba(120,70,70,0.55)';
    ctx.lineWidth = lw * 0.55;
    ctx.stroke();
    ctx.lineWidth = lw;
    ctx.restore();
  }

  // Cabeza sin ojos
  ctx.beginPath();
  ctx.ellipse(0.32, 0, 0.085, 0.07, 0, 0, TAU);
  if (echo) ctx.fillStyle = rgba(color, 0.2 * alpha);
  else {
    const hg = ctx.createRadialGradient(0.34, -0.02, 0.01, 0.32, 0, 0.09);
    hg.addColorStop(0, '#f1e6dc');
    hg.addColorStop(1, '#a39389');
    ctx.fillStyle = hg;
  }
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.stroke();
  // cicatrices donde tuvo ojos
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(0.325, 0.03 * s);
    ctx.lineTo(0.36, 0.042 * s);
  }
  ctx.strokeStyle = echo ? rgba(color, 0.65 * alpha) : '#6d5d57';
  ctx.lineWidth = lw * 0.6;
  ctx.stroke();
  ctx.lineWidth = lw;

  // Colmillos que se abren al cazar
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0.38, 0.025 * s);
    ctx.quadraticCurveTo(0.45, (0.04 + jaw * 0.06) * s, 0.47, (0.012 + jaw * 0.05) * s);
    ctx.strokeStyle = echo ? rgba([255, 235, 235], alpha) : '#fff8ee';
    ctx.lineWidth = lw * 1.1;
    ctx.stroke();
  }
  // Hoja nasal en forma de lanza
  ctx.beginPath();
  ctx.moveTo(0.37, 0);
  ctx.quadraticCurveTo(0.41, -0.045, 0.47, 0);
  ctx.quadraticCurveTo(0.41, 0.045, 0.37, 0);
  ctx.closePath();
  ctx.fillStyle = echo ? rgba(color, 0.35 * alpha) : '#c9a59e';
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── Polilla de luz ─────────────────────────────

export function drawMoth(ctx, o = {}) {
  const t = o.t ?? 0;
  const phase = o.phase ?? 0;
  const glow = o.glow ?? 0.5;
  const alpha = o.alpha ?? 1;
  const color = o.color ?? [255, 214, 140];
  const flutter = 0.35 + 0.65 * Math.abs(Math.cos(t * 22 + phase));

  ctx.save();
  // halo
  const r = 0.55 + glow * 0.9;
  const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  hg.addColorStop(0, rgba(color, (0.35 + 0.5 * glow) * alpha));
  hg.addColorStop(0.35, rgba(color, (0.1 + 0.2 * glow) * alpha));
  hg.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  ctx.rotate(Math.sin(t * 3 + phase) * 0.4);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(1, flutter);
    // ala anterior
    ctx.beginPath();
    ctx.moveTo(0.03, 0.01 * s);
    ctx.bezierCurveTo(0.12, 0.08 * s, 0.1, 0.2 * s, 0.02, 0.21 * s);
    ctx.bezierCurveTo(-0.04, 0.2 * s, -0.04, 0.08 * s, -0.01, 0.01 * s);
    ctx.closePath();
    const wg = ctx.createRadialGradient(0.03, 0.1 * s, 0.01, 0.03, 0.1 * s, 0.14);
    wg.addColorStop(0, rgba([255, 250, 225], 0.95 * alpha));
    wg.addColorStop(0.6, rgba(color, 0.85 * alpha));
    wg.addColorStop(1, rgba([200, 120, 60], 0.75 * alpha));
    ctx.fillStyle = wg;
    ctx.fill();
    // ojo en el ala
    ctx.beginPath();
    ctx.arc(0.035, 0.13 * s, 0.025, 0, TAU);
    ctx.fillStyle = rgba([120, 60, 30], 0.5 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.035, 0.13 * s, 0.011, 0, TAU);
    ctx.fillStyle = rgba([255, 255, 240], 0.9 * alpha);
    ctx.fill();
    // ala posterior
    ctx.beginPath();
    ctx.moveTo(-0.01, 0.01 * s);
    ctx.bezierCurveTo(-0.03, 0.12 * s, -0.12, 0.15 * s, -0.13, 0.07 * s);
    ctx.bezierCurveTo(-0.12, 0.03 * s, -0.06, 0.01 * s, -0.01, 0.01 * s);
    ctx.closePath();
    ctx.fillStyle = rgba(color, 0.7 * alpha);
    ctx.fill();
    ctx.restore();
  }
  // cuerpo y antenas plumosas
  ctx.beginPath();
  ctx.ellipse(-0.01, 0, 0.07, 0.022, 0, 0, TAU);
  ctx.fillStyle = rgba([255, 240, 200], alpha);
  ctx.fill();
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(0.05, 0.008 * s);
    ctx.quadraticCurveTo(0.1, 0.02 * s, 0.13, 0.06 * s);
    for (let k = 1; k <= 4; k++) {
      const x = 0.05 + k * 0.02;
      const y = (0.008 + k * 0.012) * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.012, y + 0.012 * s);
    }
  }
  ctx.strokeStyle = rgba([255, 235, 190], 0.85 * alpha);
  ctx.lineWidth = 0.008;
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── Cristal resonante ─────────────────────────────

const crystalCache = new Map();
function crystalShape(id) {
  if (crystalCache.has(id)) return crystalCache.get(id);
  const r = seeded(id + 101);
  const n = 4 + Math.floor(r() * 3);
  const shards = [];
  for (let i = 0; i < n; i++) {
    shards.push({
      a: (i / n) * TAU + (r() - 0.5) * 0.8,
      len: 0.28 + r() * 0.3,
      w: 0.07 + r() * 0.06,
      off: r() * 0.05,
    });
  }
  shards.sort((p, q) => p.len - q.len);
  crystalCache.set(id, shards);
  return shards;
}

export function drawCrystal(ctx, o = {}) {
  const id = o.id ?? 0;
  const ring = o.ring ?? 0; // 0..1 intensidad de resonancia
  const alpha = o.alpha ?? 1;
  const color = o.color ?? [200, 180, 255];
  const t = o.t ?? 0;
  const shards = crystalShape(id);
  ctx.save();
  if (ring > 0) ctx.translate(Math.sin(t * 90) * 0.012 * ring, Math.cos(t * 77) * 0.012 * ring);
  if (ring > 0.01) {
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.9 + ring * 0.6);
    gr.addColorStop(0, rgba(color, 0.55 * ring * alpha));
    gr.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 0.9 + ring * 0.6, 0, TAU);
    ctx.fill();
  }
  for (const s of shards) {
    ctx.save();
    ctx.rotate(s.a);
    ctx.translate(s.off, 0);
    const L = s.len;
    const W = s.w;
    // cara clara
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L * 0.82, -W / 2);
    ctx.lineTo(L, 0);
    ctx.closePath();
    ctx.fillStyle = rgba([235, 230, 255], (0.55 + 0.4 * ring) * alpha);
    ctx.fill();
    // cara oscura
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L, 0);
    ctx.lineTo(L * 0.82, W / 2);
    ctx.closePath();
    ctx.fillStyle = rgba(color, (0.4 + 0.4 * ring) * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -W * 0.3);
    ctx.lineTo(L * 0.82, -W / 2);
    ctx.lineTo(L, 0);
    ctx.lineTo(L * 0.82, W / 2);
    ctx.lineTo(0, W * 0.3);
    ctx.strokeStyle = rgba([250, 245, 255], (0.6 + 0.4 * ring) * alpha);
    ctx.lineWidth = 0.012;
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 0.06, 0, TAU);
  ctx.fillStyle = rgba([255, 255, 255], (0.5 + 0.5 * ring) * alpha);
  ctx.fill();
  ctx.restore();
}

// ───────────────────────────── La grieta (salida) ─────────────────────────────

export function drawRift(ctx, o = {}) {
  const t = o.t ?? 0;
  const open = o.open ?? 0; // 0..1
  const alpha = o.alpha ?? 1;
  const color = o.color ?? [210, 235, 255];
  ctx.save();
  // grieta dentada
  const r = seeded(999);
  ctx.beginPath();
  let x = -0.5;
  ctx.moveTo(x, 0);
  while (x < 0.5) {
    x += 0.06 + r() * 0.05;
    ctx.lineTo(Math.min(0.5, x), (r() - 0.5) * 0.14);
  }
  ctx.strokeStyle = rgba(color, (0.35 + 0.65 * open) * alpha);
  ctx.lineWidth = 0.03 + open * 0.03;
  ctx.stroke();
  if (open > 0) {
    const R = 1.4 * open;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, rgba([255, 255, 255], 0.9 * open * alpha));
    g.addColorStop(0.2, rgba(color, 0.5 * open * alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    // brazos en espiral de viento
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const f = k / 30;
        const a = arm * (TAU / 4) + f * 4.2 - t * 1.6;
        const rad = 0.08 + f * 1.05 * open;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rgba(color, 0.3 * open * alpha);
      ctx.lineWidth = 0.025;
      ctx.stroke();
    }
    // motas aspiradas hacia el centro
    for (let k = 0; k < 18; k++) {
      const f = (k / 18 + t * 0.35) % 1;
      const a = k * 2.39996 + f * 3;
      const rad = (1 - f) * 1.2 * open;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rad, Math.sin(a) * rad, 0.025 * (1 - f) + 0.008, 0, TAU);
      ctx.fillStyle = rgba([255, 255, 255], 0.8 * f * alpha);
      ctx.fill();
    }
  }
  ctx.restore();
}
