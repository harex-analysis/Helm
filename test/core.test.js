import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyzeDeck, boardCost, hitChance, inspectPair } from '../src/core/analysis.js';
import { cardIssue, checkDeck, deckText, indexCards, openingDeck, pairBanned, parseDeck, readQuantities, total } from '../src/core/deck.js';
import { optimize } from '../src/core/optimizer.js';
import { simulate } from '../src/core/simulation.js';

const data = name => JSON.parse(readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8'));
const snapshot = data('catalog');
const catalog = indexCards(snapshot);
const examples = data('examples');
const rules = { day: '2026-11-19', overrides: snapshot.overrides };
const example = name => parseDeck(examples.find(row => row.id === name).text, catalog);
const rocks = example('rocks'), kaido = example('kaido'), enel = example('enel');

test('las siete listas heredadas validan y se importan y exportan con las mismas cantidades', () => {
  for (const item of examples) {
    const deck = parseDeck(item.text, catalog);
    assert.equal(total(deck), 50);
    assert.deepEqual(checkDeck(deck, catalog, rules), [], item.id);
    assert.deepEqual(parseDeck(deckText(deck, true), catalog), deck);
  }
  assert.equal(enel.don, 6);
  assert.deepEqual(readQuantities('\uFEFFLeader:\r\n1xOP17-039\r\n2 OP17-045 nombre\r\n2 × OP17-045\r\n10 DON!!', catalog),
    { quantities: { 'OP17-039': 1, 'OP17-045': 4 }, don: 10 });
});

test('las reglas aplican fechas, pares y restricciones de líderes', () => {
  const { day, overrides } = rules;
  assert.match(cardIssue(catalog['OP18-001'], null, day, overrides), /disponible/);
  assert.equal(cardIssue(catalog['OP18-001'], null, '2027-01-15', overrides), '');
  assert.equal(pairBanned('OP13-001', 'EB05-001', day), false);
  assert.equal(pairBanned('OP13-001', 'EB05-001', '2026-11-27'), true);
  assert.match(cardIssue(catalog['OP11-067'], catalog['OP11-040'], day, overrides), /pareja/);
  assert.match(cardIssue(catalog['OP17-037'], catalog['OP13-079'], day, overrides), /colores|Imu/);
  assert.match(cardIssue(catalog['OP06-047'], null, day, overrides), /prohibida/);
  assert.match(checkDeck({ ...enel, don: 10 }, catalog, rules).join(' '), /6 DON/);
});

test('el análisis usa coste en mesa, exclusiones y recursos de las cartas', () => {
  const elbaph = catalog['OP17-079'];
  assert.equal(boardCost(catalog['OP17-094'], elbaph), 13);
  const plan = analyzeDeck(example('elbaph'), catalog);
  assert.ok(plan.links.some(row => row.source === 'OP17-079' && row.targets.includes('OP17-094')));
  const teach = catalog['OP09-081'];
  const pair = inspectPair(teach, catalog['EB01-048'], catalog['OP09-090'], rules, 10);
  assert.equal(pair.issues.length, 0);
  assert.ok(pair.links.some(line => /reducción|reduce el coste/i.test(line)));
  assert.ok(hitChance(10, 5) > hitChance(4, 5));
});

test('las variantes mantienen 50 cartas, fijas, colección, límite de cambios y reimportación', async () => {
  const fixed = ['OP17-118'];
  const owned = Object.fromEntries(Object.keys(catalog).filter(code => catalog[code].colors.includes('Blue')).map(code => [code, 4]));
  const proposals = await optimize(rocks, catalog, rules, { fixed, owned, maxChanges: 4, rival: kaido });
  assert.ok(proposals.length);
  for (const item of proposals) {
    assert.deepEqual(checkDeck(item.deck, catalog, rules, { owned }), []);
    assert.equal(item.deck.cards['OP17-118'], rocks.cards['OP17-118']);
    assert.ok(item.changes.count <= 4 && item.delta > 0);
    assert.deepEqual(parseDeck(deckText(item.deck), catalog), item.deck);
  }
});

test('el generador conserva el borrador y monta el paquete de inicio de Imu', async () => {
  const imu = openingDeck(catalog['OP13-079']);
  imu.cards['OP13-099'] = 1;
  const proposals = await optimize(imu, catalog, rules);
  assert.ok(proposals.length);
  assert.ok(proposals.every(item => item.deck.cards['OP13-099'] >= 1 && checkDeck(item.deck, catalog, rules).length === 0));
  await assert.rejects(optimize(imu, catalog, rules, { owned: { 'OP13-079': 1, 'OP13-099': 4 } }), /menos de 50/);
});

test('la reparación conserva el resto de la lista si basta con corregir un DON', async () => {
  const proposals = await optimize({ ...enel, don: 10 }, catalog, rules, { repair: true, maxChanges: 0 });
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].deck, enel);
});

test('la repetición usa el DON correcto, vuelve a producir las mismas manos y empareja versiones', () => {
  const options = { trials: 100, seed: 278, order: 'both' };
  const left = simulate(enel, enel, kaido, catalog, rules, options);
  const right = simulate(enel, enel, kaido, catalog, rules, options);
  assert.deepEqual(left, right);
  const first = left.groups.first;
  assert.deepEqual(first.summary[0], first.summary[1]);
  assert.equal(first.replay.lists[0].opening.length, 5);
  assert.equal(first.replay.lists[0].turns[0].draw, null);
  assert.ok(left.groups.second.replay.lists[0].turns[0].draw);
  assert.equal(first.replay.lists[0].turns[4].don, 6);
  assert.ok(first.replay.lists[0].turns.every(turn => turn.spent <= turn.don && turn.board.length <= 5));
});

test('el ejercicio A → B requiere dos personajes y devuelve métricas con interrupción', () => {
  const shanks = example('shanks');
  const result = simulate(shanks, null, null, catalog, rules, { trials: 120, mode: 'ordered', a: ['OP17-021'], b: ['OP17-027'], seed: 17 });
  assert.ok(result.groups.second.summary[0].turns[4].ready.hits > 0);
  assert.equal(result.groups.first.summary[0].turns[4].disrupted.n, 120);
  assert.throws(() => simulate(shanks, null, null, catalog, rules, { mode: 'ordered', a: ['OP17-037'], b: ['OP17-027'] }), /personajes/);
});
