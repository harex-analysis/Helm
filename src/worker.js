import { parentPort, workerData } from 'node:worker_threads';
import { indexCards } from './core/deck.js';
import { optimize } from './core/optimizer.js';
import { simulate } from './core/simulation.js';
import { syncCatalog } from './core/catalog-sync.js';
import { auditCatalog } from './core/audit.js';
import { refreshTournaments } from './core/tournaments.js';
import { proposalEvidence } from './core/evidence.js';
import { analyzeDeck, deckMetrics, hitChance, linkLabel } from './core/analysis.js';

try {
  const { operation, snapshot, payload } = workerData;
  const rules = { day: payload.day, overrides: snapshot.overrides };
  const catalog = indexCards(snapshot);
  const progress = message => parentPort.postMessage({ progress: message });
  let result;
  if (operation === 'optimize') {
    progress('Optimización · Resolviendo variantes con HiGHS…');
    result = await optimize(payload.base, catalog, rules, payload.options);
    progress('Optimización · Verificando la función objetivo y comparando manos…');
    for (const item of result) {
      item.evidence = proposalEvidence(payload.base, item.deck, catalog, rules);
      if (!payload.options?.recommendation) continue;
      const ability = analyzeDeck(item.deck, catalog);
      const stats = deckMetrics(item.deck, catalog);
      item.plan = {
        opening: [hitChance(stats.roles.early_first ?? 0, 5), hitChance(stats.roles.early ?? 0, 6)],
        links: ability.links.filter(link => link.source === item.deck.leader && link.targetCopies)
          .slice(0, 3).map(link => ({ label: linkLabel(link), copies: link.targetCopies, probability: link.probability })),
        packages: ability.buckets.filter(bucket => bucket.count > 0)
          .sort((a, b) => b.weight - a.weight).slice(0, 2).map(({ name, count }) => ({ name, count }))
      };
    }
  }
  if (operation === 'simulate') result = simulate(payload.base, payload.variant, payload.rival, catalog, rules, payload.options);
  if (operation === 'catalog') result = await syncCatalog(snapshot, progress);
  if (operation === 'audit') result = auditCatalog(catalog, rules, progress);
  if (operation === 'tournaments') result = await refreshTournaments(catalog, progress);
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error.message || String(error) });
}
