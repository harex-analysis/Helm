import { checkDeck } from '../core/deck.js';
import { btn, color, dots, esc, formField, header, icon, kind, num, opt } from './components.js';
import { crewCanvas } from './crew-sprites.js';

const label = side => side ? 'Rival' : 'Tú';
const pick = (id, options, current) => '<select id="' + id + '">' + options.map(([key, text]) => opt(String(key), text, String(current))).join('') + '</select>';

export function avatar(card, extra = '') {
  const glyph = { Leader: 'flag', Character: 'target', Event: 'bolt', Stage: 'compass' }[card.kind] ?? 'decks';
  return '<span class="card-avatar ' + color(card) + ' ' + extra + '" data-card-code="' + esc(card.code) + '" aria-hidden="true">' +
    '<i>' + icon(glyph, 18) + '</i><img alt="" decoding="async" src="/art/' + esc(card.code) + '"></span>';
}

function portrait(card, side, note, origin = '') {
  return '<div class="duel-portrait ' + (side ? 'opponent' : '') + '"><div class="portrait-avatar">' + avatar(card) + crewCanvas(card, side) +
    '</div><div><small>' + note + '</small><strong>' + esc(card.name) + '</strong><span>' +
    dots(card) + card.code + (origin ? ' · ' + esc(origin) : '') + '</span></div></div>';
}

function setup(view) {
  const { state, cards, rules, arenaEnemy, arenaPrefs, arenaLists } = view;
  const deck = arenaLists[arenaPrefs.list] ?? state.deck;
  const leader = cards[deck?.leader];
  const rival = cards[arenaEnemy?.leader];
  const errors = deck ? checkDeck(deck, cards, rules) : ['Elige una lista de 50 cartas en la mesa.'];
  const profiles = [...Object.entries(arenaLists)].map(([id, value]) =>
    [id, (id === 'current' ? 'Mi mazo' : id === 'before' ? 'Versión anterior' : 'Propuesta') + ' · ' + cards[value.leader].name]);
  return '<section class="arena-lobby"><div class="lobby-visual">' +
    '<div class="lobby-water"></div>' +
    (leader ? portrait(leader, 0, 'TU TRIPULACIÓN') : '<div class="duel-portrait vacant">Tu líder</div>') +
    '<span class="versus">VS</span>' +
    (rival ? portrait(rival, 1, 'RIVAL CPU', view.arenaEnemyOrigin) : '<div class="duel-portrait vacant">Elige rival</div>') + '</div>' +
    '<div class="lobby-controls"><div><h2>Preparar duelo</h2><p>Juega la mano, asigna DON!! y decide cómo atacar o defender.</p></div>' +
    '<div class="form-grid arena-config">' +
    formField('arena-list', 'Mi lista', pick('arena-list', profiles, arenaPrefs.list)) +
    formField('arena-first', 'Salida', pick('arena-first', [['first', 'Primero'], ['second', 'Segundo']], arenaPrefs.order)) +
    '</div><div class="actions">' + btn('Iniciar duelo', 'arena-start', { glyph: 'play', style: 'primary', disabled: Boolean(!rival || errors.length) }) +
    btn('Cambiar mazo rival', 'arena-rivals', { glyph: 'flag' }) +
    (!deck ? btn('Ir a la mesa', 'navigate', { glyph: 'decks', value: 'workshop' }) : '') + '</div>' +
    (errors.length ? '<p class="arena-hint">' + esc(errors[0]) + '</p>' : '') +
    (!rival ? '<p class="arena-hint">Elige un líder rival o una de las listas sugeridas.</p>' : '') +
    '<details class="arena-seed" ' + (view.arenaSeedOpen ? 'open' : '') + '><summary>Opciones de práctica</summary>' +
    formField('arena-seed', 'Semilla', '<input id="arena-seed" type="number" min="0" max="4294967295" value="' + esc(arenaPrefs.seed) + '">') + '</details>' +
    '</div></section>';
}

