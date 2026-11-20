import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { _electron } from 'playwright';
import { artworkType } from '../src/core/artwork.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const profile = await mkdtemp(path.join(tmpdir(), 'helm-art-test-'));
const art = path.join(profile, 'art');
await mkdir(art);
const corrupt = path.join(art, 'P-053.img');
await writeFile(corrupt, 'contenido incompleto');
const app = await _electron.launch({ executablePath: electron, args: [root, '--disable-gpu'],
  env: { ...process.env, HELM_PROFILE: profile, HELM_OFFLINE: '', DECKLAB_OFFLINE: '' } });
try {
  const win = await app.firstWindow();
  await win.getByRole('heading', { name: 'Mesa de mazos', exact: true }).waitFor();
  const codes = ['P-053', 'OP16-034'];
  const sizes = await win.evaluate(async ids => Promise.all(ids.map(async code => {
    const img = new Image();
    img.src = '/art/' + code;
    await img.decode();
    return img.naturalWidth;
  })), codes);
  assert.ok(sizes.every(width => width > 0));
  assert.ok(artworkType(await readFile(corrupt)));
  console.log('Electron decodificó ' + codes.join(' y ') + ' y reparó la caché incompleta.');
} finally {
  await app.close();
}
