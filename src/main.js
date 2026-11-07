// Eco · pegamento: estados de pantalla, bucle principal, historia y progreso.

import { createGame, update } from './game.js';
import { stepDownField, distanceField } from './geometry.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, resetProgress } from './save.js';
import { PROLOGUE, EPILOGUE, CHAPTERS, DEATH_LINES, CODEX, chapterFor } from './story.js';
import { renderStaff, toRoman, formatTime, typeLine, Toasts, drawCodexPortrait } from './ui.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const save = loadSave();
const settings = save.settings;
const params = new URLSearchParams(location.search);
const canvas = $('#world');
const renderer = new Renderer(canvas, settings);
const audio = new AudioEngine(settings);
const input = new Input();
input.attach();
const toasts = new Toasts($('#toasts'));
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch-mode', isTouch);

const app = {
  screen: 'title',
  stack: [],
  game: null,
  pendingGame: null,
  demo: null,
  demoAI: { target: null, field: null, timer: 0, nextPulse: 1, charge: 0, hold: 0 },
  story: null,
  chapterIndex: save.current ?? 0,
  tips: new Set(),
  endTimer: 0,
  noiseHistory: new Array(60).fill(0),
  playTime: 0,
};

// ───────────────────────── pantallas ─────────────────────────

const PANELS = new Set(['chapters', 'bestiary', 'howto', 'settings', 'credits']);

function show(name) {
  app.screen = name;
  for (const s of $$('.screen')) s.classList.toggle('active', s.dataset.screen === name);
  const playing = name === 'play';
  $('#hud').classList.toggle('off', !(playing || name === 'pause' || name === 'death' || name === 'complete'));
  $('#hud').classList.toggle('dim', !playing);
  $('#touch').hidden = !(playing && isTouch);
  input.enabled = playing;
  if (playing) input.reset();
  audio.duck(!playing && !!app.game && name !== 'death');
  const first = $(`.screen[data-screen="${name}"] .menu button:not([hidden]), .screen[data-screen="${name}"] .primary`);
  if (first && !isTouch && name !== 'title') setTimeout(() => first.focus(), 50);
  if (name === 'bestiary') buildCodex();
  if (name === 'chapters') buildChapterGrid();
  if (name === 'settings') syncSettingsForm();
}

function openPanel(name) {
  app.stack.push(app.screen);
  show(name);
  audio.ui('select');
}

function back() {
  const prev = app.stack.pop() || 'title';
  show(prev);
  audio.ui('back');
  if (prev === 'pause') drawPauseMap();
}

function fadeThen(fn, ms = 650) {
  if (app.transitioning) return;
  app.transitioning = true;
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => {
    try { fn(); } finally {
      app.transitioning = false;
      requestAnimationFrame(() => f.classList.remove('on'));
    }
  }, ms);
}

function toggleFullscreen() {
  if (typeof window.ecoToggleFullscreen === 'function') { window.ecoToggleFullscreen(); return; }
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
}

function setPalette(pal) {
  const root = document.documentElement.style;
  root.setProperty('--echo', pal.echo.join(', '));
  root.setProperty('--accent', pal.accent.join(', '));
}

// ───────────────────────── portada y demo ─────────────────────────

function makeDemo() {
  const g = createGame(20261107, 1);
  app.demo = g;
  app.demoAI = { target: null, field: null, timer: 0, nextPulse: 0.8, charge: 0, hold: 0 };
  if (!app.game || app.screen === 'title') renderer.prepare(g);
}