function unitButton(game, unit, { selected, goals }, place) {
  const card = game.card(unit);
  const target = goals.includes(unit.id);
  const active = selected?.id === unit.id;
  const stats = place === 'hand' ? card.cost + ' DON!!' : (card.kind === 'Stage' ? card.code : num(game.power(unit)));
  const review = place === 'field' && game.coverage(unit).review;
  const theme = unit.side ? ' rival-unit' : '';
  return '<button class="arena-unit ' + (place === 'hand' ? 'arena-hand-unit' : '') + theme +
    (active ? ' unit-selected' : '') + (target ? ' unit-target' : '') + (unit.rested ? ' unit-rested' : '') +
    '" data-action="arena-unit" data-unit-id="' + unit.id + '" data-value="' + place + ':' + unit.id + '" aria-pressed="' + active +
    '" title="' + esc(card.name + ' · ' + card.code + ' · ' + stats + (target ? ' · selección disponible' : '') + (review ? ' · revisar efecto impreso' : '')) + '">' +
    (place !== 'hand' || card.kind !== 'Character' ? '' : '<span class="unit-cost">' + card.cost + '</span>') +
    '<span class="unit-portrait">' + avatar(card) + (place === 'field' ? crewCanvas(card, unit.side) : '') +
    '</span><span class="unit-caption"><b>' + esc(card.name) + '</b><small>' +
    (place === 'hand' ? stats + (game.counter(unit) ? ' · +' + num(game.counter(unit)) : '') :
      stats + (unit.don ? ' · +' + unit.don + ' DON!!' : '') + (unit.rested ? ' · DESC.' : '')) + '</small></span>' +
    (target ? '<span class="unit-target-sign">' + icon('target', 15) + '</span>' : '') +
    (review ? '<span class="unit-review" aria-label="Revisar efecto impreso">!</span>' : '') +
    '</button>';
}

function pile(side, id, title, count, glyph, hint = '') {
  return '<button type="button" class="mat-pile mat-' + id + '" data-action="arena-zone" data-value="' + side + ':' + id +
    '" title="' + hint + '"><span class="pile-art">' + icon(glyph, 15) + '</span><span><b>' + title + '</b><strong>' + count + '</strong></span></button>';
}

function lane(game, side, view) {
  const p = game.players[side];
  const options = { selected: view.arenaFocus, goals: view.arenaTargets };
  const life = game.phase === 'mulligan' ? game.card(p.leader).life : p.life.length;
  const available = p.capacity - game.donTotal(side);
  const field = '<div class="arena-characters"><span class="mat-label">PERSONAJES <b>' + p.board.length + '/5</b></span><div class="lane-units">' +
    Array.from({ length: 5 }, (_, i) => p.board[i] ? unitButton(game, p.board[i], options, 'field') :
      '<span class="arena-slot" aria-hidden="true"><i></i></span>').join('') + '</div></div>';
  const command = '<div class="arena-reserves"><div class="leader-pedestal"><i class="mat-label">LÍDER</i>' + unitButton(game, p.leader, options, 'field') +
    '</div><div class="stage-pedestal"><i class="mat-label">ESCENARIO</i>' + (p.stage ? unitButton(game, p.stage, options, 'field') :
      '<span class="arena-slot stage-slot" aria-hidden="true">' + icon('flag', 16) + '</span>') +
    '</div><div class="cost-zone"><span class="mat-label">ÁREA DE COSTE</span><div class="don-counters">' +
    '<span class="don-active"><b>' + p.don.active + '</b> Activos</span><span><b>' + p.don.rested + '</b> Descansados</span>' +
    '<span><b>' + (game.donTotal(side) - p.don.active - p.don.rested) + '</b> Asignados</span></div></div></div>';
  return '<section class="arena-lane mat-half ' + (side ? 'lane-rival' : 'lane-own') + (game.turn === side ? ' lane-turn' : '') + '" aria-label="Campo de ' +
    label(side).toLowerCase() + '"><div class="lane-top"><span><i></i>' + (side ? 'RIVAL CPU' : 'TU CAMPO') + '</span>' +
    '<span>' + (side ? 'Mano rival' : 'Mano') + ' · <b>' + p.hand.length + '</b></span></div>' + field + command +
    pile(side, 'life', 'Vida', life, 'heart', 'Cartas de Vida boca abajo') + pile(side, 'deck', 'Mazo', p.library.length, 'decks') +
    pile(side, 'trash', 'Descarte', p.trash.length, 'library', 'Ver descarte público') +
    pile(side, 'don', 'Mazo DON!!', available, 'bolt') + '</section>';
}

