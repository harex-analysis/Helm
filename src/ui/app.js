import { assertDay, cardIssue, checkDeck, closeDon, copyLimit, deckText, FIRST_DAY, LAST_DAY, indexCards, openingDeck,
  pairBanned, parseDeck, readQuantities, today, total } from '../core/deck.js';
import { deckMetrics, editContext, explainChanges, inspectPair, roleNames, roles } from '../core/analysis.js';
import { art, btn, cardName, checkbox, dots, esc, formField, icon, kind, listArea, message, oneLine, opt, smallButton } from './components.js';
import { catalogBatch, catalogPage, catalogResults, catalogSlice, catalogTail, library, matchesPage, optimizePage, outcomes,
  sidebar, simulator, tournamentResults, visibleTournaments, overview } from './views.js';
import { builder, builderBatch, builderResults, builderSlice, builderTail } from './builder.js';
import { Arena } from '../core/arena.js';
import { arenaActions, arenaView } from './arena-view.js';
import { animateCrew, crewCanvas, crewMotions, paintSprites } from './crew-sprites.js';
import { configureArcade, cue, flight, motionAllowed, pulse, scene, showProposal, showRoute, showShuffle, stagger, tween } from './arcade.js';
import { closeScene, combatScene } from './arena-scene.js';
import { rivalLists, suggestedRivals } from '../core/rivals.js';
import { pairedOrders, rng, shuffle } from '../core/simulation.js';

const ui = document.querySelector('#main');
const nav = document.querySelector('#sidebar');
const modal = document.querySelector('#dialog');
const notice = document.querySelector('#toast');
const engine = window.desktop;
const el = id => document.getElementById(id);
const value = id => el(id).value;
const checked = id => el(id).checked;
const codes = raw => [...new Set(raw.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
const cleanCode = string => string.trim().toUpperCase();
const sameDeck = (a, b) => deckText(a, true) === deckText(b, true);
const views = { workshop: builder, arena: arenaView, overview, catalog: catalogPage, optimize: optimizePage, simulator, library, matches: matchesPage };
const simDefaults = { mode: 'opening', trials: 512, horizon: 5, seed: 17, order: 'both', a: '', b: '', mulligan: true, reserve: false, interruption: true };
const browse = { query: '', kind: '', color: '', cost: '', role: '', compatible: true, limit: catalogBatch };
const builderBrowse = { search: '', kind: '', cost: '', role: '', limit: builderBatch };
const pair = { leader: '', a: '', b: '', result: null };
let state, snapshot, cards, examples, tournamentList, owned, rival;
let page = 'workshop', catalogTab = 'cards', libraryTab = 'versions', optimizeTab = 'changes', query = '', busy = '';
let proposals, selected = 0, simResult, simPair, simOrder = 'first', simTurn = 0, playTimer, toastTimer, prefsTimer, modalSave;
let choosing = false, cardClick, shelfScroll = 0;
let auditResult, ownTournaments = false;
let refreshStatus = 'Revisando fuentes…', pendingRefresh, optimizationProgress = '';
const arenaPrefs = { list: 'current', order: 'first', seed: 17, auto: false };
let duel, arenaCandidate, arenaFocus, arenaAttack, arenaTimer, lastMotion = 0;
let arenaLogOpen = false, arenaSeedOpen = false;
let rivalCache, rivalChoices = [];
let motion, showPage = false, handDrill, optimizeOrder = 'first', lastOptimization;
const feeds = {
  workshop: { id: 'builder', grid: '.builder-gallery', filters: builderBrowse, batch: builderBatch, slice: builderSlice, tail: builderTail },
  catalog: { id: 'catalog', grid: '.gallery', filters: browse, batch: catalogBatch, slice: catalogSlice, tail: catalogTail }
};
const galleryObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting && entry.target.isConnected)) moreCards();
}, { root: ui, rootMargin: '0px 0px 240px' });

function trackGallery() {
  galleryObserver.disconnect();
  const feed = feeds[page];
  const tail = feed && ui.querySelector('[data-' + feed.id + '-more]');
  if (tail) galleryObserver.observe(tail);
}

function moreCards() {
  const feed = feeds[page];
  if (!feed) return;
  const gallery = ui.querySelector(feed.grid);
  const tail = el(feed.id + '-tail');
  if (!gallery || !tail?.hasAttribute('data-' + feed.id + '-more')) return;
  const focused = tail.contains(document.activeElement);
  const from = gallery.children.length;
  feed.filters.limit += feed.batch;
  const result = feed.slice(view(), from);
  gallery.insertAdjacentHTML('beforeend', result.cardsHtml);
  tail.outerHTML = feed.tail(result);
  if (focused) gallery.children[from]?.querySelector('button')?.focus({ preventScroll: true });
  trackGallery();
}

function filterBuilder() {
  builderBrowse.limit = builderBatch;
  el('builder-results').innerHTML = builderResults(view());
  trackGallery();
}

const rules = () => ({ day: state.day, overrides: snapshot.overrides });
function availableRivals() {
  const key = [snapshot, examples, tournamentList, state.day, state.versions.length];
  if (!rivalCache || key.some((item, index) => item !== rivalCache.key[index])) {
    rivalCache = { key, lists: rivalLists(examples, tournamentList, state.versions, cards, rules()) };
  }
  return rivalCache.lists;
}

function arenaDeck() {
  return (arenaPrefs.list === 'proposal' ? arenaCandidate : arenaPrefs.list === 'before' ? state.before?.deck : state.deck) ?? state.deck;
}

const view = () => {
  const arenaLists = {};
  if (state.deck) arenaLists.current = state.deck;
  if (state.before?.deck) arenaLists.before = state.before.deck;
  if (arenaCandidate) arenaLists.proposal = arenaCandidate;
  return { page, state, cards, snapshot, examples, tournamentList, proposals, selected, optimizeTab, catalogTab, libraryTab, query,
    simPair, simResult, simOrder, simTurn, playing: Boolean(playTimer), owned, rival, busy, rules: rules(), browse, pair, builderBrowse, choosing,
    auditResult, ownTournaments, refreshStatus, optimizationProgress, optimizeOrder, lastOptimization,
    duel, arenaFocus, arenaAttack, arenaPrefs, arenaLists, arenaLogOpen, arenaSeedOpen,
    arenaTargets: arenaAttack && duel ? duel.targets(arenaAttack).map(item => item.id) :
      duel?.phase === 'block' && duel.decisionSide() === 0 ? duel.blockers().map(item => item.id) : [],
    arenaCounters: duel?.phase === 'counter' && duel.decisionSide() === 0 ? duel.counters().map(item => item.id) : [],
    arenaEnemy: page === 'arena' && !duel ? simulationRival(arenaDeck()) : null,
    arenaEnemyOrigin: state.rivalText ? state.rivalOrigin || (total(rival) ? 'Lista personalizada' : 'Lista del líder elegido') : 'Sugerido para práctica' };
};

function render() {
  adoptRefresh();
  const scroll = ui.scrollTop;
  const handScroll = el('arena-hand-tray')?.scrollLeft ?? 0;
  const boardScroll = el('arena-board')?.scrollTop ?? 0;
  const previousHand = new Set([...ui.querySelectorAll('.arena-hand-unit')].map(unit => unit.dataset.unitId));
  const previousTurn = ui.querySelector('.arena-board')?.dataset.turn;
  arenaLogOpen = el('arena-log-details')?.open ?? arenaLogOpen;
  arenaSeedOpen = ui.querySelector('.arena-seed')?.open ?? arenaSeedOpen;
  shelfScroll = el('deck-shelf-cards')?.scrollLeft ?? shelfScroll;
  const focus = document.activeElement;
  const anchor = ui.contains(focus) ? (focus.id ? '#' + CSS.escape(focus.id) :
    focus.dataset.action ? '[data-action="' + CSS.escape(focus.dataset.action) + '"]' +
      (focus.dataset.value === undefined ? '' : '[data-value="' + CSS.escape(focus.dataset.value) + '"]') : '') : '';
  const model = view();
  nav.innerHTML = sidebar(model);
  ui.innerHTML = views[page](model);
  if (el('deck-shelf-cards')) el('deck-shelf-cards').scrollLeft = shelfScroll;
  ui.scrollTop = scroll;
  trackGallery();
  if (showPage) {
    showPage = false;
    showRoute(ui);
  }
  if (busy === 'optimize' && page === 'optimize') showShuffle(ui);
  if (page === 'arena') {
    if (el('arena-board')) el('arena-board').scrollTop = boardScroll;
    const motions = duel ? crewMotions(duel.log, lastMotion) : [];
    animateCrew(ui, motions);
    lastMotion = duel?.sequence ?? 0;
    if (el('arena-hand-tray')) {
      const tray = el('arena-hand-tray');
      tray.scrollLeft = handScroll;
      const entering = [...tray.children].filter(unit => unit.dataset.unitId && !previousHand.has(unit.dataset.unitId));
      if (entering.length) {
        const action = previousHand.size ? 'draw' : 'deal';
        stagger(action, entering);
        cue(action, entering[0]);
      }
    }
    if (duel && previousTurn !== undefined && previousTurn !== String(duel.ply)) {
      pulse('turn', ui.querySelector('.phase-rail li[aria-current]'));
    }
    const duration = combatScene(el('arena-board'), motions, cards, state.motionMode, duel?.battle, unit => duel.power(unit));
    scheduleArena(Math.max(duration, ...motions.map(event => scene(event.kind).ms)));
  }
  if (anchor) ui.querySelector(anchor)?.focus({ preventScroll: true });
}

