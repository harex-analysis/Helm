import assert from 'node:assert/strict';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { artworkAddress, artworkType, fetchArtwork } from '../src/core/artwork.js';
import { syncCatalog } from '../src/core/catalog-sync.js';
import { assertDay, cardIssue, checkDeck, codePattern, COLORS, indexCards, KINDS, parseDeck } from '../src/core/deck.js';

const data = new URL('../data/', import.meta.url);
const args = new Set(process.argv.slice(2));
const read = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
let snapshot = await read('catalog.json');
if (args.has('--refresh')) snapshot = await syncCatalog(snapshot);
assertDay(snapshot.checked);
const catalog = indexCards(snapshot);
assert.equal(Object.keys(catalog).length, snapshot.cards.length, 'Códigos duplicados en el catálogo');
assert.ok(snapshot.cards.length > 2500);
for (const card of snapshot.cards) {
  assert.ok(codePattern.test(card.code) && KINDS[card.kind] && card.name, card.code);
  assert.ok(card.colors.length && card.colors.every(color => COLORS[color]), card.code);
  assert.ok(Number.isInteger(card.cost) && card.cost >= 0 && Number.isInteger(card.counter) && card.counter >= 0, card.code);
  if (card.kind === 'Leader') assert.ok(Number.isInteger(card.life) && card.life >= 1, card.code);
  assert.ok(Array.isArray(card.traits) && Array.isArray(card.roles), card.code);
}
const issues = [];
const bundled = await readdir(new URL('art/', data));
for (const file of bundled) {
  if (!file.endsWith('.png')) continue;
  const bytes = await readFile(new URL('art/' + file, data));
  if (!catalog[file.slice(0, -4)] || !artworkType(bytes)) issues.push(file);
}
assert.deepEqual(issues, [], 'Ilustraciones incluidas sin ficha o con datos incompletos');

const rules = { day: snapshot.checked, overrides: snapshot.overrides };
const examples = await read('examples.json');
for (const item of examples) assert.deepEqual(checkDeck(parseDeck(item.text, catalog), catalog, rules), [], item.id);
const sources = await read('recommended_decks.json');
let legalReferences = 0;
for (const item of sources) {
  const address = new URL(item.source);
  assert.equal(address.origin, 'https://play.limitlesstcg.com');
  const deck = parseDeck(item.text, catalog);
  assert.equal(deck.leader, item.leader);
  if (!checkDeck(deck, catalog, rules).length) legalReferences++;
}

const missingAddress = snapshot.cards.filter(card => !artworkAddress(card.artwork_url, card.code)).map(card => card.code);
assert.deepEqual(missingAddress, [], 'Códigos sin URL oficial válida');
const summary = { fecha: rules.day, cartas: snapshot.cards.length, elegiblesAlCorte: snapshot.cards.filter(card =>
  !cardIssue(card, null, rules.day, rules.overrides)).length, pendientesDeRevision: snapshot.cards
  .filter(card => !card.available || card.construction === 'review').length, arteIncluido: bundled.length, ejemplosLegales: examples.length,
  referencias: sources.length, referenciasLegalesAlCorte: legalReferences };
if (args.has('--online') || args.has('--refresh')) {
  const sample = ['P-053', 'OP16-034', 'PRB02-001', 'EB05-001', 'EB01-009', 'OP14-041', 'OP17-045', 'OP18-001',
    'OP07-038', 'OP17-021', 'OP13-079', 'ST30-001'].filter(code => catalog[code]);
  const checked = [];
  for (let i = 0; i < sample.length; i += 4) {
    checked.push(...await Promise.all(sample.slice(i, i + 4).map(async code => {
      const image = await fetchArtwork(catalog[code]);
      return { codigo: code, tipo: image?.type ?? null, bytes: image?.bytes.length ?? null };
    })));
  }
  summary.muestraRemota = checked;
  assert.ok(checked.every(row => row.tipo), JSON.stringify(checked));
}
if (args.has('--refresh')) {
  const pending = new URL('catalog.reviewed.json', data);
  await writeFile(pending, JSON.stringify(snapshot) + '\n');
  await rename(pending, new URL('catalog.json', data));
}
console.log(JSON.stringify(summary, null, 2));
