import { cardIssue, checkDeck, closeDon, copyLimit, pairBanned, total } from '../core/deck.js';
import { deckMetrics, roleNames, roles } from '../core/analysis.js';
import { actionsMenu, art, btn, codeLabel, dots, empty, esc, header, icon, message, num, opt, smallButton, status } from './components.js';

const types = [['', 'Todas'], ['Character', 'Personajes'], ['Event', 'Eventos'], ['Stage', 'Escenarios']];
const searchField = (value, leader) => '<label class="search-box">' + icon('search', 18) +
  '<input id="builder-search" type="search" aria-label="' + (leader ? 'Buscar líder' : 'Buscar en cartas elegibles') + '" autocomplete="off" placeholder="' +
  (leader ? 'Busca un líder por nombre o código' : 'Busca por nombre, código, rasgo o efecto') + '" value="' + esc(value) + '"></label>';
const cardImages = (card, className = '', eager = false) => art(card, className, eager);
const matching = (card, query) => !query || [card.name, card.code, ...card.traits, card.effect_text].join(' ').toLowerCase().includes(query);
export const builderBatch = 24;

export function builderSlice({ state, cards, rules, owned, choosing, builderBrowse: browse }, from = 0) {
  const leader = cards[state.deck?.leader];
  const selectLeader = choosing || !leader;
  const query = browse.search.trim().toLowerCase();
  const existing = Object.keys(state.deck?.cards ?? {});
  const pool = Object.values(cards).filter(card => {
    if (selectLeader) return card.kind === 'Leader' && (!owned || owned[card.code] > 0) && !cardIssue(card, null, rules.day, rules.overrides) && matching(card, query);
    if (cardIssue(card, leader, rules.day, rules.overrides) || (owned && !owned[card.code])) return false;
    if (existing.some(code => pairBanned(code, card.code, rules.day))) return false;
    if (browse.kind && card.kind !== browse.kind) return false;
    if (browse.cost && Math.min(card.cost, 10) !== Number(browse.cost)) return false;
    if (browse.role && !roles(card, leader).has(browse.role)) return false;
    return matching(card, query);
  });
  pool.sort((a, b) => selectLeader ? a.name.localeCompare(b.name) || a.code.localeCompare(b.code) :
    a.cost - b.cost || a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  const count = total(state.deck);
  const shown = Math.min(browse.limit, pool.length);
  const cardsHtml = pool.slice(from, shown).map(card => {
    const ownedCopies = Math.min(copyLimit(card), owned?.[card.code] ?? 50);
    const inDeck = state.deck?.cards[card.code] ?? 0;
    const fixed = state.fixed.includes(card.code);
    const canAdd = count < 50 && inDeck < ownedCopies && !fixed;
    const canSwap = count === 50 && inDeck < ownedCopies && !fixed;
    const action = selectLeader ? 'choose-leader' : canSwap ? 'replace-by' : 'add-card';
    const label = selectLeader ? 'Elegir líder' : fixed ? 'Fijada' : inDeck >= ownedCopies ? 'Límite de copias' : canSwap ? 'Sustituir copia' : 'Añadir copia';
    return '<article class="crew-card ' + (inDeck ? 'in-deck' : '') + '" draggable="' + (selectLeader || canAdd || canSwap) +
      '" data-' + (selectLeader ? 'leader' : 'catalog') + '-drag="' + card.code + '">' +
      '<button class="crew-art" data-action="details" data-value="' + card.code + '" aria-label="Ver ' + esc(card.name) + '">' +
      cardImages(card) + (inDeck ? '<span class="crew-count">×' + inDeck + '</span>' : '') +
      '<span class="crew-peek">' + icon('search', 13) + ' Ver carta</span></button>' +
      '<div class="crew-info"><div class="crew-name" title="' + esc(card.name) + '">' + esc(card.name) + '</div>' +
      '<div class="crew-meta"><span>' + dots(card) + codeLabel(card) + '</span><span>' + (selectLeader ? card.life + ' VIDAS' : card.cost + ' DON!!') + '</span></div>' +
      '<div class="crew-actions">' + (!selectLeader && inDeck ? smallButton('Quitar copia de ' + card.name, 'remove-card', 'minus', card.code, fixed) : '') +
      btn(label, action, { glyph: selectLeader ? 'right' : canSwap ? 'refresh' : canAdd ? 'plus' : '', value: card.code, disabled: !selectLeader && !canAdd && !canSwap,
        style: 'crew-add ' + (selectLeader || canAdd ? 'outline-teal' : '') }) + '</div></div></article>';
  }).join('');
  return { cardsHtml, shown, total: pool.length, label: selectLeader ? 'líderes' : 'cartas elegibles' };
}

export function builderTail({ shown, total: count, label }) {
  return '<div id="builder-tail" class="gallery-tail" ' + (shown < count ? 'data-builder-more' : '') + '>' +
    (shown < count ? '<button type="button" class="button quiet" data-action="builder-more">' + num(shown) + ' de ' + num(count) +
      ' · Cargar más</button>' : (count ? num(count) + ' ' + label : '')) + '</div>';
}

export function builderResults(view) {
  const result = builderSlice(view);
  if (!result.total) return empty('Sin coincidencias', 'Prueba con otra búsqueda o cambia los filtros.', btn('Limpiar filtros', 'builder-clear'));
  return '<div class="builder-gallery" data-drop="remove">' + result.cardsHtml + '</div>' + builderTail(result);
}

function leaderSlot(leader, state, choosing) {
  if (choosing || !leader) return '<div class="leader-slot open" data-drop="leader">' + icon('flag', 25) + '<strong>Suelta aquí tu líder</strong>' +
    (leader ? '<small>Actual · ' + esc(leader.name) + '</small>' : '') + '</div>';
  return '<div class="leader-slot"><button class="shelf-art" data-action="details" data-value="' + leader.code +
    '" aria-label="Ver líder ' + esc(leader.name) + '">' + cardImages(leader, '', true) + '</button>' +
    '<div><span class="slot-kicker">' + dots(leader) + ' LÍDER</span><strong title="' + esc(state.name || leader.name) + '">' + esc(state.name || leader.name) +
    '</strong><small>' + leader.life + ' vidas · ' + closeDon(leader) + ' DON!!</small>' +
    btn('Cambiar', 'builder-leader', { style: 'quiet', glyph: 'refresh' }) + '</div></div>';
}

function deckShelf({ state, cards, rules, owned, busy, choosing }, leader) {
  const deck = state.deck;
  const count = total(deck);
  const issues = leader ? checkDeck(deck, cards, rules, { draft: true, owned }) : [];
  const selected = deck ? Object.entries(deck.cards).sort(([a], [b]) => cards[a].cost - cards[b].cost || cards[a].name.localeCompare(cards[b].name)) : [];
  const stats = leader ? deckMetrics(deck, cards, state.targets) : null;
  const meter = '<div class="builder-progress" title="' + count + ' de 50 cartas"><i style="width:' + Math.min(100, count * 2) + '%"></i></div>';
  const badge = !leader ? '' : issues.length ? status('Requiere revisión', 'bad') : count === 50 ? status('Mazo legal') : status('Borrador', 'pending');
  return '<section class="deck-shelf' + (choosing || !leader ? ' choosing-leader' : '') + '" data-drop="' + (choosing || !leader ? 'leader' : 'add') +
    '"><div class="shelf-header"><div class="shelf-heading"><div class="shelf-symbol">' +
    icon('decks', 20) + '</div><div><h2>Mi mazo <span>' + count + '<small> / 50</small></span></h2>' + meter + '</div>' + badge +
    '</div><div class="actions">' +
    (leader && !choosing ? btn(issues.length ? 'Reparar lista' : count === 50 ? 'Optimizar mazo' : 'Sugerir mazo', issues.length ? 'repair' : 'run-optimize',
      { glyph: 'wand', style: count < 50 ? 'primary' : 'outline-teal', disabled: Boolean(busy), title: issues.length ? 'Reparar lista' : '' }) : '') +
    (leader && count === 50 && !issues.length ? btn('Mano de prueba', 'hand-practice', { glyph: 'decks', disabled: Boolean(busy) }) +
      btn('Jugar en Arena', 'arena-open', { glyph: 'play', style: 'primary', disabled: Boolean(busy) }) : '') +
    (choosing ? btn('Cancelar cambio', 'builder-leader', { glyph: 'close', style: 'quiet' }) : '') +
    '</div></div><div class="shelf-content">' + leaderSlot(leader, state, choosing) +
    '<div class="shelf-tray" id="deck-shelf-cards" tabindex="0" aria-label="Cartas de mi mazo">' +
    (selected.length ? selected.map(([code, n]) => {
      const card = cards[code];
      const locked = state.fixed.includes(code);
      return '<article class="shelf-card ' + (locked ? 'locked' : '') + '" draggable="' + (!locked) + '" data-deck-drag="' + code +
        '"><button class="shelf-art" data-action="details" data-value="' + code + '" aria-label="Ver ' + esc(card.name) + '">' +
        cardImages(card, '', true) + '<span class="crew-count">×' + n + '</span>' + (locked ? '<span class="lock-dot">' + icon('lock', 11) + '</span>' : '') +
        '</button><div class="mini-actions">' +
        smallButton('Quitar copia de ' + card.name, 'remove-card', 'minus', code, locked) +
        smallButton(locked ? 'Desfijar ' + card.name : 'Fijar ' + card.name, 'fix', 'lock', code) +
        smallButton('Añadir copia de ' + card.name, 'add-card', 'plus', code, locked || count >= 50 || n >= Math.min(copyLimit(card), owned?.[code] ?? 50)) +
        '</div></article>';
    }).join('') : '<div class="shelf-placeholder"><span>' + icon('plus', 26) + '</span><div><strong>' +
      (leader ? 'Añade las primeras cartas' : 'Tu tripulación aparecerá aquí') + '</strong><small>' +
      (leader ? 'Usa Añadir copia o arrastra una carta a esta franja.' : 'Elige un líder o importa un mazo.') + '</small></div></div>') +
    '</div></div><div class="shelf-footer">' +
    (stats ? '<div class="shelf-metrics"><span><b>' + stats.kinds.Character + '</b> Personajes</span><span><b>' + stats.kinds.Event + '</b> Eventos</span>' +
      '<span><b>' + stats.kinds.Stage + '</b> Escenarios</span><span><b>' + stats.printedCounter + '</b> Counter +2000</span></div>' : '<span></span>') +
    '<div class="actions">' +
    (state.before ? btn('Deshacer aplicación', 'undo', { glyph: 'history', style: 'quiet' }) : '') +
    (leader ? btn('Ver análisis', 'navigate', { value: 'overview', glyph: 'chart', style: 'quiet' }) : '') +
    (leader && count < 50 ? btn('Listas de este líder', 'leader-tournaments', { glyph: 'library', style: 'quiet' }) : '') +
    '</div></div>' +
    (issues.length ? message(issues.join('\n'), 'bad') : '') + '</section>';
}

export function builder(view) {
  const { state, cards, choosing, builderBrowse: browse } = view;
  const leader = cards[state.deck?.leader];
  const selectLeader = choosing || !leader;
  const top = header('Mesa de mazos', leader ? 'Ajusta tu tripulación y llévala a la Arena.' : 'Empieza por un líder para abrir su conjunto de cartas.',
    '<div class="actions">' + btn('Importar', 'import', { glyph: 'upload' }) +
    (leader ? actionsMenu('Mi lista', btn('Editar texto', 'edit', { glyph: 'edit' }) +
      btn('Exportar', 'export', { glyph: 'download' }) + btn('Guardar versión', 'save-version', { glyph: 'bookmark' }) +
      btn('Renombrar mazo', 'rename', { glyph: 'edit' }), 'decks') : btn('Probar con Rocks', 'load-list', { glyph: 'play', value: 'example:0' })) + '</div>');
  const options = selectLeader ? '' : '<div class="type-filters" aria-label="Tipo de carta">' + types.map(([id, label]) =>
    btn(label, 'builder-type', { style: 'filter-chip ' + (id === browse.kind ? 'active' : ''), value: id })).join('') + '</div>';
  return top + '<div class="builder-top">' + deckShelf(view, leader) + '</div>' +
    '<section class="builder-pool" aria-label="' + (selectLeader ? 'Líderes disponibles' : 'Cartas elegibles') + '">' +
    '<div class="pool-title"><div><h2>' + (selectLeader ? 'Elige tu líder' : 'Cartas para ' + esc(leader.name)) + '</h2>' +
    '<p>' + (selectLeader ? 'Arrástralo a la zona de líder o elígelo con su botón.' : 'Arrastra, haz doble clic o usa el botón de cada carta.') + '</p></div></div>' +
    '<div class="builder-filters">' + options + searchField(browse.search, selectLeader) +
    (selectLeader ? '' : '<select id="builder-cost" aria-label="Filtrar por coste">' + opt('', 'Cualquier coste', browse.cost) +
      Array.from({ length: 11 }, (_, i) => opt(String(i), i === 10 ? 'Coste 10+' : 'Coste ' + i, browse.cost)).join('') +
      '</select><select id="builder-role" aria-label="Filtrar por función">' + opt('', 'Toda función', browse.role) +
      Object.entries(roleNames).map(([id, label]) => opt(id, label, browse.role)).join('') + '</select>') +
    '</div><div id="builder-results">' + builderResults(view) + '</div></section>';
}
