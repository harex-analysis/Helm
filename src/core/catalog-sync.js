import { parseHTML } from 'linkedom';
import { BANS, PAIRS, EXTRA_PAIRS, EXTRA_PAIRS_DAY, COLORS, today } from './deck.js';
import { SITE, artworkAddress } from './artwork.js';

export { SITE, artworkAddress };
const pattern = /\b[A-Z]+\d*-\d{3}\b/g;
const text = node => node?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const doc = html => parseHTML(html).document;

async function fetchPage(path) {
  let url = new URL(path, SITE);
  for (let i = 0; i < 4; i++) {
    if (url.origin !== SITE || url.username || url.password) throw new Error('Bandai redirigió fuera del dominio oficial.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(22000) });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error('Bandai devolvió HTTP ' + response.status + '.');
    return response.text();
  }
  throw new Error('Se excedió el límite de redirecciones de Bandai.');
}

function verifyRestrictions(html, day) {
  const document = doc(html);
  const title = [...document.querySelectorAll('.blocks h3')].find(node => text(node) === 'Cards with Active Restrictions');
  const group = title?.closest('.js-setGallery');
  if (text(document.querySelector('.pageTitDate')) !== 'November 17, 2026' || !group) {
    throw new Error('Se requiere revisar el aviso oficial de restricciones. Se conserva el catálogo local.');
  }
  let heading = '';
  const bans = new Set(), pairs = new Set();
  for (const node of group.querySelectorAll('h4, ul, ol')) {
    if (node.localName === 'h4') {
      heading = text(node);
      continue;
    }
    const codes = [...new Set(text(node).match(pattern) ?? [])].sort();
    if (!codes.length) continue;
    if (heading === 'Banned Cards') codes.forEach(code => bans.add(code));
    else if (heading === 'Banned Pair Cards' && codes.length === 2) pairs.add(codes.join('|'));
    else throw new Error('Bandai publicó un tipo de restricción que requiere revisar las reglas.');
  }
  const equal = (set, expected) => set.size === expected.length && expected.every(code => set.has(code));
  const allowed = PAIRS.map(pair => [...pair].sort().join('|'));
  const extra = EXTRA_PAIRS.map(pair => [...pair].sort().join('|'));
  if (!equal(bans, BANS) || !(equal(pairs, allowed) || (day >= EXTRA_PAIRS_DAY && equal(pairs, [...allowed, ...extra])))) {
    throw new Error('Cambió la lista oficial de cartas restringidas. Se conserva el catálogo local.');
  }
}

function readOverrides(html) {
  const overrides = {};
  for (const title of doc(html).querySelectorAll('.blocks h3')) {
    const name = text(title);
    const block = name.includes('Generally Permitted') ? 'X' : name.includes('Use Under Block Number') && name.endsWith('④') ? '4' : '';
    if (!block) continue;
    for (const code of text(title.closest('.js-setGallery')).match(pattern) ?? []) overrides[code] = block;
  }
  if (overrides['OP01-016'] !== 'X' || overrides['OP01-039'] !== '4') throw new Error('Las excepciones de rotación necesitan revisión.');
  return overrides;
}

function readSet(html, series, known) {
  const document = doc(html);
  if (document.querySelector('#series option[selected]')?.getAttribute('value') !== series) {
    throw new Error('Bandai devolvió un producto distinto de ' + series + '.');
  }
  const results = new Map();
  for (const node of document.querySelectorAll('dl.modalCol')) {
    const [code, , rawKind] = [...node.querySelectorAll('.infoCol span')].map(text);
    if (!code || !rawKind || !/^[A-Z]+\d*-\d{3}$/.test(code)) continue;
    const picture = node.querySelector('.frontCol img');
    const image = artworkAddress(picture?.getAttribute('data-src'), code) || artworkAddress(picture?.getAttribute('src'), code);
    if (results.has(code)) {
      const card = results.get(code);
      if (image && image !== card.artwork_url && !card.artwork_alternatives.includes(image) && card.artwork_alternatives.length < 2) {
        card.artwork_alternatives.push(image);
      }
      continue;
    }
    const read = selector => {
      const child = node.querySelector(selector);
      child?.querySelector('h3')?.remove();
      return text(child);
    };
    const number = selector => Number(read(selector).replaceAll(',', '')) || 0;
    const kind = rawKind[0] + rawKind.slice(1).toLowerCase();
    const colors = read('.backCol .color').split('/').map(value => value.trim());
    if (!['Leader', 'Character', 'Event', 'Stage'].includes(kind) || colors.some(color => !COLORS[color])) throw new Error('Tipo o color inesperado en ' + code + '.');
    const previous = known.get(code);
    const effect = read('.backCol .text');
    const block = read('.backCol .block');
    const trigger = read('.backCol .trigger');
    const roles = previous?.roles ?? [
      ...(/\[Blocker\]/i.test(effect) ? ['blocker'] : []), ...(/\[Rush/i.test(effect) ? ['rush'] : []),
      ...(/\b(draw|look at) (up to )?\d/i.test(effect) ? ['value'] : []), ...(trigger && trigger !== '-' ? ['trigger'] : [])
    ];
    const changedEffect = previous?.effect_text && previous.effect_text !== effect;
    results.set(code, { ...previous, code, kind, colors, roles, name: read('.cardName'),
      traits: read('.backCol .feature').split('/').map(value => value.trim()).filter(value => value && value !== '-'),
      cost: kind === 'Leader' ? 0 : number('.backCol .cost'), life: kind === 'Leader' ? number('.backCol .cost') : null,
      counter: number('.backCol .counter'), power: number('.backCol .power'),
      attribute: read('.backCol .attribute'), available: previous?.available ?? null,
      blocks: [...new Set([...(previous?.blocks ?? []), ...(block && block !== '-' ? [block] : [])])],
      construction: changedEffect ? 'review' : (previous?.construction ?? 'review'),
      effects: changedEffect ? null : (previous?.effects ?? null), effect_text: effect, trigger_text: trigger,
      artwork_url: image || artworkAddress(previous?.artwork_url, code),
      artwork_alternatives: [],
      special_start: kind === 'Leader' && /start of (the|this) game|opening hand/i.test(effect)
    });
  }
  if (!results.size) throw new Error('Sin cartas reconocibles en ' + series + '.');
  return results;
}

export async function syncCatalog(current, progress = () => {}) {
  const day = today();
  const [directory, restrictions, blocks] = await Promise.all([
    fetchPage('/cardlist/'), fetchPage('/news/restriction.html'), fetchPage('/news/blockicon-card.html')
  ]);
  verifyRestrictions(restrictions, day);
  const overrides = readOverrides(blocks);
  const products = [...new Set([...doc(directory).querySelectorAll('#series option[value]')].map(option => option.getAttribute('value')).filter(code => /^\d{6}$/.test(code)))];
  if (products.length < 20) throw new Error('Cambió el índice del catálogo oficial.');
  const prior = new Map(current.cards.map(card => [card.code, card]));
  const results = Array(products.length);
  let position = 0, completed = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (position < products.length) {
      const i = position++;
      const series = products[i];
      results[i] = readSet(await fetchPage('/cardlist/?series=' + series), series, prior);
      progress(++completed + '/' + products.length + ' productos revisados');
    }
  }));
  const merged = new Map();
  for (const set of results) for (const [code, card] of set) if (!merged.has(code)) merged.set(code, card);
  if (merged.size < current.cards.length * 0.90) throw new Error('El catálogo descargado está incompleto.');
  for (const [code, card] of prior) if (!merged.has(code)) merged.set(code, { ...card, available: null, construction: 'review' });
  return { ...current, cards: [...merged.values()].sort((a, b) => a.code.localeCompare(b.code)), overrides, checked: day, sets: products.length };
}