function demoInput(g, dt) {
  const ai = app.demoAI;
  const p = g.player;
  ai.timer -= dt;
  if (!ai.field || ai.timer <= 0) {
    const r = g.rng;
    let tx = p.x;
    let ty = p.y;
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(r() * g.cave.width);
      const y = Math.floor(r() * g.cave.height);
      if (!g.cave.grid[y * g.cave.width + x] && Math.hypot(x - p.x, y - p.y) < 16 && Math.hypot(x - p.x, y - p.y) > 6) { tx = x + 0.5; ty = y + 0.5; break; }
    }
    ai.target = { x: tx, y: ty };
    ai.field = distanceField(g.cave, tx, ty, 80);
    ai.timer = 7;
  }
  let ax = 0;
  let ay = 0;
  const nxt = stepDownField(g.cave, ai.field, p.x, p.y);
  if (nxt && nxt.d > 0) {
    ax = nxt.x - p.x;
    ay = nxt.y - p.y;
    const m = Math.hypot(ax, ay) || 1;
    ax /= m;
    ay /= m;
  } else ai.timer = 0;
  ai.nextPulse -= dt;
  let pulse = false;
  if (ai.nextPulse <= 0) {
    if (ai.hold === 0) ai.hold = 0.1 + Math.random() * 0.9;
    pulse = true;
    ai.charge += dt;
    if (ai.charge >= ai.hold) { ai.charge = 0; ai.hold = 0; ai.nextPulse = 1.8 + Math.random() * 1.6; pulse = false; }
  }
  return { ax, ay, pulse, quiet: true };
}

function goTitle() {
  app.game = null;
  audio.stopAmbient();
  audio.muffle(false);
  toasts.clear();
  setPalette(chapterFor(1).palette);
  makeDemo();
  refreshTitleMenu();
  show('title');
  if (audio.ready) audio.startTitleMusic(CHAPTERS.map((c) => c.song));
}

function refreshTitleMenu() {
  const cont = $('[data-action="continue"]');
  const hasProgress = save.seed !== null;
  cont.hidden = !hasProgress;
  if (hasProgress) {
    const cur = save.current ?? 0;
    $('#continue-label').textContent = cur >= CHAPTERS.length ? 'Hondura sin fondo' : `Capítulo ${toRoman(cur + 1)}`;
  }
  $('[data-action="exit"]').hidden = typeof window.ecoQuit !== 'function';
}

// ───────────────────────── narración ─────────────────────────

function startStory(lines, onDone) {
  app.story = { lines, i: 0, onDone, ready: false };
  show('story');
  const prog = $('#story-progress');
  prog.replaceChildren(...lines.map(() => document.createElement('i')));
  nextStoryLine(true);
}

function nextStoryLine(first = false) {
  const st = app.story;
  if (!st) return;
  if (!first) st.i++;
  if (st.i >= st.lines.length) { endStory(); return; }
  const line = $('#story-line');
  const dur = typeLine(line, st.lines[st.i], () => audio.ui('type'));
  $$('#story-progress i').forEach((n, k) => n.classList.toggle('on', k <= st.i));
  const ring = $('.story-ring');
  ring.classList.remove('go');
  void ring.offsetWidth;
  ring.classList.add('go');
  if (audio.ready) audio.bell([293.66, 349.23, 440, 392, 523.25, 587.33][st.i % 6], audio.ctx.currentTime + 0.02, 0.06, 3, 0, 0.8, audio.music);
  st.ready = false;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => { st.ready = true; }, Math.min(dur, 1.2) * 1000);
}

function endStory() {
  const st = app.story;
  app.story = null;
  if (st) { clearTimeout(st.timer); st.onDone(); }
}

// ───────────────────────── capítulos ─────────────────────────

function ensureSeed() {
  if (save.seed === null) {
    save.seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    writeSave(save);
  }
}

function showChapterCard(index) {
  ensureSeed();
  app.chapterIndex = index;
  save.current = index;
  writeSave(save);
  const ch = chapterFor(index);
  setPalette(ch.palette);
  $('#cc-num').textContent = ch.endless ? 'Más allá de la historia' : `Capítulo ${toRoman(index + 1)}`;
  $('#cc-name').textContent = ch.name;
  $('#cc-sub').textContent = ch.subtitle;
  $('#cc-text').replaceChildren(...ch.text.map((t) => { const p = document.createElement('p'); p.textContent = t; return p; }));
  renderStaff($('#cc-staff'), ch.song.slice(0, ch.params.moths), 0, -1, 1.1);
  app.pendingGame = createGame(save.seed, index);
  show('chapter');
}

