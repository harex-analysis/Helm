import loadHighs from 'highs';
import { assertDay, cardIssue, changedCopies, checkDeck, closeDon, copyLimit, datePairs, deckText, total } from './deck.js';
import { deckMetrics, hitChance, matchup, mechanics, relations, resourceLinks, roles, strategy } from './analysis.js';

let solver;
const defaults = { early_first: 2.4, early: 2.2, late: 6, counter: 2.1, blocker: 6,
  interaction: 8, value: 7, small_answer: 3, power_control: 2, target: 15 };
const probabilityDraws = { early_first: 5, early: 6, counter: 5 };
const groups = { early_first: 'Salida', early: 'Salida', late: 'Remates', counter: 'Defensa', blocker: 'Defensa',
  interaction: 'Interacción', small_answer: 'Interacción', power_control: 'Interacción', value: 'Recursos', target: 'Objetivos' };
const term = (variable, coefficient = 1) => [variable, coefficient];
const evaluate = (codes, list) => codes.reduce((n, code) => n + (list.cards[code] ?? 0), 0);

function sum(terms) {
  return terms.map(([name, coefficient], i) => {
    const sign = coefficient < 0 ? '- ' : (i ? '+ ' : '');
    return sign + Math.abs(coefficient) + ' ' + name;
  }).join(' ').replace(/(.{1,180})(?: |$)/g, '$1\n  ').trimEnd();
}

function solveModel(highs, data, vars) {
  const model = highs.createModel({ format: 'lp', data });
  try {
    model.options.set('output_flag', false);
    model.options.set('time_limit', 2.5);
    model.options.set('mip_rel_gap', 0);
    model.options.set('mip_abs_gap', 0.00001);
    const { modelStatus } = model.run();
    const { optimal, timeLimit, iterationLimit, solutionLimit } = highs.constants.modelStatus;
    if (![optimal, timeLimit, iterationLimit, solutionLimit].includes(modelStatus) ||
        model.info.get('primal_solution_status') !== highs.constants.solutionStatus.feasible) return null;
    const values = model.getSolution().colValue;
    const upperBound = model.info.get('mip_dual_bound');
    const gap = model.info.get('mip_gap');
    return {
      exact: modelStatus === optimal,
      status: { [optimal]: 'Optimal', [timeLimit]: 'Time limit reached', [iterationLimit]: 'Iteration limit reached',
        [solutionLimit]: 'Solution limit reached' }[modelStatus],
      upperBound: Number.isFinite(upperBound) ? upperBound : null,
      gap: Number.isFinite(gap) ? gap : null,
      objective: model.getObjectiveValue(),
      copies: Object.fromEntries(Object.entries(vars).map(([code, name]) => [code, values[model.getColByName(name)]]))
    };
  } finally {
    model.dispose();
  }
}

