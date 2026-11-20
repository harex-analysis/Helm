import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version, productName } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'dist', version);
const prepackaged = path.join(output, productName + '-win32-x64');
const executable = path.join(prepackaged, productName + '.exe');
await access(executable).catch(() => { throw new Error('Ejecuta npm run build:win primero. Falta ' + executable); });
const temporary = await mkdtemp(path.join(tmpdir(), 'helm-installer-'));
const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
  '--prepackaged', prepackaged, '--win', 'nsis', '--x64', '--config', 'scripts/installer.json',
  '--config.directories.output=' + temporary], { cwd: root, stdio: 'inherit',
  env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '4' } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const file = productName + '-' + version + '-Setup.exe';
await copyFile(path.join(temporary, file), path.join(output, file));
console.log('Instalador generado en ' + path.join(output, file));
