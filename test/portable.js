import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const executable = fileURLToPath(new URL('dist/' + version + '/Helm-' + version + '-Portable.exe', root));
await access(executable);
const profile = await mkdtemp(path.join(tmpdir(), 'decklab-portable-'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const endpoint = 'http://127.0.0.1:' + port;

const launcher = spawn(executable, ['--remote-debugging-port=' + port, '--disable-gpu'], {
  cwd: tmpdir(), windowsHide: true, stdio: 'ignore',
  env: { ...process.env, DECKLAB_PROFILE: profile, DECKLAB_OFFLINE: '1' }
});
let browser;
try {
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint + '/json/version', { signal: AbortSignal.timeout(500) });
      if (response.ok) break;
    } catch {}
    await delay(500);
  }
  browser = await chromium.connectOverCDP(endpoint, { timeout: 4000 });
  const context = browser.contexts()[0];
  const view = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 });
  await view.getByRole('heading', { name: 'Mesa de mazos', exact: true }).waitFor({ timeout: 14000 });
  await view.getByRole('button', { name: 'Probar con Rocks' }).click();
  await view.getByRole('button', { name: 'Mano de prueba' }).click();
  assert.equal(await view.locator('.practice-card').count(), 5);
  await view.getByRole('button', { name: 'Cerrar' }).click();
  await view.getByRole('button', { name: 'Jugar en Arena' }).click();
  await view.locator('.portrait-avatar .crew-sprite[data-painted="true"]').first().waitFor();
  await view.close();
  console.log('Ejecutable portable verificado desde una carpeta independiente. Reparto y sprites disponibles.');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (launcher.exitCode === null) {
    await delay(1800);
    if (launcher.exitCode === null) launcher.kill();
  }
}