function go(destination) {
  if (!views[destination]) return;
  if (destination !== 'simulator') stopPlayback();
  if (destination !== 'arena') { clearTimeout(arenaTimer); closeScene(); }
  if (page !== destination) {
    ui.scrollTop = 0;
    showPage = true;
  }
  page = destination;
  render();
}

function toast(text, type = '') {
  clearTimeout(toastTimer);
  notice.className = 'toast ' + type;
  notice.textContent = text;
  notice.hidden = false;
  toastTimer = setTimeout(() => { notice.hidden = true; }, type === 'bad' ? 8500 : 3400);
}

function showError(error) {
  const text = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  if (modal.open && el('dialog-errors')) {
    el('dialog-errors').innerHTML = message(text, 'bad');
  } else toast(text, 'bad');
}

function persist() {
  clearTimeout(prefsTimer);
  return engine.save(state).catch(showError);
}

function hydrate() {
  owned = state.ownedText ? readQuantities(state.ownedText, cards).quantities : null;
  rival = state.rivalText ? parseDeck(state.rivalText, cards) : null;
}

function adoptRefresh() {
  if (!pendingRefresh || busy || modal.open) return;
  const update = pendingRefresh;
  pendingRefresh = null;
  if (update.catalog?.value) {
    snapshot = update.catalog.value;
    cards = indexCards(snapshot);
    hydrate();
    if (proposals?.some(option => checkDeck(option.deck, cards, rules(), { owned }).length)) resetResults();
    auditResult = null;
  }
  if (update.tournaments?.value) tournamentList = update.tournaments.value;
}

async function refreshOnLaunch() {
  try {
    pendingRefresh = await engine.refresh();
    refreshStatus = pendingRefresh.offline ? 'Fuentes locales' :
      pendingRefresh.catalog?.error || pendingRefresh.tournaments?.error ? 'Revisión parcial · copia local' : 'Fuentes revisadas al abrir';
  } catch {
    refreshStatus = 'Fuentes locales · revisión pendiente';
  }
  if (!busy && !modal.open && !(page === 'arena' && duel)) render();
}

function currentVersion() {
  return { deck: structuredClone(state.deck), name: state.name, source: state.source, fixed: [...state.fixed] };
}

function remember(record = currentVersion()) {
  if (!record.deck) return false;
  if (state.versions.some(item => sameDeck(item.deck, record.deck) && item.name === record.name)) return false;
  state.versions.unshift({ ...record, id: crypto.randomUUID(), when: new Date().toISOString() });
  return true;
}

function stopPlayback() {
  clearInterval(playTimer);
  playTimer = null;
}

function resetResults() {
  proposals = null;
  lastOptimization = null;
  selected = 0;
  simResult = null;
  simPair = null;
  stopPlayback();
}

function replaceDeck(deck, source = '', name = '', preserve = true, fixed = []) {
  if (preserve && state.deck && !sameDeck(state.deck, deck)) remember();
  state.deck = deck;
  choosing = false;
  if (el('deck-shelf-cards')) el('deck-shelf-cards').scrollLeft = 0;
  shelfScroll = 0;
  Object.assign(builderBrowse, { search: '', kind: '', cost: '', role: '', limit: builderBatch });
  state.source = source;
  state.name = name;
  state.fixed = fixed;
  state.targets = [];
  state.before = null;
  resetResults();
  persist();
}

function showModal(title, content, { submit, save = 'Guardar', classes = '' } = {}) {
  modalSave = submit;
  modal.className = classes;
  modal.innerHTML = '<form novalidate><div class="dialog-heading"><h2>' + esc(title) + '</h2>' +
    smallButton('Cerrar', 'close-modal', 'close', '') + '</div><div id="dialog-errors" role="alert"></div>' +
    '<div class="dialog-content">' + content + '</div>' + (submit ? '<div class="dialog-footer">' + btn('Cancelar', 'close-modal') +
    '<button class="button primary" type="submit">' + esc(save) + '</button></div>' : '') + '</form>';
  if (!modal.open) modal.showModal();
  paintSprites(modal);
}

function fileEditor(target) {
  const desk = { deck: ['Importar una lista', 'lista', deckText(state.deck, true)], rival: ['Configurar rival', 'rival', state.rivalText],
    collection: ['Mi colección', 'colección', state.ownedText] }[target];
  const extra = target === 'rival' ? checkbox('example-rival', 'Usar un rival de ejemplo si el campo queda vacío', state.exampleRival) : '';
  const text = target === 'collection' ? 'Incluye cantidades y códigos. Deja el campo vacío para poder usar todo el catálogo.' :
    target === 'rival' ? 'Para optimizar puedes usar el líder como referencia. El ensayo con rival necesita una lista legal de 50 cartas.' :
      'Pega una lista con una cantidad y un código por línea. También puedes abrir un archivo .txt.';
  showModal(desk[0], '<p class="soft">' + text + '</p>' +
    formField('list-input', 'Texto de ' + desk[1], listArea('list-input', desk[2], '1 OP17-039\n4 OP17-045')) + extra +
    btn('Abrir archivo .txt', 'open-file', { glyph: 'upload' }),
  { save: target === 'deck' ? 'Cargar lista' : 'Guardar', submit: () => saveEditor(target, value('list-input').trim()) });
  if (target === 'deck') el('list-input').select();
}

function saveEditor(target, raw) {
  if (target === 'deck') {
    const deck = parseDeck(raw, cards);
    const fixed = state.deck?.leader === deck.leader ? state.fixed.filter(code => deck.cards[code] === state.deck.cards[code]) : [];
    replaceDeck(deck, '', state.deck?.leader === deck.leader ? state.name : '', true, fixed);
    go('workshop');
    stagger('deal', ui.querySelectorAll('.shelf-card'));
    toast('Lista cargada.');
    return;
  }
  if (target === 'collection' && raw) readQuantities(raw, cards);
  if (target === 'rival' && raw) {
    const deck = parseDeck(raw, cards);
    if (![0, 50].includes(total(deck))) throw new Error('Incluye el líder solo o su lista de 50 cartas.');
    const errors = checkDeck(deck, cards, rules(), { draft: true });
    if (errors.length) throw new Error(errors.join('\n'));
  }
  if (target === 'collection') state.ownedText = raw;
  if (target === 'rival') {
    state.rivalText = raw;
    state.rivalOrigin = '';
    state.exampleRival = checked('example-rival');
    if (page === 'arena') clearDuel();
  }
  hydrate();
  resetResults();
  persist();
  render();
  toast(target === 'collection' ? 'Colección actualizada.' : 'Rival actualizado.');
}

const leaderPrompt = () => '<label class="search-box">' + icon('search', 16) + '<input id="leader-search" autocomplete="off" ' +
  'aria-label="Buscar líder" placeholder="Nombre, código o tipo…"></label><div id="leader-results"></div>';

function leaderResults() {
  const search = value('leader-search').trim().toLowerCase();
  const eligible = Object.values(cards).filter(card => card.kind === 'Leader' && !cardIssue(card, null, state.day, snapshot.overrides) &&
    (!owned || owned[card.code]) && (!search || [card.name, card.code, ...card.traits].join(' ').toLowerCase().includes(search)))
    .sort((a, b) => a.name.localeCompare(b.name));
  el('leader-results').innerHTML = eligible.length ? '<div class="leader-results">' + eligible.map(card =>
    '<button type="button" class="leader-row" data-action="choose-leader" data-value="' + card.code + '">' + art(card, 'thumb') +
    '<span>' + cardName(card) + '</span><span>' + dots(card) + '</span></button>').join('') + '</div>' : '<p class="soft">Sin líderes disponibles para estos filtros.</p>';
}

function showSettings() {
  showModal('Formato y colección', '<div class="form-grid">' +
    formField('rule-day', 'Fecha del formato', '<input type="date" id="rule-day" min="' + FIRST_DAY + '" max="' + LAST_DAY + '" value="' + state.day + '">',
      'English Standard · Latinoamérica sin Brasil · niveles 1–2') + '</div><div class="actions">' +
    btn('Editar colección', 'collection', { glyph: 'library' }) +
    btn('Reglas de Bandai', 'source', { glyph: 'external', value: 'https://en.onepiece-cardgame.com/rules/', style: 'quiet' }) + '</div>',
  { submit: () => {
    const day = value('rule-day');
    assertDay(day);
    state.day = day;
    pair.result = null;
    resetResults();
    persist();
    render();
    toast('Ajustes guardados.');
  } });
}