function startChapter() {
  const g = app.pendingGame || createGame(save.seed, app.chapterIndex);
  app.pendingGame = null;
  app.game = g;
  app.tips.clear();
  app.endTimer = 0;
  renderer.prepare(g);
  audio.stopTitleMusic();
  audio.muffle(false);
  audio.startAmbient(g.chapter);
  setPalette(g.chapter.palette);
  $('#hud-num').textContent = g.chapter.endless ? '∞' : toRoman(g.chapterIndex + 1);
  $('#hud-name').textContent = g.chapter.name;
  updateHudStaff(-1);
  const keys = $('#hud-keys');
  keys.classList.remove('faded');
  clearTimeout(app.keysTimer);
  app.keysTimer = setTimeout(() => keys.classList.add('faded'), g.chapterIndex === 0 ? 30000 : 9000);
  toasts.clear();
  show('play');
  if (g.chapterIndex === 0) {
    setTimeout(() => tip('first', isTouch ? 'Mantén «Grito» y suelta: tu grito dibuja la cueva.' : 'Mantén Espacio y suelta: tu grito dibuja la cueva.'), 1200);
  } else {
    setTimeout(() => toasts.show(`${g.chapter.name}`, 'gold', 3000), 600);
  }
}

function songOf(g) {
  return g.chapter.song.slice(0, g.needed);
}

function updateHudStaff(pop) {
  const g = app.game;
  if (!g) return;
  renderStaff($('#hud-staff'), songOf(g), g.collected, pop, 0.9);
}

function tip(id, text, kind = '') {
  if (app.tips.has(id)) return;
  app.tips.add(id);
  toasts.show(text, kind, 5200);
}

function handleGameEvents(g, events) {
  for (const e of events) {
    switch (e.type) {
      case 'pulse':
        if (e.source === 'player' && g.chapterIndex === 0 && g.stats.pulses === 1) setTimeout(() => tip('moths', 'Las polillas de luz parpadean a lo lejos. Cada una guarda una nota de la canción.', 'gold'), 2500);
        if (e.source === 'player' && e.power > 0.85 && g.chapterIndex === 0) tip('loud', 'Un grito largo llega lejos… y se oye lejos.');
        break;
      case 'moth': {
        updateHudStaff(e.index);
        const left = g.needed - g.collected;
        toasts.show(left > 0 ? `Nota recuperada · faltan ${left}` : 'La canción del capítulo está completa', 'gold', 3200);
        break;
      }
      case 'exitOpen':
        setTimeout(() => toasts.show('La grieta se ha abierto. Sigue el viento.', '', 5000), 1600);
        break;
      case 'crystal':
        tip('crystal', 'El cristal repite tu grito desde allí. Los Oyentes irán a buscarlo.');
        break;
      case 'alert':
        if (e.source === 'player') tip('alert', 'Un Oyente te oyó. Irá hacia donde gritaste, no hacia donde estás.', 'danger');
        break;
      case 'hunt':
        tip('hunt', isTouch ? '¡Te persigue! Aléjate rápido y luego mantén «Planear».' : '¡Te persigue! Aléjate rápido y luego planea con Mayús.', 'danger');
        break;
      case 'death':
        app.endTimer = 1.5;
        break;
      case 'win':
        app.endTimer = 1.3;
        break;
      default: break;
    }
  }
}

function statsHTML(g) {
  const rows = [
    ['Tiempo', formatTime(g.stats.time)],
    ['Gritos', String(g.stats.pulses)],
    ['Notas', `${g.collected} / ${g.needed}`],
  ];
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function onDeath(g) {
  $('#death-line').textContent = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)];
  $('#death-stats').innerHTML = statsHTML(g);
  show('death');
}

