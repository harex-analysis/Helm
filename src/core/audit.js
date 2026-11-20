import { assertDay, cardIssue, closeDon, datePairs, pairBanned } from './deck.js';
import { relations } from './analysis.js';

export function auditCatalog(catalog, rules, progress = () => {}) {
  assertDay(rules.day);
  const cards = Object.values(catalog);
  const leaders = cards.filter(card => card.kind === 'Leader' && !cardIssue(card, null, rules.day, rules.overrides));
  const main = cards.filter(card => card.kind !== 'Leader');
  const masks = Object.fromEntries(main.map(card => [card.code, 0n]));
  const direct = new Set();
  let locked = 0;
  for (const [i, leader] of leaders.entries()) {
    const mask = 1n << BigInt(i);
    const pool = main.filter(card => !cardIssue(card, leader, rules.day, rules.overrides));
    for (const card of pool) {
      masks[card.code] |= mask;
      if (leader.effects?.persistent_on_play_lock && card.effects?.activation?.includes('on_play')) locked++;
    }
    for (const source of [leader, ...pool]) {
      if (!source.effects?.supports?.length && !source.effects?.requires_board_cost) continue;
      for (const link of relations(source, leader, pool, closeDon(leader))) for (const code of link.targets) {
        if (!pairBanned(source.code, code, rules.day)) direct.add(source.code + '/' + code + '/' + link.action);
      }
    }
    if ((i + 1) % 10 === 0) progress((i + 1) + '/' + leaders.length + ' líderes revisados');
  }
  const playable = Object.values(masks).filter(Boolean);
  let compatible = 0;
  for (let i = 0; i < playable.length; i++) {
    for (let j = i + 1; j < playable.length; j++) compatible += Number(Boolean(playable[i] & playable[j]));
  }
  for (const [left, right] of datePairs(rules.day)) if ((masks[left] ?? 0n) & (masks[right] ?? 0n)) compatible--;
  const effects = cards.map(card => card.effects).filter(Boolean);
  const analyzed = effects.filter(effect => effect.mechanics?.length || effect.gates?.length || effect.supports?.length ||
    effect.requires_board_cost || effect.board_cost_bonus).length;
  const breakdown = { gates: 0, searches: 0, named: 0, pending: 0, limits: 0, locks: 0, singleton: 0 };
  for (const effect of effects) {
    breakdown.gates += Number(Boolean(effect.gates?.length));
    breakdown.searches += Number(effect.supports?.some(support => support.action === 'search') ?? false);
    breakdown.named += Number(effect.supports?.some(support => support.action !== 'search' && support.targets.names?.length) ?? false);
    breakdown.pending += Number(Boolean(effect.pending_search));
    breakdown.limits += Number(Boolean(effect.play_limits?.length));
    breakdown.locks += Number(Boolean(effect.own_on_play_lock));
    breakdown.singleton += Number(Boolean(effect.singleton?.length));
  }
  return { leaders: leaders.length, pairs: main.length * (main.length - 1) / 2, compatible, direct: direct.size, analyzed, locked, breakdown };
}