const automaticPlan = { maxChanges: 50, minCounter: 0, minimums: {}, start: 'both', targets: [], synergy: true,
  keepDraft: true, preserveStructure: false, useRival: true };

function adjustOptimization() {
  if (!lastOptimization) return;
  const plan = lastOptimization;
  const complete = total(state.deck) >= 50;
  const position = [['both', 'Ambos órdenes'], ['first', 'Primero'], ['second', 'Segundo']];
  const limit = (id, label, current, hint) => formField(id, label,
    '<input type="number" id="' + id + '" min="0" max="50" value="' + current + '">', hint);
  showModal('Ajustar propuesta', '<p class="soft">Estos cambios vuelven a calcular la propuesta. Puedes probarla antes de aplicarla.</p><div class="form-grid">' +
    (complete ? limit('tune-changes', 'Copias que pueden entrar', plan.maxChanges, '50 deja toda la lista disponible para cambiar.') : '') +
    limit('tune-counter', 'Mínimo de Counter +2000', plan.minCounter, 'Copias con Counter impreso.') +
    formField('tune-order', 'Salida prioritaria', '<select id="tune-order">' + position.map(([id, label]) => opt(id, label, plan.start)).join('') + '</select>') +
    '</div>' + (complete ? checkbox('tune-structure', 'Conservar la composición y afinidad de mi mazo', plan.preserveStructure) :
      checkbox('tune-draft', 'Mantener las cartas de mi borrador', plan.keepDraft)) +
    '<details class="model-details"><summary>Más ajustes</summary>' +
    formField('tune-minimums', 'Copias mínimas por carta', listArea('tune-minimums',
      Object.entries(plan.minimums).map(([code, n]) => n + ' ' + code).join('\n'), '3 OP17-050'),
      'Una cantidad y un código por línea.') +
    formField('tune-targets', 'Códigos que quiero priorizar', oneLine('tune-targets', plan.targets.join(' '), 'OP17-045 OP17-050')) +
    checkbox('tune-synergy', 'Puntuar efectos que funcionan juntos', plan.synergy) +
    (rival ? checkbox('tune-rival', 'Incluir una alternativa contra mi rival', plan.useRival) : '') + '</details>', {
    save: 'Recalcular',
    submit: async () => {
      const integer = (id, hint) => {
        const text = value(id);
        const amount = Number(text);
        if (!text || !Number.isInteger(amount) || amount < 0 || amount > 50) throw new Error(hint);
        return amount;
      };
      const targets = codes(value('tune-targets'));
      const { quantities: minimums, don } = readQuantities(value('tune-minimums'), cards);
      if (don !== null || Object.keys(minimums).some(code => cards[code].kind === 'Leader')) {
        throw new Error('Indica cantidades de cartas del mazo principal.');
      }
      if (targets.some(code => !cards[code] || cards[code].kind === 'Leader')) throw new Error('Usa códigos de cartas del mazo principal.');
      const options = { ...plan, minCounter: integer('tune-counter', 'El mínimo de Counter debe estar entre 0 y 50.'),
        maxChanges: complete ? integer('tune-changes', 'Elige entre 0 y 50 copias que pueden entrar.') : 50,
        start: value('tune-order'), targets, minimums, synergy: checked('tune-synergy'),
        keepDraft: complete || checked('tune-draft'), preserveStructure: complete && checked('tune-structure'),
        useRival: Boolean(rival && checked('tune-rival')) };
      modal.close();
      await runOptimization(plan.repair, options);
    }
  });
}

function showDetails(code) {
  const card = cards[code];
  const leader = cards[state.deck?.leader];
  const n = state.deck?.cards[code] ?? 0;
  const issue = cardIssue(card, card.kind === 'Leader' ? null : leader, state.day, snapshot.overrides);
  const tags = [...roles(card, leader ?? card)].map(role => roleNames[role]).filter(Boolean);
  showModal(card.name, '<div class="card-detail">' + art(card, 'detail-art', true) + '<div><div class="detail-id">' +
    dots(card) + '<span class="code">' + code + '</span><span>' + kind(card) + '</span></div>' +
    '<p class="soft">' + esc(card.traits.join(' / ')) + '</p><div class="detail-values">' +
    (card.kind === 'Leader' ? '<span>Vida <b>' + card.life + '</b></span><span>DON!! <b>' + closeDon(card) + '</b></span>' :
      '<span>Coste <b>' + card.cost + '</b></span><span>Counter <b>+' + card.counter + '</b></span>') +
    '<span>Poder <b>' + card.power + '</b></span>' + '<span class="detail-crew">' + crewCanvas(card) + '</span></div>' +
    (card.effect_text && card.effect_text !== '-' ? '<p class="effect-text">' + esc(card.effect_text) + '</p>' : '') +
    (card.trigger_text && card.trigger_text !== '-' ? '<p class="effect-text"><b>Trigger</b> · ' + esc(card.trigger_text) + '</p>' : '') +
    (tags.length ? '<div class="tags">' + tags.map(role => '<span>' + esc(role) + '</span>').join('') + '</div>' : '') +
    (issue ? message(issue, 'bad') : '') +
    '<div class="actions">' + (card.kind === 'Leader' ? btn('Elegir líder', 'choose-leader', { value: code, disabled: Boolean(issue), style: 'primary' }) :
      btn('Añadir al mazo', 'add-card', { glyph: 'plus', value: code,
        disabled: Boolean(issue || !leader || total(state.deck) >= 50 || state.fixed.includes(code) || n >= Math.min(copyLimit(card), owned?.[code] ?? 50)), style: 'primary' })) +
    btn('Comparar', 'compare-card', { glyph: 'link', value: code }) +
    (n ? btn('Buscar sustitutos', 'substitute', { glyph: 'refresh', value: code }) : '') +
    '</div></div></div>', { classes: 'detail-dialog' });
}

const cardAt = (area, code) => ui.querySelector('[data-' + area + '-drag="' + CSS.escape(code) + '"]');

function practiceHand(action, deck) {
  if (action === 'new') {
    const practiceDeck = deck ?? handDrill?.deck ?? state.deck;
    const issues = checkDeck(practiceDeck, cards, rules());
    if (issues.length) throw new Error(issues.join('\n'));
    handDrill = { deck: practiceDeck, pool: pairedOrders(practiceDeck)[0], random: rng(crypto.getRandomValues(new Uint32Array(1))[0]),
      first: true, redrawn: false, kept: false };
  }
  if (!handDrill) return;
  if (action === 'mulligan') {
    if (handDrill.redrawn || handDrill.kept) return;
    handDrill.redrawn = true;
  }
  if (!handDrill.codes || action === 'mulligan') handDrill.codes = shuffle(handDrill.pool, handDrill.random).slice(0, 5);
  if (action === 'keep') handDrill.kept = true;
  if (action === 'first' || action === 'second') handDrill.first = action === 'first';
  const don = handDrill.first ? 1 : 2;
  const playable = card => card.kind === 'Character' && card.cost <= don;
  const samples = handDrill.codes.map(code => cards[code]);
  const hint = samples.filter(playable).length;
  showModal('Mano de prueba', '<div class="practice-stage"><div class="practice-header"><div><strong>' +
    hint + (hint === 1 ? ' personaje jugable' : ' personajes jugables') + '</strong><p>En estas cinco cartas, por coste impreso con ' + don + ' DON!!.</p></div>' +
    '<div class="actions">' + btn('Primero', 'hand-action', { value: 'first', style: handDrill.first ? 'outline-teal' : '' }) +
    btn('Segundo', 'hand-action', { value: 'second', style: handDrill.first ? '' : 'outline-teal' }) + '</div></div>' +
    '<div class="practice-cards">' + samples.map(card => '<div class="practice-card' + (playable(card) ? ' playable' : '') + '">' +
      art(card, '', true) + '<span title="' + esc(card.name) + '">' + esc(card.name) + '</span></div>').join('') + '</div></div>' +
    '<div class="actions practice-controls">' + (handDrill.kept ? '<strong>Mano conservada</strong>' :
      btn('Conservar mano', 'hand-action', { value: 'keep', glyph: 'check', style: 'primary' }) +
      btn('Hacer mulligan', 'hand-action', { value: 'mulligan', glyph: 'refresh', disabled: handDrill.redrawn })) +
      btn('Barajar de nuevo', 'hand-action', { value: 'new', glyph: 'decks' }) + '</div>', { classes: 'practice-dialog' });
  if (action === 'new' || action === 'mulligan') {
    const dealt = modal.querySelectorAll('.practice-card');
    stagger('deal', dealt);
    cue('deal', dealt[0]);
  }
  if (action === 'keep') pulse('complete', modal.querySelector('.practice-header strong'));
}

