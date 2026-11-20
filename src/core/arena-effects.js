import { relations } from './analysis.js';

const step = (type, options = {}) => ({ type, ...options });
const pick = (action, options = {}) => step('target', { action, ...options });
const mine = options => ({ own: true, ...options });
const draw = (n = 1) => step('draw', { n });
const wait = (n = 1) => step('payDon', { n });
const discard = (n = 1, trait) => step('payTrash', { n, trait });
const donate = (n = 1, active = false) => step('gainDon', { n, active });
const back = (n = 1) => step('returnDon', { n });
const buff = (amount, options) => pick('power', { amount, ...options });
const defend = (amount, options = {}) => buff(amount, mine({ battle: true, leader: true, ...options }));
const lockAttack = options => pick('freezeAttack', options);
const flag = (value, options = {}) => pick('grant', { flag: value, ...options });
const thaw = (n = 1) => step('readyDon', { n });
const freeze = options => pick('freezeReady', { rested: true, ...options });
const rest = options => pick('rest', options);
const knockout = options => pick('ko', options);
const bounce = options => pick('bounce', options);
const sacrifice = step('trashSelf');
const restSelf = step('restSelf');
const ak = 'Animal Kingdom Pirates';
const rocks = 'Rocks Pirates';
const red = 'Red-Haired Pirates';
const trait = name => step('leaderTrait', { names: [name] });
const search = (depth, names, miss = 'bottom') => step('search', { depth, traits: names, miss });
const play = (options = {}) => step('playFromHand', options);
const freezeKw = (options = {}) => pick('protectRest', options);
const manual = step('manual');

