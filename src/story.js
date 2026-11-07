// Historia, capítulos y la canción del Coro.

// Frecuencias en Hz: la canción está en re dórico.
const N = { D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, A5: 880.0 };

export const PROLOGUE = [
  'Hubo un tiempo en que la colonia cantaba.',
  'Cada noche mil voces salían de la cueva, y la canción del Coro volvía convertida en mapa: así sabíamos dónde estaba todo.',
  'Luego llegó el Silencio. Las polillas de luz, que guardaban las notas de la canción, fueron arrastradas a la Hondura.',
  'Sin canción, los ecos se volvieron extraños. Los mayores dejaron de volar.',
  'Tú eres Eco, la cría más pequeña del Coro. Tu voz todavía es tuya.',
];

export const CHAPTERS = [
  {
    id: 1,
    name: 'La Boca',
    subtitle: 'donde la oscuridad deja de responder',
    text: [
      'Grita y escucha: el eco te dirá dónde está la piedra.',
      'Pero no grites por gritar. Algo duerme aquí abajo, y ha aprendido a comer voces.',
    ],
    params: { width: 64, height: 42, moths: 3, creatures: 1, crystals: 0, fill: 0.5 },
    palette: { echo: [120, 230, 255], deep: [20, 60, 110], accent: [255, 214, 140], fog: '#03070d' },
    song: [N.D4, N.F4, N.A4],
  },
  {
    id: 2,
    name: 'Bosque de Agujas',
    subtitle: 'las piedras cuelgan como dientes',
    text: [
      'Entre las agujas brillan cristales que repiten todo lo que oyen.',
      'Un grito contra un cristal suena lejos de ti. Úsalo para que los Oyentes busquen en otra parte.',
    ],
    params: { width: 78, height: 50, moths: 4, creatures: 2, crystals: 3, fill: 0.505 },
    palette: { echo: [150, 200, 255], deep: [50, 40, 120], accent: [255, 220, 150], fog: '#05050f' },
    song: [N.G4, N.A4, N.C5, N.A4],
  },
  {
    id: 3,
    name: 'El Lago Mudo',
    subtitle: 'el agua se tragó la primera nota',
    text: [
      'Los Oyentes son más aquí, y patrullan sin descanso.',
      'Cuando estén cerca, planea en silencio: avanzarás despacio, pero no te oirán.',
    ],
    params: { width: 90, height: 56, moths: 4, creatures: 3, crystals: 3, fill: 0.495 },
    palette: { echo: [110, 170, 255], deep: [15, 40, 120], accent: [255, 230, 170], fog: '#020512' },
    song: [N.F4, N.E4, N.D4, N.A4],
  },
  {
    id: 4,
    name: 'Las Raíces que Escuchan',
    subtitle: 'el bosque de arriba también tiene oídos',
    text: [
      'Las raíces del mundo atraviesan la roca. Por aquí bajaron los Oyentes hace mucho, cuando aún eran como tú.',
      'Olvidaron cantar. Solo saben escuchar.',
    ],
    params: { width: 100, height: 62, moths: 5, creatures: 4, crystals: 4, fill: 0.51 },
    palette: { echo: [170, 255, 200], deep: [20, 80, 60], accent: [255, 200, 120], fog: '#020a07' },
    song: [N.D5, N.C5, N.A4, N.G4, N.A4],
  },
  {
    id: 5,
    name: 'El Corazón de la Hondura',
    subtitle: 'donde termina la canción',
    text: [
      'Las últimas notas laten aquí, en el fondo de todo.',
      'Cuando la canción esté completa, la Hondura tendrá que devolverte el camino.',
    ],
    params: { width: 112, height: 70, moths: 6, creatures: 6, crystals: 5, fill: 0.51 },
    palette: { echo: [255, 170, 210], deep: [90, 20, 70], accent: [255, 240, 190], fog: '#0b0207' },
    song: [N.D4, N.A4, N.F5, N.E5, N.D5, N.A5],
  },
];

export const EPILOGUE = [
  'La última polilla se posó en tus alas y la canción volvió entera.',
  'Subiste cantándola. Cada eco regresaba claro, y detrás de ti, por primera vez en años, la colonia salió a volar.',
  'Dicen que en lo hondo algunos Oyentes se quedaron quietos, escuchando. Quizá recordaron.',
  'Gracias por jugar a Eco.',
];

export const DEATH_LINES = [
  'El silencio te encontró.',
  'Un Oyente aprendió tu voz.',
  'Gritaste una vez de más.',
  'La Hondura se quedó con tu eco.',
  'Te oyeron antes de que tú los oyeras.',
];

export const CODEX = [
  { title: 'Eco', body: 'La cría más pequeña del Coro. No ve en la oscuridad, pero su grito dibuja el mundo durante unos segundos.' },
  { title: 'Polillas de luz', body: 'Cada una guarda una nota de la canción del Coro. Brillan débilmente; síguelas cuando parpadeen.' },
  { title: 'Oyentes', body: 'Antiguos murciélagos que olvidaron cantar. Ciegos, cazan por el oído: van hacia donde suena tu grito y te persiguen si oyen tu aleteo.' },
  { title: 'Cristales resonantes', body: 'Repiten cualquier grito que los alcance. Sirven para ver más lejos y para engañar a los Oyentes.' },
  { title: 'La grieta', body: 'Una corriente de aire que sube hacia la superficie. Solo se abre cuando reúnes todas las notas del capítulo.' },
];

// Capítulos infinitos después del final: la Hondura sin fondo.
export function chapterFor(index) {
  if (index < CHAPTERS.length) return CHAPTERS[index];
  const depth = index - CHAPTERS.length + 1;
  const base = CHAPTERS[CHAPTERS.length - 1];
  const hue = (depth * 47) % 360;
  const c = hslToRgb(hue / 360, 0.7, 0.75);
  return {
    id: index + 1,
    name: `Hondura sin fondo ${depth}`,
    subtitle: 'más abajo de lo que cuenta ninguna historia',
    text: ['Ya no quedan notas que recuperar. Solo ecos que nadie ha oído.'],
    params: {
      width: Math.min(140, 112 + depth * 4),
      height: Math.min(90, 70 + depth * 3),
      moths: 6,
      creatures: Math.min(10, 6 + depth),
      crystals: 5,
      fill: 0.515,
    },
    palette: { echo: c, deep: c.map((v) => Math.round(v * 0.3)), accent: [255, 235, 180], fog: '#050307' },
    song: base.song,
    endless: true,
  };
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
