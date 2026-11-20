import { crewCanvas, paintSprites } from './crew-sprites.js';
import { cue, motionAllowed, scene, tween } from './arcade.js';
import { esc, icon, num } from './components.js';

const theatre = document.querySelector('#arena-scene');
const labels = { deploy: '¡Al campo!', attack: '¡Ataque!', block: 'Defensa', impact: 'Impacto', ko: 'K.O.' };
let timer, activeUntil = 0, anchor;

export function closeScene() {
  clearTimeout(timer);
  activeUntil = 0;
  theatre.hidden = true;
  theatre.replaceChildren();
  anchor = null;
}

export function positionScene(board = anchor) {
  if (!board || theatre.hidden) return;
  anchor = board;
  const bounds = board.getBoundingClientRect();
  const top = Math.max(bounds.top + 8, 55), bottom = Math.min(bounds.bottom - 8, innerHeight - 8);
  const space = bottom - top;
  if (space < 85) { closeScene(); return; }
  const height = Math.min(176, space);
  Object.assign(theatre.style, { left: bounds.left + 8 + 'px', width: bounds.width - 16 + 'px', height: height + 'px',
    top: top + (space - height) * .35 + 'px' });
}

export function combatScene(board, events, cards, intensity, battle, getPower) {
  if (!board) { closeScene(); return 0; }
  positionScene(board);
  const attack = events.find(item => item.kind === 'attack');
  const latest = events.findLast(item => item.kind !== 'impact' || item.units?.length);
  if (!latest) return Math.max(0, activeUntil - performance.now());
  const event = attack ?? latest;
  const [actor, other] = event.units ?? [];
  if (!actor || !cards[actor.code]) return 0;
  clearTimeout(timer);
  const duration = !motionAllowed() || intensity === 'brief' ? 580 : scene(event.kind).ms + 640;
  const actorCard = cards[actor.code], foe = other && cards[other.code];
  const power = attack && battle ? [getPower(battle.attacker), getPower(battle.defender)].map(value => num(value)).join(' vs ') : '';
  theatre.dataset.kind = event.kind;
  theatre.dataset.sequence = String(event.seq);
  theatre.innerHTML = '<div class="scene-cast">' + crewCanvas(actorCard, 0) + '</div>' +
    '<div class="scene-message">' + icon(event.kind === 'block' ? 'shield' : event.kind === 'deploy' ? 'flag' : 'target', 17) +
    '<strong>' + labels[event.kind] + '</strong><span>' + esc(latest.text) + '</span>' +
    (power ? '<b>' + power + '</b>' : '') + '</div>' + (foe ? '<div class="scene-cast">' + crewCanvas(foe, 1) + '</div>' : '');
  theatre.hidden = false;
  positionScene(board);
  paintSprites(theatre);
  cue(event.kind, theatre, { silent: true });
  tween(event.kind, theatre, [{ opacity: .2, clipPath: 'inset(18% 0)' }, { opacity: 1, clipPath: 'inset(0)' }],
    { duration: Math.min(230, duration * .38) });
  for (const [index, sprite] of [...theatre.querySelectorAll('.crew-sprite')].entries()) {
    const direction = index ? -1 : 1;
    const action = event.kind === 'attack' ?
      [{ transform: 'translateX(' + -11 * direction + 'px) scale(.86)' },
        { offset: .48, transform: 'translateX(' + 25 * direction + 'px) scale(1.19)' }, { transform: 'none' }] :
      [{ transform: 'translateY(22px) scale(.73)' }, { offset: .54, transform: 'translateY(-5px) scale(1.14)' }, { transform: 'none' }];
    tween(event.kind, sprite, action, { duration: duration * .73 });
  }
  activeUntil = performance.now() + duration;
  timer = setTimeout(closeScene, duration);
  return duration;
}

document.querySelector('#main').addEventListener('scroll', () => positionScene(), { passive: true });
window.addEventListener('resize', () => positionScene());
