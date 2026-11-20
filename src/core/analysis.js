import { cardIssue, changedCopies, pairBanned, total } from './deck.js';

export const roleNames = {
  early: 'Salida de coste 0–2', early_first: 'Salida de coste 0–1', late: 'Remate de coste 6+',
  counter: 'Counter +2000', blocker: 'Blocker', interaction: 'Interacción', value: 'Robo o búsqueda',
  small_answer: 'Respuesta temprana', power_control: 'Reducción de poder', rush: 'Rush', trigger: 'Trigger'
};
const mechanicNames = { search: 'búsqueda', draw: 'robo', ramp: 'aceleración de DON!!', don_return: 'devolución de DON!!',
  don_attach: 'asignación de DON!!', recursion: 'recuperación del descarte', life: 'manipulación de Vida', self_mill: 'envío al descarte',
  hand_cost: 'descarte como coste', hand_pressure: 'presión sobre la mano', cost_control: 'reducción de coste',
  power_control: 'reducción de poder', cost_removal: 'retirada por coste', power_removal: 'retirada por poder', combat: 'efecto de combate' };
export const resourceLinks = [
  ['cost_control', 'cost_removal', 'Reduce el coste para habilitar una retirada por coste'],
  ['power_control', 'power_removal', 'Reduce el poder para habilitar una retirada por poder'],
  ['self_mill', 'recursion', 'Envía cartas del mazo al descarte para recuperarlas'],
  ['hand_cost', 'recursion', 'Descarta desde la mano para habilitar recuperación'],
  ['ramp', 'don_return', 'Acelera DON!! para sostener su devolución']
];
export const normalize = text => text.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
const countIn = (deck, cards) => cards.reduce((n, code) => n + (deck.cards[code] ?? 0), 0);
const same = (left, right) => left.toLowerCase() === right.toLowerCase();
const overlaps = (left, right) => left.some(value => right.includes(value));
const identities = card => [normalize(card.name), ...(card.effects?.aliases ?? [])];

function traitTests(filter, card) {
  const traits = card.traits.map(trait => trait.toLowerCase());
  return [
    ...(filter.traits ?? []).map(type => traits.includes(type.toLowerCase())),
    ...(filter.includes ?? []).map(text => traits.some(trait => trait.includes(text.toLowerCase())))
  ];
}

export function matchesLeader(filter, leader) {
  if (filter.alternatives?.length) return filter.alternatives.some(item => matchesLeader(item, leader));
  if (filter.multicolor) return leader.colors.length > 1;
  if (filter.attribute) return same(filter.attribute, leader.attribute);
  return overlaps(filter.names ?? [], identities(leader)) || traitTests(filter, leader).some(Boolean);
}

export function boardCost(card, leader) {
  const effect = card.effects;
  return card.cost + (effect && (!effect.board_cost_gate || matchesLeader(effect.board_cost_gate, leader)) ? (effect.board_cost_bonus ?? 0) : 0);
}

export function matchesTarget(filter, card, fieldCost = card.cost) {
  if (filter.alternatives?.length) return filter.alternatives.some(item => matchesTarget(item, card, fieldCost));
  const cost = filter.use_printed_cost ? card.cost : fieldCost;
  if ((filter.kind && filter.kind !== card.kind) || (filter.colors?.length && !overlaps(filter.colors, card.colors)) ||
      (filter.attribute && !same(filter.attribute, card.attribute)) || (filter.trigger && !card.roles.includes('trigger')) ||
      cost < (filter.min_cost ?? 0) || cost > (filter.max_cost ?? Infinity) ||
      card.power < (filter.min_power ?? 0) || card.power > (filter.max_power ?? Infinity)) return false;
  const names = identities(card);
  if (overlaps(filter.excluded_names ?? [], names) || (filter.names?.length && !overlaps(filter.names, names))) return false;
  const tests = traitTests(filter, card);
  return !tests.length || (filter.all_traits ? tests.every(Boolean) : tests.some(Boolean));
}

const lock = leader => Boolean(leader.effects?.persistent_on_play_lock);
const mismatch = (card, leader) => card !== leader && card.effects?.gates?.length &&
  !card.effects.gates.some(gate => matchesLeader(gate, leader));

export function mechanics(card, leader) {
  if (!card.effects || mismatch(card, leader)) return [];
  if (!lock(leader)) return card.effects.mechanics;
  return [...new Set((card.effects.timed_mechanics ?? []).filter(([, timing]) => timing !== 'on_play').map(([name]) => name))];
}

