// Progreso y ajustes guardados en el navegador (o en el perfil de WebView2 del .exe).

const KEY = 'eco.save.v1';

export const DEFAULT_SETTINGS = {
  volume: 0.8,
  ambient: 0.7,
  shake: true,
  glow: true,
  grain: true,
  footsteps: true,
};

function defaults() {
  return { unlocked: 0, current: 0, finished: false, seed: null, best: {}, settings: { ...DEFAULT_SETTINGS } };
}

export function loadSave() {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return { ...base, ...data, best: { ...(data.best || {}) }, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* sin almacenamiento: el juego sigue funcionando sin guardar */
  }
}

export function resetProgress(save) {
  const fresh = defaults();
  save.unlocked = fresh.unlocked;
  save.current = fresh.current;
  save.finished = fresh.finished;
  save.seed = null;
  save.best = {};
  writeSave(save);
}