function cardFeedback(code, action, from) {
  if (page !== 'workshop') return;
  const shelf = el('deck-shelf-cards');
  const trayCard = cardAt('deck', code);
  const galleryCard = cardAt('catalog', code);
  const destination = action === 'remove' ? galleryCard?.querySelector('img') : trayCard?.querySelector('img');
  if (trayCard && action !== 'remove') {
    const a = trayCard.getBoundingClientRect(), b = shelf.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) shelf.scrollLeft += a.left - b.left - 14;
  }
  const end = destination?.getBoundingClientRect() ?? ui.querySelector('.shelf-heading .shelf-symbol')?.getBoundingClientRect();
  if (from && end && end.top < innerHeight && end.bottom > 46) flight(action, '/art/' + code, from, end);
  pulse(action, (action === 'remove' ? galleryCard : trayCard)?.querySelector('.crew-count') ?? ui.querySelector('.shelf-heading h2'));
  if (action !== 'remove' && total(state.deck) === 50) pulse('complete', ui.querySelector('.shelf-heading .status'), { silent: true });
}

function chooseLeader(code, origin) {
  if (busy) throw new Error('Espera a que termine el cálculo.');
  const card = cards[code];
  if (card?.kind !== 'Leader' || cardIssue(card, null, state.day, snapshot.overrides)) throw new Error('Elige un líder legal para el formato actual.');
  if (owned && !owned[code]) throw new Error('El líder debe estar disponible en tu colección.');
  const from = origin?.getBoundingClientRect?.();
  if (code !== state.deck?.leader) replaceDeck(openingDeck(card));
  choosing = false;
  modal.close();
  ui.scrollTop = 0;
  go('workshop');
  const leaderArt = ui.querySelector('.leader-slot .shelf-art');
  flight('insert', '/art/' + code, from, leaderArt?.getBoundingClientRect());
  pulse('reveal', leaderArt);
  toast('Líder equipado · ' + card.name);
}

function addCard(code, change, origin) {
  if (busy) throw new Error('Espera a que termine el cálculo.');
  if (!state.deck) throw new Error('Elige un líder antes de añadir cartas.');
  const deck = state.deck, card = cards[code], leader = cards[deck.leader];
  const n = deck.cards[code] ?? 0;
  if (state.fixed.includes(code)) throw new Error('Desfija ' + code + ' para cambiar sus copias.');
  if (change > 0) {
    const issue = cardIssue(card, leader, state.day, snapshot.overrides);
    if (issue) throw new Error(card.name + ' · ' + issue);
    if (total(deck) >= 50) throw new Error('Quita una copia antes de añadir otra.');
    const limit = Math.min(copyLimit(card), owned?.[code] ?? 50);
    if (n >= limit) throw new Error('El límite de copias para ' + card.name + ' es ' + limit + '.');
    const paired = Object.keys(deck.cards).find(other => pairBanned(code, other, state.day));
    if (paired) throw new Error(code + ' y ' + paired + ' forman una pareja prohibida.');
  }
  if (n + change > 0) deck.cards[code] = n + change;
  else delete deck.cards[code];
  const image = origin?.closest('article')?.querySelector('img') ?? cardAt(change > 0 ? 'catalog' : 'deck', code)?.querySelector('img');
  const from = image?.getBoundingClientRect();
  state.source = '';
  state.before = null;
  resetResults();
  persist();
  render();
  cardFeedback(code, change > 0 ? 'insert' : 'remove', from);
}

function substitutions(code) {
  const deck = state.deck, current = cards[code], leader = cards[deck.leader];
  const choices = Object.values(cards).filter(card => card.code !== code && !state.fixed.includes(card.code) &&
    !cardIssue(card, leader, state.day, snapshot.overrides) &&
    (deck.cards[card.code] ?? 0) < Math.min(copyLimit(card), owned?.[card.code] ?? 50) &&
    !Object.keys(deck.cards).some(other => (other !== code || deck.cards[code] > 1) && pairBanned(card.code, other, state.day)));
  const context = editContext(deck, choices.map(card => card.code), cards);
  const score = card => context.similarity(code, card.code);
  choices.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  showModal('Sustitutos de ' + current.name, '<p class="soft">Compatibles con el líder y las existencias. Ordenados por tipo, función y coste.</p>' +
    '<div class="changes-list">' + choices.slice(0, 10).map(card =>
      '<div class="substitute-row"><button type="button" class="card-cell" data-action="details" data-value="' + card.code + '">' +
      art(card, 'thumb') + '<span>' + cardName(card) + '</span></button><span>' + esc(context.describe(code, card.code)) + '</span>' +
      btn('Cambiar 1', 'swap', { value: code + '/' + card.code, disabled: state.fixed.includes(code), style: 'outline-teal' }) + '</div>').join('') +
    (!choices.length ? message('No hay sustitutos con estos límites.') : '') + '</div>');
}

function replaceBy(code) {
  const deck = state.deck, incoming = cards[code];
  if (!deck || total(deck) !== 50 || state.fixed.includes(code)) throw new Error('Completa una lista y elige una carta que puedas añadir.');
  const context = editContext(deck, [code], cards);
  const options = Object.keys(deck.cards).filter(out => out !== code && !state.fixed.includes(out)).filter(out => {
    const candidate = structuredClone(deck);
    candidate.cards[out]--;
    if (!candidate.cards[out]) delete candidate.cards[out];
    candidate.cards[code] = (candidate.cards[code] ?? 0) + 1;
    return checkDeck(candidate, cards, rules(), { owned }).length === 0;
  }).sort((a, b) => context.similarity(b, code) - context.similarity(a, code) || a.localeCompare(b));
  showModal('Añadir ' + incoming.name, '<p class="soft">Elige qué copia sale de la lista de 50.</p>' +
    (options.length ? '<div class="changes-list">' + options.map(out => '<div class="substitute-row"><button type="button" class="card-cell" data-action="details" data-value="' +
      out + '">' + art(cards[out], 'thumb') + '<span>' + cardName(cards[out]) + '</span></button><span>' +
      esc(context.describe(out, code)) + '</span>' + btn('Sustituir', 'swap', { value: out + '/' + code, style: 'outline-teal' }) + '</div>').join('') +
      '</div>' : message('Desfija una carta o revisa la legalidad y la colección.')));
}

function swapCards(from, to) {
  if (state.fixed.includes(from) || state.fixed.includes(to)) throw new Error('Desfija las cantidades antes de sustituir.');
  const deck = structuredClone(state.deck);
  deck.cards[from]--;
  if (!deck.cards[from]) delete deck.cards[from];
  deck.cards[to] = (deck.cards[to] ?? 0) + 1;
  const errors = checkDeck(deck, cards, rules(), { owned, draft: true });
  if (errors.length) throw new Error(errors.join('\n'));
  const previous = currentVersion();
  const origin = cardAt('catalog', to)?.querySelector('img')?.getBoundingClientRect();
  remember(previous);
  state.deck = deck;
  state.source = '';
  state.before = previous;
  resetResults();
  persist();
  modal.close();
  render();
  cardFeedback(to, 'swap', origin);
  toast('Cambiada una copia de ' + cards[from].name + ' por ' + cards[to].name + '.');
}

function showPair(explore) {
  pair.leader = cleanCode(value('pair-leader'));
  pair.a = cleanCode(value('pair-a'));
  pair.b = cleanCode(value('pair-b'));
  const leader = cards[pair.leader], a = cards[pair.a], b = cards[pair.b];
  if (leader?.kind !== 'Leader' || !a || (!explore && !b)) throw new Error('Escribe códigos válidos del líder y de las cartas que quieres comparar.');
  if (explore) {
    const issues = inspectPair(leader, leader, a, rules(), closeDon(leader)).issues;
    const found = issues.length ? [] : Object.values(cards).filter(card => card.code !== a.code &&
      (card.code === leader.code || !cardIssue(card, leader, state.day, snapshot.overrides)) && !pairBanned(a.code, card.code, state.day))
      .flatMap(card => inspectPair(leader, a, card, rules(), closeDon(leader)).links);
    pair.result = { issues, links: [...new Set(found)], cautions: [], explore };
  } else pair.result = inspectPair(leader, a, b, rules(), closeDon(leader));
  render();
}