// Reviewed effects use the printed windows and costs. The generic parser below only accepts complete, simple clauses.
const reviewed = {
  'OP17-039': { attack: [discard(), step('revealDraw', { trait: rocks, n: 2 })] },
  'OP08-051': { play: [buff(2000, mine({ names: ['Edward Weevil'] }))] },
  'OP17-050': { play: [step('reorder', { depth: 2 }), draw()] },
  'OP17-045': { play: [draw()] },
  'OP17-054': { play: [lockAttack({ maxCost: 6, printed: true })], activate: [wait(3), restSelf, lockAttack()] },
  'OP17-046': { play: [pick('bottom', { both: true, maxCost: 5 })] },
  'OP17-042': { play: [step('revealHand', { n: 3, trait: rocks }), buff(-3000)] },
  'OP17-044': { activate: [restSelf, draw(), step('payTrash', { n: 1, required: true })] },
  'OP17-049': { play: [step('linlin')], defend: [step('once', { key: 'defend' }), discard(), defend(1000)] },
  'OP17-040': { play: [draw()], leaderBattle: [trait(rocks), step('once', { key: 'battle' }), discard(), defend(3000, { onlyLeader: true })] },
  'OP17-048': { attack: [step('once', { key: 'react' }), discard(1, rocks), buff(-3000)],
    defend: [step('once', { key: 'react' }), discard(1, rocks), buff(-3000)] },
  'OP14-049': { play: [wait(2), draw(2), bounce({ both: true, maxCost: 7 })] },
  'OP17-118': { play: [draw(), play({ trait: rocks, count: 2, budget: 9, different: true })] },
  'OP17-055': { main: [wait(), flag('Unblockable', mine({ names: ['Rocks.D.Xebec'], leader: true }))], counter: [defend(2000, { trait: rocks })] },
  'OP17-056': { main: [wait(5), bounce({ both: true, maxCost: 6 })], counter: [defend(2000, { trait: rocks })] },
  'OP17-058': { attack: [step('once', { key: 'react' }), back(), buff(-2000)],
    defend: [step('once', { key: 'react' }), back(), buff(-2000)] },
  'EB04-032': { play: [discard(1, ak), draw(2)], activate: [trait(ak), step('once', { key: 'main' }), wait(2), donate()] },
  'OP17-073': { play: [trait(ak), discard(), donate(1, true)] },
  'OP17-074': { play: [donate()] },
  'EB04-031': { activate: [trait(ak), step('checkSingleton', { name: 'King' }), step('once', { key: 'main' }), donate(1, true), donate()] },
  'OP17-060': { play: [trait(ak), donate(1, true), knockout({ maxPower: 3000 })] },
  'OP17-061': { play: [trait(ak), back(), step('addLife')], activate: [sacrifice, play({ names: ['King', 'Queen', 'Jack'] })] },
  'OP17-065': { play: [back(), draw(), lockAttack({ count: 2, maxCost: 5 })] },
  'OP17-062': { returnDon: [step('once', { key: 'return' }), donate(1, true), thaw()] },
  'ST34-004': { play: [back(4), discard(), step('addLife'), pick('basePower', { amount: 0 })] },
  'OP17-063': { activate: [step('playedNow'), step('once', { key: 'main' }), back(), pick('negateKO', { maxCost: 6 })] },
  'OP15-078': { main: [back(2), draw(), rest({ maxPower: 5000 })], counter: [defend(1000), step('donAtMost', { n: 6 }), draw()] },
  'OP07-077': { main: [step('leaderTrait', { names: [ak, 'Big Mom Pirates'] }), search(5, [ak, 'Big Mom Pirates'])],
    trigger: [step('leaderTrait', { names: [ak, 'Big Mom Pirates'] }), search(5, [ak, 'Big Mom Pirates'])] },
  'OP17-077': { main: [trait(ak), wait(3), discard(2), donate(3)], counter: [back(), defend(4000, { onlyLeader: true })] },
  'OP07-076': { counter: [back(), defend(2000), rest()], trigger: [donate(1, true)] },
  'OP09-077': { main: [back(2), knockout({ maxPower: 6000 })], trigger: [donate(1, true)] },
  'OP17-020': { activate: [step('once', { key: 'main' }), step('payRestOrTrash'), freeze()] },
  'OP17-032': { play: [search(3, [red])] },
  'OP17-029': { play: [thaw(), rest({ count: 2, maxCost: 2 })] },
  'OP17-033': { play: [search(3, [red])], defend: [sacrifice, rest({ leader: true })] },
  'ST32-002': { play: [draw(), freezeKw({ maxCost: 6, printed: true })] },
  'OP17-031': { play: [draw(), rest({ maxCost: 8 })], end: [pick('ready', mine({ trait: red }))] },
  'OP07-026': { play: [step('bonney')] },
  'OP13-031': { play: [bounce(mine({ required: true })), play({ maxCost: 5, rested: true })] },
  'OP11-035': { play: [rest()], effectKO: [wait(), play({ maxCost: 4, traits: ['Fish-Man', 'Merfolk'] })] },
  'OP17-027': { play: [trait(red), draw(), rest({ count: 2 })] },
  'ST16-004': { play: [knockout({ rested: true })] },
  'OP17-022': { play: [thaw(2), step('restAll')] },
  'OP17-038': { main: [step('payBoard', { n: 4 }), rest()], counter: [discard(), defend(3000)] },
  'OP17-037': { main: [search(5, [red])], counter: [step('payBoard', { n: 1 }), defend(3000)] },
  'OP17-036': { main: [wait(6), rest(), knockout({ count: 2, maxCost: 6, rested: true })], counter: [defend(4000, { names: ['Shanks'] })] },
  'OP17-089': { play: [search(3, ['Elbaph'], 'trash')] },
  'OP07-059': { attack: [step('boardTrait', { trait: 'Foxy Pirates', n: 3 }), back(3),
    freeze({ onlyRivalLeader: true }), freeze()] },
  'OP08-098': { attack: [step('attached', { n: 1 }),
    play({ trait: 'Shandian Warrior', budgetDon: true, after: 'lifeToHand' })] },
  'OP13-079': { activate: [step('once', { key: 'main' }), step('imuCost'), draw()] },
  'OP13-099': { activate: [wait(3), restSelf, play({ trait: 'Five Elders', color: 'Black', budgetDon: true })] },
  'OP09-081': { activate: [discard(), step('teachLock')] },
  'OP17-081': { play: [discard(), step('recover', { maxCost: 8, except: 'Gerd' })] }
};

