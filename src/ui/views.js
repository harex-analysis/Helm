import { COLORS, KINDS, cardIssue, checkDeck, deckText, copyLimit, parseDeck, total } from '../core/deck.js';
import { analyzeDeck, deckMetrics, linkLabel, roleNames, roles } from '../core/analysis.js';
import { rate } from '../core/simulation.js';
import { avatar } from './arena-view.js';
import { actionsMenu, art, btn, cardName, checkbox, codeLabel, color, costCurve, dots, empty, esc, formField, header, icon, kind,
  message, metricsTile, num, oneLine, opt, pct, ruleDate, smallButton, status, timestamp } from './components.js';

export const pages = [
  ['workshop', 'Mesa de mazos', 'decks'], ['arena', 'Arena', 'play'], ['optimize', 'Optimización', 'wand'],
  ['simulator', 'Laboratorio', 'chart'], ['catalog', 'Catálogo', 'grid'], ['library', 'Biblioteca', 'library'], ['matches', 'Partidas', 'history']
];
const panelTitle = (title, note = '', actions = '') => '<div class="panel-title"><div><h2>' + title + '</h2>' +
  (note ? '<p>' + note + '</p>' : '') + '</div>' + actions + '</div>';
const block = (title, content, note = '', actions = '', extra = '') => '<section class="panel ' + extra + '">' + panelTitle(title, note, actions) + content + '</section>';
const stack = (...items) => '<div class="stack">' + items.join('') + '</div>';
const buttons = (...items) => '<div class="actions">' + items.join('') + '</div>';
const rows = entries => entries.length ? '<ul class="findings">' + entries.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '<p class="soft">Sin resultados.</p>';
const isReady = (state, cards, rules) => !checkDeck(state.deck, cards, rules).length;
const tabs = (items, selected, action) => '<div class="tabs">' + items.map(([id, label]) => btn(label, action,
  { value: id, style: id === selected ? 'tab active' : 'tab' })).join('') + '</div>';

export function sidebar({ page, snapshot, state, busy, refreshStatus }) {
  const route = new Set(['workshop', 'optimize', 'arena']);
  const item = ([id, label, glyph]) => {
    const active = id === page || (id === 'workshop' && page === 'overview');
    return '<button class="nav-item ' + (active ? 'selected' : '') +
        '" data-action="navigate" data-value="' + id + '"' + (active ? ' aria-current="page"' : '') + '>' +
        icon(glyph, 19) + '<span>' + label + '</span>' + (active ? icon('chevron', 14) : '') + '</button>';
  };
  return '<div class="nav-top"><div class="nav-caption">RUTA DE JUEGO</div><nav aria-label="Navegación principal">' +
    ['workshop', 'optimize', 'arena'].map(id => item(pages.find(row => row[0] === id))).join('') +
    '<details class="nav-tools" ' + (route.has(page) || page === 'overview' ? '' : 'open') + '><summary>' +
    icon('library', 18) + '<span>Herramientas</span>' + icon('chevron', 14) + '</summary><div>' +
    pages.filter(([id]) => !route.has(id)).map(item).join('') + '</div></details>' +
    '</nav></div><div class="nav-bottom">' +
    '<button class="nav-item" data-action="settings">' + icon('settings', 19) + '<span>Formato y datos</span></button>' +
    '<div class="format-card"><div><i class="' + (busy === 'catalog' ? 'pending' : '') + '"></i><strong>Standard · LATAM</strong></div>' +
    '<small>' + num(snapshot.cards.length) + ' cartas · ' + ruleDate(state.day) + '</small>' +
    '<small class="launch-status" role="status">' + esc(refreshStatus) + '</small></div></div>';
}

function composition(stats) {
  const { count, kinds } = stats;
  return '<div class="split-track" role="img" aria-label="Personajes ' + kinds.Character + ', eventos ' + kinds.Event + ', escenarios ' + kinds.Stage + '">' +
    Object.entries(kinds).map(([id, n]) => '<i class="' + id.toLowerCase() + '" style="width:' + (count ? n / count * 100 : 0) + '%"></i>').join('') +
    '</div><div class="split-list">' + Object.entries(kinds).map(([id, n]) => '<div><span><i class="' + id.toLowerCase() + '"></i>' +
    ({ Character: 'Personajes', Event: 'Eventos', Stage: 'Escenarios' }[id]) + '</span><strong>' + n + '</strong></div>').join('') +
    '</div><div class="split-footer"><span>Coste medio</span><strong>' + num(stats.average, 2) + ' DON!!</strong></div>';
}