async function runOptimization(repair, options = automaticPlan) {
  if (busy || !state.deck) return;
  const base = structuredClone(state.deck);
  if (!repair) {
    const issues = checkDeck(base, cards, rules(), { draft: true, owned });
    if (issues.length) {
      go('optimize');
      throw new Error(issues.join('\n'));
    }
  }
  const previous = { proposals, selected, optimizeOrder, optimizeTab, lastOptimization };
  const pending = { ...options, repair };
  lastOptimization = pending;
  optimizeOrder = options.start === 'second' ? 'second' : 'first';
  busy = 'optimize';
  optimizationProgress = 'Armando el modelo de tu mazo…';
  optimizeTab = 'changes';
  proposals = null;
  go('optimize');
  const end = engine.onProgress(progress => {
    if (!progress.startsWith('Optimización · ')) return;
    optimizationProgress = progress.slice('Optimización · '.length);
    if (el('optimization-progress')) el('optimization-progress').textContent = optimizationProgress;
    if (page === 'optimize') tween('turn', el('optimization-progress'), [{ opacity: .35 }, { opacity: 1 }]);
  });
  const started = performance.now();
  try {
    const eligibleRival = options.useRival && rival && !checkDeck(rival, cards, rules(), { draft: true }).length ? rival : null;
    const result = await engine.run('optimize', { day: state.day, base,
      options: { ...options, owned, rival: eligibleRival, fixed: state.fixed, repair, recommendation: true } });
    if (lastOptimization === pending && sameDeck(base, state.deck)) {
      proposals = result;
      selected = 0;
    }
    if (page === 'optimize' && motionAllowed()) {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 600 - (performance.now() - started))));
    }
  } catch (error) {
    if (lastOptimization === pending && sameDeck(base, state.deck)) {
      ({ proposals, selected, optimizeOrder, optimizeTab, lastOptimization } = previous);
    }
    throw error;
  } finally {
    end();
    busy = '';
    render();
    if (page === 'optimize' && proposals?.length) showProposal(ui);
  }
}

function applyDeck(deck, label) {
  if (busy) return;
  const errors = checkDeck(deck, cards, rules(), { owned });
  if (errors.length) throw new Error(errors.join('\n'));
  const minimum = lastOptimization?.minCounter ?? 0;
  if (minimum && deckMetrics(deck, cards).printedCounter < minimum) {
    throw new Error('La selección debe conservar al menos ' + minimum + ' copias con Counter +2000.');
  }
  for (const [code, amount] of Object.entries(lastOptimization?.minimums ?? {})) {
    if ((deck.cards[code] ?? 0) < amount) throw new Error('La selección debe incluir al menos ' + amount + ' copias de ' + cards[code].name + '.');
  }
  const before = currentVersion();
  remember(before);
  state.before = before;
  state.deck = deck;
  state.source = '';
  remember();
  resetResults();
  if (total(before.deck) === 50 && !checkDeck(before.deck, cards, rules()).length) {
    simPair = { base: before.deck, variant: state.deck, label: 'Anterior → ' + label };
  }
  persist();
  go('workshop');
  stagger('reveal', ui.querySelectorAll('.shelf-card'));
  pulse('complete', ui.querySelector('.shelf-heading .status'));
  toast('Variante aplicada y guardada.');
}

function chooseChanges() {
  const proposal = proposals[selected];
  const swaps = explainChanges(state.deck, proposal.deck, cards);
  showModal('Elegir sustituciones', '<p class="soft">Cada selección reemplaza una copia. La lista resultante se vuelve a validar.</p>' +
    swaps.map(({ from, to, description }, i) => '<div class="swap-description">' + checkbox('swap-' + i, cards[from].name + ' → ' + cards[to].name, true) +
      '<small>' + esc(description) + '</small></div>').join(''),
  { save: 'Aplicar selección', submit: () => {
    const result = structuredClone(state.deck);
    if (!swaps.some((_, i) => checked('swap-' + i))) throw new Error('Marca al menos un cambio.');
    for (const [i, { from: out, to: incoming }] of swaps.entries()) {
      if (!checked('swap-' + i)) continue;
      result.cards[out]--;
      if (!result.cards[out]) delete result.cards[out];
      result.cards[incoming] = (result.cards[incoming] ?? 0) + 1;
    }
    applyDeck(result, 'Cambios elegidos');
  } });
}

function undo() {
  const previous = state.before;
  if (!previous || busy) return;
  replaceDeck(previous.deck, previous.source, previous.name, true, previous.fixed);
  go('workshop');
  toast('Lista anterior recuperada.');
}

function updateSim() {
  if (!el('sim-mode')) return;
  Object.assign(state.sim, {
    mode: value('sim-mode'), order: value('sim-order'), trials: Number(value('sim-trials')), horizon: Number(value('sim-horizon')),
    seed: el('sim-seed').value === '' ? NaN : Number(value('sim-seed')),
    a: el('sim-a')?.value ?? state.sim.a, b: el('sim-b')?.value ?? state.sim.b, mulligan: checked('sim-mulligan'),
    reserve: checked('sim-reserve'), interruption: checked('sim-interruption')
  });
}

function simulationRival(own = state.deck) {
  if (rival && total(rival)) return checkDeck(rival, cards, rules()).length ? null : rival;
  if (rival) return availableRivals().find(item => item.deck.leader === rival.leader)?.deck ?? null;
  return state.exampleRival ? suggestedRivals(availableRivals(), own, cards)[0]?.deck ?? null : null;
}

function rivalOptions(leader) {
  const lists = availableRivals();
  rivalChoices = leader ? lists.filter(item => item.deck.leader === leader) : suggestedRivals(lists, arenaDeck(), cards);
  el('rival-options').innerHTML = rivalChoices.length ? rivalChoices.map((item, index) => {
    const card = cards[item.deck.leader];
    return '<div class="rival-choice">' + art(card, 'thumb') + '<div><strong>' + esc(item.name) +
      '</strong><small>' + esc(card.name + ' · ' + card.code + ' · ' + item.origin) +
      '</small><p>' + esc(item.reason) + '</p></div>' +
      btn('Usar este mazo', 'arena-use-rival', { value: index, style: index === 0 ? 'primary' : 'quiet' }) + '</div>';
  }).join('') : '<p class="soft">Todavía no hay una lista legal local para este líder.</p>';
  if (leader) el('rival-options').insertAdjacentHTML('beforeend', '<div class="actions">' +
    btn('Generar mazo para este líder', 'arena-generate-rival', { glyph: 'wand', value: leader }) + '</div>');
}

function showRivals() {
  const leaders = Object.values(cards).filter(card => card.kind === 'Leader' && !cardIssue(card, null, state.day, snapshot.overrides))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  showModal('Cambiar mazo rival', '<p class="soft">' + (duel && !duel.result ? 'Al elegir otro mazo se reinicia el duelo. ' : '') +
    'Elige un líder o practica contra una lista sugerida. Cada sugerencia describe una situación de juego.' +
    '</p>' + formField('rival-leader', 'Líder del rival', '<select id="rival-leader">' + opt('', 'Ver sugerencias') +
      leaders.map(card => opt(card.code, card.name + ' · ' + card.code)).join('') + '</select>') +
    '<div id="rival-options" class="rival-choices"></div><div class="actions rival-tools">' +
    btn('Pegar lista .txt', 'rival', { glyph: 'upload' }) +
    btn('Elegir automáticamente', 'arena-auto-rival', { glyph: 'flag' }) + '</div>', { classes: 'rival-dialog' });
  rivalOptions('');
}

function equipRival(deck, origin = '') {
  if (deck) {
    const issues = checkDeck(deck, cards, rules());
    if (issues.length) throw new Error(issues.join('\n'));
  }
  state.rivalText = deck ? deckText(deck, true) : '';
  state.rivalOrigin = origin;
  state.exampleRival = true;
  hydrate();
  resetResults();
  clearDuel();
  persist();
  modal.close();
  render();
  toast(deck ? 'Rival equipado · ' + cards[deck.leader].name : 'Sugerencia automática activada.');
}

async function generateRival(code) {
  const box = el('rival-options');
  const button = box.querySelector('[data-action="arena-generate-rival"]');
  busy = 'rival';
  button.disabled = true;
  button.querySelector('span').textContent = 'Preparando 50 cartas…';
  try {
    const [choice] = await engine.run('optimize', { day: state.day, base: openingDeck(cards[code]), options: {} });
    if (modal.open && box.isConnected) equipRival(choice.deck, 'Mazo de práctica generado');
  } finally {
    busy = '';
    if (box.isConnected) rivalOptions(code);
    else render();
  }
}

