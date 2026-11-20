import { app, BrowserWindow, protocol, ipcMain, net, dialog, shell, Menu } from 'electron';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { indexCards } from './core/deck.js';
import { createArtworkStore } from './core/artwork.js';
import { loadMotion } from './core/motion.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceOrigins = new Set(['https://en.onepiece-cardgame.com', 'https://play.limitlesstcg.com']);
const browserRoute = 'decklab://app/';
const security = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const assetTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
let snapshot, cards, examples, tournaments, profile, window, task, bootSync, motion, loadArtwork;
const workers = new Set();
const sourceJobs = new Map();
let saveQueue = Promise.resolve();

protocol.registerSchemesAsPrivileged([{ scheme: 'decklab', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('Helm');
app.setAppUserModelId('local.helm.desktop');
// The previous desktop builds already store decks, references and illustrations here.
const dataPath = process.env.HELM_PROFILE || process.env.DECKLAB_PROFILE || path.join(app.getPath('appData'), 'DeckLab Desktop');
app.setPath('userData', path.resolve(dataPath));
const offline = Boolean(process.env.HELM_OFFLINE || process.env.DECKLAB_OFFLINE);

async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback;
    throw error;
  }
}

async function commit(file, data) {
  const draft = file + '.tmp';
  await writeFile(draft, JSON.stringify(data), 'utf8');
  await rename(draft, file);
}

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'app') return new Response(null, { status: 404 });
  const route = url.pathname;
  if (route.startsWith('/art/')) return serveArt(route.slice(5));
  const file = route === '/' ? 'src/ui/index.html' : route.slice(1);
  if (!/^src\/(?:core|ui)\/[\w./-]+$/.test(file) || file.split('/').includes('..')) return new Response(null, { status: 404 });
  const contentType = assetTypes[path.extname(file)];
  if (!contentType) return new Response(null, { status: 404 });
  try {
    const body = await readFile(path.join(root, file));
    return new Response(body, { headers: { 'Content-Type': contentType, 'Content-Security-Policy': security, 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}

async function serveArt(code) {
  const image = await loadArtwork(cards[code]).catch(() => null);
  return image ? new Response(image.bytes, { headers: { 'Content-Type': image.type, 'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff' } }) : new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function register(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.senderFrame?.url !== browserRoute || event.sender !== window?.webContents) throw new Error('Origen de llamada inválido.');
    return fn(event, ...args);
  });
}

function work(operation, payload, progress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: { operation, snapshot, payload } });
    workers.add(worker);
    worker.on('message', message => {
      if (message.progress) progress(message.progress);
      else if (message.error) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.once('error', reject);
    worker.once('exit', () => {
      workers.delete(worker);
      reject(new Error('El cálculo terminó antes de entregar un resultado.'));
    });
  });
}

function updateSource(operation, payload, progress) {
  const current = sourceJobs.get(operation);
  if (current) {
    if (progress) current.listeners.add(progress);
    return current.promise;
  }
  const listeners = new Set(progress ? [progress] : []);
  const promise = work(operation, payload, value => { for (const callback of listeners) callback(value); }).then(async result => {
    if (operation === 'catalog') {
      await commit(path.join(profile, 'catalog.json'), result);
      snapshot = result;
      cards = indexCards(result);
      return result;
    }
    const merged = new Map([...tournaments, ...result].map(row => [row.source + '/' + row.rank + '/' + row.leader, row]));
    const updated = [...merged.values()].sort((a, b) => b.day.localeCompare(a.day) || a.rank - b.rank).slice(0, 150);
    await commit(path.join(profile, 'tournaments.json'), updated);
    tournaments = updated;
    return updated;
  }).finally(() => sourceJobs.delete(operation));
  sourceJobs.set(operation, { promise, listeners });
  return promise;
}

function bootUpdates() {
  if (offline) return { offline: true };
  bootSync ??= (async () => {
    // Refresh lists against the newly reviewed catalog when available. An upstream change never removes the usable local copy.
    const result = {};
    for (const key of ['catalog', 'tournaments']) {
      try { result[key] = { value: await updateSource(key, {}) }; }
      catch (error) { result[key] = { error: error.message }; }
    }
    return result;
  })();
  return bootSync;
}

