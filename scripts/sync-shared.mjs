// Copies the shared core engine + UI into each app so every app is self-contained
// (electron-builder and plain `npm install` on a VPS both need that).
// Uses a manual copy: fs.cpSync crashes natively on some Windows/Node 24 setups.
import { rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['windows', 'server'];

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFileSync(s, d);
  }
}

for (const app of targets) {
  const dest = join(root, 'apps', app, 'shared');
  rmSync(dest, { recursive: true, force: true });
  copyDir(join(root, 'packages', 'core', 'src'), join(dest, 'core'));
  copyDir(join(root, 'packages', 'ui', 'public'), join(dest, 'ui'));
  console.log(`[sync] packages/{core,ui} -> apps/${app}/shared`);
}