function decision(game, view) {
  const { arenaFocus: focused, arenaAttack } = view;
  const active = game.players[0];
  if (game.result) return '<div class="decision-body"><h3>' + (game.result.winner === 0 ? 'Victoria' : 'Derrota') +
    '</h3><p>' + esc(game.result.text) + '</p><div class="actions">' + btn('Volver a preparar', 'arena-reset', { glyph: 'refresh', style: 'primary' }) +
    btn('Ver estadísticas', 'arena-stats', { glyph: 'chart' }) + '</div></div>';
  if (game.phase === 'mulligan') return '<div class="decision-body"><h3>Tu mano inicial</h3><p>Conserva estas cinco cartas o cambia toda la mano una vez.</p><div class="actions">' +
    btn('Conservar mano', 'arena-mulligan', { value: 'keep', style: 'primary', glyph: 'check' }) +
    btn('Hacer mulligan', 'arena-mulligan', { value: 'mulligan', glyph: 'refresh' }) + '</div></div>';
  if (game.pending?.side === 0 || game.pending?.manual) {
    const task = game.pending;
    return '<div class="decision-body"><h3>' + esc(task.label) + '</h3><div class="decision-options">' +
      task.items.map((item, i) => task.manual ? btn('Ver la ficha y el texto', 'details', { glyph: 'info', value: item.code }) :
        btn(item.label ?? game.name(item), 'arena-choose', { value: i, style: 'outline-teal' })).join('') +
      '</div><div class="actions">' + (task.manual ? btn('Mesa de efectos', 'arena-effects', { glyph: 'settings', style: 'primary' }) : '') +
      (!task.required ? btn(task.pass, 'arena-choose', { value: -1 }) : '') + '</div></div>';
  }
  if (game.decisionSide() === 1) return '<div class="decision-body"><h3>El rival está jugando</h3><p>La Arena se detiene cuando tengas que decidir.</p></div>';
  if (game.phase === 'block') {
    return '<div class="decision-body"><h3>Declara un Blocker</h3><p>' + esc(game.name(game.battle.attacker)) + ' ataca con ' +
      num(game.power(game.battle.attacker)) + ' de poder.</p><div class="decision-options">' + game.blockers().map(unit =>
        btn(game.name(unit), 'arena-block', { value: unit.id, glyph: 'shield', style: 'outline-teal' })).join('') + '</div>' +
      btn('Pasar al Counter', 'arena-block', { value: '', style: 'primary' }) + '</div>';
  }
  if (game.phase === 'counter') {
    const options = game.counters();
    const needed = Math.max(0, game.power(game.battle.attacker) - game.power(game.battle.defender) + 1);
    return '<div class="decision-body"><h3>Defiende el ataque</h3><p>' + num(game.power(game.battle.attacker)) + ' de ataque contra ' +
      num(game.power(game.battle.defender)) + ' de defensa.</p><p>' + (!needed ? 'La defensa ya supera al ataque.' :
        !options.length ? 'Tu mano no tiene un Counter utilizable.' : 'Necesitas superar el ataque por al menos 1 de poder.') +
      '</p><div class="decision-options">' + options.map(unit =>
        btn(game.name(unit) + (game.counter(unit) ? ' +' + game.counter(unit) : ' · Evento'), 'arena-counter', { value: unit.id, glyph: 'shield' })).join('') +
      '</div>' + btn('Resolver combate', 'arena-resolve', { style: 'primary', glyph: 'check' }) + '</div>';
  }
  if (arenaAttack) return '<div class="decision-body"><h3>Elige un objetivo</h3><p>Los objetivos válidos están marcados en el campo rival.</p>' +
    btn('Cancelar ataque', 'arena-cancel-attack') + '</div>';
  const card = focused ? game.card(focused) : null;
  const unitControls = focused ? '<div class="arena-card-info"><h3>' + esc(card.name) + '</h3><p>' +
    esc(kind(card)) + (card.kind === 'Leader' ? ' · ' + card.life + ' Vida impresa' : ' · ' + card.cost + ' DON!!') +
    (game.coverage(focused).review ? ' · Efectos para revisar' : '') + '</p></div><div class="actions">' +
    (active.hand.includes(focused) ? btn(card.kind === 'Event' ? 'Jugar evento' : 'Desplegar', 'arena-deploy',
      { glyph: 'plus', value: focused.id, style: 'primary', disabled: !game.canPlay(focused) }) : '') +
    (active.board.includes(focused) || active.leader === focused ? btn('Asignar DON!!', 'arena-attach',
      { glyph: 'bolt', value: focused.id, disabled: !active.don.active }) : '') +
    (game.canActivate(focused) ? btn('Usar habilidad', 'arena-activate', { glyph: 'wand', value: focused.id, style: 'outline-teal' }) : '') +
    (game.targets(focused).length ? btn('Atacar', 'arena-attack', { glyph: 'target', value: focused.id, style: 'primary' }) : '') +
    btn('Ver ficha', 'details', { glyph: 'info', value: card.code, style: 'quiet' }) + '</div>' :
    '<h3>Tu turno</h3><p>Selecciona un personaje en mano o una unidad del campo.</p>';
  return '<div class="decision-body">' + unitControls +
    '<div class="actions decision-end">' + btn('Terminar turno', 'arena-end', { glyph: 'right', style: 'outline-teal' }) + '</div></div>';
}

