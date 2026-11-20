import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { _electron } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const executableArgument = process.argv.indexOf('--executable');
const packaged = process.argv.includes('--packaged') || executableArgument !== -1;
const { version, productName } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const executablePath = executableArgument !== -1 ? path.resolve(process.argv[executableArgument + 1]) :
  packaged ? path.join(root, 'dist', version, productName + '-win32-x64', productName + '.exe') : electron;
const profile = await mkdtemp(path.join(tmpdir(), 'helm-tests-'));
const screenshots = path.join(root, 'test-output', version);
await mkdir(screenshots, { recursive: true });
const open = () => _electron.launch({ executablePath, args: [...(packaged ? [] : [root]), '--disable-gpu', '--enable-logging=stderr'],
  env: { ...process.env, HELM_PROFILE: profile, HELM_OFFLINE: '1' }, timeout: 20000 });

let app = await open();
const errors = [];
try {
  const win = await app.firstWindow();
  if (process.argv.includes('--compact')) {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760));
    await win.waitForFunction(() => window.innerWidth <= 965);
  }
  win.setDefaultTimeout(22000);
  assert.equal(await win.title(), 'Helm');
  await win.locator('.helm-mark').evaluate(img => img.decode());
  win.on('pageerror', error => errors.push(error.message));
  const take = async name => {
    if (name === 'mesa' || name === 'optimizacion') {
      await win.locator('#main').evaluate(async node => {
        await Promise.allSettled(node.getAnimations({ subtree: true })
          .filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished));
      });
    }
    return win.screenshot({ path: path.join(screenshots, name + '.png') });
  };
  const nav = async name => {
    const target = win.getByRole('navigation').getByRole('button', { name, exact: true });
    if (!(await target.isVisible())) await win.locator('.nav-tools summary').click();
    await target.click();
  };
  const action = (name, exact = true) => win.getByRole('button', { name, exact }).first();
  const snapshot = () => readFile(path.join(profile, 'workspace.json'), 'utf8').then(JSON.parse);

  await win.getByRole('heading', { name: 'Mesa de mazos', exact: true }).waitFor();
  await win.locator('.crew-card img').first().evaluate(img => img.decode());
  await take('elegir-lider');
  assert.equal(await win.locator('.shelf-card').count(), 0);
  await win.getByRole('searchbox', { name: 'Buscar líder' }).fill('OP14-041');
  await win.locator('.crew-card .crew-art').click();
  const boa = win.locator('#dialog canvas[data-frame="24"][data-painted="true"]');
  await boa.waitFor();
  assert.ok(await boa.evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    .some((value, index) => index % 4 === 3 && value >= 230)));
  await take('boa-hancock');
  await action('Cerrar').click();
  await win.getByRole('searchbox', { name: 'Buscar líder' }).fill('OP17-039');
  assert.equal(await win.locator('.crew-card').count(), 1);
  await win.locator('.crew-card[data-leader-drag="OP17-039"] .crew-art').dragTo(win.locator('.leader-slot[data-drop="leader"]'));
  await win.getByRole('heading', { name: 'Cartas para Rocks.D.Xebec' }).waitFor();
  await win.getByRole('searchbox', { name: 'Buscar en cartas elegibles' }).fill('OP17-050');
  await win.locator('.crew-card .crew-art').dblclick();
  await win.locator('.shelf-card .crew-count[data-motion="insert"]').waitFor();
  await win.locator('.shelf-card').waitFor();
  assert.equal(await win.locator('.shelf-card .crew-count').textContent(), '×1');
  const startCard = win.locator('.crew-card[data-catalog-drag="OP17-050"]');
  await startCard.dragTo(win.locator('.deck-shelf'), { targetPosition: { x: 260, y: 45 } });
  assert.equal(await win.locator('.shelf-card .crew-count').textContent(), '×2');
  await action('Quitar copia de Streusen').click();
  assert.equal(await win.locator('.shelf-card .crew-count').textContent(), '×1');

  assert.equal(await action('Ajustar propuesta').count(), 0);
  await action('Sugerir mazo').click();
  await win.getByRole('heading', { name: 'Preparando tu sugerencia' }).waitFor();
  await win.getByRole('button', { name: /Recomendación · Plan del líder/ }).waitFor();
  await win.getByRole('heading', { name: 'Salida con la lista sugerida' }).waitFor();
  await action('Ajustar propuesta').click();
  await win.locator('#tune-counter').fill('10');
  await win.getByText('Más ajustes', { exact: true }).click();
  await win.locator('#tune-minimums').fill('3 OP17-050');
  await action('Recalcular').click();
  await win.getByRole('button', { name: /Recomendación · Plan del líder/ }).waitFor();
  const counter = await win.locator('.proposal-summary strong').nth(1).textContent();
  assert.ok(Number(counter.split('→')[1]) >= 10);
  assert.deepEqual((await snapshot()).deck.cards, { 'OP17-050': 1 });
  await take('sugerencia');
  await nav('Mesa de mazos');

  await action('Cambiar').click();
  await win.getByRole('searchbox', { name: 'Buscar líder' }).fill('OP17-020');
  await win.locator('.crew-card[data-leader-drag="OP17-020"] .crew-art').dragTo(win.locator('.leader-slot[data-drop="leader"]'));
  await win.getByRole('heading', { name: 'Cartas para Shanks', exact: true }).waitFor();
  assert.ok((await snapshot()).versions.some(item => item.deck.leader === 'OP17-039'));

  await nav('Biblioteca');
  await action('Mazos de ejemplo').click();
  await win.locator('.example-card').filter({ has: win.getByRole('heading', { name: 'Rocks.D.Xebec', exact: true }) }).getByRole('button', { name: 'Cargar', exact: true }).click();
  await win.locator('.leader-slot img').evaluate(img => img.decode());
  assert.equal(await win.locator('.leader-slot strong').textContent(), 'Rocks.D.Xebec');
  assert.equal(await win.locator('[data-action="builder-page"]').count(), 0);
  const visibleCards = await win.locator('.crew-card').count();
  await win.locator('#builder-tail').scrollIntoViewIfNeeded();
  await win.waitForFunction(count => document.querySelectorAll('.crew-card').length > count, visibleCards);
  await win.locator('#main').evaluate(main => main.scrollTop = 0);
  const cardBox = await win.locator('.crew-art').first().evaluate(button => ({
    width: button.getBoundingClientRect().width, compact: matchMedia('(max-width: 1120px)').matches
  }));
  // The gallery uses smaller columns in its compact layout.
  assert.ok(cardBox.width >= (cardBox.compact ? 114 : 140),
    'La ilustración mide ' + cardBox.width + ' px en el diseño ' + (cardBox.compact ? 'compacto' : 'amplio') + '.');
  await take('mesa');
  await action('Mano de prueba').click();
  assert.equal(await win.locator('.practice-card').count(), 5);
  await take('mano-de-prueba');
  await action('Hacer mulligan').click();
  assert.ok(await action('Hacer mulligan').isDisabled());
  await action('Conservar mano').click();
  await win.getByText('Mano conservada', { exact: true }).waitFor();
  await action('Cerrar').click();

  await action('Optimizar mazo').click();
  assert.equal(await win.getByText('Criterios de búsqueda', { exact: true }).count(), 0);
  await win.getByRole('heading', { name: 'Optimizando tu mazo' }).waitFor();
  assert.equal(await win.locator('.shuffle-cards i').count(), 5);
  const shuffle = win.locator('.shuffle-cards[data-motion="shuffle"] i').first();
  assert.ok(await shuffle.evaluate(card => card.getAnimations().some(animation => animation.effect.getTiming().duration === 880)));
  await action('Aplicar variante').waitFor();
  await win.getByRole('heading', { name: 'Qué cambia en partida' }).waitFor();
  await action('Ajustar propuesta').click();
  await win.locator('#tune-changes').fill('8');
  await win.locator('#tune-order').selectOption('second');
  await action('Recalcular').click();
  await action('Aplicar variante').waitFor();
  assert.ok(Number(await win.locator('.proposal-summary strong').first().textContent()) <= 8);
  assert.ok(await win.locator('[data-action="opt-order"][data-value="second"]').evaluate(button => button.classList.contains('active')));
  await take('optimizacion');
  await action('Ver sinergias').click();
  await win.getByRole('heading', { name: 'Qué cartas trabajan juntas' }).waitFor();
  assert.ok(await win.locator('.synergy-route').count() > 0);
  await take('sinergias');
  await action('Propuestas').click();
  await action('Ver evidencia').click();
  await win.getByRole('heading', { name: 'Comprobación matemática' }).waitFor();
  await win.getByText(/Brecha MIP/).waitFor();
  assert.equal(await win.locator('.comparison-card').count(), 2);
  await take('evidencia');
  await action('Propuestas').click();
  await win.getByText('Probar variante', { exact: true }).click();
  await action('Repartir mano de la variante').click();
  assert.equal(await win.locator('.practice-card').count(), 5);
  await action('Cerrar').click();
  await win.getByText('Probar variante', { exact: true }).click();
  await action('Comparar en simulador').click();
  await win.getByRole('heading', { name: 'Resultados', exact: true }).waitFor();
  assert.equal(await win.locator('.replay-team').count(), 3);
  await action('Turno siguiente').click();
  await win.getByRole('heading', { name: 'Repetición · Turno 2' }).waitFor();
  await take('laboratorio');
  await nav('Optimización');
  await action('Elegir cambios').click();
  const checks = win.locator('#dialog input[type=checkbox]');
  assert.ok(await checks.count() > 1);
  for (const box of (await checks.all()).slice(1)) await box.uncheck();
  await action('Aplicar selección').click();
  await win.getByRole('heading', { name: 'Mesa de mazos', exact: true }).waitFor();
  await win.getByText('Variante aplicada y guardada.').waitFor();
  const changed = await snapshot();
  assert.ok(changed.versions.length >= 2);
  assert.notDeepEqual(changed.deck.cards, changed.before.deck.cards);
  await action('Deshacer aplicación').click();
  await win.getByText('Lista anterior recuperada.').waitFor();
  assert.deepEqual((await snapshot()).deck.cards, changed.before.deck.cards);

  await action('Jugar en Arena').click();
  await win.getByRole('heading', { name: 'Preparar duelo' }).waitFor();
  await take('arena-sala');
  await action('Cambiar mazo rival').click();
  await win.locator('#rival-leader').selectOption('OP17-020');
  await take('arena-rival');
  await action('Usar este mazo').click();
  assert.equal(await win.locator('.duel-portrait.opponent strong').textContent(), 'Shanks');
  await action('Cambiar mazo rival').click();
  await win.locator('#rival-leader').selectOption('OP17-058');
  await action('Usar este mazo').click();
  assert.equal(await win.locator('.duel-portrait.opponent strong').textContent(), 'Kaido');
  assert.match((await snapshot()).rivalText, /^1 OP17-058/);
  await win.getByText('Opciones de práctica', { exact: true }).click();
  await win.locator('#arena-seed').fill('18');
  await action('Iniciar duelo').click();
  assert.equal(await win.locator('.arena-hand .arena-unit').count(), 5);
  await action('Conservar mano').click();
  await win.locator('.arena-hand-unit').filter({ hasText: 'Buckin' }).first().click();
  await action('Desplegar').click();
  const cinematic = win.locator('#arena-scene[data-kind="deploy"]:not([hidden])');
  await cinematic.waitFor();
  assert.ok(await cinematic.evaluate(element => element.getAnimations().length > 0));
  await take('escena-despliegue');
  const buckin = win.locator('.lane-own .arena-unit').filter({ hasText: 'Buckin' });
  const sequence = await cinematic.getAttribute('data-sequence');
  await buckin.click();
  assert.equal(await win.locator('#arena-scene').getAttribute('data-sequence'), sequence);
  assert.equal(await win.locator('#arena-scene').evaluate(element => element.hidden), false);
  const avatar = buckin.locator('[data-card-code="OP08-051"] img');
  await avatar.waitFor();
  await avatar.evaluate(img => img.decode());
  assert.equal(await avatar.evaluate(img => getComputedStyle(img).objectFit), 'contain');
  const sprite = buckin.locator('canvas.crew-sprite[data-painted="true"]');
  await sprite.waitFor();
  assert.equal(await sprite.getAttribute('data-frame'), '14');
  assert.ok(await sprite.evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value >= 200);
  }));
  assert.equal(await win.locator('.mat-life').count(), 2);
  await win.locator('.lane-own .mat-life').click();
  await win.getByRole('heading', { name: 'Vida · Rocks.D.Xebec' }).waitFor();
  await action('Cerrar').click();
  await win.locator('.arena-menu summary').click();
  await action('Mesa de efectos').click();
  await action('Aplicar efecto').click();
  await win.locator('.arena-log [role="status"]').getByText(/Ajuste de práctica/).waitFor();
  await action('Activar auto').click();
  await win.waitForFunction(() => document.querySelectorAll('.arena-log .log-entry.attack').length > 0, null, { timeout: 22000 });
  await action('Pausar auto').click();
  assert.ok(await win.locator('.arena-board .card-avatar').count() >= 3);
  const rivalSprite = win.locator('.lane-rival .leader-pedestal canvas.crew-sprite[data-painted="true"]');
  assert.equal(await rivalSprite.getAttribute('data-frame'), '2');
  assert.ok(await rivalSprite.evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value >= 200)));
  await win.locator('.arena-board .card-avatar img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await take('arena');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760));
  await win.waitForFunction(() => window.innerWidth <= 965);
  assert.ok(await win.locator('.arena-board').evaluate(board => board.scrollWidth <= board.clientWidth + 1));
  assert.ok(await win.locator('.arena-hand').evaluate(hand => {
    const box = hand.getBoundingClientRect();
    return box.top < innerHeight && box.bottom <= innerHeight + 1;
  }));
  await take('arena-compacta');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1450, 970));
  await action('Cambiar mazo rival').click();
  await win.getByText('Al elegir otro mazo se reinicia el duelo.', { exact: false }).waitFor();
  await win.locator('#rival-leader').selectOption('OP13-079');
  await action('Generar mazo para este líder').click();
  await win.getByText('Mazo de práctica generado', { exact: false }).waitFor();
  assert.equal(await win.locator('.duel-portrait.opponent strong').textContent(), 'Imu');
  await action('Iniciar duelo').click();
  assert.equal(await win.locator('.arena-hand .arena-unit').count(), 5);
  assert.ok((await win.locator('.lane-rival .leader-pedestal').textContent()).includes('Imu'));

  const localList = path.join(profile, 'mazo-prueba.txt');
  const examples = JSON.parse(await readFile(path.join(root, 'data', 'examples.json'), 'utf8'));
  await writeFile(localList, examples.find(row => row.id === 'shanks').text);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file + '.export.txt' });
  }, localList);
  await nav('Mesa de mazos');
  await action('Importar').click();
  await action('Abrir archivo .txt').click();
  await win.waitForFunction(() => document.querySelector('#list-input').value.startsWith('1 OP17-020'));
  await action('Cargar lista').click();
  await win.getByRole('heading', { name: 'Cartas para Shanks', exact: true }).waitFor();
  await win.getByText('Mi lista', { exact: true }).click();
  await action('Exportar').click();
  await win.getByText('Lista exportada.').waitFor();
  assert.match(await readFile(localList + '.export.txt', 'utf8'), /^1 OP17-020/);

  await nav('Catálogo');
  const firstBatch = await win.locator('.gallery-card').count();
  await win.locator('#catalog-tail').scrollIntoViewIfNeeded();
  await win.waitForFunction(count => document.querySelectorAll('.gallery-card').length > count, firstBatch);
  await win.locator('#main').evaluate(main => main.scrollTop = 0);
  await win.getByRole('textbox', { name: 'Buscar cartas' }).fill('OP17-021');
  assert.equal(await win.locator('.gallery-card').count(), 1);
  await win.locator('.gallery-card img').first().evaluate(image => image.decode());
  await win.locator('.gallery-card button[data-action="details"]').first().click();
  const fallback = win.locator('#dialog canvas[data-frame="-1"][data-painted="true"]');
  await fallback.waitFor();
  assert.ok(await fallback.evaluate(canvas => canvas.getContext('2d').getImageData(18, 15, 3, 3).data.some((value, i) => i % 4 === 3 && value >= 200)));
  await action('Cerrar').click();
  await action('Comparar cartas').click();
  await action('Ejemplo de Teach').click();
  await win.getByText(/Reduce el coste para habilitar una retirada/).waitFor();
  await action('Cobertura del análisis').click();
  await action('Calcular cobertura').click();
  await win.getByText('Parejas compatibles', { exact: true }).waitFor();

  await nav('Partidas');
  await action('Configurar rival').click();
  await win.getByRole('dialog').getByRole('heading', { name: 'Configurar rival' }).waitFor();
  await win.locator('#list-input').fill('1 OP17-058');
  await action('Guardar').click();
  await action('Registrar partida').click();
  await action('Guardar').click();
  await win.getByRole('heading', { name: 'Rendimiento por lista y orden' }).waitFor();
  assert.ok((await snapshot()).matches.length === 1);
  assert.deepEqual(errors, []);

  await nav('Mesa de mazos');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 760));
  await win.waitForFunction(() => window.innerWidth <= 965);
  assert.ok(await win.locator('#main').evaluate(main => main.scrollWidth <= main.clientWidth + 1));
  await take('ventana-compacta');
  await app.close();
  app = await open();
  const reopened = await app.firstWindow();
  await reopened.getByRole('heading', { name: 'Cartas para Shanks', exact: true }).waitFor();
  await reopened.locator('.nav-tools summary').click();
  await reopened.getByRole('navigation').getByRole('button', { name: 'Partidas', exact: true }).click();
  await reopened.getByRole('heading', { name: 'Rendimiento por lista y orden' }).waitFor();
  console.log('Escritorio ' + (packaged ? 'empaquetado' : 'en desarrollo') +
    ' · Reparto, arrastre, animación Lua, optimización, duelo con sprites, laboratorio, catálogo y persistencia verificados.');
} catch (error) {
  const failed = app.windows()[0];
  if (failed) {
    console.error('Error de la interfaz', errors, await failed.locator('#toast').textContent(), await failed.locator('h1').textContent());
    await failed.screenshot({ path: path.join(screenshots, 'ultimo-error.png') });
  }
  throw error;
} finally {
  await app.close().catch(() => {});
}
