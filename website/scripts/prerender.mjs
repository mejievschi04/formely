/**
 * După `vite build`: scrie HTML static pentru fiecare pagină publică, ca motoarele de căutare
 * și crawlerele care nu rulează JavaScript să vadă textul și meta-tag-urile.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const ssrDir = resolve(root, '.ssr');
const ROUTES = ['/', '/legal/confidentialitate', '/legal/termeni'];

const { render } = await import(pathToFileURL(resolve(ssrDir, 'entry-server.js')).href);
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');

for (const route of ROUTES) {
  const { html, helmet } = render(route);
  const head = ['title', 'meta', 'link', 'script'].map((key) => helmet[key].toString()).join('\n    ');
  const page = template
    .replace(/<html[^>]*>/, `<html ${helmet.htmlAttributes.toString()} data-theme="dark">`)
    .replace(/<title>[\s\S]*?<\/title>/, head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  const out = route === '/' ? resolve(dist, 'index.html') : resolve(dist, `.${route}`, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  console.log(`prerendered ${route}`);
}

rmSync(ssrDir, { recursive: true, force: true });