export async function optimize(base, catalog, rules, options = {}) {
  assertDay(rules.day);
  const { owned = null, fixed = [], targets = [], maxChanges = 8, repair = false, rival = null,
    synergy = true, start = 'both', minCounter = 0, recommendation = false,
    keepDraft = true, preserveStructure = true, minimums = {} } = options;
  const leader = catalog[base?.leader];
  if (leader?.kind !== 'Leader' || cardIssue(leader, null, rules.day, rules.overrides)) throw new Error('Elige un líder legal para la fecha seleccionada.');
  if (owned && !owned[leader.code]) throw new Error('Incluye el líder en tu colección.');
  if (!Number.isInteger(maxChanges) || maxChanges < 0 || maxChanges > 50) throw new Error('El máximo debe estar entre 0 y 50 cambios.');
  if (!Number.isInteger(minCounter) || minCounter < 0 || minCounter > 50) throw new Error('El mínimo de Counter +2000 debe estar entre 0 y 50.');
  const count = total(base);
  const draftIssues = checkDeck(base, catalog, rules, { draft: true, owned });
  if (!repair && draftIssues.length) throw new Error(draftIssues.join('\n'));
  const baselineLegal = count === 50 && !draftIssues.length;
  const stats = deckMetrics(base, catalog);
  if (baselineLegal && stats.printedCounter + maxChanges < minCounter) {
    throw new Error('El mínimo de Counter +2000 excede lo que puedes añadir con el límite de cambios.');
  }
  const pool = Object.values(catalog).filter(card => !cardIssue(card, leader, rules.day, rules.overrides) && (!owned || owned[card.code] > 0));
  const limits = Object.fromEntries(pool.map(card => [card.code, Math.min(copyLimit(card), owned?.[card.code] ?? 50)]));
  if (Object.values(limits).reduce((a, b) => a + b, 0) < 50) throw new Error('Hay menos de 50 copias elegibles en el catálogo o tu colección.');
  for (const code of fixed) {
    if (!base.cards[code] || base.cards[code] > (limits[code] ?? 0)) throw new Error('La cantidad fijada de ' + code + ' no se puede conservar.');
  }
  if (targets.some(code => !limits[code]) && !repair) throw new Error('Revisa las cartas objetivo. Deben estar disponibles para el líder y la colección.');

  for (const [code, amount] of Object.entries(minimums)) {
    if (!Number.isInteger(amount) || amount < 1 || amount > (limits[code] ?? 0) ||
        (fixed.includes(code) && amount > base.cards[code])) {
      throw new Error('El mínimo de ' + code + ' excede las copias elegibles, disponibles o fijadas.');
    }
  }
  const baselineEligible = baselineLegal && stats.printedCounter >= minCounter &&
    Object.entries(minimums).every(([code, amount]) => (base.cards[code] ?? 0) >= amount);
  if (baselineEligible && maxChanges === 0 && !recommendation) return [];

  const columns = [], rows = [], generals = [];
  const floors = [];
  const vars = Object.fromEntries(pool.map((card, i) => [card.code, 'x' + i]));
  const row = (terms, op, value) => rows.push('r' + rows.length + ': ' + sum(terms) + ' ' + op + ' ' + value);
  const bounded = (name, max, min = 0, integer = false) => {
    columns.push(min + ' <= ' + name + ' <= ' + max);
    if (integer) generals.push(name);
    return name;
  };
  const selection = codes => codes.map(code => term(vars[code]));
  const protect = (codes, minimum) => {
    if (!codes.length) return;
    row(selection(codes), '>=', minimum);
    floors.push({ codes, minimum });
  };
  for (const card of pool) {
    const code = card.code;
    const existing = base.cards[code] ?? 0;
    const retained = fixed.includes(code) || (count < 50 && !repair && keepDraft) ? existing : 0;
    bounded(vars[code], fixed.includes(code) ? existing : limits[code], Math.max(retained, minimums[code] ?? 0), true);
  }
  if (minCounter) {
    const counters = pool.filter(card => card.counter >= 2000).map(card => card.code);
    if (counters.reduce((n, code) => n + limits[code], 0) < minCounter) {
      throw new Error('El catálogo o la colección tienen menos Counter +2000 elegibles que el mínimo pedido.');
    }
    protect(counters, minCounter);
  }
  row(selection(Object.keys(vars)), '=', 50);
  for (const [a, b] of datePairs(rules.day)) {
    if (!vars[a] || !vars[b]) continue;
    const flag = bounded('p' + rows.length, 1, 0, true);
    row([term(vars[a]), term(flag, -limits[a])], '<=', 0);
    row([term(vars[b]), term(flag, limits[b])], '<=', limits[b]);
  }
  const additions = [];
  for (const { code } of pool) {
    const old = base.cards[code] ?? 0;
    if (!old) additions.push(vars[code]);
    else if (old < limits[code]) {
      const extra = bounded('a' + vars[code], limits[code] - old);
      row([term(vars[code]), term(extra, -1)], '<=', old);
      additions.push(extra);
    }
  }
  if (count >= 50 && additions.length) row(additions.map(name => term(name)), '<=', maxChanges);
  if (count === 50 && !repair && preserveStructure) {
    for (const [kind, copies] of Object.entries(stats.kinds)) {
      const list = pool.filter(card => card.kind === kind).map(card => card.code);
      if (copies > 2) protect(list, copies - 2);
    }
  }

  const terms = [], caps = { early_first: 50, early: 50, late: 9, counter: 50, blocker: 8,
    interaction: 10, value: 10, small_answer: 9, power_control: 9, target: 10 };
  const registeredRoles = Object.fromEntries(pool.map(card => [card.code, roles(card, leader)]));
  function capped(codes, limit, weight, role = '', group = 'Sinergias') {
    if (!codes.length) return;
    const name = bounded('c' + rows.length, limit);
    row([term(name), ...selection(codes).map(([v]) => term(v, -1))], '<=', 0);
    terms.push({ name, weight, role, group: groups[role] ?? group, evaluate: deck => Math.min(limit, evaluate(codes, deck)) });
  }
  for (const [role, cap] of Object.entries(caps)) {
    const codes = pool.filter(card => role === 'target' ? targets.includes(card.code) :
      role === 'counter' ? card.counter >= 2000 : registeredRoles[card.code].has(role)).map(card => card.code);
    if (!codes.length) continue;
    const draws = probabilityDraws[role];
    if (!draws) { capped(codes, cap, defaults[role], role); continue; }
    const countName = bounded('q' + rows.length, 50);
    const chance = bounded('h' + rows.length, 100);
    row([term(countName), ...selection(codes).map(([name]) => term(name, -1))], '=', 0);
    const percent = n => 100 * hitChance(n, draws);
    // The hypergeometric hit probability is concave in the number of copies.
    // The minimum of the secant extensions equals the function at integer counts.
    for (let n = 0; n < 50; n++) {
      const slope = percent(n + 1) - percent(n);
      row([term(chance), term(countName, -slope)], '<=', percent(n) - slope * n);
    }
    terms.push({ name: chance, weight: defaults[role], role, group: groups[role], evaluate: deck => percent(evaluate(codes, deck)) });
  }
  const tribal = pool.filter(card => card.traits.some(type => leader.traits.includes(type))).map(card => card.code);
  capped(tribal, 26, 3, '', 'Afinidad');
  if (baselineLegal && !repair && preserveStructure) {
    const mainTrait = leader.traits.map(trait => {
      const same = pool.filter(card => card.traits.includes(trait)).map(card => card.code);
      return { same, qty: evaluate(same, base) };
    }).sort((a, b) => b.qty - a.qty)[0];
    if (mainTrait?.qty >= 20) protect(mainTrait.same, mainTrait.qty - 2);
  }

  if (synergy) {
    for (const bucket of strategy(leader, pool)) capped(bucket.codes, bucket.cap, bucket.weight);
    const priority = new Set([...Object.keys(base.cards), ...targets, ...tribal]);
    const priorityPool = pool.filter(card => priority.has(card.code));
    // All eligible cards remain selectable. Score the deck's likely sources as well as the leader.
    for (const source of [leader, ...priorityPool]) {
      for (const link of relations(source, leader, pool, closeDon(leader))) {
        const required = link.action === 'search'
          ? Math.max(1, Array.from({ length: 50 }, (_, i) => i + 1).find(n => hitChance(n, link.depth, source === leader ? 50 : 49) >= 0.65) ?? 50)
          : (link.minimum || 1);
        if (link.targets.reduce((n, code) => n + limits[code], 0) < required) continue;
        // Fractional credit below the target density keeps the MIP tractable on large catalogs.
        const name = bounded('s' + rows.length, 1);
        if (source !== leader) row([term(name), term(vars[source.code], -1)], '<=', 0);
        row([term(name, required), ...selection(link.targets).map(([v]) => term(v, -1))], '<=', 0);
        terms.push({ name, group: 'Sinergias', weight: source === leader ? 22 : (link.timing === 'start' ? 20 : 6),
          evaluate: deck => source === leader || deck.cards[source.code] ? Math.min(1, evaluate(link.targets, deck) / required) : 0 });
        if (source === leader && link.action === 'requires' && link.zone === 'field' && required > 1) {
          capped(link.targets.filter(code => catalog[code].kind === 'Character' && catalog[code].cost <= 3), Math.min(24, 6 * required), 5);
        }
        if (link.costs_don && (source === leader || source.kind === 'Stage')) {
          const early = link.targets.filter(code => catalog[code].cost <= 7);
          if (source === leader) capped(early, 8, 7);
          else if (early.length) {
            const planTag = bounded('e' + rows.length, 8);
            row([term(planTag), term(vars[source.code], -8)], '<=', 0);
            row([term(planTag), ...selection(early).map(([v]) => term(v, -1))], '<=', 0);
            terms.push({ name: planTag, group: 'Sinergias', weight: 12, evaluate: deck => deck.cards[source.code] ? Math.min(8, evaluate(early, deck)) : 0 });
          }
        }
      }
    }
    for (const [from, to] of resourceLinks) {
      const left = priorityPool.filter(card => mechanics(card, leader).includes(from)).map(card => card.code);
      const right = priorityPool.filter(card => !left.includes(card.code) && mechanics(card, leader).includes(to)).map(card => card.code);
      if (!left.length || !right.length) continue;
      const name = bounded('m' + rows.length, 5);
      for (const side of [left, right]) row([term(name), ...selection(side).map(([v]) => term(v, -1))], '<=', 0);
      terms.push({ name, group: 'Sinergias', weight: 4, evaluate: deck => Math.min(5, evaluate(left, deck), evaluate(right, deck)) });
    }
  }
  const profiles = [
    { name: recommendation ? 'Plan del líder' : 'Equilibrado',
      description: recommendation ? 'Combina la curva, el Counter y los efectos interpretados de ' + leader.name + '.'
        : 'Curva, Counter y objetivos válidos para el líder.', extra: {}, primary: recommendation },
    { name: 'Salida temprana', description: 'Prioriza ver personajes que puedes jugar con uno o dos DON!!.', extra: { early_first: start === 'second' ? 0 : 2.0, early: start === 'first' ? 0.5 : 2.0, value: 4 } },
    { name: 'Defensa', description: 'Prioriza ver Counter +2000 y disponer de Blocker.', extra: { counter: 2.6, blocker: 16 } }
  ];
  if (rival && catalog[rival.leader]) {
    const plan = matchup(rival, catalog);
    const extra = Object.fromEntries(Object.entries(plan.weights).map(([role, value]) => [role, probabilityDraws[role] ? value / 8 : value]));
    profiles.splice(recommendation ? 1 : 0, 0,
      { name: 'Contra ' + catalog[rival.leader].name, description: plan.notes.join(' '), extra, onPlayRisk: plan.onPlayRisk });
  }
  const requested = repair ? [{ name: 'Reparación', description: 'Prioriza conservar copias dentro de las reglas y el límite de cambios.', extra: {}, primary: recommendation }] : profiles;
  solver ??= loadHighs();
  const highs = await solver;
  const proposals = [], seen = new Set([deckText(base, true)]);
  const risk = pool.filter(card => card.effects?.on_play_only &&
    ['interaction', 'small_answer', 'value', 'power_control'].some(role => registeredRoles[card.code].has(role))).map(card => card.code);
  const affinityOrder = start === 'first' ? 0.7 : start === 'second' ? -1.2 : 0;
  for (const profile of requested) {
    const weight = item => item.weight + (profile.extra[item.role] ?? 0) + (item.role === 'early_first' ? affinityOrder : 0);
    const penalty = repair ? 100_000 : recommendation ? 0 : 5;
    const objective = terms.map(item => term(item.name, weight(item)));
    if (count) objective.push(...additions.map(name => term(name, -penalty)));
    if (profile.onPlayRisk) objective.push(...risk.map(code => term(vars[code], -10)));
    if (!objective.length) objective.push(term(vars[pool[0].code], 0));
    const model = ['Maximize', ' score: ' + sum(objective), 'Subject To', ...rows, 'Bounds', ...columns,
      'Generals', generals.join(' ').replace(/(.{1,180})(?: |$)/g, '$1\n'), 'End'].join('\n');
    const solution = solveModel(highs, model, vars);
    if (!solution) continue;
    const copies = {};
    let integral = true;
    for (const card of pool) {
      const primal = solution.copies[card.code];
      if (!Number.isFinite(primal) || Math.abs(primal - Math.round(primal)) > 1e-5) integral = false;
      else if (primal >= 0.5) copies[card.code] = Math.round(primal);
    }
    const deck = { leader: leader.code, don: closeDon(leader), cards: copies };
    const errors = checkDeck(deck, catalog, rules, { owned });
    const changes = changedCopies(base, deck);
    if (!integral || errors.length || floors.some(floor => evaluate(floor.codes, deck) < floor.minimum) ||
        (count >= 50 && changes.count > maxChanges) ||
        fixed.some(code => copies[code] !== base.cards[code]) ||
        Object.entries(minimums).some(([code, amount]) => (copies[code] ?? 0) < amount) ||
        (count < 50 && !repair && keepDraft && changes.removed.length)) continue;
    if (!profile.primary && seen.has(deckText(deck, true))) continue;
    const breakdown = list => {
      const scores = { Salida: 0, Defensa: 0, Remates: 0, Interacción: 0, Recursos: 0, Objetivos: 0, Afinidad: 0, Sinergias: 0, Ajustes: 0 };
      for (const term of terms) scores[term.group] += weight(term) * term.evaluate(list);
      scores.Ajustes -= (profile.onPlayRisk ? 10 * evaluate(risk, list) : 0) + (count ? penalty * changedCopies(base, list).count : 0);
      return scores;
    };
    const sumScores = result => Object.values(result).reduce((sum, n) => sum + n, 0);
    const baseTerms = baselineLegal && !repair ? breakdown(base) : null;
    const proposalTerms = breakdown(deck);
    const score = sumScores(proposalTerms);
    const objectiveError = Math.abs(score - solution.objective);
    if (!Number.isFinite(objectiveError) || objectiveError > Math.max(1e-4, Math.abs(score) * 1e-9)) {
      throw new Error('La propuesta no pasó la comprobación numérica de la función objetivo.');
    }
    const delta = baseTerms ? score - sumScores(baseTerms) : null;
    if (!profile.primary && baselineEligible && delta !== null && delta <= 0.00001) continue;
    const retain = Boolean(profile.primary && baselineEligible && delta !== null && delta <= 0.00001);
    const selected = retain ? base : deck;
    const selectedScore = retain ? sumScores(baseTerms) : score;
    const gap = retain && !solution.exact && solution.upperBound !== null
      ? Math.max(0, solution.upperBound - selectedScore) / Math.max(1e-12, Math.abs(selectedScore)) : solution.gap;
    seen.add(deckText(selected, true));
    proposals.push({ ...profile, deck: selected, score: selectedScore, delta: retain ? 0 : delta, exact: solution.exact,
      changes: retain ? changedCopies(base, base) : changes,
      check: { model: recommendation ? '7.0' : '4.0', status: solution.status, upperBound: solution.upperBound, gap, minCounter,
        objectiveError, candidates: pool.length, base: baseTerms, proposal: retain ? baseTerms : proposalTerms } });
  }
  if (!proposals.length && !baselineEligible) throw new Error('No se encontró una lista legal con estos límites. Revisa el máximo de cambios, el mínimo de Counter, las cantidades pedidas, las cartas fijas y la colección.');
  return proposals;
}