function onComplete(g) {
  const i = g.chapterIndex;
  save.unlocked = Math.max(save.unlocked, i + 1);
  const prev = save.best[i];
  if (!prev || g.stats.time < prev.time) save.best[i] = { time: g.stats.time, pulses: g.stats.pulses };
  save.current = i + 1;
  writeSave(save);
  $('#complete-name').textContent = g.chapter.name;
  renderStaff($('#complete-staff'), songOf(g), g.needed, -1, 1.35);
  $('#complete-stats').innerHTML = statsHTML(g) + (prev && g.stats.time < prev.time ? '<div><dt>Récord</dt><dd>¡nuevo!</dd></div>' : '');
  show('complete');
  audio.stopAmbient();
  setTimeout(() => audio.phrase(songOf(g), 0.38, 0.3), 300);
}

function nextChapter() {
  const i = app.chapterIndex + 1;
  if (i === CHAPTERS.length && !save.finished) {
    save.finished = true;
    writeSave(save);
    fadeThen(() => {
      app.game = null;
      startStory(EPILOGUE, () => { save.current = CHAPTERS.length; writeSave(save); goTitle(); });
      if (audio.ready) audio.startTitleMusic(CHAPTERS.map((c) => c.song));
    });
    return;
  }
  fadeThen(() => { app.game = null; makeDemo(); showChapterCard(i); });
}

function retry() {
  audio.muffle(false);
  fadeThen(() => {
    app.pendingGame = createGame(save.seed, app.chapterIndex);
    startChapter();
  }, 450);
}

function pause() {
  if (app.screen !== 'play' || !app.game || app.game.status !== 'playing') return;
  show('pause');
  audio.ui('back');
  const g = app.game;
  $('#pause-chapter').textContent = g.chapter.name;
  $('#pause-stats').innerHTML = `${statsHTML(g)}<div><dt>Semilla</dt><dd>${save.seed}</dd></div>`;
  drawPauseMap();
}

function drawPauseMap() {
  if (app.game) renderer.drawMap($('#map-canvas'), app.game);
}

function resume() {
  if (!app.game) return;
  show('play');
  audio.ui('select');
}

// ───────────────────────── paneles ─────────────────────────

let codexTimer = null;
function buildCodex() {
  const root = $('#codex');
  if (!root.children.length) {
    for (const c of CODEX) {
      const card = document.createElement('article');
      card.className = 'codex-card';
      card.innerHTML = '<canvas></canvas><div class="body"><h3></h3><p></p></div>';
      card.querySelector('h3').textContent = c.title;
      card.querySelector('p').textContent = c.body;
      card.dataset.kind = c.title;
      root.appendChild(card);
    }
  }
  cancelAnimationFrame(codexTimer);
  const t0 = performance.now();
  const loop = () => {
    if (app.screen !== 'bestiary') return;
    const t = (performance.now() - t0) / 1000;
    const echo = getComputedStyle(document.documentElement).getPropertyValue('--echo').split(',').map(Number);
    for (const card of root.children) drawCodexPortrait(card.querySelector('canvas'), card.dataset.kind, t, echo);
    codexTimer = requestAnimationFrame(loop);
  };
  loop();
}

function buildChapterGrid() {
  const root = $('#chapter-grid');
  root.replaceChildren();
  const total = CHAPTERS.length + (save.finished ? 1 : 0);
  for (let i = 0; i < total; i++) {
    const ch = chapterFor(i);
    const locked = i > save.unlocked;
    const b = document.createElement('button');
    b.className = `chap${locked ? ' locked' : ''}`;
    b.style.setProperty('--c', ch.palette.echo.join(', '));
    const best = save.best[i];
    b.innerHTML = `<span class="wave"></span><span class="n"></span><span class="t"></span><span class="s"></span><span class="best"></span>`;
    b.querySelector('.n').textContent = ch.endless ? 'Sin fondo' : `Capítulo ${toRoman(i + 1)}`;
    b.querySelector('.t').textContent = ch.endless ? 'Hondura sin fondo' : ch.name;
    b.querySelector('.s').textContent = ch.subtitle;
    b.querySelector('.best').textContent = best ? `Mejor tiempo ${formatTime(best.time)} · ${best.pulses} gritos` : locked ? '' : 'Sin completar';
    if (!locked) {
      b.addEventListener('click', () => {
        audio.ui('select');
        app.stack = [];
        fadeThen(() => { app.game = null; showChapterCard(i); });
      });
    } else b.disabled = true;
    root.appendChild(b);
  }
}