const timings = {
  'on play': 'play', 'when attacking': 'attack', 'on your opponent\'s attack': 'defend',
  'activate: main': 'activate', 'main': 'main', 'counter': 'counter', 'trigger': 'trigger',
  'on k.o.': 'ko', 'end of your turn': 'end', 'on block': 'block'
};
const stamps = /\[(On Play|When Attacking|On Your Opponent's Attack|Activate: Main|Main|Counter|Trigger|On K\.O\.|End of Your Turn|On Block)\]/gi;
const cache = new WeakMap();
const baseKeywords = ['Blocker', 'Rush', 'Rush: Character', 'Banish', 'Double Attack', 'Unblockable'];

function windows(card) {
  if (cache.has(card)) return cache.get(card);
  const text = (card.effect_text ?? '').replaceAll('’', "'");
  const clauses = [...text.matchAll(stamps)];
  const body = {};
  for (const [i, match] of clauses.entries()) {
    const start = match.index + match[0].length;
    const window = timings[match[1].toLowerCase()];
    const value = text.slice(start, clauses[i + 1]?.index).trim();
    if (value && !value.startsWith('effect')) body[window] = body[window] ? body[window] + ' ' + value : value;
  }
  if (card.trigger_text && card.trigger_text !== '-') body.trigger = card.trigger_text.replace(/^\[Trigger\]\s*/i, '');
  const prefix = text.match(/^(?:\[(?:Blocker|Rush(?:: Character)?|Banish|Double Attack|Unblockable)\]\s*(?:\([^)]*\)\s*)?)*/i)?.[0] ?? '';
  const keywords = baseKeywords.filter(word => prefix.toLowerCase().includes('[' + word.toLowerCase() + ']'));
  const data = { body, keywords };
  cache.set(card, data);
  return data;
}

export const printedKeyword = (card, word) => windows(card).keywords.includes(word);

function infer(card, text, timing, leader, pool, don) {
  const clause = text.replace(/\s+/g, ' ').trim();
  let match = clause.match(/^Draw (\d+) cards?\.$/i);
  if (match) return [draw(Number(match[1]))];
  match = clause.match(/^Add up to (\d+) DON!! cards? (?:as (active|rested) )?from your DON!! deck(?: and (rest (?:it|them)|set (?:it|them) as active))?\.$/i);
  if (match) return [donate(Number(match[1]), match[2] === 'active' || match[3]?.includes('active'))];
  match = clause.match(/^Up to 1 of your Leader or Characters?(?: cards?)? gains \+([\d,]+) power during this battle\.$/i);
  if (match) return [defend(Number(match[1].replaceAll(',', '')))];
  match = clause.match(/^K\.O\. up to (\d+) of your opponent's Characters with ([\d,]+) power or less\.$/i);
  if (match) return [knockout({ count: Number(match[1]), maxPower: Number(match[2].replaceAll(',', '')) })];
  match = clause.match(/^Rest up to (\d+) of your opponent's Characters(?: with a cost of (\d+) or less)?\.$/i);
  if (match) return [rest({ count: Number(match[1]), maxCost: match[2] ? Number(match[2]) : undefined })];
  if (/^Look at \d+ cards? from the top of your deck; reveal up to 1 [^.]+ and add it to your hand\. Then, place the rest at the bottom of your deck in any order\.$/i.test(clause)) {
    const hit = relations(card, leader, pool, don).find(link => link.action === 'search');
    if (hit) return [step('search', { depth: hit.depth, codes: hit.targets, miss: 'bottom' })];
  }
  if (/^Activate this card's \[Main\] effect\.$/i.test(clause) && timing === 'trigger') return effectsAt(card, 'main', leader, pool, don) ?? [manual];
  return [manual];
}

export function effectsAt(card, timing, leader, pool, don) {
  const known = reviewed[card.code]?.[timing];
  if (known) return known;
  const text = windows(card).body[timing];
  return text ? infer(card, text, timing, leader, pool, don) : null;
}

const printedPassive = new Set(['OP17-044', 'OP17-118', 'OP17-063', 'OP13-031', 'OP14-049', 'OP13-079', 'OP13-099', 'OP09-081',
  'OP17-045', 'OP15-069', 'EB04-031', 'OP17-062', 'OP17-079', 'OP17-081', 'OP17-094', 'OP17-040', 'OP17-021']);

export function effectCoverage(card, leader, pool, don) {
  const text = card.effect_text ?? '';
  const ability = windows(card);
  const manualWindows = Object.keys(ability.body).filter(timing => effectsAt(card, timing, leader, pool, don)?.some(op => op.type === 'manual'));
  const starts = text.slice(0, text.search(stamps) < 0 ? text.length : text.search(stamps));
  const passive = starts.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim();
  const hasExtraWindow = /\[Your Turn\].*When|not activate|would be|cannot attack any card|Once Per Turn.*When/i.test(text);
  const review = manualWindows.length > 0 || ((Boolean(passive) || hasExtraWindow) && !printedPassive.has(card.code));
  return { review, keywords: ability.keywords, manualWindows };
}
