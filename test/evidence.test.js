import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Arena } from '../src/core/arena.js';
import { checkDeck, indexCards, parseDeck } from '../src/core/deck.js';
import { deckMetrics } from '../src/core/analysis.js';
import { proposalEvidence } from '../src/core/evidence.js';
import { optimize } from '../src/core/optimizer.js';
import { pairedDifference, pairedOrders, simulate } from '../src/core/simulation.js';
import { rivalLists, suggestedRivals } from '../src/core/rivals.js';

const read = name => JSON.parse(readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8'));
const snapshot = read('catalog');
const cards = indexCards(snapshot);
const rules = { day: snapshot.checked, overrides: snapshot.overrides };
const load = id => parseDeck(read('examples').find(row => row.id === id).text, cards);
const natural = (copies, draws) => {
  let missed = 1;
  for (let i = 0; i < draws; i++) missed *= (50 - copies - i) / (50 - i);
  return 1 - missed;
};

test('la mejor sustitución coincide con una enumeración independiente de un modelo pequeño', async () => {
  const leader = { ...cards['OP17-039'], traits: [], effects: null };
  const item = (code, cost, counter) => ({ ...cards['OP08-051'], code, cost, counter, roles: [], traits: [], effects: null, construction: 'copies-50' });
  const [a, b, filler] = [item('ZZ01-001', 1, 0), item('ZZ01-002', 4, 2000), item('ZZ01-003', 4, 0)];
  const catalog = Object.fromEntries([leader, a, b, filler].map(card => [card.code, card]));
  const base = { leader: leader.code, don: 10, cards: { [a.code]: 4, [b.code]: 5, [filler.code]: 41 } };
  const score = (x, y) => 240 * natural(x, 5) + 220 * natural(x, 6) + 210 * natural(y, 5);
  const variations = [[0, 0], [-1, 1], [-1, 0], [1, -1], [0, -1], [1, 0], [0, 1]]
    .map(([x, y]) => ({ x, y, score: score(4 + x, 5 + y) - (x || y ? 5 : 0) }));
  const best = variations.sort((x, y) => y.score - x.score)[0];
  const proposals = await optimize(base, catalog, rules, { maxChanges: 1, synergy: false });
  const balanced = proposals.find(item => item.name === 'Equilibrado');
  assert.ok(balanced?.exact);
  assert.equal(balanced.deck.cards[a.code], 4 + best.x);
  assert.equal(balanced.deck.cards[b.code], 5 + best.y);
  assert.ok(Math.abs(balanced.score - best.score) < 1e-6);
  assert.ok(balanced.check.objectiveError < 1e-6);
  assert.equal(balanced.check.gap, 0);
  assert.ok(Math.abs(balanced.check.upperBound - best.score) < 1e-6);
  const guarded = await optimize(base, catalog, rules, { minCounter: 6, maxChanges: 1, synergy: false });
  assert.ok(guarded.length && guarded.every(item => item.deck.cards[b.code] === 6 && item.check.minCounter === 6));
  assert.ok(guarded.every(item => item.deck.cards[a.code] === 4 && !checkDeck(item.deck, catalog, rules).length));
  await assert.rejects(optimize(base, catalog, rules, { minCounter: 7, maxChanges: 1, synergy: false }), /excede/);
});

test('el Counter condicionado no sube el KPI impreso y limitar la defensa cambia una propuesta', async () => {
  const rocks = load('rocks');
  assert.ok(rocks.cards['OP17-118']);
  assert.equal(deckMetrics(rocks, cards).printedCounter, 0);
  const shanks = load('shanks');
  const minCounter = deckMetrics(shanks, cards).printedCounter;
  const proposals = await optimize(shanks, cards, rules, { minCounter });
  assert.ok(minCounter && proposals.length);
  assert.ok(proposals.every(item => deckMetrics(item.deck, cards).printedCounter >= minCounter && !checkDeck(item.deck, cards, rules).length));
});

test('el selector omite listas inválidas y repetidas y cambia sugerencia al equipar otro líder', () => {
  const examples = read('examples');
  const result = rivalLists(examples, [{ text: '1 OP17-058' }, { text: 'inválido' }], [{ deck: load('kaido') }], cards, rules);
  assert.equal(result.length, examples.length);
  for (const id of ['rocks', 'kaido']) {
    const own = load(id);
    const suggested = suggestedRivals(result, own, cards);
    assert.equal(new Set(suggested.map(item => item.deck.leader)).size, suggested.length);
    assert.ok(suggested.every(item => item.deck.leader !== own.leader && item.reason));
  }
  assert.equal(suggestedRivals(result, load('rocks'), cards)[0].deck.leader, load('kaido').leader);
  assert.notEqual(suggestedRivals(result, load('kaido'), cards)[0].deck.leader, load('kaido').leader);
});

test('la medición emparejada conserva identidades, signos y un intervalo para cero discordancias', async () => {
  const same = pairedDifference(0, 0, 2400);
  assert.equal(same.value, 0);
  assert.ok(same.low < 0 && same.high > 0);
  const base = load('rocks');
  const [proposal] = await optimize(base, cards, rules);
  const [original, revised] = pairedOrders(base, proposal.deck);
  assert.deepEqual(original, pairedOrders(base)[0]);
  assert.equal(original.filter((code, i) => code !== revised[i]).length, proposal.changes.count);
  for (const [code, count] of Object.entries(proposal.deck.cards)) assert.equal(revised.filter(item => item === code).length, count);
  const setup = { seed: 208, trials: 100, horizon: 3, mulligan: false };
  const alone = simulate(base, null, null, cards, rules, setup);
  const paired = simulate(base, proposal.deck, null, cards, rules, setup);
  for (const order of ['first', 'second']) assert.deepEqual(alone.groups[order].summary[0], paired.groups[order].summary[0]);
  const report = proposalEvidence(base, proposal.deck, cards, rules, { seed: 208, trials: 3000 });
  for (const { turnOne, defense } of Object.values(report.metrics)) {
    for (const metric of [turnOne, defense]) {
      assert.ok(Math.abs(metric.sample[1].value - metric.sample[0].value - metric.delta.value) < 1e-12);
    }
    assert.ok(turnOne.sample.every((row, i) => Math.abs(row.value - turnOne.exact[i]) < 0.035));
  }
  const identical = proposalEvidence(base, base, cards, rules, { trials: 50 });
  assert.equal(identical.metrics.first.turnOne.delta.gains, 0);
  assert.equal(identical.metrics.second.defense.delta.losses, 0);
});

test('la devolución puede pagar con un DON!! asignado y conservar los activos', () => {
  const game = new Arena(load('kaido'), load('rocks'), cards, rules);
  game.start(false);
  game.endTurn();
  game.endTurn();
  const leader = game.players[0].leader;
  const rival = game.players[1].leader;
  game.attach(leader.id);
  game.attack(leader.id, rival.id);
  assert.match(game.pending.label, /Activar el efecto/);
  game.choose(0);
  assert.match(game.pending.label, /Devuelve DON/);
  const assigned = game.pending.items.findIndex(item => item.unit === leader);
  assert.ok(assigned >= 0);
  game.choose(assigned);
  assert.equal(leader.don, 0);
  assert.equal(game.players[0].don.active, 2);
});

test('la sugerencia automática del líder respeta mínimos y conserva el borrador y la lista original', async () => {
  const draft = { leader: 'OP17-039', don: 10, cards: { 'OP17-050': 1 } };
  const options = { recommendation: true, maxChanges: 50, preserveStructure: false,
    minimums: { 'OP17-050': 3 }, minCounter: 10 };
  const [primary, ...alternatives] = await optimize(draft, cards, rules, options);
  assert.ok(primary?.primary);
  assert.equal(primary.name, 'Plan del líder');
  assert.equal(primary.changes.removed.length, 0);
  for (const item of [primary, ...alternatives]) {
    assert.deepEqual(checkDeck(item.deck, cards, rules), []);
    assert.ok(item.deck.cards['OP17-050'] >= 3);
    assert.ok(deckMetrics(item.deck, cards).printedCounter >= 10);
    assert.ok(item.check.upperBound === null || item.check.upperBound + 1e-5 >= item.score);
  }
  assert.deepEqual(draft.cards, { 'OP17-050': 1 });
  await assert.rejects(optimize(draft, cards, rules, { ...options, fixed: ['OP17-050'] }), /fijadas/);
  await assert.rejects(optimize(draft, cards, rules, { ...options, minimums: { 'OP17-050': 5 } }), /elegibles/);

  const full = load('rocks');
  const [retain] = await optimize(full, cards, rules, { ...options, maxChanges: 0, minCounter: 0, minimums: {} });
  assert.ok(retain?.primary);
  assert.equal(retain.changes.count, 0);
  assert.deepEqual(retain.deck, full);
});
