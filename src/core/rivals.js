import { matchup } from './analysis.js';
import { checkDeck, deckText, parseDeck } from './deck.js';

export function rivalLists(examples, tournaments, versions, catalog, rules) {
  const lists = [
    ...examples.map(item => ({ ...item, origin: 'Mazo de ejemplo' })),
    ...versions.map(item => ({ ...item, origin: 'Mi biblioteca' })),
    ...tournaments.map(item => ({ ...item, origin: 'Lista pública de torneo' }))
  ];
  const seen = new Set();
  const result = [];
  for (const item of lists) {
    let deck = item.deck;
    if (!deck) {
      try { deck = parseDeck(item.text, catalog); }
      catch { continue; }
    }
    if (checkDeck(deck, catalog, rules).length) continue;
    const text = deckText(deck, true);
    if (seen.has(text)) continue;
    seen.add(text);
    const plan = matchup(deck, catalog);
    result.push({ deck, name: item.title || item.name || catalog[deck.leader].name,
      origin: item.origin, reason: plan.notes[0], weights: plan.weights });
  }
  return result;
}

export function suggestedRivals(lists, own, catalog) {
  const ownWeights = own ? matchup(own, catalog).weights : {};
  // Pressure gives a ramp list a useful drill. Heavy lists can practice against cost-inflating opponents.
  const practice = ownWeights.early ? 'small_answer' : ownWeights.interaction && !ownWeights.small_answer ? 'power_control' :
    ownWeights.power_control ? 'interaction' : 'early';
  const priority = [...lists].sort((a, b) => (b.weights[practice] ?? 0) - (a.weights[practice] ?? 0));
  const leaders = new Set([own?.leader]);
  return priority.filter(item => {
    if (leaders.has(item.deck.leader)) return false;
    leaders.add(item.deck.leader);
    return true;
  }).slice(0, 4);
}
