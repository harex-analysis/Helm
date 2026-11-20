import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { _electron } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const directory = new URL('../src/ui/assets/', import.meta.url);
const profile = await mkdtemp(path.join(tmpdir(), 'helm-brand-'));
const app = await _electron.launch({ executablePath: electron, args: [root, '--disable-gpu'],
  env: { ...process.env, HELM_PROFILE: profile, HELM_OFFLINE: '1' } });
try {
  const window = await app.firstWindow();
  await window.getByRole('heading', { name: 'Mesa de mazos', exact: true }).waitFor();
  const frames = [];
  for (const [file, width, height] of [['helm-mark', 256, 256], ['helm-mark', 48, 48], ['helm-mark', 32, 32],
    ['helm-mark', 16, 16], ['helm-logo', 608, 188]]) {
    const svg = await readFile(new URL(file + '.svg', directory), 'utf8');
    await window.evaluate(({ svg, width, height }) => {
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0; background:transparent;';
      document.documentElement.style.background = 'transparent';
      document.body.insertAdjacentHTML('afterbegin', svg);
      Object.assign(document.body.firstElementChild.style, { position: 'fixed', left: 0, top: 0, width: width + 'px', height: height + 'px' });
    }, { svg, width, height });
    const png = await window.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: true, scale: 'css' });
    if (file === 'helm-mark') frames.push({ size: width, png });
    if (width >= 256) await writeFile(new URL(file + '.png', directory), png);
  }
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  for (const [index, { size, png }] of frames.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size % 256;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  await writeFile(new URL('helm.ico', directory), Buffer.concat([header, ...frames.map(frame => frame.png)]));
} finally {
  await app.close();
}
