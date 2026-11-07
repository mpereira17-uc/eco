// Entrada: teclado, ratón, mando y controles táctiles.

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pulseHeld = false;
    this.pulseTapped = false;
    this.suppressPulse = false;
    this.mouseHeld = false;
    this.touch = { ax: 0, ay: 0, shout: false, glide: false, stickId: null };
    this.gamepadPause = false;
    this.lastPadStart = false;
    this.enabled = false;
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        if (this.enabled && !this.suppressPulse) { this.pulseHeld = true; this.pulseTapped = true; }
        e.preventDefault();
      }
      if (e.code.startsWith('Arrow') && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') { this.pulseHeld = false; this.suppressPulse = false; }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.pulseHeld = false; this.mouseHeld = false; });
    const world = document.getElementById('world');
    world.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.enabled) { this.mouseHeld = true; this.pulseTapped = true; }
    });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.mouseHeld = false; });
    this.attachTouch();
  }

  attachTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const shout = document.getElementById('touch-shout');
    const glide = document.getElementById('touch-glide');
    if (!stick) return;
    const moveStick = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.touch.ax = dx;
      this.touch.ay = dy;
      knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { this.touch.stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.touch.stickId) moveStick(e); });
    const endStick = (e) => {
      if (e.pointerId !== this.touch.stickId) return;
      this.touch.stickId = null;
      this.touch.ax = 0;
      this.touch.ay = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    const hold = (el, key) => {
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        this.touch[key] = true;
        if (key === 'shout') this.pulseTapped = true;
        el.classList.add('on');
      });
      const up = () => { this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold(shout, 'shout');
    hold(glide, 'glide');
  }

  // Evita que la tecla que cerró un menú dispare un grito al empezar a jugar.
  reset() {
    this.pulseHeld = false;
    this.pulseTapped = false;
    this.mouseHeld = false;
    this.suppressPulse = this.keys.has('Space');
  }

  pad() {
    let pads = [];
    try {
      // En algunos marcos incrustados el navegador bloquea los mandos y esta llamada lanza un error.
      pads = navigator.getGamepads ? navigator.getGamepads() || [] : [];
    } catch {
      return null;
    }
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Devuelve el estado de control de este fotograma.
  sample() {
    let ax = 0;
    let ay = 0;
    for (const [code, v] of Object.entries(MOVE_KEYS)) {
      if (this.keys.has(code)) { ax += v[0]; ay += v[1]; }
    }
    ax += this.touch.ax;
    ay += this.touch.ay;
    let quiet = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.glide;
    let pulse = this.pulseHeld || this.mouseHeld || this.touch.shout || this.pulseTapped;
    this.gamepadPause = false;
    const p = this.pad();
    if (p) {
      const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
      ax += dz(p.axes[0] || 0);
      ay += dz(p.axes[1] || 0);
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      if (b(0)) pulse = true;
      if (b(4) || b(5) || b(6) || b(7)) quiet = true;
      if (b(12)) ay -= 1;
      if (b(13)) ay += 1;
      if (b(14)) ax -= 1;
      if (b(15)) ax += 1;
      const start = b(9);
      if (start && !this.lastPadStart) this.gamepadPause = true;
      this.lastPadStart = start;
    }
    this.pulseTapped = false;
    const m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    return { ax, ay, pulse: pulse && !this.suppressPulse, quiet };
  }
}
