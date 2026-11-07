// Piezas de interfaz: pentagrama de notas, narración palabra a palabra, avisos y retratos del bestiario.

import { drawBat, drawOyente, drawMoth, drawCrystal, drawRift } from './models.js';

const SVG = 'http://www.w3.org/2000/svg';

// Posición diatónica respecto a Mi4 (línea inferior del pentagrama en clave de sol).
const PITCHES = [
  [261.63, -2], [293.66, -1], [329.63, 0], [349.23, 1], [392.0, 2], [440.0, 3], [493.88, 4],
  [523.25, 5], [587.33, 6], [659.25, 7], [698.46, 8], [783.99, 9], [880.0, 10], [987.77, 11],
];

export function staffStep(freq) {
  let best = PITCHES[0];
  for (const p of PITCHES) if (Math.abs(Math.log(p[0] / freq)) < Math.abs(Math.log(best[0] / freq))) best = p;
  return best[1];
}

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/** Dibuja la canción de un capítulo en un pentagrama; las notas recuperadas brillan. */
export function renderStaff(container, song, collected, popIndex = -1, scale = 1) {
  const gap = 8;
  const top = 16;
  const bottom = top + gap * 4;
  const step = 34;
  const left = 46;
  const width = left + song.length * step + 18;
  const height = 64;
  const svg = el('svg', { class: 'staff', viewBox: `0 0 ${width} ${height}`, width: width * scale, height: height * scale, role: 'img' });
  svg.setAttribute('aria-label', `${collected} de ${song.length} notas`);
  for (let i = 0; i < 5; i++) el('line', { class: 'line', x1: 0, x2: width, y1: top + i * gap, y2: top + i * gap }, svg);
  // emblema: una pequeña polilla en lugar de clave
  const em = el('g', { class: 'emblem', transform: `translate(18 ${top + gap * 2})` }, svg);
  el('path', { d: 'M0 0 C 6 -10, 14 -10, 12 -2 C 10 2, 4 2, 0 0 Z M0 0 C 6 10, 14 10, 12 2 C 10 -2, 4 -2, 0 0 Z M0 0 C -6 -10, -14 -10, -12 -2 C -10 2, -4 2, 0 0 Z M0 0 C -6 10, -14 10, -12 2 C -10 -2, -4 -2, 0 0 Z' }, em);
  el('line', { x1: 0, y1: -7, x2: 0, y2: 7 }, em);
  song.forEach((f, i) => {
    const s = staffStep(f);
    const x = left + i * step + step / 2;
    const y = bottom - s * (gap / 2);
    const g = el('g', { class: `note${i < collected ? ' got' : ''}${i === popIndex ? ' pop' : ''}` }, svg);
    // líneas adicionales
    for (let ls = -2; ls >= s; ls -= 2) el('line', { class: 'ledger', x1: x - 9, x2: x + 9, y1: bottom - ls * (gap / 2), y2: bottom - ls * (gap / 2) }, svg);
    for (let ls = 10; ls <= s; ls += 2) el('line', { class: 'ledger', x1: x - 9, x2: x + 9, y1: bottom - ls * (gap / 2), y2: bottom - ls * (gap / 2) }, svg);
    const up = s < 4;
    el('line', { class: 'stem', x1: up ? x + 5 : x - 5, x2: up ? x + 5 : x - 5, y1: y, y2: up ? y - 26 : y + 26 }, g);
    el('ellipse', { class: 'head', cx: x, cy: y, rx: 5.4, ry: 3.9, transform: `rotate(-20 ${x} ${y})` }, g);
  });
  container.replaceChildren(svg);
  return svg;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export function toRoman(n) {
  return ROMAN[n - 1] ?? String(n);
}

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Muestra una línea de texto palabra a palabra. Devuelve la duración aproximada. */
export function typeLine(node, text, onWord) {
  node.replaceChildren();
  const words = text.split(' ');
  words.forEach((w, i) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = i < words.length - 1 ? `${w} ` : w;
    span.style.animationDelay = `${i * 0.07}s`;
    node.appendChild(span);
    if (onWord) setTimeout(() => onWord(i), i * 70);
  });
  return words.length * 0.07 + 0.9;
}

export class Toasts {
  constructor(root) {
    this.root = root;
  }

  show(text, kind = '', duration = 4200) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.root.appendChild(t);
    while (this.root.children.length > 3) this.root.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 900);
    }, duration);
  }

  clear() {
    this.root.replaceChildren();
  }
}

/** Retrato animado para el bestiario. */
export function drawCodexPortrait(canvas, kind, t, echo = [120, 230, 255]) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 220;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = w / 2;
  const cy = h / 2;
  // anillos de sonar de fondo
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.35 + i / 3) % 1);
    ctx.strokeStyle = `rgba(${echo.join(',')},${0.22 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 20 + k * Math.max(w, h) * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  switch (kind) {
    case 'Eco':
      ctx.scale(150, 150);
      ctx.rotate(-Math.PI / 2);
      drawBat(ctx, { flap: t * 5, glide: 0.5 + 0.5 * Math.sin(t * 0.6), mode: 'portrait', rim: echo, charge: Math.max(0, Math.sin(t * 1.3)), lineWidth: 0.008 });
      break;
    case 'Polillas de luz':
      ctx.scale(260, 260);
      ctx.rotate(-Math.PI / 2 + Math.sin(t) * 0.2);
      drawMoth(ctx, { t, glow: 0.5 + 0.5 * Math.sin(t * 2), phase: 0 });
      break;
    case 'Oyentes': {
      // del hocico (+0,55) a la punta de la cola (-1,0): se centra y se ajusta al alto del retrato
      const s = Math.min(150, (h * 0.86) / 1.55);
      ctx.translate(0, -0.225 * s);
      ctx.scale(s, s);
      ctx.rotate(-Math.PI / 2);
      const states = ['wander', 'listen', 'hunt'];
      const state = states[Math.floor(t / 3) % 3];
      drawOyente(ctx, { mode: 'portrait', step: t * 4, t, state, lineWidth: 0.01 });
      break;
    }
    case 'Cristales resonantes': {
      const ring = Math.max(0, 1 - ((t % 2.5) / 1.4));
      ctx.scale(150, 150);
      drawCrystal(ctx, { id: 2, ring, t });
      break;
    }
    case 'La grieta':
      ctx.scale(80, 80);
      drawRift(ctx, { t, open: 0.5 + 0.5 * Math.sin(t * 0.5) ** 2 });
      break;
    default: break;
  }
  ctx.restore();
}