export function roles(card, leader) {
  const list = new Set(card.roles);
  if (card.kind === 'Character') {
    if (card.cost <= 2) list.add('early');
    if (card.cost <= 1) list.add('early_first');
    if (card.cost >= 6) list.add('late');
  }
  if (card.counter >= 2000) list.add('counter');
  if (mechanics(card, leader).includes('power_control')) list.add('power_control');
  if (card.effects?.on_play_only && (lock(leader) || mismatch(card, leader))) {
    for (const role of ['interaction', 'small_answer', 'value', 'power_control']) list.delete(role);
  }
  return list;
}

export function relations(source, leader, pool, don) {
  if (!source.effects) return [];
  const links = [];
  for (const support of source.effects.supports) {
    if (support.leader_gate && !matchesLeader(support.leader_gate, leader)) continue;
    if (lock(leader) && support.timing === 'on_play') continue;
    const targets = pool.filter(card => card.kind !== 'Leader' && card.code !== source.code &&
      (!support.costs_don || card.cost <= don) &&
      matchesTarget(support.targets, card, support.zone === 'field' ? boardCost(card, leader) : card.cost));
    links.push({ ...support, filterKey: JSON.stringify(support.targets), source: source.code, targets: targets.map(card => card.code) });
  }
  const threshold = source.effects.requires_board_cost;
  if (threshold) {
    const targets = pool.filter(card => card.kind === 'Character' && card.code !== source.code && boardCost(card, leader) >= threshold);
    links.push({ action: 'board', source: source.code, targets: targets.map(card => card.code), minimum: 3, depth: threshold });
  }
  return links;
}

export function linkLabel(link) {
  if (link.timing === 'start' && link.action === 'play') return 'Juega al inicio';
  if (link.costs_don) return 'Despliega según DON!! en campo';
  const zone = { hand: 'la mano', trash: 'el descarte', 'hand or trash': 'la mano o el descarte', deck: 'el mazo', 'life card': 'Vida', 'life cards': 'Vida' }[link.zone];
  if (link.action === 'play' && zone) return 'Despliega desde ' + zone;
  return { search: 'Busca en las primeras ' + link.depth, play: 'Despliega un objetivo',
    board: 'Pide coste ' + link.depth + '+ en mesa', requires: 'Pide ' + link.minimum + ' en mesa',
    buff: link.detail ? 'Concede ' + link.detail : 'Potencia en mesa', recover: 'Recupera del descarte', protect: 'Protege en mesa' }[link.action] ?? link.action;
}

export function hitChance(copies, draws, population = 50) {
  const targets = Math.min(population, Math.max(0, copies));
  let miss = 1;
  for (let i = 0; i < Math.min(draws, population); i++) {
    miss *= Math.max(0, population - targets - i) / (population - i);
  }
  return 1 - miss;
}

export function deckMetrics(deck, catalog, targets = []) {
  const curve = Array(11).fill(0);
  const kinds = { Character: 0, Event: 0, Stage: 0 };
  const roleCounts = {};
  let sumCost = 0, noCounter = 0, printedCounter = 0, targetCopies = 0;
  const leader = catalog[deck.leader];
  for (const [code, n] of Object.entries(deck.cards)) {
    const card = catalog[code];
    if (!card) continue;
    curve[Math.min(10, card.cost)] += n;
    kinds[card.kind] += n;
    sumCost += card.cost * n;
    if (!card.counter) noCounter += n;
    if (card.counter >= 2000) printedCounter += n;
    for (const role of roles(card, leader)) roleCounts[role] = (roleCounts[role] ?? 0) + n;
    if (targets.length ? targets.includes(code) : card.kind === 'Character' && card.cost <= 2) targetCopies += n;
  }
  const count = total(deck);
  const probability = hitChance(targetCopies, 5);
  return { count, curve, kinds, roles: roleCounts, noCounter, printedCounter, targetCopies, probability,
    redrawProbability: 1 - (1 - probability) ** 2, average: count ? sumCost / count : 0 };
}

export function strategy(leader, pool) {
  const buckets = [];
  const add = (name, predicate, cap, weight) => {
    const codes = pool.filter(predicate).map(card => card.code);
    if (codes.length) buckets.push({ name, codes, cap, weight });
  };
  if (leader.code === 'OP17-079') {
    add('Activadores baratos de coste 12+ en mesa', card => card.kind === 'Character' && card.cost <= 2 && boardCost(card, leader) >= 12, 8, 23);
    add('Apoyos Elbaph de coste 12+', card => card.effects?.requires_board_cost === 12 && card.traits.includes('Elbaph'), 14, 5);
  }
  if (leader.code === 'OP17-058') {
    add('Aceleradores de DON!! de Kaido', card => ['EB04-032', 'OP17-073', 'OP17-074'].includes(card.code), 11, 20);
    add('Remates de Kaido de coste 10', card => ['OP17-062', 'OP17-063'].includes(card.code), 6, 16);
  }
  if (leader.code === 'OP13-079') {
    const stages = relations(leader, leader, pool, 10).filter(link => link.timing === 'start' && link.action === 'play').flatMap(link => link.targets);
    add('Escenario para el inicio de Imu', card => stages.includes(card.code), 1, 65);
  }
  const leaderMechanics = mechanics(leader, leader);
  for (const [enabler, payoff, label] of resourceLinks) {
    if (leaderMechanics.includes(payoff)) add(label, card => mechanics(card, leader).includes(enabler), 7, 4);
    if (leaderMechanics.includes(enabler)) add(label, card => mechanics(card, leader).includes(payoff), 7, 4);
  }
  add('Condición de líder compatible', card => card.effects?.gates?.some(gate => matchesLeader(gate, leader)), 12, 3);
  return buckets;
}