async function simulateNow() {
  if (busy || !state.deck) return;
  updateSim();
  const sim = state.sim;
  if (!Number.isInteger(sim.trials) || sim.trials < 1 || sim.trials > 20000) throw new Error('Elige de 1 a 20.000 ensayos.');
  if (!Number.isInteger(sim.horizon) || sim.horizon < 1 || sim.horizon > 8) throw new Error('Elige de 1 a 8 turnos.');
  if (!Number.isInteger(sim.seed) || sim.seed < 0 || sim.seed > 4294967295) throw new Error('Elige una semilla entre 0 y 4294967295.');
  const base = simPair?.base ?? state.deck;
  const enemy = simulationRival();
  if (rival && !enemy) toast('No hay lista elegible para el rival. Se ensayará solo tu mazo.');
  busy = 'simulate';
  simResult = null;
  stopPlayback();
  render();
  try {
    const result = await engine.run('simulate', { day: state.day, base, variant: simPair?.variant, rival: enemy, options: {
      ...sim, a: sim.mode === 'opening' && !sim.a.trim() ? state.targets : codes(sim.a), b: codes(sim.b)
    } });
    simResult = result;
    simTurn = 0;
    simOrder = Object.keys(result.groups)[0];
    persist();
  } finally {
    busy = '';
    renderReplay();
  }
}

function renderReplay() {
  render();
  if (page !== 'simulator' || !simResult) return;
  const replay = el('replay-teams');
  if (!replay) return;
  stagger('replay', replay.querySelectorAll('.board-card.played'));
  pulse('turn', el('replay-turn'));
  cue('replay', replay.querySelector('.replay-title'));
  for (const team of replay.querySelectorAll('.replay-stats')) {
    tween('turn', team, [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }]);
  }
}

function showRecord() {
  const errors = checkDeck(state.deck, cards, rules());
  if (errors.length) throw new Error(errors.join('\n'));
  if (!rival) return fileEditor('rival');
  showModal('Registrar partida',
    '<p class="soft">' + esc(cards[state.deck.leader].name + ' contra ' + cards[rival.leader].name) + '</p><div class="form-grid">' +
    formField('record-order', 'Jugué', '<select id="record-order">' + opt('first', 'Primero') + opt('second', 'Segundo') + '</select>') +
    formField('record-outcome', 'Resultado', '<select id="record-outcome">' + Object.entries(outcomes).map(([id, label]) => opt(id, label)).join('') +
    '</select>') + '</div>',
  { submit: () => {
    state.matches.unshift({ when: new Date().toISOString(), own: structuredClone(state.deck), rival: structuredClone(rival),
      order: value('record-order'), outcome: value('record-outcome') });
    persist();
    render();
    toast('Partida registrada.');
  } });
}

function loadList(key) {
  const [type, index] = key.split(':');
  const source = type === 'example' ? examples : visibleTournaments(view());
  const list = source[index];
  const deck = parseDeck(list.text, cards);
  replaceDeck(deck, list.source);
  go('workshop');
  stagger('deal', ui.querySelectorAll('.shelf-card'));
  const errors = checkDeck(deck, cards, rules(), { owned });
  toast(errors.length ? 'Lista cargada para revisión.' : 'Lista cargada desde ' + list.name + '.');
}

async function sync() {
  if (busy) return;
  busy = 'catalog';
  render();
  const end = engine.onProgress(progress => {
    if (page === 'catalog') {
      const button = ui.querySelector('[data-action=sync]');
      if (button) button.querySelector('span').textContent = progress;
    }
  });
  try {
    const fresh = await engine.run('catalog', { day: state.day });
    snapshot = fresh;
    cards = indexCards(snapshot);
    auditResult = null;
    hydrate();
    resetResults();
    toast('Catálogo oficial revisado.');
  } finally {
    busy = '';
    try { end(); }
    finally { render(); }
  }
}

async function catalogAnalysis(operation) {
  if (busy) return;
  busy = operation;
  render();
  const end = engine.onProgress(progress => {
    const button = ui.querySelector('[data-action="' + (operation === 'audit' ? 'audit' : 'refresh-tournaments') + '"] span');
    if (button) button.textContent = progress;
  });
  try {
    const result = await engine.run(operation, { day: state.day });
    if (operation === 'audit') auditResult = { ...result, day: state.day };
    else {
      tournamentList = result;
      toast('Listas públicas actualizadas.');
    }
  } finally {
    busy = '';
    try { end(); }
    finally { render(); }
  }
}

function scheduleArena(animationTime = 0) {
  clearTimeout(arenaTimer);
  if (!duel || duel.result || duel.phase === 'mulligan' || page !== 'arena' || modal.open ||
      (!arenaPrefs.auto && (duel.decisionSide() !== 1 || duel.pending?.manual))) return;
  arenaTimer = setTimeout(() => {
    if (page !== 'arena' || modal.open) return;
    try {
      duel.autoStep();
      validateArenaFocus();
      render();
    } catch (error) { showError(error); }
  }, Math.max(animationTime, duel.pending ? 210 : 340));
}

function validateArenaFocus() {
  if (arenaFocus && ![...duel.field(0), ...duel.field(1), ...duel.players[0].hand].includes(arenaFocus)) arenaFocus = null;
  if (arenaAttack && !duel.targets(arenaAttack).length) arenaAttack = null;
}

function arenaCommand(run) {
  if (!duel) return;
  if (!run()) { toast('Esa acción no está disponible en esta fase.', 'bad'); return; }
  validateArenaFocus();
  render();
}

function openArena(candidate) {
  if (candidate) {
    arenaCandidate = candidate;
    arenaPrefs.list = 'proposal';
    if (duel && !duel.result) {
      showModal('Cambiar la lista del duelo', '<p class="soft">La partida de práctica actual se reiniciará.</p>',
        { save: 'Preparar variante', submit: () => { clearDuel(); go('arena'); } });
      return;
    }
    clearDuel();
  }
  go('arena');
}

function clearDuel() {
  clearTimeout(arenaTimer);
  closeScene();
  if (el('arena-board')) el('arena-board').scrollTop = 0;
  duel = null;
  arenaFocus = null;
  arenaAttack = null;
  arenaPrefs.auto = false;
  arenaLogOpen = false;
  lastMotion = 0;
}

function startArena() {
  const list = arenaDeck();
  const opponent = simulationRival(list);
  if (!list || !opponent) throw new Error('Completa tu lista y la del rival para iniciar el duelo.');
  const seed = value('arena-seed') === '' ? NaN : Number(value('arena-seed'));
  duel = new Arena(list, opponent, cards, rules(), { seed, first: value('arena-first') === 'first' });
  arenaPrefs.seed = seed;
  ui.scrollTop = 0;
  render();
}

function selectArenaUnit(key) {
  const [zone, value] = key.split(':');
  const id = Number(value);
  if (duel.decisionSide() === 0 && zone === 'field' && duel.blockers().some(unit => unit.id === id)) {
    arenaCommand(() => duel.block(id));
    return;
  }
  if (duel.decisionSide() === 0 && zone === 'hand' && duel.counters().some(unit => unit.id === id)) {
    arenaCommand(() => duel.useCounter(id));
    return;
  }
  if (arenaAttack && duel.targets(arenaAttack).some(unit => unit.id === id)) {
    const attacker = arenaAttack;
    arenaAttack = null;
    arenaCommand(() => duel.attack(attacker.id, id));
    return;
  }
  arenaFocus = zone === 'hand' ? duel.players[0].hand.find(unit => unit.id === id) : duel.find(id);
  render();
}

function showArenaZone(key) {
  if (!duel) return;
  const [side, zone] = key.split(':');
  const p = duel.players[Number(side)];
  const title = { life: 'Vida', deck: 'Mazo', don: 'Mazo DON!!', trash: 'Descarte' }[zone];
  if (!p || !title) return;
  if (zone === 'trash') {
    showModal('Descarte · ' + duel.name(p.leader), p.trash.length ? '<div class="changes-list">' +
      [...p.trash].reverse().map(unit => '<button type="button" class="change-row" data-action="details" data-value="' + unit.code + '">' +
        art(duel.card(unit), 'thumb') + '<span>' + cardName(duel.card(unit)) + '</span></button>').join('') +
      '</div>' : '<p class="soft">Zona vacía.</p>');
    return;
  }
  const count = zone === 'life' ? (duel.phase === 'mulligan' ? duel.card(p.leader).life : p.life.length) :
    zone === 'deck' ? p.library.length : p.capacity - duel.donTotal(Number(side));
  const note = zone === 'life' ? 'La Vida se revela al recibir daño.' : zone === 'deck' ? 'Las cartas permanecen boca abajo.' :
    'Los DON!! de esta reserva se incorporan en la fase de DON!! o por efectos.';
  showModal(title + ' · ' + duel.name(p.leader), '<p><strong>' + count + '</strong> ' + (count === 1 ? 'carta.' : 'cartas.') +
    '</p><p class="soft">' + note + '</p>');
}

