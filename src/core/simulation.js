import { checkDeck } from './deck.js';
import { relations } from './analysis.js';

const ordered = cards => Object.entries(cards).sort(([a], [b]) => a.localeCompare(b));
const expand = cards => ordered(cards).flatMap(([code, n]) => Array(n).fill(code));
const remove = (array, value) => array.splice(array.indexOf(value), 1);

export function pairedOrders(base, variant) {
  const original = expand(base.cards);
  if (!variant) return [original, null];
  const remaining = { ...variant.cards };
  const additions = ordered(variant.cards).flatMap(([code, n]) => Array(Math.max(0, n - (base.cards[code] ?? 0))).fill(code));
  let next = 0;
  const revised = original.map(code => {
    if (!(remaining[code] > 0)) return additions[next++];
    remaining[code]--;
    return code;
  });
  return [original, revised];
}

export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  };
}

export function shuffle(order, random) {
  const cards = [...order];
  for (let i = cards.length - 1; i > 0; i--) {
    const index = Math.floor(random() / 0x100000000 * (i + 1));
    [cards[i], cards[index]] = [cards[index], cards[i]];
  }
  return cards;
}

export function rate(hits, n) {
  if (!n) return { value: 0, low: 0, high: 1, hits, n };
  const value = hits / n;
  const z = 1.959963984540054;
  const divisor = 1 + z ** 2 / n;
  const middle = (value + z ** 2 / (2 * n)) / divisor;
  const margin = z * Math.sqrt((value * (1 - value) + z ** 2 / (4 * n)) / n) / divisor;
  return { value, low: Math.max(0, middle - margin), high: Math.min(1, middle + margin), hits, n };
}

// Empirical Bernstein for paired outcomes D ∈ {-1,0,1}, with a two-sided union bound.
export function pairedDifference(gains, losses, n) {
  const value = n ? (gains - losses) / n : 0;
  if (n < 2) return { value, low: -1, high: 1, gains, losses, n };
  const variance = Math.max(0, (gains + losses - n * value ** 2) / (n - 1));
  const log = Math.log(4 / 0.05);
  const error = Math.sqrt(2 * variance * log / n) + 14 * log / (3 * (n - 1));
  return { value, low: Math.max(-1, value - error), high: Math.min(1, value + error), gains, losses, n };
}