export function analyzeDeck(deck, catalog) {
  const leader = catalog[deck.leader];
  const pool = Object.keys(deck.cards).map(code => catalog[code]);
  const links = [leader, ...pool].flatMap(card => relations(card, leader, pool, deck.don)).map(link => {
    const targetCopies = countIn(deck, link.targets);
    return { ...link, targetCopies, probability: link.action === 'search' ? hitChance(targetCopies, link.depth, link.source === deck.leader ? 50 : 49) : null };
  });
  const buckets = strategy(leader, pool).map(bucket => ({ ...bucket, count: countIn(deck, bucket.codes) }));
  const resources = resourceLinks.flatMap(([a, b, label]) => {
    const left = pool.filter(card => mechanics(card, leader).includes(a));
    const right = pool.filter(card => mechanics(card, leader).includes(b));
    return left.some(card => right.some(other => card !== other)) ? [{ label, left: left.map(card => card.code), right: right.map(card => card.code) }] : [];
  });
  return { links, buckets, resources, cautions: pool.flatMap(card => [
    ...(mismatch(card, leader) ? [card.name + ' tiene una condición de líder sin coincidencia.'] : []),
    ...(lock(leader) && card.effects?.activation?.includes('on_play') ? [leader.name + ' anula Al jugar de ' + card.name + '.'] : []),
    ...(card.effects?.pending_search ? ['La búsqueda de ' + card.name + ' requiere revisión.'] : [])
  ]) };
}

export function inspectPair(leader, a, b, rules, don) {
  const issues = [leader, a, b].flatMap(card => {
    const issue = cardIssue(card, card.code === leader.code ? null : leader, rules.day, rules.overrides);
    return issue ? [card.code + ' · ' + issue] : [];
  });
  if (a.code === b.code && a.code === leader.code) issues.push('Incluye una sola copia del líder.');
  if (pairBanned(a.code, b.code, rules.day)) issues.push(a.code + ' y ' + b.code + ' · pareja prohibida');
  const links = [[a, b], [b, a]].flatMap(([source, target]) => {
    const direct = relations(source, leader, [target], don).filter(link => link.targets.length)
      .map(link => source.name + ' → ' + target.name + ' · ' + linkLabel(link));
    const support = resourceLinks.filter(([from, to]) => source !== target &&
      mechanics(source, leader).includes(from) && mechanics(target, leader).includes(to))
      .map(([, , label]) => source.name + ' → ' + target.name + ' · ' + label);
    return [...direct, ...support];
  });
  const cautions = [[a, b], [b, a], [leader, a], [leader, b]].flatMap(([source, target]) => {
    if (source === target) return [];
    const effect = source.effects;
    const notes = [];
    if (effect?.own_on_play_lock && target.effects?.activation?.includes('on_play')) notes.push(source.name + ' puede anular Al jugar de ' + target.name + '.');
    if (overlaps(effect?.singleton ?? [], identities(target))) notes.push(source.name + ' comprueba que no haya otro ' + target.name + ' en mesa.');
    for (const limit of effect?.play_limits ?? []) {
      if (limit.timing === 'on_play' && lock(leader)) continue;
      if (target.kind !== 'Leader' && (!limit.characters_only || target.kind === 'Character') && target.cost >= limit.min_printed_cost) {
        notes.push('Si se resuelve el límite de ' + source.name + ', jugar ' + target.name + (limit.hand_only ? ' desde la mano' : '') + ' queda restringido ese turno.');
      }
    }
    return notes;
  });
  for (const card of [a, b]) if (mismatch(card, leader)) cautions.push(card.name + ' contiene una condición que no coincide con el líder.');
  return { issues: [...new Set(issues)], links: [...new Set(links)], cautions: [...new Set(cautions)] };
}

