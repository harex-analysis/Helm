import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Arena } from '../src/core/arena.js';
import { auditCatalog } from '../src/core/audit.js';
import { effectsAt } from '../src/core/arena-effects.js';
import { indexCards, parseDeck } from '../src/core/deck.js';
import { exactOpening, simulate } from '../src/core/simulation.js';
import { tournamentEntries } from '../src/core/tournaments.js';

const read = name => JSON.parse(readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8'));
const snapshot = read('catalog');
const catalog = indexCards(snapshot);
const examples = read('examples');
const list = id => parseDeck(examples.find(row => row.id === id).text, catalog);
const rules = { day: snapshot.checked, overrides: snapshot.overrides };

function placeInHand(game, side, code) {
  const player = game.players[side];
  if (!player.hand.some(unit => unit.code === code)) {
    const zone = [player.library, player.life].find(items => items.some(unit => unit.code === code));
    player.hand.push(...zone.splice(zone.findIndex(unit => unit.code === code), 1));
  }
  return player.hand.find(unit => unit.code === code);
}

test('la Arena respeta mulligan, Vida, robos, DON!! y restricción de ataque de apertura', () => {
  const match = new Arena(list('rocks'), list('kaido'), catalog, rules, { seed: 17 });
  assert.equal(match.players[0].hand.length, 5);
  const initial = match.players[0].hand.map(unit => unit.id);
  match.start(true);
  const [own, rival] = match.players;
  assert.notDeepEqual(own.hand.map(unit => unit.id), initial);
  assert.equal(own.hand.length, 5);
  assert.equal(own.life.length, catalog[own.leader.code].life);
  assert.equal(own.don.active, 1);
  assert.equal(match.canAttack(own.leader), false);
  assert.equal(match.endTurn(), true);
  assert.equal(rival.hand.length, 6);
  assert.equal(rival.don.active, 2);
  assert.equal(match.canAttack(rival.leader), false);
  assert.equal(match.endTurn(), true);
  assert.equal(own.hand.length, 6);
  assert.equal(own.don.active, 3);
  assert.equal(match.canAttack(own.leader), true);
});

test('Blocker y Counter alteran un combate y los DON!! se despejan al refrescar', () => {
  const match = new Arena(list('rocks'), list('kaido'), catalog, rules);
  match.start(false);
  const yamato = placeInHand(match, 1, 'OP17-074');
  match.manual('play-free', 1, yamato.id);
  assert.ok(match.players[1].board.includes(yamato));
  match.endTurn();
  match.endTurn();
  const own = match.players[0].leader, other = match.players[1].leader;
  match.attach(own.id);
  assert.equal(match.power(own), catalog[own.code].power + 1000);
  assert.ok(match.attack(own.id, other.id));
  while (match.pending) match.choose(match.pending.required ? 0 : -1);
  assert.equal(match.phase, 'block');
  assert.equal(match.block(yamato.id), true);
  assert.equal(match.battle.defender, yamato);
  const counter = placeInHand(match, 1, 'OP17-074');
  assert.ok(match.useCounter(counter.id));
  assert.ok(match.players[1].stats.defense > 0);
  assert.ok(match.resolveBattle());
  assert.equal(match.battle, null);
  assert.equal(match.life(1), catalog[other.code].life);
  assert.equal(match.phase, 'main');
  assert.ok(own.rested);
});

test('el buscador revisado ofrece los objetivos del texto, añade la selección y conserva el mazo', () => {
  const match = new Arena(list('shanks'), list('kaido'), catalog, rules);
  match.start(false);
  const player = match.players[0];
  const limejuice = placeInHand(match, 0, 'OP17-032');
  const index = player.library.findIndex(unit => unit.code === 'OP17-027');
  player.library.unshift(...player.library.splice(index, 1));
  const known = player.library[0];
  assert.ok(match.deploy(limejuice.id, 0));
  assert.ok(match.pending.items.includes(known));
  match.choose(match.pending.items.indexOf(known));
  assert.ok(player.hand.includes(known));
  assert.ok(player.board.includes(limejuice));
  assert.match(match.log.at(-1).text, /encuentra Benn/);
});

test('los duelos CPU terminan de forma reproducible sin duplicar copias o exceder zonas', () => {
  const run = () => {
    const match = new Arena(list('rocks'), list('kaido'), catalog, rules, { seed: 902 });
    for (let i = 0; i < 700 && !match.result; i++) {
      assert.ok(match.autoStep());
      for (const [side, player] of match.players.entries()) {
        const zones = [...player.library, ...player.hand, ...player.board, ...player.life, ...player.trash, ...(player.stage ? [player.stage] : [])];
        assert.equal(new Set(zones).size, zones.length);
        assert.ok(player.board.length <= 5);
        assert.ok(match.donTotal(side) <= player.capacity && player.don.active >= 0);
      }
    }
    assert.ok(match.result);
    assert.match(match.result.text, /Vida|agotó/);
    return [match.seed, match.result, match.log];
  };
  assert.deepEqual(run(), run());
});

test('el texto complejo se marca para mesa de efectos y una modificación afecta al poder real', () => {
  const manual = { ...catalog['OP17-027'], code: 'XX00-027', effect_text: '[On Play] Draw 1 card if your opponent has more Life.' };
  assert.equal(effectsAt(manual, 'play', catalog['OP17-020'], [], 10)[0].type, 'manual');
  const match = new Arena(list('rocks'), list('kaido'), catalog, rules);
  match.start(false);
  const leader = match.players[0].leader;
  const power = match.power(leader);
  match.manual('power', 0, leader.id, 1000);
  assert.equal(match.power(leader), power + 1000);
  assert.match(match.log.at(-1).text, /Ajuste de práctica/);
  match.endTurn();
  assert.equal(match.power(leader), power);
});

test('el cálculo exacto exige dos copias físicas si A y B se superponen', () => {
  const order = [...Array(49).fill('OP17-049'), 'OP17-050'];
  const target = new Set(['OP17-050']);
  assert.equal(exactOpening(order, catalog, target, target, false), 0);
  order[0] = 'OP17-050';
  const chance = exactOpening(order, catalog, target, target, false);
  assert.ok(Math.abs(chance - 5 * 4 / (50 * 49)) < 1e-10);
  const short = simulate(list('rocks'), null, list('kaido'), catalog, rules, { horizon: 1, trials: 2 });
  assert.equal(short.horizon, 1);
  assert.equal(short.groups.first.summary[0].turns.length, 1);
});

test('la auditoría reproduce el recuento legado en el catálogo inicial', () => {
  const result = auditCatalog(catalog, rules);
  assert.deepEqual([result.leaders, result.pairs, result.compatible, result.direct, result.analyzed, result.locked],
    [97, 3974790, 1869210, 59001, 2212, 124]);
});

test('las referencias de torneo conservan procedencia y cantidades', () => {
  const deck = list('rocks');
  const toRecord = (code, count) => { const [set, number] = code.split('-'); return { set, number, count }; };
  const entry = { placing: 1, decklist: { leader: toRecord(deck.leader, 1) } };
  for (const kind of ['Character', 'Event', 'Stage']) {
    entry.decklist[kind.toLowerCase()] = Object.entries(deck.cards).filter(([code]) => catalog[code].kind === kind)
      .map(([code, n]) => toRecord(code, n));
  }
  const [result] = tournamentEntries({ id: '6af73f74ee43ef7891473606', name: 'Prueba', date: '2026-11-19', players: 16 }, [entry], catalog);
  assert.equal(result.rank, 1);
  assert.deepEqual(parseDeck(result.text, catalog), deck);
});
