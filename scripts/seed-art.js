import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { artworkType, fetchArtwork } from '../src/core/artwork.js';
import { indexCards, parseDeck } from '../src/core/deck.js';

const data = new URL('../data/', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
const catalog = indexCards(await read('catalog.json'));
const decks = (await read('examples.json')).map(row => parseDeck(row.text, catalog));
const codes = [...new Set(decks.flatMap(deck => [deck.leader, ...Object.keys(deck.cards)]))];
await mkdir(new URL('art/', data), { recursive: true });
for (let i = 0; i < codes.length; i += 4) {
  await Promise.all(codes.slice(i, i + 4).map(async code => {
    const path = new URL('art/' + code + '.png', data);
    const local = await readFile(path).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (artworkType(local)) return;
    const art = await fetchArtwork(catalog[code]);
    if (!art) throw new Error('Arte oficial no disponible para ' + code);
    await writeFile(path, art.bytes);
  }));
}
console.log('Ilustraciones de ejemplo comprobadas: ' + codes.length);