export function matchup(rival, catalog) {
  const leader = catalog[rival.leader];
  const cards = Object.entries(rival.cards);
  const copies = predicate => cards.reduce((n, [code, count]) => n + (predicate(catalog[code]) ? count : 0), 0);
  const early = copies(card => card.kind === 'Character' && card.cost <= 3);
  const late = copies(card => card.kind === 'Character' && card.cost >= 6);
  const ramp = copies(card => mechanics(card, leader).includes('ramp'));
  const inflated = copies(card => boardCost(card, leader) - card.cost >= 3);
  const weights = {}, notes = [];
  if (inflated >= 4 || (!cards.length && leader.code === 'OP17-079')) {
    weights.power_control = 18;
    notes.push('Prioriza reducir poder frente a personajes con coste elevado en mesa.');
  }
  if ((ramp >= 5 && late >= 6) || (!cards.length && leader.code === 'OP17-058')) {
    weights.early = 16;
    notes.push('Despliega presión temprana antes de que la aceleración adelante los remates.');
  }
  if (early >= 12) {
    weights.small_answer = 14;
    notes.push('Valora respuestas a sus ' + early + ' personajes de coste 0–3.');
  }
  if (late >= 12) {
    weights.interaction = 12;
    notes.push('Valora interacción frente a ' + late + ' personajes de coste 6+.');
  }
  const onPlayRisk = Boolean(leader.effects?.opponent_on_play_lock);
  if (onPlayRisk) {
    weights.counter = 8;
    notes.push('Favorece respuestas que puedan activarse fuera de Al jugar.');
  }
  if (!notes.length) {
    weights.counter = 12;
    notes.push('Prioriza Counter en mano frente a ' + leader.name + '.');
  }
  return { weights, notes, onPlayRisk };
}

export function editContext(base, options, catalog) {
  const leader = catalog[base.leader];
  const pool = [...new Set([...Object.keys(base.cards), ...options])].map(code => catalog[code]);
  const sources = [leader, ...Object.keys(base.cards).map(code => catalog[code])];
  const searches = sources.flatMap(source => relations(source, leader, pool, base.don)).filter(link => link.action === 'search');
  const tags = card => new Set([...roles(card, leader), ...mechanics(card, leader)]);
  const labels = entries => entries.slice(0, 5).map(key => roleNames[key] ?? mechanicNames[key] ?? key).join(', ');
  const describe = (left, right) => {
    const removed = left ? tags(catalog[left]) : new Set(), added = right ? tags(catalog[right]) : new Set();
    const out = [...removed].filter(tag => !added.has(tag)), gain = [...added].filter(tag => !removed.has(tag));
    const loss = [...new Set(searches.filter(link => link.targets.includes(left) && !link.targets.includes(right)).map(link => catalog[link.source].name))];
    const wins = [...new Set(searches.filter(link => link.targets.includes(right) && !link.targets.includes(left)).map(link => catalog[link.source].name))];
    const notes = [];
    if (left && right && catalog[left].cost !== catalog[right].cost) notes.push('Coste ' + catalog[left].cost + ' → ' + catalog[right].cost);
    if (gain.length) notes.push('Gana ' + labels(gain));
    if (out.length) notes.push('Cede ' + labels(out));
    if (wins.length) notes.push('Objetivo de ' + wins.slice(0, 3).join(', '));
    if (loss.length) notes.push('Sale de la búsqueda de ' + loss.slice(0, 3).join(', '));
    if (!notes.length) notes.push('Conserva las funciones y búsquedas detectadas.');
    return notes.join(' · ');
  };
  const similarity = (left, right) => {
    const a = catalog[left], b = catalog[right];
    const tagsB = tags(b);
    const overlap = [...tags(a)].filter(tag => tagsB.has(tag)).length;
    const same = searches.filter(link => link.targets.includes(left) && link.targets.includes(right)).length;
    const lost = searches.filter(link => link.targets.includes(left) && !link.targets.includes(right)).length;
    return overlap * 5 + same * 4 - lost * 3 - 2 * Math.abs(a.cost - b.cost) + 5 * Number(a.kind === b.kind);
  };
  return { describe, similarity };
}

export function explainChanges(base, variant, catalog) {
  const diff = changedCopies(base, variant);
  const expand = entries => entries.flatMap(({ code, copies }) => Array(copies).fill(code));
  const incoming = expand(diff.added);
  const context = editContext(base, [...Object.keys(variant.cards)], catalog);
  const swaps = [];
  for (const from of expand(diff.removed)) {
    if (!incoming.length) { swaps.push({ from, to: null, description: context.describe(from, null) }); continue; }
    const best = [...incoming].sort((a, b) => context.similarity(from, b) - context.similarity(from, a) || a.localeCompare(b))[0];
    swaps.push({ from, to: best, description: context.describe(from, best) });
    incoming.splice(incoming.indexOf(best), 1);
  }
  return swaps.concat(incoming.map(to => ({ from: null, to, description: context.describe(null, to) })));
}
