import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Produce a portable study with its own fonts, image, styles and interactions.
// No build variables, API keys, sessions or application data are included.
const root = fileURLToPath(new URL('.', import.meta.url));
let html = await readFile(join(root, 'index.html'), 'utf8');
let css = await readFile(join(root, 'studies.css'), 'utf8');
let js = await readFile(join(root, 'studies.js'), 'utf8');
for (const font of [
  'headline',
  'text',
  'text-medium',
  'text-semibold',
  'mono',
]) {
  const bytes = await readFile(join(root, 'assets', `${font}.woff2`));
  css = css.replaceAll(
    `./assets/${font}.woff2`,
    `data:font/woff2;base64,${bytes.toString('base64')}`,
  );
}
const image = await readFile(join(root, 'assets', 'walk-still-life.png'));
js = js.replaceAll(
  './assets/walk-still-life.png',
  `data:image/png;base64,${image.toString('base64')}`,
);
html = html.replace(
  '<link rel="stylesheet" href="./studies.css" />',
  `<style>${css}</style>`,
);
html = html.replace(
  '<script type="module" src="./studies.js"></script>',
  `<script type="module">${js.replaceAll('</script', '<\\/script')}</script>`,
);
const licenses = await Promise.all(
  ['barlow-condensed', 'ibm-plex-sans', 'ibm-plex-mono'].map((name) =>
    readFile(join(root, 'assets', `${name}-LICENSE.txt`), 'utf8'),
  ),
);
html = html.replace(
  '</head>',
  `<script type="text/plain" id="font-license-notices">${licenses.join('\n\n').replaceAll('</script', '<\\/script')}</script></head>`,
);
const target =
  process.argv[2] || join(tmpdir(), 'terms-apply-design-studies.html');
await writeFile(target, html);
console.log(`Exported standalone design studies: ${target}`);