export function arenaView(view) {
  const { duel: game, arenaPrefs, arenaFocus } = view;
  const actions = !game ? btn('Ir al laboratorio', 'navigate', { value: 'simulator', glyph: 'chart' }) :
    '<div class="actions">' +
    btn('Cambiar mazo rival', 'arena-rivals', { glyph: 'flag' }) +
    btn(arenaPrefs.auto ? 'Pausar auto' : 'Activar auto', 'arena-auto', { glyph: arenaPrefs.auto ? 'pause' : 'play', style: arenaPrefs.auto ? 'outline-teal' : '' }) +
    '<details class="actions-menu arena-menu"><summary>' + icon('settings', 15) + ' Opciones</summary><div>' +
    btn('Mesa de efectos', 'arena-effects', { glyph: 'settings',
      disabled: game.phase === 'mulligan' || Boolean(game.result) || Boolean(game.pending && !game.pending.manual) }) +
    btn('Ver estadísticas', 'arena-stats', { glyph: 'chart' }) +
    btn('Nuevo duelo', 'arena-reset', { glyph: 'refresh' }) + '</div></details></div>';
  const title = header('Arena', game ? 'Semilla ' + game.seed + ' · ' + (game.phase === 'mulligan' ? 'Preparación' : 'Turno ' + game.players[game.turn].turns + ' · ' + label(game.turn)) :
    'Duelo de práctica por turnos contra la CPU.', actions);
  const presentation = '<div class="arena-presentation">' +
    formField('arena-motion', 'Animación', '<select id="arena-motion">' +
      [['full', 'Escenas completas'], ['brief', 'Escenas breves'], ['reduced', 'Movimiento reducido'], ['system', 'Según Windows']].map(([mode, label]) =>
        opt(mode, label, view.state.motionMode)).join('') + '</select>') +
    btn(view.state.arcadeSound ? 'Silenciar' : 'Activar sonido', 'arena-sound', { glyph: 'bolt', style: 'quiet' }) + '</div>';
  if (!game) return title + presentation + setup(view);
  const battle = game.battle;
  const phaseLabel = { mulligan: 'MANO INICIAL', main: 'FASE PRINCIPAL', 'pre-block': 'ATAQUE', block: 'BLOCKER', counter: 'COUNTER', damage: 'DAÑO', over: 'FIN DEL DUELO' }[game.phase] ?? 'RESOLUCIÓN';
  const banner = battle ? '<strong>' + esc(game.name(battle.attacker)) + '</strong><span>' + num(game.power(battle.attacker)) + ' ⚔ ' +
    num(game.power(battle.defender)) + '</span><strong>' + esc(game.name(battle.defender)) + '</strong>' :
    '<i></i><span>' + phaseLabel + '</span><i></i>';
  const last = game.log.at(-1);
  const battleStep = { 'pre-block': 0, block: 1, counter: 2, damage: 3 }[game.phase];
  const phases = battle ? ['Ataque', 'Blocker', 'Counter', 'Daño'] : ['Refresco', 'Robo', 'DON!!', 'Principal', 'Fin'];
  const current = battle ? battleStep : game.phase === 'mulligan' || game.phase === 'over' ? -1 : game.phase === 'ending' ? 4 : 3;
  const stepRail = '<ol class="phase-rail" aria-label="' + (battle ? 'Pasos de combate' : 'Fases del turno') + '">' +
    phases.map((phase, i) => '<li ' + (i === current ? 'aria-current="step"' : i < current ? 'class="done"' : '') + '>' + phase + '</li>').join('') + '</ol>';
  return title + presentation + '<div class="arena-grid"><div class="arena-main">' + stepRail + '<div class="arena-board" id="arena-board" data-turn="' + game.ply +
    '" tabindex="0" role="region" aria-label="Tablero de duelo">' +
    lane(game, 1, view) + '<div class="battle-divider ' + (battle ? 'dueling' : '') + '" aria-live="polite">' + banner + '</div>' + lane(game, 0, view) +
    '</div><section class="arena-hand"><div class="arena-toolbar"><h2>Mi mano <b>' + game.players[0].hand.length + '</b></h2><span>' +
    (game.phase === 'mulligan' ? 'Mano de cinco cartas' : 'Selecciona un personaje o evento') + '</span></div><div class="arena-hand-tray" id="arena-hand-tray">' +
    game.players[0].hand.map(unit => unitButton(game, unit, { selected: arenaFocus, goals: view.arenaCounters }, 'hand')).join('') +
    (!game.players[0].hand.length ? '<span class="arena-hint">Mano vacía.</span>' : '') + '</div></section></div>' +
    '<aside class="arena-side"><section class="arena-command"><div class="arena-toolbar"><h2>' + icon('flag', 15) + ' Acciones</h2></div>' + decision(game, view) +
    '</section><section class="arena-log"><div class="arena-toolbar"><h2>' + icon('history', 15) + ' Última jugada</h2></div>' +
    (last ? '<div class="log-entry ' + last.kind + '" role="status"><i></i><span>' + esc(last.text) + '</span></div>' :
      '<p class="arena-hint">La bitácora aparece al comenzar.</p>') +
    '<details id="arena-log-details" ' + (view.arenaLogOpen ? 'open' : '') + '><summary>Bitácora de combate</summary><div class="log-list">' +
    game.log.slice(-28).reverse().map(entry => '<div class="log-entry ' + entry.kind + '"><i></i><span>' + esc(entry.text) + '</span></div>').join('') +
    '</div></details></section></aside></div>';
}

