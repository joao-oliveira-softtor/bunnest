/**
 * Publish each public package in packages/* whose (name, version) is not on npm yet.
 * Pass --dry-run to print what would be published (npm pack --dry-run) without publishing.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPublished } from './release-target.js';

type Package = { name: string; version: string; private?: boolean };

const root = join(import.meta.dirname, '..', 'packages');
const dryRun = process.argv.includes('--dry-run');

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(root, entry.name);
  const pkg: Package = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  if (pkg.private) continue;

  const view = Bun.spawn(['npm', 'view', `${pkg.name}@${pkg.version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await view.exited;
  if (isPublished(code, await new Response(view.stdout).text(), pkg.version)) {
    console.log(`skip    ${pkg.name}@${pkg.version} (already on npm)`);
    continue;
  }

  console.log(`${dryRun ? 'dry-run ' : 'publish '}${pkg.name}@${pkg.version}`);
  const cmd = dryRun ? ['npm', 'pack', '--dry-run'] : ['bun', 'publish', '--access', 'public'];
  const exit = await Bun.spawn(cmd, { cwd: dir, stdout: 'inherit', stderr: 'inherit' }).exited;
  if (exit !== 0) process.exit(1);
}