function calculate(event, operation, payload) {
  const progress = message => {
    if (!event.sender.isDestroyed()) event.sender.send('engine:progress', message);
  };
  if (['catalog', 'tournaments'].includes(operation)) return updateSource(operation, payload, progress);
  if (!['optimize', 'simulate', 'audit'].includes(operation)) throw new Error('Operación desconocida.');
  if (task) throw new Error('Ya hay un cálculo en curso.');
  task = work(operation, payload, progress).finally(() => { task = undefined; });
  return task;
}

function openWindow() {
  window = new BrowserWindow({
    width: 1450, height: 970, minWidth: 940, minHeight: 680, backgroundColor: '#f7ecd6', show: false,
    title: 'Helm', icon: path.join(root, 'src', 'ui', 'assets', 'helm-mark.png'), titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#662b2b', symbolColor: '#fff0cb', height: 46 },
    webPreferences: { preload: path.join(root, 'src', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_, __, done) => done(false));
  window.once('ready-to-show', () => window.show());
  window.loadURL(browserRoute);
}

async function initialize() {
  Menu.setApplicationMenu(null);
  profile = app.getPath('userData');
  await mkdir(path.join(profile, 'art'), { recursive: true });
  loadArtwork = createArtworkStore({ bundled: path.join(root, 'data', 'art'), cached: path.join(profile, 'art'), offline,
    fetcher: (url, options) => net.fetch(url, options) });
  const fallback = await json(path.join(root, 'data', 'catalog.json'));
  snapshot = await json(path.join(profile, 'catalog.json'), fallback);
  if (!Array.isArray(snapshot?.cards) || !snapshot.overrides || typeof snapshot.checked !== 'string' ||
      snapshot.checked < fallback.checked) snapshot = fallback;
  cards = indexCards(snapshot);
  examples = await json(path.join(root, 'data', 'examples.json'), []);
  tournaments = await json(path.join(profile, 'tournaments.json'), await json(path.join(root, 'data', 'recommended_decks.json'), []));
  motion = await loadMotion();
  protocol.handle('decklab', serve);
  openWindow();
}

register('workspace:bootstrap', async () => ({
  snapshot, examples, tournaments, motion, state: await json(path.join(profile, 'workspace.json'), null)
}));
register('workspace:save', (_, state) => {
  if (JSON.stringify(state).length > 30_000_000) throw new Error('El espacio de trabajo excede el tamaño admitido.');
  const save = saveQueue.then(() => commit(path.join(profile, 'workspace.json'), state));
  saveQueue = save.catch(() => {});
  return save;
});
register('file:open', async () => {
  const result = await dialog.showOpenDialog(window, { title: 'Abrir lista de mazo', filters: [{ name: 'Lista de cartas', extensions: ['txt'] }],
    properties: ['openFile'] });
  if (result.canceled) return null;
  const buffer = await readFile(result.filePaths[0]);
  if (buffer.length > 2_000_000) throw new Error('La lista de texto supera el tamaño admitido.');
  return buffer.toString('utf8');
});
register('file:save', async (_, { name, text }) => {
  const type = name.endsWith('.csv') ? 'csv' : 'txt';
  const result = await dialog.showSaveDialog(window, { defaultPath: path.basename(name), filters: [{ name: type.toUpperCase(), extensions: [type] }] });
  if (result.canceled) return false;
  await writeFile(result.filePath, text, 'utf8');
  return true;
});
register('source:open', async (_, address) => {
  const url = new URL(address);
  if (!sourceOrigins.has(url.origin) || url.username || url.password) throw new Error('El enlace no pertenece a una fuente del catálogo.');
  await shell.openExternal(url.href);
});
register('engine:run', (event, { operation, payload }) => calculate(event, operation, payload));
register('engine:startup-refresh', () => bootUpdates());

app.whenReady().then(initialize).catch(error => {
  console.error(error);
  dialog.showErrorBox('Helm', 'No se pudo iniciar la aplicación.\n' + error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const worker of workers) void worker.terminate(); });