function higher(left, right) {
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

export function deployment(hand, catalog, don, priority = new Set()) {
  const plans = Array((don + 1) * 6);
  plans[0] = { codes: [], score: [0, 0, 0, 0, 0] };
  let best = plans[0];
  for (const code of hand) {
    const card = catalog[code];
    if (card.kind !== 'Character' || card.cost > don) continue;
    for (let cost = don - card.cost; cost >= 0; cost--) {
      for (let size = 4; size >= 0; size--) {
        const previous = plans[cost * 6 + size];
        if (!previous) continue;
        const [needed, , power, reserve] = previous.score;
        const nextCost = cost + card.cost;
        const slot = nextCost * 6 + size + 1;
        const score = [needed + Number(priority.has(code)), nextCost, power + card.power, reserve - card.counter, size + 1];
        if (!plans[slot] || higher(score, plans[slot].score)) {
          const candidate = { score, codes: [...previous.codes, code] };
          plans[slot] = candidate;
          if (higher(score, best.score)) best = candidate;
        }
      }
    }
  }
  return best.codes;
}

const early = (catalog, code) => catalog[code].kind === 'Character' && catalog[code].cost <= 2;

function targetTest(cards, a, b, order = false) {
  if (!b.size) return cards.some(code => a.has(code));
  let seenA = false, seenB = false;
  for (const code of cards) {
    if ((seenA && b.has(code)) || (!order && seenB && a.has(code))) return true;
    seenA ||= a.has(code);
    seenB ||= b.has(code);
  }
  return false;
}

function combinations(n, k) {
  if (n < k) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return value;
}

export function exactOpening(order, catalog, a, b, redraw) {
  const counts = [0, 0, 0, 0];
  for (const code of order) {
    const inA = a.size ? a.has(code) : early(catalog, code);
    counts[Number(inA) + 2 * Number(b.has(code))]++;
  }
  const [neither, aOnly, bOnly, shared] = counts;
  const n = order.length;
  const denominator = combinations(n, 5);
  if (!denominator) return 0;
  let successes = denominator - combinations(n - aOnly - shared, 5);
  if (b.size) successes += -combinations(n - bOnly - shared, 5) + combinations(neither, 5) - shared * combinations(neither, 4);
  const chance = Math.max(0, Math.min(1, successes / denominator));
  return redraw ? 1 - (1 - chance) ** 2 : chance;
}

function makeDrill(deck, catalog, mode, a, b) {
  const leader = catalog[deck.leader];
  const pool = Object.keys(deck.cards).map(code => catalog[code]);
  const active = source => relations(source, leader, pool, deck.don);
  const searches = Object.fromEntries(['OP17-089', 'OP17-037'].filter(code => deck.cards[code]).flatMap(code => {
    const link = active(catalog[code]).find(link => link.action === 'search');
    return link ? [[code, link]] : [];
  }));
  if (mode === 'pieces' || mode === 'ordered') {
    if (!a.size || !b.size || [...a, ...b].some(code => catalog[code]?.kind !== 'Character')) throw new Error('A y B necesitan códigos de personajes.');
    return { kind: mode, label: mode === 'ordered' ? 'Jugar A antes que B' : 'Dos personajes en mesa', targets: new Set([...a, ...b]), searches };
  }
  if (mode !== 'leader') return null;
  if (leader.code === 'OP07-059') {
    const support = active(leader).find(link => link.action === 'requires');
    return { kind: 'foxy', label: 'Foxy · tres personajes en mesa y DON!! para congelar', targets: new Set(support?.targets), minimum: 3, searches };
  }
  if (leader.code === 'OP08-098') {
    const support = active(leader).find(link => link.costs_don);
    return { kind: 'kalgara', label: 'Kalgara · personaje jugable al atacar, con Vida y DON!!', targets: new Set(support?.targets), searches };
  }
  if (leader.code === 'OP13-079') {
    const stage = deck.cards['OP13-099'] ? 'OP13-099' : '';
    const support = stage ? active(catalog[stage]).find(link => link.costs_don) : null;
    return { kind: 'imu', label: 'Imu · The Empty Throne y tres DON!! activos', stage, targets: new Set(support?.targets), searches };
  }
  throw new Error('El ejercicio de líder está disponible para Foxy OP07-059, Kalgara OP08-098 e Imu OP13-079.');
}

export function trace(order, deck, catalog, options) {
  const { seed = 17, first = true, mulligan = true, reserve = false, press = false,
    a = new Set(), b = new Set(), drill = null, horizon = 5 } = options;
  const random = rng(seed);
  const pool = [...order];
  if (drill?.stage) remove(pool, drill.stage);
  const isPiece = code => drill?.targets.has(code);
  const matching = cards => {
    if (drill?.minimum) return cards.filter(isPiece).length >= drill.minimum;
    if (drill && !['pieces', 'ordered'].includes(drill.kind)) return cards.some(isPiece);
    if (!drill && !a.size && !b.size) return cards.some(code => early(catalog, code));
    return targetTest(cards, a.size ? a : new Set(cards.filter(code => early(catalog, code))), b);
  };
  const keep = cards => {
    if (drill?.kind === 'foxy') return cards.filter(code => isPiece(code) && catalog[code].cost <= 3).length >= 2;
    if (drill?.kind === 'imu' && !drill.stage) return true;
    if (['imu', 'kalgara'].includes(drill?.kind)) return cards.some(code => isPiece(code) && catalog[code].cost <= 4);
    return matching(cards);
  };
  let shuffled = shuffle(pool, random);
  const opening = shuffled.slice(0, 5);
  const changed = mulligan && !keep(opening);
  if (changed) shuffled = shuffle(pool, random);
  const hand = shuffled.slice(0, 5);
  const kept = [...hand];
  const life = catalog[deck.leader].life;
  if (!Number.isInteger(life)) throw new Error('Falta la Vida impresa del líder en el catálogo.');
  const lifeCards = shuffled.slice(5, 5 + life);
  const library = shuffled.slice(5 + life);
  const seen = [...hand], board = [], turns = [];
  let disrupted = false;
  function search(link) {
    const looked = library.splice(0, link.depth);
    const choice = looked.filter(code => link.targets.includes(code)).sort((x, y) =>
      Number(isPiece(y)) - Number(isPiece(x)) || catalog[x].cost - catalog[y].cost || catalog[y].counter - catalog[x].counter)[0];
    if (choice) {
      remove(looked, choice);
      hand.push(choice);
      seen.push(choice);
    }
    if (link.source === 'OP17-037') library.push(...looked);
    return choice;
  }
  for (let turn = 1; turn <= horizon; turn++) {
    const draw = !first || turn > 1 ? library.shift() : null;
    if (draw) {
      hand.push(draw);
      seen.push(draw);
    }
    let removed = null;
    if (press && !disrupted) {
      if (drill && turn >= 2) {
        const zone = drill.kind === 'kalgara' ? hand : board;
        removed = drill.stage || zone.find(isPiece);
        if (removed && !drill.stage) remove(zone, removed);
      } else if (!drill && turn === 3 && board.length) {
        removed = [...board].sort((x, y) => catalog[x].cost - catalog[y].cost || catalog[y].power - catalog[x].power || x.localeCompare(y))[0];
        remove(board, removed);
      }
      if (removed) disrupted = true;
    }
    const don = Math.min(deck.don, 2 * turn - Number(first));
    let active = don, ready = false;
    const special = [], found = [];
    const event = drill?.searches['OP17-037'];
    if (event && hand.includes(event.source) && catalog[event.source].cost <= active && !matching([...hand, ...board])) {
      remove(hand, event.source);
      special.push(event.source);
      active -= catalog[event.source].cost;
      found.push(search(event));
    }
    let hold;
    if (['imu', 'kalgara'].includes(drill?.kind)) {
      const imu = drill.kind === 'imu';
      const enabled = imu ? drill.stage && !disrupted && active >= 3 : turn > 1 && lifeCards.length && active >= 1;
      const target = hand.find(code => isPiece(code) && catalog[code].cost <= don);
      if (enabled && target) {
        ready = true;
        active -= imu ? 3 : 1;
        remove(hand, target);
        special.push(target);
        if (!imu) {
          const lifeCard = lifeCards.shift();
          hand.push(lifeCard);
          seen.push(lifeCard);
        }
      } else if (!imu || !disrupted) hold = target;
    }

    const isOrdered = drill?.kind === 'ordered';
    const boardReady = targetTest(board, a, b, isOrdered);
    let priority = new Set();
    if (drill?.kind === 'foxy') priority = drill.targets;
    if (['pieces', 'ordered'].includes(drill?.kind) && !boardReady) {
      const hasA = board.some(code => a.has(code));
      const hasB = board.some(code => b.has(code));
      if (isOrdered) {
        priority = hasA ? b : a;
        if (!hasA && !hand.some(code => a.has(code) && catalog[code].cost <= active)) hold = hand.find(code => b.has(code) && !a.has(code));
      } else priority = hasA && !hasB ? b : hasB && !hasA ? a : drill.targets;
    }
    const available = [...hand];
    if (hold) remove(available, hold);
    if (reserve && !hand.some(code => catalog[code].counter >= 2000 && (!available.includes(code) || catalog[code].cost > active))) {
      const defender = available.filter(code => catalog[code].counter >= 2000 && catalog[code].kind === 'Character')
        .sort((x, y) => catalog[x].power - catalog[y].power || catalog[y].cost - catalog[x].cost)[0];
      if (defender) remove(available, defender);
    }
    const normal = deployment(available, catalog, active, priority);
    if (isOrdered) normal.sort((x, y) => Number(a.has(y)) - Number(a.has(x)));
    const played = [...special.filter(code => catalog[code].kind === 'Character'), ...normal];
    const replaced = [...board].sort((x, y) => Number(Boolean(isPiece(x))) - Number(Boolean(isPiece(y))) ||
      catalog[x].power - catalog[y].power || catalog[x].cost - catalog[y].cost).slice(0, Math.max(0, board.length + played.length - 5));
    for (const code of replaced) remove(board, code);
    for (const code of normal) {
      remove(hand, code);
      if (drill?.searches[code]) found.push(search(drill.searches[code]));
    }
    board.push(...played);
    if (board.length > 5) board.splice(0, board.length - 5);
    if (drill?.kind === 'foxy') ready = turn > 1 && don >= 3 && matching(board);
    if (['pieces', 'ordered'].includes(drill?.kind)) ready = targetTest(board, a, b, isOrdered);
    const counter = hand.reduce((sum, code) => sum + catalog[code].counter, 0);
    turns.push({ draw, board: [...board], played, removed: removed ?? null, replaced, hand: [...hand], don, life: lifeCards.length,
      spent: don - active + normal.reduce((sum, code) => sum + catalog[code].cost, 0),
      counter, defensive: hand.some(code => catalog[code].counter >= 2000), targetSeen: matching(seen), ready,
      power: board.reduce((sum, code) => sum + catalog[code].power, 0), found: found.filter(Boolean), special });
  }
  return { opening, kept, changed, turns, targetMet: matching(kept) };
}

const bins = () => ({ deployment: 0, objectives: 0, defense: 0, ready: 0, disrupted: 0, don: 0, spent: 0, counter: 0 });
const pairedFields = ['deployment', 'defense'];
const differenceBin = () => ({ gains: 0, losses: 0 });
const recordPair = (entry, own, variant) => {
  if (own === variant) return;
  if (variant) entry.gains++;
  else entry.losses++;
};

export function simulate(base, variant, rival, catalog, rules, options = {}) {
  const { trials = 512, seed = 17, order = 'both', mode = 'opening', a: aCodes = [], b: bCodes = [], interruption = true, horizon = 5 } = options;
  if (!Number.isInteger(trials) || trials < 1 || trials > 20000) throw new Error('Indica de 1 a 20.000 ensayos.');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) throw new Error('Indica de 1 a 8 turnos.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Indica una semilla entera entre 0 y 4294967295.');
  if (variant && variant.leader !== base.leader) throw new Error('La comparación usa dos listas con el mismo líder.');
  for (const deck of [base, variant, rival].filter(Boolean)) {
    const issues = checkDeck(deck, catalog, rules);
    if (issues.length) throw new Error(issues.join('\n'));
  }
  if ([...aCodes, ...bCodes].some(code => !catalog[code])) throw new Error('Revisa los códigos objetivo.');
  const a = new Set(aCodes), b = new Set(bCodes);
  const random = rng(seed);
  const trialSeeds = Array.from({ length: trials }, () => [random(), random()]);
  const orders = pairedOrders(base, variant);
  const rivalOrder = rival ? expand(rival.cards) : [];
  const decks = [base, variant].filter(Boolean);
  const drills = decks.map(deck => makeDrill(deck, catalog, mode, a, b));
  const groups = {};
  for (const first of order === 'both' ? [true, false] : [order !== 'second']) {
    const totals = decks.map(() => ({ opening: 0, mulligans: 0, turns: Array.from({ length: horizon }, bins) }));
    const paired = variant ? { opening: differenceBin(), turns: Array.from({ length: horizon }, () =>
      Object.fromEntries(pairedFields.map(field => [field, differenceBin()]))) } : null;
    let replay;
    for (const [commonSeed, rivalSeed] of trialSeeds) {
      const enemy = rival ? trace(rivalOrder, rival, catalog, { seed: rivalSeed, first: !first, mulligan: options.mulligan, horizon }) : null;
      const frames = decks.map((deck, index) => {
        const opts = { seed: commonSeed, first, a, b, drill: drills[index], reserve: options.reserve, mulligan: options.mulligan, horizon };
        const press = interruption && Boolean(enemy?.turns[1]?.board.length);
        const own = trace(orders[index], deck, catalog, { ...opts, press: drills[index] ? false : press });
        const withPressure = drills[index] && interruption ? trace(orders[index], deck, catalog, { ...opts, press: true }) : own;
        const group = totals[index];
        group.opening += Number(own.targetMet);
        group.mulligans += Number(own.changed);
        for (const [i, turn] of own.turns.entries()) {
          const row = group.turns[i];
          row.deployment += Number(turn.played.length > 0);
          row.objectives += Number(turn.targetSeen);
          row.defense += Number(turn.defensive);
          row.ready += Number(turn.ready);
          row.disrupted += Number(withPressure.turns[i].ready);
          row.don = turn.don;
          row.spent += turn.spent;
          row.counter += turn.counter;
        }
        return own;
      });
      if (paired) {
        recordPair(paired.opening, frames[0].targetMet, frames[1].targetMet);
        for (let i = 0; i < horizon; i++) {
          const left = frames[0].turns[i], right = frames[1].turns[i];
          recordPair(paired.turns[i].deployment, Boolean(left.played.length), Boolean(right.played.length));
          recordPair(paired.turns[i].defense, left.defensive, right.defensive);
        }
      }
      replay ??= { lists: frames, rival: enemy };
    }
    const summary = totals.map((group, i) => ({
      opening: rate(group.opening, trials), mulligans: rate(group.mulligans, trials),
      exact: mode === 'opening' ? exactOpening(orders[i], catalog, a, b, options.mulligan ?? true) : null,
      turns: group.turns.map(row => ({
        deployment: rate(row.deployment, trials), objectives: rate(row.objectives, trials), defense: rate(row.defense, trials),
        ready: rate(row.ready, trials), disrupted: rate(row.disrupted, trials), don: row.don, spent: row.spent / trials, counter: row.counter / trials
      }))
    }));
    const finish = ({ gains, losses }) => pairedDifference(gains, losses, trials);
    const differences = paired ? { opening: finish(paired.opening), turns: paired.turns.map(row =>
      Object.fromEntries(pairedFields.map(field => [field, finish(row[field])]))) } : null;
    groups[first ? 'first' : 'second'] = { summary, replay, differences };
  }
  return { groups, trials, seed, horizon, drill: drills[0]?.label ?? '', leaders: [...decks.map(deck => deck.leader), ...(rival ? [rival.leader] : [])] };
}
