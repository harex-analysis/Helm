import { readFileSync } from 'node:fs';
import { checkDeck, deckText, indexCards, parseDeck, changedCopies } from '../src/core/deck.js';
import { optimize } from '../src/core/optimizer.js';
import { proposalEvidence } from '../src/core/evidence.js';

const read = file => JSON.parse(readFileSync(new URL('../data/' + file + '.json', import.meta.url), 'utf8'));
const snapshot = read('catalog');
const catalog = indexCards(snapshot);
const rules = { day: snapshot.checked, overrides: snapshot.overrides };
const examples = read('examples').map(({ text, source }) => ({ deck: parseDeck(text, catalog), source, group: 'Ejemplo' }));
const known = new Set(examples.map(row => row.deck.leader));
const references = [];
for (const item of read('recommended_decks')) {
  if (known.has(item.leader)) continue;
  try {
    const deck = parseDeck(item.text, catalog);
    if (checkDeck(deck, catalog, rules).length) continue;
    known.add(deck.leader);
    references.push({ deck, source: item.source, group: 'Torneo adicional' });
    if (references.length === 8) break;
  } catch {}
}
const recommendation = process.argv.includes('--helm');
const maxChanges = recommendation ? 50 : 8;
const results = [];
for (const { deck, source, group } of [...examples, ...references]) {
  const proposals = await optimize(deck, catalog, rules, { maxChanges, recommendation, preserveStructure: !recommendation });
  for (const proposal of proposals) {
    if (changedCopies(deck, proposal.deck).count > maxChanges || checkDeck(proposal.deck, catalog, rules).length ||
        deckText(parseDeck(deckText(proposal.deck), catalog)) !== deckText(proposal.deck) ||
        (proposal.check.upperBound !== null && proposal.check.upperBound + 1e-5 < proposal.score) ||
        (proposal.exact && Math.abs(proposal.check.upperBound - proposal.score) > 1e-4)) {
      throw new Error('Falló la validación de ' + deck.leader + ' · ' + proposal.name);
    }
  }
  const item = proposals[0];
  if (!item) { results.push({ code: deck.leader, group, source, profiles: 0 }); continue; }
  const report = proposalEvidence(deck, item.deck, catalog, rules, { trials: 3000, seed: 916407 });
  const first = report.metrics.first;
  const second = report.metrics.second;
  const absError = Math.max(...[first.turnOne, second.turnOne].flatMap(turn =>
    turn.sample.map((row, i) => Math.abs(row.value - turn.exact[i]))));
  results.push({ code: deck.leader, leader: catalog[deck.leader].name, source, group, profiles: proposals.length,
    exact: proposals.filter(p => p.exact).length, maxObjectiveError: Math.max(...proposals.map(p => p.check.objectiveError)),
    maxGap: proposals.every(p => p.check.gap !== null) ? Math.max(...proposals.map(p => p.check.gap)) : null,
    changes: item.changes.count, first: first.turnOne.exact, second: second.turnOne.exact, defense: first.defense.sample.map(row => row.value),
    defenseInterval: [first.defense.delta.low, first.defense.delta.high], absError });
}
console.log(JSON.stringify({ date: rules.day, maxChanges, recommendation, trials: 3000, seed: 916407, results }, null, 2));
