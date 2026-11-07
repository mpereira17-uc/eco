// Motor de audio 100 % sintetizado con WebAudio: nada de archivos de sonido.
// El grito de Eco se oye con sus ecos espacializados: cada pared devuelve un
// "clic" con el retardo y el paneo que le corresponden.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // reflexiones tempranas dispersas y cola difusa
      const early = i < rate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
      d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay)) * 0.6 + early;
    }
  }
  return buf;
}

export class AudioEngine {
  constructor(settings = {}) {
    this.settings = settings;
    this.ctx = null;
    this.creatureVoices = new Map();
    this.nextDrip = 0;
    this.nextBeat = 0;
    this.lastFlap = 0;
    this.titleTimer = null;
  }

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.out.connect(this.lowpass).connect(this.comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 3.4, 2.6);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.out);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.out);
    this.amb = ctx.createGain();
    this.amb.connect(this.out);
    this.music = ctx.createGain();
    this.music.connect(this.out);

    const nlen = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    this.applyVolumes();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime((s.volume ?? 0.8) * 0.9, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambient ?? 0.7, t, 0.05);
    this.music.gain.setTargetAtTime((s.ambient ?? 0.7) * 0.9, t, 0.05);
  }

  // ─── utilidades ───
  send(node, wet = 0.3, dest = this.sfx) {
    node.connect(dest);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.reverb);
    }
  }

  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  panner(pan) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  // ─── el grito y sus ecos ───
  pulse(e) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const power = e.power;
    const dur = 0.05 + power * 0.16;
    const f0 = 4200 - power * 1700;
    const f1 = 1500 - power * 900;
    const src = e.source === 'crystal';
    const distToPlayer = Math.hypot(e.dx || 0, e.dy || 0);
    const att = src ? clamp(1 - distToPlayer / 26, 0.05, 1) : 1;
    const pan = src ? clamp((e.dx || 0) / 10, -1, 1) : 0;

    const chirp = (start, freq0, freq1, length, peak, panV, cutoff, wet) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq0, start);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), start + length);
      const h = ctx.createOscillator();
      h.type = 'triangle';
      h.frequency.setValueAtTime(freq0 * 1.5, start);
      h.frequency.exponentialRampToValueAtTime(Math.max(60, freq1 * 1.5), start + length);
      const hg = ctx.createGain();
      hg.gain.value = 0.18;
      const g = ctx.createGain();
      this.env(g, start, 0.004, peak, length + 0.05);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      const p = this.panner(panV);
      o.connect(g);
      h.connect(hg).connect(g);
      g.connect(lp).connect(p);
      this.send(p, wet);
      o.start(start);
      h.start(start);
      o.stop(start + length + 0.1);
      h.stop(start + length + 0.1);
    };

    if (src) {
      // el cristal canta: campana metálica FM
      const o = ctx.createOscillator();
      const m = ctx.createOscillator();
      const mg = ctx.createGain();
      const base = 1300 + Math.random() * 500;
      o.frequency.value = base;
      m.frequency.value = base * 3.51;
      mg.gain.setValueAtTime(base * 1.2, t);
      mg.gain.exponentialRampToValueAtTime(1, t + 1.4);
      m.connect(mg).connect(o.frequency);
      const g = ctx.createGain();
      this.env(g, t, 0.003, 0.22 * att, 1.6);
      const p = this.panner(pan);
      o.connect(g).connect(p);
      this.send(p, 0.6);
      o.start(t);
      m.start(t);
      o.stop(t + 1.8);
      m.stop(t + 1.8);
      return;
    }

    chirp(t, f0, f1, dur, 0.32 * (0.55 + power * 0.45), 0, 9000, 0.12 + 0.25 * e.openness);
    // ecos espacializados por sector
    for (const s of e.sectors || []) {
      if (s.hit < 0.25) continue;
      const delay = 0.035 + s.dist * 0.03;
      const vol = 0.13 * (1 - s.dist / (e.range + 1)) * (0.5 + power * 0.5) * (0.4 + s.hit * 0.6);
      if (vol < 0.006) continue;
      chirp(t + delay, f0 * 0.92, f1 * 0.92, dur * 0.8, vol, Math.cos(s.angle) * 0.9, 6500 - s.dist * 220, 0.2);
    }
  }

  bell(freq, t, peak = 0.22, len = 2.6, pan = 0, wet = 0.55, dest = this.sfx) {
    const ctx = this.ctx;
    const p = this.panner(pan);
    const parts = [[1, 1], [2.0, 0.45], [3.01, 0.25], [4.2, 0.12], [5.43, 0.06]];
    for (const [ratio, amp] of parts) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      this.env(g, t, 0.006, peak * amp, len / (ratio * 0.6 + 0.4));
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + len + 0.2);
    }
    this.send(p, wet, dest);
  }

  pad(freqs, t, len, peak = 0.06, dest = this.music) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(2200, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(400, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + len * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g);
    this.send(g, 0.5, dest);
    for (const f of freqs) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 0.1);
      }
    }
  }

  phrase(freqs, gap = 0.34, start = 0.05) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + start;
    freqs.forEach((f, i) => this.bell(f, t + i * gap, 0.2, 2.8, (i % 2 ? 0.25 : -0.25)));
  }

  thud(t, power = 1, pan = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.35 * power, 0.22);
    const n = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const ng = ctx.createGain();
    this.env(ng, t, 0.002, 0.2 * power, 0.12);
    const p = this.panner(pan);
    o.connect(g).connect(p);
    n.connect(lp).connect(ng).connect(p);
    this.send(p, 0.25);
    o.start(t);
    o.stop(t + 0.3);
    n.start(t);
    n.stop(t + 0.2);
  }

  screech(t, vol, pan) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1100, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.55);
    const vib = ctx.createOscillator();
    vib.frequency.value = 23;
    const vg = ctx.createGain();
    vg.gain.value = 60;
    vib.connect(vg).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    this.env(g, t, 0.02, vol, 0.6);
    const p = this.panner(pan);
    o.connect(bp).connect(g).connect(p);
    this.send(p, 0.5);
    o.start(t);
    vib.start(t);
    o.stop(t + 0.75);
    vib.stop(t + 0.75);
  }

  growl(t, vol, pan) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.5);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 4); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    this.env(g, t, 0.06, vol, 0.7);
    const p = this.panner(pan);
    o.connect(shaper).connect(lp).connect(g).connect(p);
    this.send(p, 0.35);
    o.start(t);
    o.stop(t + 0.9);
  }

  wingbeat(t, vol) {
    const ctx = this.ctx;
    const n = this.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    this.env(g, t, 0.02, vol, 0.08);
    n.connect(lp).connect(g);
    this.send(g, 0.05);
    n.start(t);
    n.stop(t + 0.14);
  }

  drip(t, pan) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.05 + Math.random() * 0.05, 0.09);
    const p = this.panner(pan);
    o.connect(g).connect(p);
    this.send(p, 0.85, this.amb);
    o.start(t);
    o.stop(t + 0.15);
  }

  heartbeat(t, vol) {
    for (const [dt, v] of [[0, 1], [0.16, 0.7]]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(62, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      const g = this.ctx.createGain();
      this.env(g, t + dt, 0.008, vol * v, 0.16);
      o.connect(g);
      this.send(g, 0, this.amb);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }

  ui(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.003;
    if (kind === 'hover') {
      const o = this.ctx.createOscillator();
      o.frequency.value = 2300;
      const g = this.ctx.createGain();
      this.env(g, t, 0.002, 0.025, 0.03);
      o.connect(g);
      this.send(g, 0.2);
      o.start(t);
      o.stop(t + 0.06);
    } else if (kind === 'select') {
      this.bell(880, t, 0.08, 0.9, -0.2, 0.4);
      this.bell(1318.5, t + 0.07, 0.07, 1.0, 0.2, 0.4);
    } else if (kind === 'back') {
      this.bell(659.25, t, 0.07, 0.8, 0, 0.4);
    } else if (kind === 'type') {
      const o = this.ctx.createOscillator();
      o.frequency.value = 1600 + Math.random() * 300;
      const g = this.ctx.createGain();
      this.env(g, t, 0.001, 0.012, 0.02);
      o.connect(g);
      this.send(g, 0.3);
      o.start(t);
      o.stop(t + 0.04);
    }
  }

  // ─── ambiente por capítulo ───
  startAmbient(chapter) {
    if (!this.ctx) return;
    this.stopAmbient();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const root = (chapter.song?.[0] ?? 293.66) / 4;
    const nodes = [];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(1, t + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.connect(bus);
    bus.connect(this.amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    nodes.push(lfo);
    for (const [f, a] of [[root, 0.05], [root * 1.5, 0.03], [root * 2.003, 0.02]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(lp);
      o.start();
      nodes.push(o);
    }
    // aire de la cueva
    const n = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.018;
    n.connect(bp).connect(ng).connect(bus);
    n.start();
    nodes.push(n);
    this.ambient = { nodes, bus };
  }

  stopAmbient() {
    if (!this.ambient || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { nodes, bus } = this.ambient;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    for (const n of nodes) { try { n.stop(t + 1.3); } catch { /* ya parado */ } }
    this.ambient = null;
    for (const v of this.creatureVoices.values()) this.killVoice(v);
    this.creatureVoices.clear();
    if (this.wind) { this.killVoice(this.wind); this.wind = null; }
  }

  killVoice(v) {
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 0.2);
    try { v.src.stop(t + 1); } catch { /* ya parado */ }
  }

  makeVoice(freq, q) {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(bp).connect(gain).connect(pan);
    this.send(pan, 0.3, this.amb);
    src.start();
    return { src, bp, gain, pan };
  }

  // Baja el ambiente (respiraciones, viento, latido) mientras hay un menú encima del juego.
  duck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = this.settings.ambient ?? 0.7;
    this.amb.gain.cancelScheduledValues(t);
    this.amb.gain.setTargetAtTime(on ? base * 0.2 : base, t, 0.15);
  }

  // Duck general al morir y vuelta a la normalidad
  muffle(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.lowpass.frequency.cancelScheduledValues(t);
    this.lowpass.frequency.setValueAtTime(this.lowpass.frequency.value, t);
    this.lowpass.frequency.exponentialRampToValueAtTime(on ? 380 : 20000, t + (on ? 1.4 : 0.6));
  }

  handleEvents(events, g) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const p = g.player;
    const rel = (x, y) => {
      const dx = x - p.x;
      const dy = y - p.y;
      return { d: Math.hypot(dx, dy), pan: clamp(dx / 9, -1, 1) };
    };
    for (const e of events) {
      switch (e.type) {
        case 'pulse': this.pulse(e); break;
        case 'moth': {
          const song = g.chapter.song;
          const f = song[e.index % song.length];
          this.bell(f, t, 0.24, 3.2, 0, 0.6);
          this.bell(f * 2, t + 0.02, 0.05, 1.5, 0, 0.6);
          break;
        }
        case 'exitOpen':
          this.phrase(g.chapter.song, 0.26, 0.4);
          this.pad([g.chapter.song[0] / 2, g.chapter.song[0] * 0.75, g.chapter.song[0]], t + 0.2, 5, 0.05, this.sfx);
          break;
        case 'alert': {
          const r = rel(e.x, e.y);
          const vol = 0.16 * clamp(1 - r.d / 30, 0.05, 1);
          this.screech(t + 0.05 + Math.random() * 0.15, vol, r.pan);
          break;
        }
        case 'hunt': {
          const r = rel(e.x, e.y);
          this.growl(t, 0.22 * clamp(1 - r.d / 14, 0.15, 1), r.pan);
          break;
        }
        case 'bump': this.thud(t, clamp(e.power / 5, 0.3, 1)); break;
        case 'death': {
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(520, t);
          o.frequency.exponentialRampToValueAtTime(40, t + 1.6);
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          const gg = this.ctx.createGain();
          this.env(gg, t, 0.01, 0.25, 1.7);
          o.connect(lp).connect(gg);
          this.send(gg, 0.6);
          o.start(t);
          o.stop(t + 1.9);
          this.thud(t, 1);
          this.muffle(true);
          break;
        }
        case 'win': {
          const song = g.chapter.song;
          song.forEach((f, i) => this.bell(f * 2, t + i * 0.11, 0.1, 2.2, (i % 2 ? 0.4 : -0.4), 0.7));
          break;
        }
        default: break;
      }
    }
  }

  update(g, dt) {
    if (!this.ctx || !this.ambient) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p = g.player;
    const playing = g.status === 'playing';

    // aleteo audible (y el silencio al planear)
    const cycle = Math.floor(p.flap / Math.PI);
    if (cycle !== this.lastFlap) {
      this.lastFlap = cycle;
      if (playing && !p.quiet) this.wingbeat(t + 0.005, p.moving ? 0.07 : 0.035);
    }

    // goteo
    if (t > this.nextDrip) {
      this.nextDrip = t + 1.5 + Math.random() * 4.5;
      this.drip(t + 0.01, Math.random() * 2 - 1);
    }

    // voces de los Oyentes: respiración granulosa que se acerca
    for (const c of g.creatures) {
      let v = this.creatureVoices.get(c.id);
      if (!v) { v = this.makeVoice(380, 5); v.phase = Math.random() * 10; this.creatureVoices.set(c.id, v); }
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      const hunting = c.state === 'hunt';
      const rate = hunting ? 5.5 : c.state === 'investigate' ? 3 : c.state === 'sleep' ? 0.7 : 1.4;
      v.phase += dt * rate;
      const breath = Math.pow(0.5 + 0.5 * Math.sin(v.phase * Math.PI), 2);
      const base = hunting ? 0.2 : c.state === 'investigate' ? 0.12 : c.state === 'sleep' ? 0.05 : 0.07;
      const vol = playing ? base * breath * clamp(1 - d / 15, 0, 1) ** 1.5 : 0;
      v.gain.gain.setTargetAtTime(vol, t, 0.05);
      v.bp.frequency.setTargetAtTime(hunting ? 900 : c.state === 'sleep' ? 240 : 420, t, 0.2);
      v.pan.pan.setTargetAtTime(clamp(dx / 8, -1, 1), t, 0.05);
    }

    // viento de la grieta abierta
    if (g.exit.open) {
      if (!this.wind) {
        this.wind = this.makeVoice(600, 0.8);
        this.wind.phase = 0;
      }
      const dx = g.exit.x - p.x;
      const d = Math.hypot(dx, g.exit.y - p.y);
      this.wind.phase += dt;
      this.wind.bp.frequency.setTargetAtTime(500 + Math.sin(this.wind.phase * 0.7) * 250, t, 0.3);
      this.wind.gain.gain.setTargetAtTime(0.25 * clamp(1 - d / 28, 0.04, 1), t, 0.2);
      this.wind.pan.pan.setTargetAtTime(clamp(dx / 10, -1, 1), t, 0.1);
    }

    // latido cuando hay peligro
    if (playing && g.danger > 0.22 && t > this.nextBeat) {
      const bpm = 60 + g.danger * 100;
      this.nextBeat = t + 60 / bpm;
      this.heartbeat(t + 0.01, 0.12 + g.danger * 0.25);
    }
  }

  // Música de la portada: la canción del Coro, lenta, sobre un colchón de pads.
  startTitleMusic(songs) {
    if (!this.ctx || this.titleTimer) return;
    const notes = songs.flat();
    let i = 0;
    const tick = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      if (i % 8 === 0) {
        const root = notes[(i / 8) % notes.length | 0] / 2;
        this.pad([root / 2, root * 0.75, root], t, 7.5, 0.035);
      }
      this.bell(notes[i % notes.length], t, 0.07, 3.5, Math.sin(i) * 0.5, 0.75, this.music);
      i++;
    };
    tick();
    this.titleTimer = setInterval(tick, 950);
  }

  stopTitleMusic() {
    if (this.titleTimer) clearInterval(this.titleTimer);
    this.titleTimer = null;
  }
}
