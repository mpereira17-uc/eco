// Empaqueta el juego en dist/web: un solo script clásico (eco.js) que funciona
// incluso abriendo index.html con doble clic (file://), sin servidor.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist', 'web');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  outfile: join(out, 'eco.js'),
  logLevel: 'warning',
});

const html = await readFile(join(root, 'index.html'), 'utf8');
const marker = '<script type="module" src="src/main.js"></script>';
if (!html.includes(marker)) throw new Error('No encontré la etiqueta del script en index.html');
await writeFile(join(out, 'index.html'), html.replace(marker, '<script src="eco.js" defer></script>'));
await cp(join(root, 'styles.css'), join(out, 'styles.css'));
await cp(join(root, 'assets', 'fonts'), join(out, 'assets', 'fonts'), { recursive: true });
await cp(join(root, 'assets', 'icon-64.png'), join(out, 'assets', 'icon-64.png'));
console.log('dist/web listo');
