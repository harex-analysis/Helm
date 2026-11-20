import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { artworkAddress, artworkCandidates, artworkType, createArtworkStore, fetchArtwork } from '../src/core/artwork.js';

const card = { code: 'OP17-039', artwork_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP17-039_p1.png' };
const bytes = await readFile(new URL('../data/art/OP17-039.png', import.meta.url));

test('el arte admite ediciones del código correcto y vuelve al archivo oficial canónico', async () => {
  assert.equal(artworkAddress('/images/cardlist/card/OP17-040.png', card.code), '');
  assert.equal(artworkAddress('https://otra.example/images/cardlist/card/OP17-039.png', card.code), '');
  assert.equal(artworkType(bytes.subarray(0, -20)), '');
  const requests = [];
  const image = await fetchArtwork(card, async url => {
    requests.push(url);
    return url === card.artwork_url ? new Response('Error interno', { status: 502 }) : new Response(bytes);
  });
  assert.deepEqual(requests, artworkCandidates(card));
  assert.equal(image.type, 'image/png');
  assert.deepEqual(image.bytes, bytes);
});

test('la caché incompleta se reemplaza y las solicitudes simultáneas comparten descarga', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'helm-art-'));
  const bundled = path.join(directory, 'bundled');
  const cached = path.join(directory, 'cached');
  await Promise.all([mkdir(bundled), mkdir(cached)]);
  const file = path.join(cached, card.code + '.img');
  await writeFile(file, bytes.subarray(0, -20));
  let downloads = 0;
  const load = createArtworkStore({ bundled, cached, fetcher: async () => {
    downloads++;
    return new Response(bytes);
  } });
  const [a, b] = await Promise.all([load(card), load(card)]);
  assert.equal(downloads, 1);
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal((await load(card)).type, 'image/png');
  assert.equal(downloads, 1);
  assert.deepEqual(await readFile(file), bytes);
});
