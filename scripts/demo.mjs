/**
 * Firebase kurulumu olmadan sistemi yerelde açar:
 *   npm run demo   →  http://localhost:5173
 * API (bellek içi veri + test hesapları) ve ön yüz birlikte başlar. Ctrl+C ile ikisi de kapanır.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 3)) {
  console.error(`Demo için Node.js 22.3 ya da üstü gerekli (şu an ${process.versions.node}).`);
  process.exit(1);
}

for (const dir of ['api', 'web']) {
  if (!existsSync(join(root, dir, 'node_modules'))) {
    console.log(`→ ${dir} bağımlılıkları kuruluyor…`);
    const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: join(root, dir), stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

const procs = [
  spawn(npm, ['run', 'demo'], { cwd: join(root, 'api'), stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'demo'], { cwd: join(root, 'web'), stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
