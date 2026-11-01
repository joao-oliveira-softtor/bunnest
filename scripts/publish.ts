/**
 * Publish each public package in packages/* whose (name, version) is not on npm yet, in
 * publishOrder. Each one is packed by Bun (which turns `workspace:*` into the real version and
 * runs no scripts: the workflow already built and tested) and uploaded by npm, which supports
 * trusted publishing (OIDC) from GitHub Actions.
 * Pass --dry-run to pack every package, already published or not, and list the tarball
 * (npm pack --dry-run) without publishing.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPublished, publishOrder } from './release-target.js';

type Package = { name: string; version: string; private?: boolean };

const root = join(import.meta.dirname, '..', 'packages');
const dryRun = process.argv.includes('--dry-run');

const packages = new Map<string, Package>();
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pkg: Package = JSON.parse(await readFile(join(root, entry.name, 'package.json'), 'utf8'));
  if (!pkg.private) packages.set(entry.name, pkg);
}

async function run(cmd: string[], cwd?: string): Promise<void> {
  const exit = await Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' }).exited;
  // Throw, not process.exit: the `finally` below must still remove the staging folder.
  if (exit !== 0) throw new Error(`${cmd.join(' ')} exited with ${exit}`);
}

for (const dir of publishOrder([...packages.keys()])) {
  const pkg = packages.get(dir)!;
  const view = Bun.spawn(['npm', 'view', `${pkg.name}@${pkg.version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await view.exited;
  if (isPublished(code, await new Response(view.stdout).text(), pkg.version) && !dryRun) {
    console.log(`skip    ${pkg.name}@${pkg.version} (already on npm)`);
    continue;
  }

  console.log(`${dryRun ? 'dry-run ' : 'publish '}${pkg.name}@${pkg.version}`);
  const stage = await mkdtemp(join(tmpdir(), 'publish-'));
  try {
    await run(
      ['bun', 'pm', 'pack', '--ignore-scripts', '--quiet', '--destination', stage],
      join(root, dir),
    );
    // The folder holds only this tarball. The path must be absolute: npm reads `a/b.tgz` as a GitHub repo.
    const tarball = join(stage, (await readdir(stage))[0]!);
    await run(
      dryRun
        ? ['npm', 'pack', '--dry-run', tarball]
        : ['npm', 'publish', tarball, '--access', 'public'],
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