function arenaEffectFields() {
  if (!el('arena-effects-targets')) return;
  const [key, , area] = arenaActions.find(row => row[0] === value('arena-effect-action'));
  const side = Number(value('arena-effect-side'));
  const units = area === 'field' ? duel.field(side) : area === 'hand' ? duel.players[side].hand : area === 'trash' ? duel.players[side].trash : [];
  const target = area === 'team' ? '' : formField('arena-effect-target', 'Objetivo', '<select id="arena-effect-target">' +
    units.map(unit => opt(String(unit.id), duel.name(unit), String(arenaFocus?.id ?? ''))).join('') + '</select>');
  const amount = ['power', 'basePower', 'draw', 'add-don', 'ready-don', 'return-don'].includes(key)
    ? formField('arena-effect-amount', 'Cantidad', '<input type="number" id="arena-effect-amount" value="' + (key === 'power' ? '1000' : key === 'basePower' ? '0' : '1') + '">') : '';
  const keywords = key === 'grant' ? formField('arena-effect-flag', 'Palabra clave', '<select id="arena-effect-flag">' +
    ['Blocker', 'Rush', 'Rush: Character', 'Banish', 'Double Attack', 'Unblockable'].map(word => opt(word, word)).join('') + '</select>') : '';
  el('arena-effects-targets').innerHTML = target + amount + keywords;
}

function showArenaEffects() {
  if (!duel || duel.phase === 'mulligan' || duel.result) return;
  clearTimeout(arenaTimer);
  showModal('Mesa de efectos', '<p class="soft">Aplica al tablero lo que indique el texto impreso. El ajuste queda registrado en la bitácora.</p>' +
    formField('arena-effect-action', 'Acción', '<select id="arena-effect-action">' + arenaActions.map(([id, label]) => opt(id, label)).join('') + '</select>') +
    formField('arena-effect-side', 'Tripulación', '<select id="arena-effect-side">' + opt('0', 'Mi tripulación', String(arenaFocus?.side ?? 0)) +
      opt('1', 'Rival', String(arenaFocus?.side ?? 0)) + '</select>') +
    '<div id="arena-effects-targets" class="form-grid"></div>', { save: 'Aplicar efecto', submit: () => {
      const amount = el('arena-effect-amount')?.value;
      if (amount === '') throw new Error('Escribe una cantidad.');
      duel.manual(value('arena-effect-action'), Number(value('arena-effect-side')), Number(el('arena-effect-target')?.value),
        amount == null ? 1 : Number(amount), el('arena-effect-flag')?.value);
      validateArenaFocus();
      render();
    } });
  arenaEffectFields();
}

function showArenaStats() {
  if (!duel) return;
  const names = { attacks: 'Ataques', played: 'Despliegues', defense: 'Counters', draws: 'Robos', damage: 'Vidas infligidas', manual: 'Efectos para revisar' };
  showModal('Estadísticas del duelo', '<table class="data-table"><thead><tr><th>Métrica</th><th>Tú</th><th>Rival</th></tr></thead><tbody>' +
    Object.entries(names).map(([key, label]) => '<tr><td>' + label + '</td>' + duel.players.map(player => '<td>' + player.stats[key] + '</td>').join('') +
      '</tr>').join('') + '</tbody></table>');
}

const actions = {
  navigate: go,
  settings: showSettings,
  'close-modal': () => modal.close(),
  import: () => fileEditor('deck'),
  edit: () => fileEditor('deck'),
  rival: () => fileEditor('rival'),
  collection: () => fileEditor('collection'),
  'hand-practice': () => practiceHand('new', state.deck),
  'hand-proposal': () => practiceHand('new', proposals[selected].deck),
  'hand-action': action => practiceHand(action),
  source: url => engine.source(url),
  export: async () => {
    if (await engine.saveText(state.deck.leader + '.txt', deckText(state.deck) + '\n')) toast('Lista exportada.');
  },
  'open-file': async () => {
    const text = await engine.openText();
    if (text !== null && modal.open) el('list-input').value = text;
  },
  leader: () => {
    showModal('Elegir líder', leaderPrompt());
    leaderResults();
    el('leader-search').focus();
  },
  'choose-leader': (code, button) => chooseLeader(code, button.closest('article')?.querySelector('.crew-art')),
  'builder-leader': () => {
    choosing = !choosing;
    Object.assign(builderBrowse, { search: '', kind: '', cost: '', role: '', limit: builderBatch });
    ui.scrollTop = 0;
    go('workshop');
    el('builder-search').focus({ preventScroll: true });
  },
  'builder-type': id => {
    Object.assign(builderBrowse, { kind: id, limit: builderBatch });
    render();
  },
  'builder-clear': () => {
    Object.assign(builderBrowse, { search: '', kind: '', cost: '', role: '', limit: builderBatch });
    render();
  },
  'builder-more': moreCards,
  'arena-open': () => openArena(),
  'arena-sound': () => {
    state.arcadeSound = !state.arcadeSound;
    configureArcade(motion, state.arcadeSound, state.motionMode);
    persist();
    render();
  },
  'arena-rivals': showRivals,
  'arena-use-rival': index => equipRival(rivalChoices[Number(index)].deck, rivalChoices[Number(index)].origin),
  'arena-auto-rival': () => equipRival(null),
  'arena-generate-rival': generateRival,
  'arena-proposal': () => openArena(proposals?.[selected]?.deck),
  'arena-start': startArena,
  'arena-unit': selectArenaUnit,
  'arena-zone': showArenaZone,
  'arena-mulligan': choice => { duel.start(choice === 'mulligan'); render(); },
  'arena-deploy': id => arenaCommand(() => duel.deploy(Number(id), 0)),
  'arena-attach': id => arenaCommand(() => duel.attach(Number(id))),
  'arena-activate': id => arenaCommand(() => duel.activate(Number(id))),
  'arena-attack': id => { arenaAttack = duel.find(Number(id)); render(); },
  'arena-cancel-attack': () => { arenaAttack = null; render(); },
  'arena-choose': id => arenaCommand(() => duel.choose(Number(id))),
  'arena-block': id => arenaCommand(() => duel.block(id ? Number(id) : null)),
  'arena-counter': id => arenaCommand(() => duel.useCounter(Number(id))),
  'arena-resolve': () => arenaCommand(() => duel.resolveBattle()),
  'arena-end': () => arenaCommand(() => duel.endTurn()),
  'arena-auto': () => { arenaPrefs.auto = !arenaPrefs.auto; arenaAttack = null; render(); },
  'arena-effects': showArenaEffects,
  'arena-stats': showArenaStats,
  'arena-reset': () => {
    const reset = () => { clearDuel(); ui.scrollTop = 0; render(); };
    if (duel && !duel.result && duel.ply) showModal('Preparar un nuevo duelo',
      '<p class="soft">Se reiniciará la práctica actual.</p>', { submit: reset, save: 'Reiniciar' });
    else reset();
  },
  rename: () => showModal('Renombrar mazo', formField('deck-name', 'Nombre del mazo', oneLine('deck-name', state.name || cards[state.deck.leader].name)),
    { submit: () => { state.name = value('deck-name').trim().slice(0, 100); persist(); render(); } }),
  details: showDetails,
  substitute: substitutions,
  'replace-by': replaceBy,
  swap: key => swapCards(...key.split('/')),
  'add-card': (code, origin) => {
    addCard(code, 1, origin);
    if (modal.open) showDetails(code);
  },
  'remove-card': (code, origin) => addCard(code, -1, origin),
  fix: code => {
    state.fixed = state.fixed.includes(code) ? state.fixed.filter(item => item !== code) : [...state.fixed, code];
    resetResults();
    persist();
    render();
  },
  'catalog-tab': id => { catalogTab = id; go('catalog'); },
  'catalog-more': moreCards,
  'compare-card': code => {
    pair.leader = state.deck?.leader ?? '';
    pair.a = code;
    pair.result = null;
    modal.close();
    actions['catalog-tab']('pairs');
  },
  'inspect-pair': () => showPair(false),
  'explore-pair': () => showPair(true),
  'pair-example': () => {
    el('pair-leader').value = 'OP09-081';
    el('pair-a').value = 'EB01-048';
    el('pair-b').value = 'OP09-090';
    showPair(false);
  },
  sync,
  audit: () => catalogAnalysis('audit'),
  'refresh-tournaments': () => catalogAnalysis('tournaments'),
  'leader-tournaments': () => { libraryTab = 'tournaments'; ownTournaments = true; query = ''; go('library'); },
  'opt-tab': id => { optimizeTab = id; go('optimize'); },
  'tune-optimization': adjustOptimization,
  'opt-order': id => { optimizeOrder = id; render(); showProposal(ui); },
  'run-optimize': () => runOptimization(false),
  repair: () => runOptimization(true),
  'select-proposal': index => { selected = Number(index); render(); showProposal(ui); },
  apply: () => {
    const proposal = proposals?.[selected];
    if (proposal) applyDeck(proposal.deck, proposal.name);
  },
  'choose-changes': chooseChanges,
  undo,
  'compare-sim': () => {
    simPair = { base: state.deck, variant: proposals[selected].deck, label: 'Mi lista → ' + proposals[selected].name };
    simResult = null;
    go('simulator');
    return simulateNow();
  },
  'clear-sim-pair': () => { simPair = null; simResult = null; stopPlayback(); render(); },
  simulate: simulateNow,
  'sim-order': id => { simOrder = id; simTurn = 0; stopPlayback(); renderReplay(); },
  'sim-turn': step => { simTurn = Math.max(0, Math.min(simResult.horizon - 1, simTurn + Number(step))); stopPlayback(); renderReplay(); },
  'sim-play': () => {
    if (playTimer) stopPlayback();
    else {
      const last = simResult.horizon - 1;
      if (last === 0) return;
      if (simTurn === last) simTurn = 0;
      playTimer = setInterval(() => {
        if (++simTurn >= last) stopPlayback();
        renderReplay();
      }, 1050);
    }
    render();
  },
  'library-tab': id => { libraryTab = id; render(); },
  'save-version': () => {
    remember();
    persist();
    render();
    toast('Versión guardada en la biblioteca.');
  },
  'load-version': id => {
    const item = state.versions.find(row => row.id === id);
    replaceDeck(structuredClone(item.deck), item.source, item.name, true, item.fixed ?? []);
    go('workshop');
  },
  'load-list': loadList,
  record: showRecord,
  csv: async () => {
    const escapeCsv = field => '"' + String(field).replaceAll('"', '""') + '"';
    const lines = [['fecha_utc', 'lista_propia', 'lista_rival', 'orden', 'resultado'],
      ...state.matches.map(match => [match.when, deckText(match.own), deckText(match.rival), match.order, match.outcome])];
    if (await engine.saveText('decklab-partidas.csv', '\uFEFF' + lines.map(row => row.map(escapeCsv).join(',')).join('\r\n'))) toast('Registro exportado.');
  }
};

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const menu = button.closest('.actions-menu');
  if (menu) menu.open = false;
  if (button.classList.contains('crew-art') && event.detail && !choosing && state.deck &&
      button.closest('.crew-card').querySelector('[data-action="add-card"]:enabled,[data-action="replace-by"]:enabled')) {
    clearTimeout(cardClick);
    if (event.detail === 1) cardClick = setTimeout(() => showDetails(button.dataset.value), 225);
    return;
  }
  const safeWhileBusy = /^(navigate|details|source|close-modal|catalog-tab|catalog-more|builder-more|opt-tab|library-tab)$/;
  if (busy && !safeWhileBusy.test(button.dataset.action)) {
    toast('Espera a que termine el cálculo.');
    return;
  }
  try { await actions[button.dataset.action]?.(button.dataset.value, button); }
  catch (error) { showError(error); }
});