export const arenaActions = [
  ['power', 'Cambiar poder hasta el fin del turno', 'field'], ['basePower', 'Fijar poder base este turno', 'field'],
  ['rest', 'Descansar unidad', 'field'], ['ready', 'Activar unidad', 'field'], ['freezeAttack', 'Impedir su próximo ataque', 'field'],
  ['freezeReady', 'Impedir su próximo refresco', 'field'], ['protectRest', 'Proteger del descanso', 'field'],
  ['grant', 'Conceder palabra clave este turno', 'field'], ['ko', 'Enviar personaje K.O.', 'field'],
  ['trash', 'Enviar al descarte', 'field'], ['bounce', 'Devolver a la mano', 'field'], ['bottom', 'Colocar al fondo del mazo', 'field'],
  ['negateKO', 'Anular y enviar K.O.', 'field'], ['draw', 'Robar cartas', 'team'], ['add-don', 'Añadir DON!! activos', 'team'],
  ['ready-don', 'Activar DON!! descansados', 'team'], ['return-don', 'Devolver DON!!', 'team'], ['deck-life', 'Añadir Vida desde el mazo', 'team'],
  ['draw-life', 'Tomar Vida a la mano', 'team'], ['trash-life', 'Enviar Vida al descarte', 'team'],
  ['play-free', 'Desplegar personaje desde la mano', 'hand'], ['discard', 'Descartar carta de la mano', 'hand'], ['recover', 'Recuperar del descarte', 'trash']
];
