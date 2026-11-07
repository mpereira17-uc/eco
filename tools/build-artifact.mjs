// Genera dist/artifact/eco.html: el juego en un solo archivo autocontenido
// (estilos, fuentes y código en línea), sin <html>/<head>/<body> propios,
// para publicarlo como página donde el anfitrión pone el esqueleto del documento.
// Requiere haber ejecutado antes tools/build-web.mjs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist', 'artifact');
await mkdir(out, { recursive: true });

const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'styles.css'), 'utf8');
const js = await readFile(join(root, 'dist', 'web', 'eco.js'), 'utf8');

const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? 'Eco';
const description = html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? '';
const bodyStart = html.indexOf('<body>') + '<body>'.length;
const bodyEnd = html.indexOf('<script type="module"');
if (bodyStart < 6 || bodyEnd < 0) throw new Error('No encontré el cuerpo o el script en index.html');
const body = html.slice(bodyStart, bodyEnd).trim();

// Las fuentes viajan dentro del CSS como data: URI
const inlineCss = css.replace(/url\('assets\/fonts\/([^']+\.woff2)'\)/g, (_, file) => {
  const data = readFileSync(join(root, 'assets', 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${data})`;
});
if (/assets\//.test(inlineCss)) throw new Error('Quedó una ruta a assets/ en el CSS');
if (/<\/script/i.test(js)) throw new Error('El código contiene </script> y no se puede incrustar');

const page = `<title>${title}</title>
<meta name="description" content="${description}">
<style>
${inlineCss}
</style>
${body}
<script>
${js}
</script>
`;
await writeFile(join(out, 'eco.html'), page);
console.log(`dist/artifact/eco.html listo (${(page.length / 1024).toFixed(0)} KB)`);
