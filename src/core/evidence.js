import { deckMetrics, hitChance } from './analysis.js';
import { checkDeck } from './deck.js';
import { simulate } from './simulation.js';

export const evidenceSetup = { seed: 428531, trials: 2400, horizon: 3, order: 'both', mulligan: false, reserve: false, interruption: false };

export function proposalEvidence(base, variant, catalog, rules, options = {}) {
  if (checkDeck(base, catalog, rules).length || checkDeck(variant, catalog, rules).length || base.leader !== variant.leader) return null;
  const setup = { ...evidenceSetup, ...options, order: 'both', horizon: 3, mulligan: false, interruption: false, reserve: false };
  const report = simulate(base, variant, null, catalog, rules, setup);
  const [left, right] = [base, variant].map(deck => deckMetrics(deck, catalog));
  const metrics = {};
  for (const [label, draws, role] of [['first', 5, 'early_first'], ['second', 6, 'early']]) {
    const { summary, differences } = report.groups[label];
    const exact = [left, right].map(stats => hitChance(stats.roles[role] ?? 0, draws));
    metrics[label] = {
      turnOne: { exact, sample: summary.map(row => row.turns[0].deployment), delta: differences.turns[0].deployment },
      defense: { sample: summary.map(row => row.turns[2].defense), delta: differences.turns[2].defense }
    };
  }
  return {
    seed: setup.seed, trials: setup.trials, metrics,
    counterPrinted: [left, right].map(stats => hitChance(stats.printedCounter, 5)),
    specialStart: Boolean(catalog[base.leader].special_start)
  };
}
