export const FIRST_DAY = '2026-11-19';
export const LAST_DAY = '2027-03-31';
export const EXTRA_PAIRS_DAY = '2026-11-27';
export const BANS = ['OP06-047', 'OP03-040', 'OP06-086', 'ST10-001', 'OP06-116', 'OP14-020'];
export const PAIRS = [['OP07-115', 'EB04-058'], ['OP11-040', 'OP11-067'], ['OP11-040', 'OP08-069']];
export const EXTRA_PAIRS = [['EB05-001', 'OP13-001'], ['EB05-001', 'OP01-002']];
export const COLORS = { Red: 'Rojo', Green: 'Verde', Blue: 'Azul', Purple: 'Morado', Black: 'Negro', Yellow: 'Amarillo' };
export const KINDS = { Leader: 'Líder', Character: 'Personaje', Event: 'Evento', Stage: 'Escenario' };
export const LOCAL_ZONE = 'America/La_Paz';
const BLOCKS = new Set(['2', '3', '4', '5', 'X']);
const headings = /^(leader|líder|character|characters|personajes|event|events|eventos|stage|stages|escenarios|main deck|mazo principal|don!!):?$/i;
export const codePattern = /^[A-Z]+\d*-\d{3}$/;

export function today(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: LOCAL_ZONE }).format(date);
}

export function displayDay(day) {
  return day.split('-').reverse().join('/');
}

export function indexCards(snapshot) {
  return Object.fromEntries(snapshot.cards.map(card => [card.code, card]));
}

export const total = deck => Object.values(deck?.cards ?? {}).reduce((sum, n) => sum + n, 0);
export const closeDon = leader => leader.construction === 'enel' ? 6 : 10;
export const openingDeck = leader => ({ leader: leader.code, cards: {}, don: closeDon(leader) });
export const copyLimit = card => card.construction === 'copies-50' ? 50 : 4;
export const datePairs = day => day >= EXTRA_PAIRS_DAY ? [...PAIRS, ...EXTRA_PAIRS] : PAIRS;
export const pairBanned = (a, b, day) => datePairs(day).some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export function assertDay(day) {
  const date = new Date(day + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== day || day < FIRST_DAY || day > LAST_DAY) {
    throw new Error('El formato Standard revisado abarca del 19/11/2026 al 31/03/2027.');
  }
}

export function readQuantities(raw, catalog) {
  const quantities = {};
  let don = null;
  for (const [index, source] of raw.split(/\r?\n/).entries()) {
    const line = source.trim();
    if (!line || /^(#|\/\/)/.test(line) || headings.test(line)) continue;
    const donLine = line.match(/^(\d{1,3})\s*[x×]?\s*DON(?:!!)?$/i);
    if (donLine) {
      don = (don ?? 0) + Number(donLine[1]);
      continue;
    }
    const match = line.match(/^(\d{1,3})\s*[x×]?\s*([A-Z]+\d*-\d{3})(?:\s+.*)?$/i);
    if (!match || !Number(match[1])) throw new Error('Línea ' + (index + 1) + '. Escribe una cantidad y un código, como 4 OP17-045.');
    const code = match[2].toUpperCase();
    if (!catalog[code]) throw new Error('Línea ' + (index + 1) + '. ' + code + ' está fuera del catálogo.');
    quantities[code] = (quantities[code] ?? 0) + Number(match[1]);
  }
  return { quantities, don };
}

export function parseDeck(raw, catalog) {
  const { quantities, don } = readQuantities(raw, catalog);
  const leaders = Object.keys(quantities).filter(code => catalog[code].kind === 'Leader');
  const [leader] = leaders;
  if (leaders.length !== 1 || quantities[leader] !== 1) throw new Error('Incluye exactamente una copia de un líder.');
  delete quantities[leader];
  return { leader, cards: quantities, don: don ?? closeDon(catalog[leader]) };
}

export function deckText(deck, includeDon = false) {
  if (!deck) return '';
  const cards = Object.entries(deck.cards).sort(([a], [b]) => a.localeCompare(b));
  return ['1 ' + deck.leader, ...cards.map(([code, n]) => n + ' ' + code), ...(includeDon ? [deck.don + ' DON!!'] : [])].join('\n');
}

export function cardIssue(card, leader, day, overrides) {
  if (BANS.includes(card.code)) return 'carta prohibida';
  if (!card.available) return 'disponibilidad regional pendiente';
  if (card.available > day) return 'disponible desde ' + displayDay(card.available);
  if (!(overrides[card.code] ? [overrides[card.code]] : card.blocks).some(block => BLOCKS.has(block))) return 'fuera de la rotación Standard';
  if (card.construction === 'review') return 'regla de construcción pendiente de revisión';
  if (!leader) return '';
  if (card.kind === 'Leader') return 'tipo inválido para el mazo principal';
  if (!card.colors.every(color => leader.colors.includes(color))) return 'colores incompatibles con el líder';
  if (leader.construction === 'rayleigh' && card.cost >= 5) return 'Rayleigh admite cartas de coste 0–4';
  if (leader.construction === 'imu' && card.kind === 'Event' && card.cost >= 2) return 'Imu admite eventos de coste 0–1';
  if (leader.construction === 'east-blue' && !card.traits.includes('East Blue')) return 'el líder requiere el tipo East Blue';
  if (pairBanned(card.code, leader.code, day)) return 'pareja prohibida con ' + leader.code;
  return '';
}

export function checkDeck(deck, catalog, rules, { draft = false, owned = null } = {}) {
  assertDay(rules.day);
  const leader = catalog[deck?.leader];
  if (leader?.kind !== 'Leader') return ['Selecciona un líder válido.'];
  const errors = [];
  const leaderIssue = cardIssue(leader, null, rules.day, rules.overrides);
  if (leaderIssue) errors.push(leader.code + ' · ' + leaderIssue);
  const count = total(deck);
  if (count > 50 || (!draft && count !== 50)) errors.push('El mazo principal tiene ' + count + '/50 cartas.');
  if (deck.don !== closeDon(leader)) errors.push('Incluye ' + closeDon(leader) + ' DON!! para este líder.');
  if (owned && !owned[leader.code]) errors.push('La colección necesita una copia del líder.');
  for (const [code, copies] of Object.entries(deck.cards)) {
    const card = catalog[code];
    if (!card) {
      errors.push(code + ' · fuera del catálogo');
      continue;
    }
    const issue = cardIssue(card, leader, rules.day, rules.overrides);
    if (issue) errors.push(code + ' · ' + issue);
    if (!Number.isInteger(copies) || copies < 1 || copies > copyLimit(card)) errors.push(code + ' · máximo ' + copyLimit(card) + ' copias');
    if (owned && copies > (owned[code] ?? 0)) errors.push(code + ' · ' + (owned[code] ?? 0) + ' copias en tu colección');
  }
  for (const [a, b] of datePairs(rules.day)) {
    if (deck.cards[a] && deck.cards[b]) errors.push(a + ' y ' + b + ' · pareja prohibida');
  }
  return errors;
}

export function changedCopies(before, after) {
  const added = [], removed = [];
  for (const code of new Set([...Object.keys(before.cards), ...Object.keys(after.cards)])) {
    const change = (after.cards[code] ?? 0) - (before.cards[code] ?? 0);
    if (change > 0) added.push({ code, copies: change });
    if (change < 0) removed.push({ code, copies: -change });
  }
  return { added, removed, count: added.reduce((sum, row) => sum + row.copies, 0) };
}
