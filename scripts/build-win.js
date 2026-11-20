import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version, productName } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const out = path.join(root, 'dist', version);
for (const directory of [path.dirname(out), out, path.join(out, productName + '-win32-x64')]) {
  const info = await lstat(directory).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Directorio de compilación inesperado: ' + directory);
}
const [output] = await packager({
  dir: root,
  out,
  name: productName,
  executableName: productName,
  icon: path.join(root, 'src', 'ui', 'assets', 'helm.ico'),
  platform: 'win32',
  arch: 'x64',
  electronVersion: '45.4.1',
  overwrite: true,
  asar: false,
  prune: true,
  ignore: [/^\/(?:dist|test|test-output|scripts|\.git|\.github)(?:\/|$)/, /^\/(?:\.gitignore|package-lock\.json|.*\.md|.*\.cmd)$/iu],
  win32metadata: {
    CompanyName: productName, FileDescription: 'Laboratorio de mazos para One Piece TCG', ProductName: productName
  }
});
console.log('Aplicación empaquetada en ' + output);