document.addEventListener('dblclick', event => {
  const button = event.target.closest('.crew-art');
  const entry = button?.closest('.crew-card').querySelector('[data-action="add-card"]:enabled,[data-action="replace-by"]:enabled');
  if (!entry) return;
  clearTimeout(cardClick);
  try {
    if (entry.dataset.action === 'replace-by') replaceBy(button.dataset.value);
    else addCard(button.dataset.value, 1, button);
  }
  catch (error) { showError(error); }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  if (!modalSave) return;
  if (busy) return toast('Espera a que termine el cálculo.');
  try { await modalSave(); modal.close(); }
  catch (error) { showError(error); }
});

document.addEventListener('error', event => {
  if (event.target.tagName === 'IMG') event.target.hidden = true;
}, true);
modal.addEventListener('close', () => {
  if (pendingRefresh && !busy && !(page === 'arena' && duel)) render();
  else scheduleArena();
});

const filters = { 'kind-filter': 'kind', 'color-filter': 'color', 'cost-filter': 'cost', 'role-filter': 'role' };
document.addEventListener('input', event => {
  const { id, value } = event.target;
  if (id === 'leader-search') leaderResults();
  if (id === 'catalog-search') {
    browse.query = value;
    browse.limit = catalogBatch;
    el('catalog-results').innerHTML = catalogResults(view());
    trackGallery();
  }
  if (id === 'builder-search') {
    builderBrowse.search = value;
    filterBuilder();
  }
  if (id === 'tournament-search') {
    query = value;
    el('tournament-results').innerHTML = tournamentResults(view());
  }
  if (id.startsWith('sim-') && page === 'simulator') {
    updateSim();
    clearTimeout(prefsTimer);
    prefsTimer = setTimeout(persist, 160);
  }
});

document.addEventListener('change', event => {
  const { id, value, checked } = event.target;
  if (id in filters || id === 'compatible-filter') {
    if (id === 'compatible-filter') browse.compatible = checked;
    else browse[filters[id]] = value;
    browse.limit = catalogBatch;
    el('catalog-results').innerHTML = catalogResults(view());
    trackGallery();
  }
  if (id === 'builder-cost' || id === 'builder-role') {
    builderBrowse[id === 'builder-cost' ? 'cost' : 'role'] = value;
    filterBuilder();
  }
  if (id === 'arena-list' || id === 'arena-first' || id === 'arena-seed') {
    if (id === 'arena-list') { arenaPrefs.list = value; render(); }
    if (id === 'arena-first') arenaPrefs.order = value;
    if (id === 'arena-seed') arenaPrefs.seed = value ? Number(value) : '';
  }
  if (id === 'arena-motion') {
    state.motionMode = value;
    closeScene();
    configureArcade(motion, state.arcadeSound, state.motionMode);
    persist();
    render();
  }
  if (id === 'arena-effect-action' || id === 'arena-effect-side') arenaEffectFields();
  if (id === 'rival-leader') rivalOptions(value);
  if (id === 'tournaments-leader') {
    ownTournaments = checked;
    el('tournament-results').innerHTML = tournamentResults(view());
  }
  if (id.startsWith('sim-') && page === 'simulator') {
    updateSim();
    if (id === 'sim-mode') render();
    persist();
  }
});

let dragged;
document.addEventListener('dragstart', event => {
  if (event.target instanceof HTMLImageElement) { event.preventDefault(); return; }
  const item = event.target.closest('[data-leader-drag],[data-catalog-drag],[data-deck-drag]');
  if (!item?.draggable || busy) return;
  const from = item.dataset.leaderDrag ? 'leader' : item.dataset.deckDrag ? 'remove' : 'add';
  dragged = { from, code: item.dataset.leaderDrag ?? item.dataset.deckDrag ?? item.dataset.catalogDrag, item };
  event.dataTransfer.setData('text/plain', dragged.code);
  event.dataTransfer.effectAllowed = 'copyMove';
});
document.addEventListener('dragover', event => {
  const target = event.target.closest('[data-drop]');
  if (!target || target.dataset.drop !== dragged?.from) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = dragged.from === 'remove' ? 'move' : 'copy';
  target.classList.add('drop-hover');
});
document.addEventListener('dragleave', event => {
  const target = event.target.closest('[data-drop]');
  if (target && !target.contains(event.relatedTarget)) target.classList.remove('drop-hover');
});
document.addEventListener('dragend', () => {
  dragged = null;
  document.querySelectorAll('.drop-hover').forEach(node => node.classList.remove('drop-hover'));
});
document.addEventListener('drop', event => {
  const target = event.target.closest('[data-drop]');
  if (!target || target.dataset.drop !== dragged?.from) return;
  event.preventDefault();
  target.classList.remove('drop-hover');
  try {
    if (dragged.from === 'leader') chooseLeader(dragged.code, dragged.item.querySelector('.crew-art'));
    else if (dragged.from === 'add' && total(state.deck) === 50) replaceBy(dragged.code);
    else addCard(dragged.code, dragged.from === 'add' ? 1 : -1, dragged.item.querySelector('button'));
  }
  catch (error) { showError(error); }
  dragged = null;
});

try {
  const data = await engine.bootstrap();
  ({ snapshot, examples, tournaments: tournamentList, motion } = data);
  cards = indexCards(snapshot);
  const date = today();
  const defaults = { day: date < FIRST_DAY ? FIRST_DAY : date > LAST_DAY ? LAST_DAY : date, deck: null,
    name: '', source: '', versions: [], matches: [], fixed: [], targets: [], before: null,
    ownedText: '', rivalText: '', rivalOrigin: '', exampleRival: true, maxChanges: 8, minCounter: 0, synergy: true, start: 'both',
    arcadeSound: false, motionMode: 'full' };
  state = { ...defaults, ...data.state, sim: { ...simDefaults, ...data.state?.sim } };
  configureArcade(motion, state.arcadeSound, state.motionMode);
  if (state.before?.deck && state.deck && total(state.before.deck) === 50 && total(state.deck) === 50 &&
      state.before.deck.leader === state.deck.leader && !checkDeck(state.before.deck, cards, rules()).length) {
    simPair = { base: state.before.deck, variant: state.deck, label: 'Anterior → mi lista actual' };
  }
  hydrate();
  showPage = true;
  render();
  void refreshOnLaunch();
} catch (error) {
  ui.innerHTML = message(error.message, 'bad');
}