function deckRows(deck, cards, state, owned) {
  const entries = Object.entries(deck.cards).sort(([a], [b]) => cards[a].cost - cards[b].cost || cards[a].name.localeCompare(cards[b].name));
  if (!entries.length) return '<div class="inner-empty">Añade cartas desde el catálogo o genera una lista para este líder.</div>';
  return '<div class="table-wrap"><table class="data-table deck-table"><thead><tr><th>Carta</th><th>Tipo</th><th>Coste</th><th>Counter</th><th>Copias</th><th></th></tr></thead><tbody>' +
    entries.map(([code, n]) => {
      const card = cards[code];
      const fixed = state.fixed.includes(code);
      return '<tr draggable="' + (!fixed) + '" data-deck-drag="' + code + '"><td><button class="card-cell" data-action="details" data-value="' + code + '">' +
        art(card, 'thumb') + '<span>' + cardName(card) + '</span></button></td><td>' + kind(card) + '</td><td>' + card.cost +
        '</td><td>' + (card.counter ? '+' + card.counter : '—') + '</td><td><div class="quantity">' +
        smallButton('Quitar copia de ' + card.name, 'remove-card', 'minus', code, fixed) + '<strong>' + n + '</strong>' +
        smallButton('Añadir copia de ' + card.name, 'add-card', 'plus', code, fixed || n >= Math.min(copyLimit(card), owned?.[code] ?? 50) || total(deck) >= 50) +
        '</div></td><td><div class="row-tools ' + (fixed ? 'fixed' : '') + '">' +
        smallButton(fixed ? 'Desfijar ' + card.name : 'Fijar ' + card.name, 'fix', 'lock', code) +
        smallButton('Buscar sustitutos de ' + card.name, 'substitute', 'refresh', code) + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}

export function overview(view) {
  const { state, cards, rules, owned } = view;
  const leader = cards[state.deck?.leader];
  const actions = buttons(btn('Volver a la mesa', 'navigate', { glyph: 'left', value: 'workshop' }), btn('Exportar', 'export', { glyph: 'download', disabled: !leader }));
  const top = header('Análisis del mazo', leader ? esc(state.name || leader.name) : '', actions);
  if (!leader) return top + empty('Elige tu líder', 'Abre una lista o elige un líder para empezar un mazo.', buttons(
    btn('Elegir líder', 'leader', { style: 'primary' }), btn('Abrir un ejemplo', 'navigate', { value: 'library', glyph: 'library' })));
  const errors = checkDeck(state.deck, cards, rules, { draft: true, owned });
  const m = deckMetrics(state.deck, cards, state.targets);
  const probability = state.sim.mulligan ? m.redrawProbability : m.probability;
  const metrics = '<div class="metrics">' +
    metricsTile('Cartas del mazo', m.count + '<em> / 50</em>', Object.keys(state.deck.cards).length + ' cartas distintas', 'decks') +
    metricsTile('Personajes de coste bajo', m.roles.early ?? 0, 'Jugables con 0–2 DON!!', 'bolt') +
    metricsTile('Counter +2000', m.printedCounter, 'Copias con defensa impresa', 'shield') +
    metricsTile('Objetivo en mano inicial', m.count === 50 ? pct(probability) : '—',
      (state.targets.length ? 'Objetivos elegidos' : 'Personajes de coste 0–2') + (state.sim.mulligan ? ' · mulligan' : ''), 'target') + '</div>';
  const summary = '<div class="dashboard-grid">' + block('Curva de DON!!', costCurve(m.curve),
    'Copias por coste impreso', '<span class="chart-key"><i></i> Mi lista</span>', 'curve-panel') +
    block('Composición', composition(m), 'Distribución por tipo', '', 'composition') + '</div>';
  const deckActions = buttons(btn('Editar texto', 'edit', { glyph: 'edit', style: 'quiet' }),
    btn('Añadir cartas', 'navigate', { value: 'workshop', glyph: 'plus', style: 'outline-teal' }));
  const deckPanel = block('Lista del mazo', '<div class="deck-drop" data-drop="add">' + deckRows(state.deck, cards, state, owned) + '</div>',
    'Fija las cantidades que quieras conservar al optimizar.', deckActions, 'list-panel');
  const utility = buttons(btn('Guardar versión', 'save-version', { glyph: 'bookmark' }), btn('Renombrar mazo', 'rename', { glyph: 'edit' }),
    btn('Ver sinergias', 'opt-tab', { glyph: 'link', value: 'synergies' }),
    ...(state.before ? [btn('Deshacer aplicación', 'undo', { glyph: 'history' })] : []),
    ...(state.source ? [btn('Fuente de la lista', 'source', { glyph: 'external', value: state.source })] : []));
  return top + stack(...(errors.length ? [message(errors.join('\n'), 'bad')] : []), metrics, summary, deckPanel, utility);
}

const catalogFilters = ({ browse, state }) => '<div class="catalog-filters">' +
  '<label class="search-box">' + icon('search', 18) + '<input id="catalog-search" aria-label="Buscar cartas" autocomplete="off" placeholder="Nombre, código o rasgo…" value="' + esc(browse.query) + '"></label>' +
  '<select id="kind-filter" aria-label="Tipo">' + opt('', 'Todos los tipos', browse.kind) +
  Object.entries(KINDS).map(([id, label]) => opt(id, label, browse.kind)).join('') + '</select>' +
  '<select id="color-filter" aria-label="Color">' + opt('', 'Todos los colores', browse.color) +
  Object.entries(COLORS).map(([id, label]) => opt(id, label, browse.color)).join('') + '</select>' +
  '<select id="cost-filter" aria-label="Coste">' + opt('', 'Cualquier coste', browse.cost) +
  Array.from({ length: 11 }, (_, i) => opt(String(i), i === 10 ? 'Coste 10+' : 'Coste ' + i, browse.cost)).join('') + '</select>' +
  '<select id="role-filter" aria-label="Función">' + opt('', 'Todas las funciones', browse.role) +
  Object.entries(roleNames).map(([id, label]) => opt(id, label, browse.role)).join('') + '</select>' +
  (state.deck ? checkbox('compatible-filter', 'Solo cartas elegibles para mi líder', browse.compatible) : '') + '</div>';

export const catalogBatch = 30;
export function catalogSlice({ cards, state, rules, browse, owned }, from = 0) {
  const leader = cards[state.deck?.leader];
  const query = browse.query.toLowerCase().trim();
  const candidates = Object.values(cards).filter(card =>
    (!query || [card.code, card.name, ...card.traits].join(' ').toLowerCase().includes(query)) &&
    (!browse.kind || card.kind === browse.kind) && (!browse.color || card.colors.includes(browse.color)) &&
    (!browse.cost || card.kind !== 'Leader' && Math.min(10, card.cost) === Number(browse.cost)) &&
    (!browse.role || roles(card, leader ?? card).has(browse.role)) &&
    (!leader || !browse.compatible || (!cardIssue(card, leader, rules.day, rules.overrides) && (!owned || owned[card.code]))))
    .sort((a, b) => Number(a.kind !== 'Leader') - Number(b.kind !== 'Leader') || a.cost - b.cost || a.code.localeCompare(b.code));
  const shown = Math.min(browse.limit, candidates.length);
  const cardsHtml = candidates.slice(from, shown).map(card => {
    const n = state.deck?.cards[card.code] ?? 0;
    const issue = cardIssue(card, card.kind === 'Leader' ? null : leader, rules.day, rules.overrides);
    const disabled = Boolean(issue || !leader || total(state.deck) >= 50 || state.fixed.includes(card.code) || n >= Math.min(copyLimit(card), owned?.[card.code] ?? 50));
    return '<article class="gallery-card ' + color(card) + '" draggable="' + (card.kind !== 'Leader' && !disabled) + '" data-catalog-drag="' + card.code + '">' +
      '<button class="gallery-art" data-action="details" data-value="' + card.code + '" aria-label="Ver ' + esc(card.name) + '">' +
      art(card) + '<span class="art-badge">' + (card.kind === 'Leader' ? 'L' : card.cost) + '</span></button>' +
      '<div class="gallery-caption"><div class="gallery-name">' + esc(card.name) + '</div><div class="gallery-meta">' +
      dots(card) + codeLabel(card) + (n ? '<span class="quantity-badge">×' + n + '</span>' : '') + '</div>' +
      (card.kind === 'Leader' ? btn('Elegir líder', 'choose-leader', { value: card.code, disabled: Boolean(issue), title: issue, style: 'tile-button' }) :
        btn('Añadir', 'add-card', { glyph: 'plus', value: card.code, disabled, title: issue, style: 'tile-button' })) + '</div></article>';
  }).join('');
  return { cardsHtml, shown, total: candidates.length };
}

export function catalogTail({ shown, total: count }) {
  return '<div id="catalog-tail" class="gallery-tail" ' + (shown < count ? 'data-catalog-more' : '') + '>' +
    (shown < count ? btn(num(shown) + ' de ' + num(count) + ' · Cargar más', 'catalog-more', { style: 'quiet' }) :
      num(count) + ' cartas') + '</div>';
}

export function catalogResults(view) {
  const result = catalogSlice(view);
  return result.total ? '<div class="gallery" data-drop="remove">' + result.cardsHtml + '</div>' + catalogTail(result) :
    empty('Sin cartas coincidentes', 'Ajusta los filtros para consultar el catálogo.');
}

function pairView(view) {
  const { pair, cards, state } = view;
  const result = pair.result;
  return stack(block('Comparar cartas',
    '<div class="form-grid">' + formField('pair-leader', 'Líder', oneLine('pair-leader', pair.leader || state.deck?.leader, 'OP09-081')) +
    formField('pair-a', 'Carta A', oneLine('pair-a', pair.a, 'EB01-048')) + formField('pair-b', 'Carta B', oneLine('pair-b', pair.b, 'OP09-090')) + '</div>' +
    buttons(btn('Comprobar pareja', 'inspect-pair', { glyph: 'link', style: 'primary' }), btn('Buscar conexiones de A', 'explore-pair', { glyph: 'search' }),
      btn('Ejemplo de Teach', 'pair-example', { glyph: 'decks' }))),
    ...(result ? [
      ...(result.issues.length ? [message(result.issues.join('\n'), 'bad')] : [message('Compatible con ' + cards[pair.leader].name + ' en la fecha seleccionada.', 'good')]),
      block(result.explore ? 'Conexiones encontradas · ' + result.links.length : 'Conexiones por texto y recursos',
        rows(result.links.slice(0, 100)), result.links.length > 100 ? 'Se muestran las primeras 100 conexiones.' : ''),
      ...(result.cautions.length ? [block('Condiciones y orden de juego', rows(result.cautions))] : [])
    ] : []));
}

export function catalogPage(view) {
  const { catalogTab, state, cards, snapshot, busy, owned } = view;
  const leader = cards[state.deck?.leader];
  const heading = header('Catálogo', num(snapshot.cards.length) + ' cartas de Bandai · Última revisión ' + ruleDate(snapshot.checked),
    btn(busy === 'catalog' ? 'Actualizando…' : 'Actualizar catálogo', 'sync', { glyph: 'refresh', disabled: Boolean(busy) }));
  const nav = tabs([['cards', 'Explorar cartas'], ['pairs', 'Comparar cartas'], ['audit', 'Cobertura del análisis']], catalogTab, 'catalog-tab');
  if (catalogTab === 'audit') return heading + nav + auditPage(view);
  return heading + nav +
    (catalogTab === 'pairs' ? pairView(view) : '<div class="catalog-layout"><div>' + catalogFilters(view) +
      '<div id="catalog-results">' + catalogResults(view) + '</div></div>' + (leader ?
        '<aside class="panel deck-preview" data-drop="add">' + panelTitle('En mi mazo', esc(leader.name) + ' · ' + total(state.deck) + '/50') +
        (Object.keys(state.deck.cards).length ? '<div class="mini-deck">' + Object.entries(state.deck.cards)
          .sort(([a], [b]) => cards[a].cost - cards[b].cost || a.localeCompare(b)).map(([code, n]) => {
            const card = cards[code];
            return '<div class="mini-row" draggable="' + (!state.fixed.includes(code)) + '" data-deck-drag="' + code + '">' +
              '<button class="flat" data-action="details" data-value="' + code + '">' + esc(card.name) + '</button><b>' + n + '</b>' +
              smallButton('Quitar copia de ' + card.name, 'remove-card', 'minus', code, state.fixed.includes(code)) + '</div>';
          }).join('') + '</div>' : '<p class="soft">Arrastra cartas aquí para añadirlas.</p>') +
        btn('Abrir mi mazo', 'navigate', { glyph: 'right', value: 'workshop', style: 'quiet' }) + '</aside>' : '') + '</div>');
}

function auditPage({ auditResult, busy, state }) {
  const button = btn(busy === 'audit' ? 'Analizando catálogo…' : 'Calcular cobertura', 'audit', { glyph: 'chart', style: 'primary', disabled: Boolean(busy) });
  if (auditResult?.day !== state.day) return empty('Cobertura de sinergias y legalidad',
    'Calcula las parejas compatibles y los efectos interpretados para tu fecha de formato.', button);
  const { leaders, pairs, compatible, direct, analyzed, locked, breakdown } = auditResult;
  const keys = { gates: 'Condiciones de líder', searches: 'Buscadores', named: 'Apoyos por nombre', pending: 'Búsquedas pendientes',
    limits: 'Límites de juego', locks: 'Anulan Al jugar', singleton: 'Restringen duplicados en mesa' };
  return stack(block('Auditoría del ' + ruleDate(state.day), '<div class="metrics">' +
    metricsTile('Líderes elegibles', num(leaders), 'Según el formato seleccionado', 'flag') +
    metricsTile('Parejas compatibles', num(compatible), 'De ' + num(pairs) + ' parejas de códigos distintos', 'link') +
    metricsTile('Enlaces por texto', num(direct), 'Origen, objetivo y acción', 'target') +
    metricsTile('Cartas interpretadas', num(analyzed), num(locked) + ' combinaciones con Al jugar anulado', 'decks') + '</div>',
    'Una pareja es compatible si comparte al menos un líder legal.', button),
    block('Patrones del catálogo', '<div class="pair-stats">' + Object.entries(breakdown).map(([key, n]) =>
      '<div><span>' + keys[key] + '</span><strong>' + num(n) + '</strong></div>').join('') + '</div>'));
}

function synergyView(deck, other, cards) {
  const left = analyzeDeck(deck, cards);
  const right = other ? analyzeDeck(other, cards) : null;
  const key = link => [link.source, link.action, link.depth, link.zone, link.timing, link.detail, link.filterKey].join('/');
  const map = new Map(left.links.map(link => [key(link), [link, null]]));
  for (const link of right?.links ?? []) {
    const id = key(link);
    map.set(id, [map.get(id)?.[0] ?? null, link]);
  }
  const priority = ([a, b]) => {
    const link = a ?? b;
    return 100 * Number(link.source === deck.leader) + 18 * Number(link.action === 'search') +
      (right ? Math.abs((b?.targetCopies ?? 0) - (a?.targetCopies ?? 0)) * 3 : link.targetCopies);
  };
  const items = [...map.values()].sort((a, b) => priority(b) - priority(a));
  const buckets = [...new Set([...left.buckets, ...(right?.buckets ?? [])].map(bucket => bucket.name))];
  const moment = { start: 'Al comenzar la partida', on_play: 'Al jugar', on_attack: 'Al atacar', activate: 'Al activar', end: 'Al terminar el turno' };
  const synergy = ([base, variant]) => {
    const link = variant ?? base, source = cards[link.source];
    const targets = [...new Set([...(variant?.targets ?? []), ...(base?.targets ?? [])])];
    const format = code => {
      const before = deck.cards[code] ?? 0, after = other?.cards[code] ?? 0;
      const copies = other && before !== after ? before + ' → ' + after : String(before);
      return btn(cards[code].name + ' · ' + copies, 'details', { value: code, style: 'quiet', title: code });
    };
    return '<article class="synergy-route"><div class="synergy-source"><button type="button" class="flat" data-action="details" data-value="' +
      source.code + '">' + art(source, 'thumb') + '<span><strong>' + esc(source.name) + '</strong><small>' +
      esc(moment[link.timing] ?? 'Efecto de carta') + '</small>' +
      (source.kind === 'Leader' ? '<small>Líder</small>' : '<small>En mazo · ' + (deck.cards[source.code] ?? 0) +
        (right ? ' → ' + (other.cards[source.code] ?? 0) : '') + '</small>') +
      '</span></button></div><div class="synergy-targets"><h3>' +
      esc(linkLabel(link)) + '</h3><div class="actions">' + targets.slice(0, 4).map(format).join('') + '</div>' +
      (targets.length > 4 ? '<details><summary>Ver todos los objetivos</summary><div class="actions">' + targets.slice(4).map(format).join('') + '</div></details>' : '') +
      (!targets.length ? '<p class="soft">Sin objetivos en la lista.</p>' : '') + '</div><div class="synergy-outcome"><span>Copias elegibles</span><strong>' +
      (base?.targetCopies ?? 0) + (right ? ' → ' + (variant?.targetCopies ?? 0) : '') + '</strong>' +
      (link.action === 'search' ? '<span>Probabilidad de acertar</span><strong>' + (base ? pct(base.probability) : '—') +
        (right ? ' → ' + (variant ? pct(variant.probability) : '—') : '') + '</strong>' : '') + '</div></article>';
  };
  const resources = new Map([...left.resources, ...(right?.resources ?? [])].map(item => [item.label, item]));
  return stack(
    block('Qué cartas trabajan juntas', items.length ? '<div class="synergy-routes">' + items.slice(0, 7).map(synergy).join('') + '</div>' +
      (items.length > 7 ? '<details class="model-details"><summary>Ver las demás interacciones (' + (items.length - 7) +
        ')</summary><div class="synergy-routes">' + items.slice(7).map(synergy).join('') + '</div></details>' : '') :
      '<p class="soft">Aún no hay efectos interpretados que conecten estas cartas.</p>',
      right ? 'Cada ficha muestra qué activa el efecto, sus objetivos y el cambio de tu lista a la variante.' :
        'Cada ficha muestra qué activa el efecto y qué cartas de tu mazo lo aprovechan.'),
    ...(buckets.length ? [block('Paquetes del líder', '<div class="pair-stats">' + buckets.map(name => '<div><span>' + esc(name) + '</span><strong>' +
      (left.buckets.find(bucket => bucket.name === name)?.count ?? 0) + (right ? ' → ' + (right.buckets.find(bucket => bucket.name === name)?.count ?? 0) : '') +
      '</strong></div>').join('') + '</div>')] : []),
    ...(resources.size ? [block('Cómo se aprovechan los recursos', rows([...resources.values()].map(item => item.label + ' · ' +
      item.left.slice(0, 2).map(code => cards[code].name).join(', ') + ' → ' +
      item.right.slice(0, 2).map(code => cards[code].name).join(', '))))] : []),
    ...(left.cautions.length || right?.cautions.length ? [block('Condiciones de activación', rows([...new Set([...left.cautions, ...(right?.cautions ?? [])])]))] : []));
}

function changeList(items, cards, direction) {
  return items.length ? '<div class="changes-list">' + items.map(({ code, copies }) => {
    const card = cards[code];
    return '<button class="change-row" data-action="details" data-value="' + code + '">' + art(card, 'thumb') +
      '<span>' + cardName(card) + '</span><strong class="' + direction + '">' + (direction === 'in' ? '+' : '−') + copies + '</strong></button>';
  }).join('') + '</div>' : '<p class="soft">Ninguna carta.</p>';
}

const pp = value => new Intl.NumberFormat('es-BO', { signDisplay: 'exceptZero', maximumFractionDigits: 1 }).format(100 * value) + ' pp';
const pairedLabel = delta => '<span class="evidence-delta ' + (delta.low > 0 ? 'positive' : delta.high < 0 ? 'negative' : '') + '">' +
  pp(delta.value) + (delta.low <= 0 && delta.high >= 0 ? ' · No concluyente' : '') + '</span><small>IC 95 % de ' + pp(delta.low) + ' a ' + pp(delta.high) + '</small>';
const comparePercent = values => pct(values[0]) + ' → ' + pct(values[1]);

function evidenceBars(label, values, delta) {
  const names = ['Actual', 'Variante'];
  return '<div class="comparison-metric"><h3>' + label + '</h3>' + values.map((value, i) =>
    '<div class="comparison-row"><span>' + names[i] + '</span><span class="comparison-track" aria-hidden="true"><i style="--share:' +
    (value * 100) + '%"></i></span><b>' + pct(value) + '</b></div>').join('') +
    '<div class="comparison-change">' + (delta ? pairedLabel(delta) : '<b>' + pp(values[1] - values[0]) + ' · Exacto</b>') + '</div></div>';
}

function evidenceCharts(evidence) {
  return '<div class="comparison-grid">' + [['first', 'Si sales primero'], ['second', 'Si sales segundo']].map(([key, name]) => {
    const { turnOne, defense } = evidence.metrics[key];
    return '<section class="comparison-card" aria-label="' + name + '"><h3>' + name + '</h3>' +
      evidenceBars('Personaje jugable · Turno 1', turnOne.exact) +
      evidenceBars('Counter +2000 en mano · Turno 3', defense.sample.map(item => item.value), defense.delta) + '</section>';
  }).join('') + '</div>';
}

function evidencePanel(option) {
  if (!option) return empty('Calcula una propuesta', 'La evidencia compara la lista actual con una variante usando el mismo formato.');
  const { evidence, check } = option;
  const table = evidence ? '<div class="table-wrap"><table class="data-table evidence-table"><thead><tr>' +
    '<th>Orden</th><th>Personaje jugable T1, exacto</th><th>Despliegue T1, simulado</th><th>Counter +2000 T3, simulado</th></tr></thead><tbody>' +
    [['first', 'Primero'], ['second', 'Segundo']].map(([key, label]) => {
      const { turnOne, defense } = evidence.metrics[key];
      return '<tr><th scope="row">' + label + '</th><td><strong>' + comparePercent(turnOne.exact) + '</strong><small>' +
        pp(turnOne.exact[1] - turnOne.exact[0]) + '</small></td><td><strong>' + comparePercent(turnOne.sample.map(m => m.value)) +
        '</strong>' + pairedLabel(turnOne.delta) + '</td><td><strong>' + comparePercent(defense.sample.map(m => m.value)) + '</strong>' +
        pairedLabel(defense.delta) + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<p class="soft evidence-note">Counter +2000 en las cinco cartas naturales · <b>' + comparePercent(evidence.counterPrinted) + '</b></p>' : '';
  const breakdown = check ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Componente</th><th>Lista actual</th><th>Variante</th></tr></thead><tbody>' +
    Object.entries(check.proposal).filter(([label, score]) => score || check.base?.[label]).map(([label, score]) =>
      '<tr><td>' + label + '</td><td>' + (check.base ? num(check.base[label], 2) : '—') + '</td><td>' + num(score, 2) + '</td></tr>').join('') +
    '</tbody></table></div>' : '';
  return stack(
    evidence ? block('Qué cambia en mesa', evidenceCharts(evidence) + '<details class="model-details"><summary>Ver tabla de ensayos y Counter inicial</summary>' +
      table + '</details>' + (evidence.specialStart ? '<p class="soft evidence-note">Este líder puede alterar la preparación. La medición usa la mano natural de cinco cartas.</p>' : ''),
      num(evidence.trials) + ' ensayos emparejados por orden · Semilla ' + evidence.seed + ' · Mano natural sin mulligan') :
      block('Prueba comparativa', '<p class="soft">La medición requiere una lista base legal de 50 copias.</p>'),
    block('Comprobación matemática', '<div class="solver-check">' + status(option.exact ? 'Óptima para el modelo' : 'Solución factible') +
      '<span>' + num(check?.candidates ?? 0) + ' códigos candidatos</span><span>Objetivo recalculado · error ' +
      esc(check?.objectiveError?.toExponential(2) ?? '—') + '</span>' +
      (check?.upperBound != null ? '<span>Cota superior ' + num(check.upperBound, 4) + '</span>' : '') +
      (check?.gap != null ? '<span>Brecha MIP ' + num(check.gap * 100, 4) + ' %</span>' : '') +
      (check?.minCounter ? '<span>Mínimo de Counter +2000 · ' + check.minCounter + '</span>' : '') + '</div>' +
      '<details class="model-details"><summary>Ver contribuciones al puntaje</summary>' + breakdown + '</details>' +
      '<p class="soft evidence-note">La brecha compara el puntaje hallado con la cota de HiGHS. La mano natural se calcula sin reemplazo. El Counter simulado depende de la política de despliegue del Laboratorio.</p>',
      'La lista pasa por una comprobación de cantidades, legalidad y consistencia con HiGHS.'));
}

export function optimizePage(view) {
  const { state, cards, rules, busy, proposals, selected, optimizeTab, optimizeOrder, lastOptimization } = view;
  const deck = state.deck;
  const option = proposals?.[selected];
  const draft = total(deck) < 50;
  const heading = header('Optimización', draft ? 'Una propuesta de 50 cartas para jugar con tu líder.' :
    'Una propuesta para tu líder, con alternativas de salida y defensa.',
    lastOptimization && !busy ? btn('Ajustar propuesta', 'tune-optimization', { glyph: 'settings' }) : '');
  if (!deck) return heading + empty('Elige un líder', 'El motor necesita un líder para filtrar las cartas elegibles.', btn('Elegir líder', 'leader', { style: 'primary' }));
  const tab = tabs([['changes', 'Propuestas'], ['synergies', 'Sinergias'], ['evidence', 'Evidencia']], optimizeTab, 'opt-tab');
  const issues = checkDeck(deck, cards, rules, { draft: true, owned: view.owned });
  const top = heading + (proposals?.length || optimizeTab !== 'changes' ? tab : '');
  if (busy === 'optimize') return top + '<section class="shuffle-panel" role="status">' +
    '<div class="shuffle-cards" aria-hidden="true">' + Array.from({ length: 5 }, () => '<i>' + icon('compass', 27) + '</i>').join('') +
    '</div><div><h2>' + (draft ? 'Preparando tu sugerencia' : 'Optimizando tu mazo') + '</h2><p id="optimization-progress">' +
    esc(view.optimizationProgress) + '</p></div></section>';
  if (optimizeTab === 'synergies' && !proposals?.length) return top + synergyView(deck, null, cards);
  if (!proposals) {
    return top + stack(...(issues.length ? [message(issues.join('\n'), 'bad')] : []),
      empty(cards[deck.leader].name, draft ? 'Helm elige las cartas elegibles y completa el mazo según el plan del líder.' :
        'Helm busca una lista legal siguiendo el plan del líder y las cantidades fijadas.',
        buttons(btn(issues.length ? 'Reparar lista' : draft ? 'Sugerir mazo' : 'Optimizar mazo', issues.length ? 'repair' : 'run-optimize',
          { glyph: 'wand', style: 'primary', disabled: Boolean(busy) }), btn('Editar lista', 'edit', { glyph: 'edit' }))));
  }
  if (!proposals.length) return top + empty('Conservar mi mazo', 'Con estos criterios, tu lista igualó o superó las variantes encontradas.');
  const variants = '<div class="proposal-picker">' + proposals.map((item, i) =>
    '<button class="proposal-tile ' + (i === selected ? 'selected' : '') + '" data-action="select-proposal" data-value="' + i + '">' +
    '<span>' + icon(item.primary ? 'wand' : 'decks', 17) + esc(item.primary ? 'Recomendación · ' + item.name : item.name) +
    '</span><small>' + (item.changes.count ? item.changes.count + ' copias entran' : 'Conservar el mazo actual') + '</small></button>').join('') + '</div>';
  if (optimizeTab === 'evidence') return top + stack(variants, evidencePanel(option));
  if (optimizeTab === 'synergies') return top + stack(variants, synergyView(deck, option?.deck, cards));
  const original = deckMetrics(deck, cards, state.targets), updated = deckMetrics(option.deck, cards, state.targets);
  const report = option.evidence?.metrics[optimizeOrder];
  const difference = report ? report.turnOne.exact[1] - report.turnOne.exact[0] : 0;
  const measurable = report ? '<div class="outcome-report"><div class="outcome-heading"><h3>Qué cambia en partida</h3>' +
    tabs([['first', 'Salir primero'], ['second', 'Salir segundo']], optimizeOrder, 'opt-order') + '</div><div class="comparison-grid">' +
    evidenceBars('Personaje jugable por coste · Turno 1', report.turnOne.exact) +
    evidenceBars('Tener Counter +2000 en mano en el turno 3', report.defense.sample.map(item => item.value), report.defense.delta) +
    '</div><p class="outcome-reading">' + (Math.abs(difference) < 1e-8 ? 'La salida natural se mantiene.' :
      'La salida natural ' + (difference > 0 ? 'sube ' : 'baja ') + pct(Math.abs(difference)).replace(/\s*%$/, '') + ' puntos porcentuales.') +
    ' ' + (report.defense.delta.high < 0 ? 'Conservas Counter con menor frecuencia en los ensayos.' :
      report.defense.delta.low > 0 ? 'Conservas Counter con mayor frecuencia en los ensayos.' : 'El cambio de defensa en mano es incierto en los ensayos.') +
    '</p><div class="actions">' + btn('Ver evidencia', 'opt-tab', { value: 'evidence', glyph: 'chart', style: 'quiet' }) +
    btn('Ver sinergias', 'opt-tab', { value: 'synergies', glyph: 'link', style: 'quiet' }) + '</div></div>' :
    option.plan ? '<div class="outcome-report"><h3>Salida con la lista sugerida</h3><p class="outcome-reading">Personaje jugable por coste en turno 1 · ' +
      pct(option.plan.opening[0]) + ' al salir primero y ' + pct(option.plan.opening[1]) +
      ' al salir segundo. Probabilidad de una mano natural.</p></div>' : '';
  const support = option.plan && (option.plan.links.length || option.plan.packages.length) ?
    '<details class="model-details"><summary>Por qué encaja con el líder</summary>' + rows([
      ...option.plan.links.map(link => link.label + ' · ' + link.copies + ' copias elegibles' +
        (link.probability == null ? '' : ' · ' + pct(link.probability) + ' de acierto')),
      ...option.plan.packages.map(group => group.name + ' · ' + group.count + ' copias')
    ]) + '</details>' : '';
  const changed = option.changes.count || option.changes.removed.length;
  return top + stack(variants, block(esc(option.name), '<p class="soft">' + esc(option.description) + '</p>' +
    '<div class="proposal-summary"><div><span>Copias que entran</span><strong>' + option.changes.count + '</strong></div><div><span>Counter +2000</span><strong>' +
    original.printedCounter + ' → ' + updated.printedCounter + '</strong></div><div><span>Personajes coste 0–2</span><strong>' +
    (original.roles.early ?? 0) + ' → ' + (updated.roles.early ?? 0) + '</strong></div></div>' + support + measurable +
    buttons(changed ? btn('Aplicar variante', 'apply', { glyph: 'check', style: 'primary', disabled: Boolean(busy) }) :
      btn('Volver a la mesa', 'navigate', { glyph: 'decks', style: 'primary', value: 'workshop' }),
      ...(isReady(state, cards, rules) && option.changes.count > 1 ? [btn('Elegir cambios', 'choose-changes', { glyph: 'settings', disabled: Boolean(busy) })] : []),
      actionsMenu('Probar variante', btn('Probar variante en Arena', 'arena-proposal', { glyph: 'play', disabled: Boolean(busy) }) +
      btn('Repartir mano de la variante', 'hand-proposal', { glyph: 'decks', disabled: Boolean(busy) }) +
      btn('Comparar en simulador', 'compare-sim', { glyph: 'chart', disabled: Boolean(busy || !isReady(state, cards, rules)) }), 'play')),
    '', status(option.exact ? 'Óptima según el modelo' : 'Solución válida')),
    '<div class="dashboard-grid even">' + block('Salen', changeList(option.changes.removed, cards, 'out')) +
      block('Entran', changeList(option.changes.added, cards, 'in')) + '</div>',
    block('Curva antes y después', costCurve(original.curve, updated.curve), '', '<span class="chart-key"><i></i> Base <i class="gold"></i> Variante</span>'));
}

const interval = measure => '<strong title="' + esc(measure.hits + '/' + measure.n + ' · IC 95 % ' + pct(measure.low) + ' a ' + pct(measure.high)) +
  '">' + pct(measure.value) + '</strong>';
const simModes = [['opening', 'Aperturas por coste impreso'], ['pieces', 'Dos personajes en mesa'], ['ordered', 'Jugar A antes que B'], ['leader', 'Ejercicio del líder']];

function simTable(summary, drill) {
  const fields = drill ? [['ready', 'Jugada disponible'], ['disrupted', 'Con interrupción'], ['objectives', 'Piezas vistas'], ['defense', 'Counter +2000']] :
    [['deployment', 'Desplegar un personaje'], ['objectives', 'Objetivo visto'], ['defense', 'Counter +2000']];
  return '<div class="table-wrap"><table class="data-table sim-table"><thead><tr><th>Turno</th><th>DON!!</th>' +
    fields.map(([, name]) => '<th>' + name + '</th>').join('') + '<th>DON!! usado</th></tr></thead><tbody>' +
    summary[0].turns.map((row, i) => '<tr><td>T' + (i + 1) + '</td><td>' + row.don + '</td>' +
      fields.map(([id]) => '<td>' + interval(row[id]) + (summary[1] ? '<span class="after"> → ' + interval(summary[1].turns[i][id]) + '</span>' : '') + '</td>').join('') +
      '<td>' + num(row.spent, 2) + (summary[1] ? '<span class="after"> → ' + num(summary[1].turns[i].spent, 2) + '</span>' : '') +
      '</td></tr>').join('') + '</tbody></table></div>';
}

function replayBoard(trace, leader, turn, cards, label) {
  const row = trace.turns[turn];
  const zone = slots => Array.from({ length: slots }, (_, i) => {
    const code = row.board[i];
    return code ? '<button class="board-card ' + (row.played.includes(code) ? 'played' : '') + '" data-action="details" data-value="' + code + '" title="' +
      esc(cards[code].name) + '">' + avatar(cards[code]) + '<span class="replay-unit-name">' + esc(cards[code].name) + '</span></button>' : '<div class="board-slot"></div>';
  }).join('');
  return '<div class="replay-team"><div class="replay-title"><span>' + label + '</span><strong>' + esc(leader.name) + '</strong>' +
    '<div>' + dots(leader) + '</div></div><div class="board">' + zone(5) + '</div><div class="replay-stats">' +
    '<span>DON!! <b>' + row.spent + '/' + row.don + '</b></span><span>Mano <b>' + row.hand.length +
    '</b></span><span>Counter <b>+' + num(row.counter) + '</b></span><span>Poder <b>' + num(row.power) + '</b></span></div>' +
    '<details class="replay-hand"><summary>Ver mano y acciones</summary><div class="replay-notes"><span>Mano · ' +
    esc(row.hand.map(code => cards[code].name).join(', ')) + '</span>' + (row.draw ? '<span>Robo · ' + esc(cards[row.draw].name) + '</span>' : '') +
    (row.removed ? '<span>Interrupción · ' + esc(cards[row.removed].name) + '</span>' : '') +
    (row.replaced.length ? '<span>Reemplazos · ' + esc(row.replaced.map(code => cards[code].name).join(', ')) + '</span>' : '') +
    (row.found.length ? '<span>Búsquedas · ' + esc(row.found.map(code => cards[code].name).join(', ')) + '</span>' : '') +
    '</div></details></div>';
}

export function simResult({ simResult: result, simOrder, cards, simTurn, playing }) {
  if (!result) return '';
  const group = result.groups[simOrder] ?? Object.values(result.groups)[0];
  const orders = Object.keys(result.groups);
  const turn = simTurn;
  const base = group.summary[0], other = group.summary[1];
  const defensiveTurn = Math.min(2, base.turns.length - 1);
  const metric = (name, measure, variant, glyph) => metricsTile(name, interval(measure) +
    (variant ? '<em> → ' + interval(variant) + '</em>' : ''), 'IC de Wilson del 95 % al pasar el cursor', glyph);
  return stack(
    '<div class="result-heading"><div><h2>Resultados</h2><p>' + num(result.trials) + ' ensayos por orden · Semilla ' + result.seed +
    (result.drill ? ' · ' + esc(result.drill) : '') + '</p></div>' + (orders.length > 1 ? tabs([['first', 'Primero'], ['second', 'Segundo']], simOrder, 'sim-order') : '') + '</div>',
    '<div class="metrics three">' + metric('Despliegue en turno 1', base.turns[0].deployment, other?.turns[0].deployment, 'bolt') +
    metric('Counter +2000 en turno ' + (defensiveTurn + 1), base.turns[defensiveTurn].defense, other?.turns[defensiveTurn].defense, 'shield') +
    metric('Objetivo en mano inicial', base.opening, other?.opening, 'target') + '</div>',
    '<div class="lab-summary">' + (base.exact === null ? '' : '<span>Probabilidad exacta <b>' + pct(base.exact) +
      (other ? ' → ' + pct(other.exact) : '') + '</b></span>') +
    '<span>Manos cambiadas <b>' + pct(base.mulligans.value) + (other ? ' → ' + pct(other.mulligans.value) : '') + '</b></span></div>',
    block('Resultados por turno', simTable(group.summary, result.drill), other ? 'Base → variante con semillas emparejadas.' : 'Estimaciones de la lista base.'),
    block('<span id="replay-turn">Repetición · Turno ' + (turn + 1) + '</span>', '<div id="replay-teams" class="replay-teams">' +
      group.replay.lists.map((trace, i) => replayBoard(trace, cards[result.leaders[i]], turn, cards, i ? 'Variante' : 'Base')).join('') +
      (group.replay.rival ? replayBoard(group.replay.rival, cards[result.leaders.at(-1)], turn, cards, 'Rival') : '') + '</div>',
      'Primer ensayo con la semilla indicada.', buttons(smallButton('Turno anterior', 'sim-turn', 'left', -1, turn === 0),
        btn(playing ? 'Pausar' : 'Reproducir', 'sim-play', { glyph: playing ? 'pause' : 'play', style: 'outline-teal' }),
        smallButton('Turno siguiente', 'sim-turn', 'chevron', 1, turn === result.horizon - 1))));
}

export function simulator(view) {
  const { state, cards, rules, busy, simPair } = view;
  const { sim } = state;
  const top = header('Laboratorio', 'Mide manos, curva y defensa en ensayos repetibles.',
    buttons(btn('Ir a Arena', 'arena-open', { glyph: 'play' }), btn('Configurar rival', 'rival', { glyph: 'flag' })));
  if (!state.deck) return top + empty('Elige un mazo', 'Las aperturas necesitan una lista legal de 50 cartas.', btn('Abrir biblioteca', 'navigate', { value: 'library' }));
  const fields = '<div class="form-grid laboratory-fields">' +
    formField('sim-mode', 'Ejercicio', '<select id="sim-mode">' + simModes.map(([id, label]) => opt(id, label, sim.mode)).join('') + '</select>') +
    formField('sim-order', 'Orden de salida', '<select id="sim-order">' + [['both', 'Ambos'], ['first', 'Primero'], ['second', 'Segundo']].map(([id, label]) => opt(id, label, sim.order)).join('') + '</select>') +
    formField('sim-trials', 'Ensayos', '<input id="sim-trials" type="number" min="1" max="20000" value="' + esc(sim.trials) + '">') +
    formField('sim-horizon', 'Turnos', '<input id="sim-horizon" type="number" min="1" max="8" value="' + esc(sim.horizon) + '">') +
    formField('sim-seed', 'Semilla', '<input id="sim-seed" type="number" min="0" max="4294967295" value="' + esc(sim.seed) + '">') + '</div>';
  const detailed = sim.mode === 'pieces' || sim.mode === 'ordered';
  const objectives = sim.mode !== 'leader' ? '<div class="form-grid">' + formField('sim-a', detailed ? 'Personajes A' : 'Objetivos A',
    oneLine('sim-a', sim.a, 'OP17-021'), detailed ? '' : 'Si está vacío, usa los objetivos del mazo o personajes de coste 0–2.') +
    formField('sim-b', detailed ? 'Personajes B' : 'Objetivos B (opcional)', oneLine('sim-b', sim.b, 'OP17-027'),
      detailed ? 'Separa los códigos con coma o espacio.' : 'Si lo rellenas, busca al menos una copia de A y otra de B.') + '</div>' : '';
  return top + stack(block('Configurar ensayo', fields + objectives + '<div class="check-row">' +
    checkbox('sim-mulligan', 'Hacer mulligan sin objetivo', sim.mulligan) +
    checkbox('sim-reserve', 'Reservar Counter +2000', sim.reserve) +
    checkbox('sim-interruption', 'Interrupción de prueba', sim.interruption) + '</div>' +
    '<div class="sim-controls">' + buttons(btn(busy === 'simulate' ? 'Simulando…' : 'Simular aperturas', 'simulate', { glyph: 'play', style: 'primary',
      disabled: Boolean(busy || !isReady(state, cards, rules)) }), ...(simPair ? [btn('Usar solo mi mazo', 'clear-sim-pair', { glyph: 'close' })] : [])) +
    '<span class="soft">' + (simPair ? 'Comparativa · ' + esc(simPair.label) : 'Lista base · ' + esc(cards[state.deck.leader].name)) + '</span></div>',
    'Modelo de aperturas con robos, DON!! y despliegue. Los ejercicios de líder tienen efectos revisados.'),
    ...(isReady(state, cards, rules) ? [] : [message('Completa y valida tu lista antes de simular.', 'bad')]),
    ...(busy === 'simulate' ? ['<div class="loading"><i class="spinner"></i> Muestreando manos y turnos…</div>'] :
      view.simResult ? [simResult(view)] : []));
}

function exampleCards(list, type, view) {
  const { cards, rules } = view;
  return '<div class="examples">' + list.map((item, i) => {
    const leader = cards[item.leader];
    const issue = cardIssue(leader, null, rules.day, rules.overrides);
    return '<article class="example-card">' + art(leader) + '<div><h3>' + esc(leader.name) + '</h3><p>' + esc(item.name) + '</p>' +
      '<small>' + esc(item.context ?? leader.code) + '</small>' + buttons(btn('Cargar', 'load-list', { value: type + ':' + i, disabled: Boolean(issue), style: 'outline-teal' }),
        btn('Fuente', 'source', { glyph: 'external', value: item.source, style: 'quiet' })) + '</div></article>';
  }).join('') + '</div>';
}

export function library(view) {
  const { state, cards, libraryTab, examples, query, busy, ownTournaments } = view;
  const heading = header('Biblioteca', 'Listas guardadas, referencias de torneo y tu colección.',
    buttons(btn('Guardar mi mazo', 'save-version', { glyph: 'bookmark', disabled: !state.deck }), btn('Mi colección', 'collection', { glyph: 'library' })));
  const tab = tabs([['versions', 'Mis listas'], ['examples', 'Mazos de ejemplo'], ['tournaments', 'Torneos']], libraryTab, 'library-tab');
  if (libraryTab === 'examples') return heading + tab + exampleCards(examples, 'example', view);
  if (libraryTab === 'tournaments') return heading + tab + '<div class="catalog-filters"><label class="search-box">' + icon('search', 18) +
    '<input id="tournament-search" aria-label="Buscar listas" value="' + esc(query) +
    '" placeholder="Buscar líder, código o torneo…"></label>' +
    btn(busy === 'tournaments' ? 'Consultando…' : 'Actualizar torneos', 'refresh-tournaments', { glyph: 'refresh', disabled: Boolean(busy) }) +
    (state.deck ? checkbox('tournaments-leader', 'Solo mi líder', ownTournaments) : '') +
    '</div><div id="tournament-results">' + tournamentResults(view) + '</div>';
  if (!state.versions.length) return heading + tab + empty('Aún no hay listas guardadas', 'Puedes guardar el mazo actual o cargar una lista de ejemplo.',
    btn('Explorar ejemplos', 'library-tab', { value: 'examples', glyph: 'decks', style: 'primary' }));
  return heading + tab + '<div class="versions">' + state.versions.map(item => {
    const leader = cards[item.deck.leader];
    return '<article class="panel version-row">' + art(leader, 'thumb') + '<div><h3>' + esc(item.name || leader.name) + '</h3><small>' +
      esc(leader.code + ' · ' + total(item.deck) + '/50 · ' + timestamp(item.when)) + '</small></div>' +
      btn('Abrir lista', 'load-version', { glyph: 'right', value: item.id }) + '</article>';
  }).join('') + '</div>';
}

export function visibleTournaments(view) {
  const term = view.query.trim().toLowerCase();
  return view.tournamentList.filter(item => {
    if (view.ownTournaments && view.state.deck && item.leader !== view.state.deck.leader) return false;
    if (![item.name, item.leader, view.cards[item.leader]?.name].join(' ').toLowerCase().includes(term)) return false;
    try { return checkDeck(parseDeck(item.text, view.cards), view.cards, view.rules).length === 0; }
    catch { return false; }
  });
}

export function tournamentResults(view) {
  const list = visibleTournaments(view);
  return list.length ? exampleCards(list, 'tournament', view) : empty('Sin listas legales en esta búsqueda', 'Cambia el filtro de líder o actualiza los torneos.');
}

const positions = { first: 'Primero', second: 'Segundo' };
export const outcomes = { win: 'Victoria', loss: 'Derrota', draw: 'Empate' };

function versionCode(deck) {
  let hash = 2166136261;
  for (const char of deckText(deck, true)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function matchesPage(view) {
  const { state, cards } = view;
  const heading = header('Partidas', 'Registra resultados con el rival, el orden y la versión exacta del mazo.',
    buttons(btn('Exportar CSV', 'csv', { glyph: 'download', disabled: !state.matches.length }), btn('Registrar partida', 'record', { glyph: 'plus', style: 'primary', disabled: !state.deck })));
  if (!state.matches.length) return heading + empty('Aún no hay resultados', 'Carga un rival y registra una partida jugada para seguir el rendimiento de tu mazo.',
    btn('Configurar rival', 'rival', { glyph: 'flag' }));
  const formatRecord = value => {
    const saved = state.versions.find(item => deckText(item.deck, true) === deckText(value, true));
    return (saved?.name || cards[value.leader].name) + ' · ' + (total(value) ? versionCode(value) : 'solo líder');
  };
  const summaries = new Map();
  for (const record of state.matches) {
    const key = [deckText(record.own, true), deckText(record.rival, true), record.order].join('|');
    const tally = summaries.get(key) ?? { ...record, win: 0, loss: 0, draw: 0, n: 0 };
    tally[record.outcome]++;
    tally.n++;
    summaries.set(key, tally);
  }
  return heading + stack(block('Rendimiento por lista y orden',
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Mi lista</th><th>Rival</th><th>Salida</th><th>V / D / E</th><th>Victorias</th></tr></thead><tbody>' +
    [...summaries.values()].map(row => '<tr><td>' + esc(formatRecord(row.own)) + '</td><td>' + esc(formatRecord(row.rival)) +
      '</td><td>' + positions[row.order] + '</td><td>' + [row.win, row.loss, row.draw].join(' / ') + '</td><td>' + interval(rate(row.win, row.n)) + '</td></tr>').join('') +
    '</tbody></table></div>'), block('Registro',
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Mi lista</th><th>Rival</th><th>Salida</th><th>Resultado</th></tr></thead><tbody>' +
    state.matches.map(row => '<tr><td>' + esc(timestamp(row.when)) + '</td><td>' + esc(formatRecord(row.own)) + '</td><td>' + esc(formatRecord(row.rival)) +
      '</td><td>' + positions[row.order] + '</td><td>' + status(outcomes[row.outcome], row.outcome === 'win' ? 'good' : row.outcome === 'loss' ? 'bad' : 'pending') + '</td></tr>').join('') +
    '</tbody></table></div>'));
}
