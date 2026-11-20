const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ease = 'cubic-bezier(.19,.81,.31,1)';
let scenes, sound = false, audio, canvas, ctx, frame = 0, mode = 'system';
let particles = [];

export function configureArcade(motion, playSound, preference = 'system') {
  scenes = motion;
  sound = Boolean(playSound);
  mode = preference;
  document.documentElement.dataset.motionMode = preference;
}

export const scene = name => scenes[name];
export const motionAllowed = () => mode === 'full' || mode === 'brief' || (mode === 'system' && !reduced.matches);

export function tween(name, element, frames, options = {}) {
  if (!element || !motionAllowed()) return;
  return element.animate(frames, { duration: scene(name).ms, easing: ease, ...options });
}

function chime(cue) {
  if (!sound || !cue.tone) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const t = audio.currentTime;
    const note = audio.createOscillator();
    const volume = audio.createGain();
    note.type = 'triangle';
    note.frequency.setValueAtTime(cue.tone * 1.48, t);
    note.frequency.exponentialRampToValueAtTime(cue.tone, t + .08);
    volume.gain.setValueAtTime(.0001, t);
    volume.gain.exponentialRampToValueAtTime(.055, t + .009);
    volume.gain.exponentialRampToValueAtTime(.0001, t + .14);
    note.connect(volume).connect(audio.destination);
    note.start(t);
    note.stop(t + .15);
  } catch {}
}

function tick(now) {
  const ratio = Math.min(2, devicePixelRatio);
  const width = Math.round(innerWidth * ratio), height = Math.round(innerHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter(particle => (now - particle.start) < particle.life);
  for (const p of particles) {
    const t = Math.max(0, now - p.start) / p.life;
    ctx.globalAlpha = (1 - t) ** 1.4;
    ctx.fillStyle = p.color;
    const x = p.x + p.vx * t, y = p.y + p.vy * t + 26 * t * t;
    ctx.fillRect(x, y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  frame = particles.length ? requestAnimationFrame(tick) : 0;
}

export function cue(name, element, { silent = false } = {}) {
  const spec = scene(name);
  if (!element) return;
  element.dataset.motion = name;
  if (!silent) chime(spec);
  if (!motionAllowed() || !spec.sparks) return;
  const r = element.getBoundingClientRect();
  if (!r.width || r.bottom < 46 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'arcade-particles';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
  }
  const start = performance.now(), power = 16 + spec.rise * 1.4;
  for (let i = 0; i < spec.sparks; i++) {
    const angle = (i + Math.random()) * Math.PI * 2 / spec.sparks;
    const velocity = (0.35 + Math.random() * .8) * power;
    particles.push({ start, life: spec.ms * (.55 + .6 * Math.random()), x: (r.left + r.right) / 2,
      y: (r.top + r.bottom) / 2, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      size: 1 + Math.floor(Math.random() * 4), color: i % 4 ? spec.color : '#fff3c7' });
  }
  if (particles.length > 170) particles = particles.slice(-170);
  frame ||= requestAnimationFrame(tick);
}

export function pulse(name, element, options) {
  if (!element) return;
  const { scale, rise } = scene(name);
  cue(name, element, options);
  tween(name, element, [{ transform: 'none' }, { offset: .44,
    transform: 'translateY(' + (-rise * .2) + 'px) scale(' + scale + ')' }, { transform: 'none' }]);
}

export function stagger(name, elements) {
  const { tilt, rise, stagger: delay } = scene(name);
  for (const [i, element] of Array.from(elements).slice(0, 24).entries()) {
    const spread = Math.min(i, 12) * Math.min(28, delay);
    tween(name, element, [{ opacity: .18, transform: 'translateY(' + rise + 'px) rotate(' + tilt + 'deg) scale(.93)' },
      { opacity: 1, transform: 'none' }], { delay: spread, fill: 'backwards' });
  }
}

export function flight(name, image, from, to) {
  if (!image || !from || !to || !from.width || !to.width || !motionAllowed()) return;
  const clone = new Image();
  clone.src = image;
  clone.alt = '';
  clone.className = 'arcade-flight';
  Object.assign(clone.style, { left: from.x + 'px', top: from.y + 'px', width: from.width + 'px', height: from.height + 'px' });
  document.body.append(clone);
  const dx = to.x - from.x, dy = to.y - from.y;
  const translation = (x, y) => 'translate(' + x + 'px,' + y + 'px)';
  const animation = tween(name, clone, [{ transform: 'none', opacity: .92 }, { offset: .56,
    transform: translation(dx * .54, dy * .62 - scene(name).rise) + ' rotate(' + scene(name).tilt + 'deg) scale(.86)', opacity: 1 },
  { transform: translation(dx, dy) + ' scale(' + to.width / from.width + ')', opacity: .1 }]);
  if (animation) void animation.finished.then(() => clone.remove(), () => clone.remove());
  else clone.remove();
}

export function showRoute(root) {
  tween('route', root.querySelector('.page-heading'), [{ opacity: .35, transform: 'translateX(-11px)' }, { opacity: 1, transform: 'none' }]);
  tween('route', root.querySelector('.deck-shelf,.arena-lobby,.shuffle-panel,.proposal-picker,.panel'),
    [{ opacity: .6, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]);
}

export function showProposal(root) {
  const button = root.querySelector('.proposal-tile.selected');
  if (!button) return;
  pulse('reveal', button);
  for (const [i, stat] of [...root.querySelectorAll('.proposal-summary strong')].entries()) {
    tween('reveal', stat, [{ opacity: .65, transform: 'translateY(3px)' }, { transform: 'scale(1.12)', offset: .42 },
      { opacity: 1, transform: 'none' }], { delay: i * 58, fill: 'backwards' });
  }
  for (const [i, bar] of [...root.querySelectorAll('.comparison-track i')].entries()) {
    tween('reveal', bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: i * 21, fill: 'backwards' });
  }
}

export function showShuffle(root) {
  const stack = root.querySelector('.shuffle-cards');
  if (!stack) return;
  cue('shuffle', stack);
  const spec = scene('shuffle');
  const transform = (x, y, angle) => 'translate(' + x + '%,' + y + 'px) rotate(' + angle + 'deg)';
  Array.from(stack.children).forEach((card, i) => {
    const { outerX, outerY, outerAngle, innerX, innerY, innerAngle, delay } = spec['card' + (i + 1)];
    const shuffle = tween('shuffle', card, [{ transform: 'translateX(-50%) rotate(0)' }, { offset: .34,
      transform: transform(outerX, outerY, outerAngle) },
    { offset: .66, transform: transform(innerX, innerY, innerAngle) },
    { transform: 'translateX(-50%) rotate(0)' }], { iterations: Infinity, delay });
    if (!shuffle) card.style.transform = transform(-50, 0, outerAngle / 3);
  });
}

document.addEventListener('pointermove', event => {
  const art = event.target.closest?.('.crew-art, .shelf-art');
  if (!art || !motionAllowed() || event.pointerType !== 'mouse' || event.buttons) return;
  const bounds = art.getBoundingClientRect();
  art.style.setProperty('--tilt-x', ((event.clientY - bounds.top) / bounds.height - .5) * -13 + 'deg');
  art.style.setProperty('--tilt-y', ((event.clientX - bounds.left) / bounds.width - .5) * 16 + 'deg');
  art.style.setProperty('--sheen-x', (event.clientX - bounds.left) / bounds.width * 100 + '%');
});