function syncSettingsForm() {
  const f = $('#settings-form');
  for (const [k, v] of Object.entries(settings)) {
    const inp = f.elements[k];
    if (!inp) continue;
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = v;
  }
}

$('#settings-form').addEventListener('input', (e) => {
  const inp = e.target;
  if (!inp.name) return;
  settings[inp.name] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
  writeSave(save);
  audio.applyVolumes();
  if (inp.name === 'glow' || inp.name === 'grain') renderer.resize();
});

// ───────────────────────── acciones ─────────────────────────

let resetArmed = false;
const actions = {
  new: () => {
    save.seed = null;
    save.current = 0;
    ensureSeed();
    fadeThen(() => startStory(PROLOGUE, () => showChapterCard(0)));
  },
  continue: () => fadeThen(() => showChapterCard(Math.min(save.current ?? 0, save.finished ? CHAPTERS.length : CHAPTERS.length - 1))),
  chapters: () => openPanel('chapters'),
  bestiary: () => openPanel('bestiary'),
  howto: () => openPanel('howto'),
  settings: () => openPanel('settings'),
  credits: () => openPanel('credits'),
  back,
  'skip-story': () => endStory(),
  descend: () => fadeThen(startChapter, 500),
  pause,
  resume,
  restart: () => retry(),
  retry: () => retry(),
  next: () => nextChapter(),
  quit: () => fadeThen(goTitle),
  fullscreen: () => toggleFullscreen(),
  exit: () => { if (typeof window.ecoQuit === 'function') window.ecoQuit(); },
  'reset-progress': (btn) => {
    if (!resetArmed) {
      resetArmed = true;
      btn.textContent = '¿Seguro? Pulsa otra vez para borrar';
      setTimeout(() => { resetArmed = false; btn.textContent = 'Borrar progreso'; }, 4000);
      return;
    }
    resetArmed = false;
    resetProgress(save);
    btn.textContent = 'Progreso borrado';
    refreshTitleMenu();
  },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = actions[btn.dataset.action];
  if (fn) { if (!['back', 'pause', 'resume'].includes(btn.dataset.action)) audio.ui('select'); fn(btn); }
});

let hovered = null;
document.addEventListener('pointerover', (e) => {
  const el = e.target instanceof Element ? e.target.closest('.menu button, .primary, .chap:not(.locked), .back') : null;
  if (el === hovered) return; // moverse entre partes del mismo botón no repite el sonido
  hovered = el;
  if (!el) return;
  audio.ui('hover');
  // Pasar el ratón por un menú mueve el foco: así nunca hay dos opciones resaltadas a la vez.
  if (e.pointerType === 'mouse' && el.matches('.menu button') && document.activeElement !== el) el.focus({ preventScroll: true });
});

// El audio solo puede arrancar tras un gesto del usuario.
function unlockAudio() {
  if (audio.ready) { audio.resume(); return; }
  audio.init();
  if (app.screen === 'title' || app.screen === 'story') audio.startTitleMusic(CHAPTERS.map((c) => c.song));
  if (app.game && app.screen === 'play') audio.startAmbient(app.game.chapter);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

window.addEventListener('keydown', (e) => {
  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
  const s = app.screen;
  const key = e.code;
  const confirm = key === 'Space' || key === 'Enter' || key === 'NumpadEnter';
  if (s === 'story') {
    if (confirm) { e.preventDefault(); if (app.story?.ready) nextStoryLine(); }
    else if (key === 'Escape') endStory();
  } else if (s === 'chapter') {
    if (confirm) { e.preventDefault(); actions.descend(); }
    else if (key === 'Escape') actions.quit();
  } else if (s === 'play') {
    if (key === 'Escape' || key === 'KeyP' || key === 'KeyM' || key === 'Tab') { e.preventDefault(); pause(); }
  } else if (s === 'pause') {
    if (key === 'Escape' || key === 'KeyP' || key === 'KeyM' || key === 'Tab') { e.preventDefault(); resume(); }
  } else if (s === 'death') {
    if (confirm || key === 'KeyR') { e.preventDefault(); actions.retry(); }
  } else if (s === 'complete') {
    if (confirm) { e.preventDefault(); actions.next(); }
  } else if (PANELS.has(s)) {
    if (key === 'Escape' || key === 'Backspace') { e.preventDefault(); back(); }
  }
  // navegación con flechas en menús
  if (s !== 'play' && (key === 'ArrowDown' || key === 'ArrowUp')) {
    const items = $$(`.screen[data-screen="${s}"] .menu button:not([hidden]), .screen[data-screen="${s}"] .chap:not(.locked), .screen[data-screen="${s}"] .back`);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const n = key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[n].focus();
    audio.ui('hover');
  }
});

$('#screen-story').addEventListener('click', (e) => {
  if (e.target.closest('[data-action]')) return;
  if (app.story?.ready) nextStoryLine();
});

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && app.screen === 'play') pause(); });

