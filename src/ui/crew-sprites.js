import { esc } from './components.js';
import { cue, pulse, scene, tween } from './arcade.js';

const atlases = ['crew-sprites.png', 'crew-sprites-rivals.png', 'crew-sprites-grand-line.png'].map(file => '/src/ui/assets/' + file);
const cast = ['monkeydluffy', 'shanks', 'kaido', 'rocks dxebec', 'sabo', 'enel', 'portgasdace',
  'marshall dteach', 'roronoazoro', 'nicorobin', 'nami', 'tonytonychopper',
  'charlotte linlin', 'edward newgate', 'buckin', 'kyo', 'queen', 'king',
  'yamato', 'trafalgar law', 'kouzuki oden', 'gloriosa', 'shiki', 'nola',
  'boa hancock', 'buggy', 'hatchan', 'leo', 'otama', 'nefeltari vivi', 'boa sandersonia',
  'jinbe', 'imu', 'sanji', 'usopp', 'bepo'].map(key => key.replaceAll(' ', ''));
const aliases = { kozukioden: 'kouzukioden', edwardnewgatewhitebeard: 'edwardnewgate', tama: 'otama',
  vivi: 'nefeltarivivi', jinbei: 'jinbe' };
const portraitCrops = { 14: { left: .18, right: .96 }, 20: { left: .01, right: .96 }, 23: { left: .08, right: 1 } };
const palette = { Red: '#eb775c', Blue: '#69bada', Green: '#7ad2a4', Purple: '#be9cef', Yellow: '#f0ce7b', Black: '#a7b1ce' };
const size = 72;
const images = new Map();
const textures = new Map();

export function spriteIndex(name) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cast.indexOf(aliases[key] ?? key);
}

export function crewCanvas(card, side = 0) {
  const frame = /^(Leader|Character)$/.test(card.kind) ? spriteIndex(card.name) : -1;
  return '<canvas aria-hidden="true" class="crew-sprite" width="' + size + '" height="' + size + '" data-code="' +
    esc(card.code) + '" data-color="' + esc(card.colors[0]) + '" data-facing="' + side + '" data-frame="' + frame + '"></canvas>';
}

function asset(address) {
  if (!images.has(address)) {
    if (images.size >= 145) images.delete([...images.keys()].find(key => !atlases.includes(key)));
    const image = new Image();
    image.src = address;
    images.set(address, image.decode().then(() => image, () => null));
  }
  return images.get(address);
}

function illustration(canvas) {
  const { code, color, facing, frame } = canvas.dataset;
  const key = [code, frame, facing].join('/');
  if (textures.has(key)) return textures.get(key);
  if (textures.size >= 250) textures.delete(textures.keys().next().value);
  const texture = (async () => {
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const ctx = tile.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const index = Number(frame);
    if (index >= 0) {
      const sheet = await asset(atlases[Math.floor(index / 12)]);
      if (sheet) {
        const cell = index % 12;
        const w = sheet.width / 4, h = sheet.height / 3;
        const { left, right } = portraitCrops[index] ?? { left: 0, right: 1 };
        const width = (right - left) * (size - 4);
        if (facing === '0') { ctx.translate(size, 0); ctx.scale(-1, 1); }
        ctx.drawImage(sheet, (cell % 4 + left) * w, Math.floor(cell / 4) * h, (right - left) * w, h,
          (size - width) / 2, 1, width, size - 4);
        if (index >= 24) {
          const pixels = ctx.getImageData(0, 0, size, size);
          for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] < 150) pixels.data[i] = 0;
          ctx.putImageData(pixels, 0, 0);
        }
        return tile;
      }
    }
    const image = await asset('/art/' + code);
    ctx.fillStyle = '#101929';
    ctx.fillRect(10, 12, 52, 55);
    ctx.fillStyle = palette[color] ?? '#e5c993';
    ctx.fillRect(13, 10, 46, 53);
    ctx.fillStyle = '#263853';
    ctx.fillRect(16, 13, 40, 46);
    if (image) {
      const crop = { x: .12, y: .13, width: .76, height: .42 };
      ctx.drawImage(image, image.width * crop.x, image.height * crop.y, image.width * crop.width, image.height * crop.height, 16, 13, 40, 46);
    } else {
      ctx.fillStyle = palette[color] ?? '#e5c993';
      ctx.fillRect(32, 24, 8, 24);
      ctx.fillRect(24, 32, 24, 8);
    }
    return tile;
  })();
  textures.set(key, texture);
  return texture;
}

export function paintSprites(root) {
  for (const canvas of root.querySelectorAll('.crew-sprite:not([data-painted])')) {
    canvas.dataset.painted = 'pending';
    void illustration(canvas).then(image => {
      if (!canvas.isConnected) return;
      canvas.getContext('2d').drawImage(image, 0, 0);
      canvas.dataset.painted = 'true';
    });
  }
}

const animated = new Set(['deploy', 'attack', 'block', 'impact', 'ko']);
export function crewMotions(log, after) {
  return log.slice(-16).filter(event => event.seq > after && animated.has(event.kind) && event.ids.length);
}

export function animateCrew(root, events) {
  paintSprites(root);
  const units = new Map(Array.from(root.querySelectorAll('.arena-unit[data-unit-id]'))
    .map(unit => [Number(unit.dataset.unitId), unit]));
  const board = root.querySelector('.arena-board');
  const marker = board?.querySelector('.battle-divider');
  for (const event of events) {
    const [first, second] = event.ids.map(id => units.get(id));
    const spec = scene(event.kind);
    if (event.kind === 'deploy') {
      cue('deploy', first);
      tween('deploy', first?.querySelector('.crew-sprite'), [{ transform: 'translateY(' + spec.rise + 'px) scale(.44)', opacity: 0 },
        { transform: 'translateY(-7px) scale(' + spec.scale + ')', opacity: 1, offset: .7 }, { transform: 'none' }]);
    }
    if (event.kind === 'attack' && first && second) {
      cue('attack', marker ?? second);
      const from = first.getBoundingClientRect(), to = second.getBoundingClientRect();
      const field = board.getBoundingClientRect();
      const bothVisible = [from, to].every(rect => rect.top >= field.top && rect.bottom <= field.bottom);
      const span = bothVisible ? .48 : .18;
      const rush = (unit, dx, dy, tilt) => {
        unit.classList.add('sprite-striker');
        tween('attack', unit.querySelector('.crew-sprite'), [{ transform: 'none' }, { transform:
          'translate(' + dx + 'px,' + dy + 'px) rotate(' + tilt + 'deg) scale(' + spec.scale + ')', offset: .53 },
        { transform: 'none' }]);
      };
      rush(first, (to.x - from.x) * span, (to.y - from.y) * span, spec.tilt);
      if (bothVisible) rush(second, (from.x - to.x) * span, (from.y - to.y) * span, -spec.tilt);
    }
    if (event.kind === 'block' && first) {
      first.classList.add('sprite-guard');
      pulse('block', first.querySelector('.crew-sprite') ?? first);
    }
    if (event.kind === 'impact' || event.kind === 'ko') {
      const target = first ?? marker;
      target?.classList.add('sprite-impact');
      pulse(event.kind, target?.querySelector('.crew-sprite') ?? target, { silent: event.kind === 'impact' && events.some(item => item.kind === 'ko') });
    }
  }
}