// ───────────────────────── HUD: medidor de ruido ─────────────────────────

function drawNoise(g) {
  const c = $('#noise-meter');
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  app.noiseHistory.push(Math.min(1, g.noise / 7));
  app.noiseHistory.shift();
  ctx.clearRect(0, 0, W, H);
  const echo = g.chapter.palette.echo;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${echo.join(',')},0.9)`;
  ctx.beginPath();
  const n = app.noiseHistory.length;
  for (let i = 0; i < W; i += 2) {
    const k = app.noiseHistory[Math.floor((i / W) * n)];
    const y = H / 2 + Math.sin(i * 0.35 + g.time * 18) * k * (H / 2 - 3) * (0.4 + 0.6 * (i / W));
    if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
  }
  ctx.stroke();
  const mode = $('#noise-mode');
  const label = g.player.quiet ? 'Planeo' : 'Aleteo';
  if (mode.textContent !== label) mode.textContent = label;
  mode.classList.toggle('quiet', g.player.quiet);
}

// ───────────────────────── bucle principal ─────────────────────────

let last = performance.now();
let frameErrors = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try {
    tick(now);
  } catch (err) {
    // Un fallo puntual no debe congelar el juego: se registra y el bucle sigue.
    if (frameErrors++ < 5) console.error(err);
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const s = app.screen;

  if (app.game && (s === 'play' || s === 'death' || s === 'complete' || s === 'pause')) {
    const g = app.game;
    if (s === 'play' || (s !== 'pause' && g.status !== 'playing')) {
      const inp = s === 'play' ? input.sample() : { ax: 0, ay: 0, pulse: false, quiet: false };
      if (s === 'play' && input.gamepadPause) pause();
      const events = update(g, inp, dt);
      renderer.onEvents(events);
      audio.handleEvents(events, g);
      handleGameEvents(g, events);
      audio.update(g, dt);
      if (app.endTimer > 0) {
        app.endTimer -= dt;
        if (app.endTimer <= 0) {
          if (g.status === 'dead') onDeath(g);
          else if (g.status === 'won') onComplete(g);
        }
      }
      drawNoise(g);
    }
    if (s === 'pause' && Math.floor(now / 100) % 2 === 0) drawPauseMap();
    renderer.render(g, s === 'pause' ? 0 : dt);
  } else if (app.demo) {
    const g = app.demo;
    if (renderer.game !== g) renderer.prepare(g);
    const events = update(g, demoInput(g, dt), dt);
    if (g.status !== 'playing') g.status = 'playing';
    renderer.onEvents(events.filter((e) => e.type === 'pulse' || e.type === 'crystal'));
    const off = window.innerWidth > 760 ? -(window.innerWidth * 0.2) / renderer.tile : 0;
    renderer.render(g, dt, { cameraOffset: { x: off, y: 0 }, danger: 0 });
  }
}

// ───────────────────────── arranque ─────────────────────────

goTitle();
requestAnimationFrame(frame);

// Atajos de depuración para pruebas automáticas
window.__eco = { app, save, actions, renderer, audio, input, startChapter, showChapterCard, nav: { distanceField, stepDownField } };
