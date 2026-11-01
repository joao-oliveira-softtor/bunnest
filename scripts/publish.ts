/**
 * Publishes the public packages in packages/* in two steps, so no third-party code (install,
 * build, tests) runs in the job that can authenticate to npm:
 *
 *   bun run scripts/publish.ts pack <dir>      build job: pack each public package, in
 *                                              publishOrder, into <dir> as NN-<name>.tgz
 *   bun run scripts/publish.ts publish <dir>   publish job: upload each tarball in <dir> whose
 *                                              version is not on npm yet, in that order
 *   bun run scripts/publish.ts --dry-run       pack into a temp folder and list each tarball
 *
 * Bun packs (it turns `workspace:*` into the real version; --ignore-scripts, since the workflow
 * already built and tested) and npm uploads, because npm supports trusted publishing (OIDC).
 * npm runs no lifecycle scripts for a tarball.
 */
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isPublished, publishOrder } from './release-target.js';

type Package = { name: string; version: string; private?: boolean; files?: string[] };

const root = join(import.meta.dirname, '..', 'packages');

async function run(cmd: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'inherit' });
  const out = await new Response(proc.stdout).text();
  // Throw, not process.exit: callers' `finally` must still remove their temp folder.
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(' ')} failed`);
  return out;
}

async function onNpm(pkg: Pick<Package, 'name' | 'version'>): Promise<boolean> {
  const view = Bun.spawn(['npm', 'view', `${pkg.name}@${pkg.version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await view.exited;
  return isPublished(code, await new Response(view.stdout).text(), pkg.version);
}

async function pack(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  const packages = new Map<string, Package>();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg: Package = JSON.parse(await readFile(join(root, entry.name, 'package.json'), 'utf8'));
    if (!pkg.private) packages.set(entry.name, pkg);
  }
  for (const [index, dir] of publishOrder([...packages.keys()]).entries()) {
    // bun pm pack silently leaves out a missing "files" entry: an unbuilt dist/ must fail here.
    for (const file of packages.get(dir)!.files ?? []) await access(join(root, dir, file));
    const stage = await mkdtemp(join(tmpdir(), 'pack-'));
    try {
      await run(
        ['bun', 'pm', 'pack', '--ignore-scripts', '--quiet', '--destination', stage],
        join(root, dir),
      );
      // The folder holds only this tarball; the prefix carries publishOrder to the publish job.
      const [file] = await readdir(stage);
      await rename(join(stage, file!), join(out, `${String(index).padStart(2, '0')}-${file}`));
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
}

async function tarballs(dir: string): Promise<string[]> {
  // Absolute paths: npm reads a relative `a/b.tgz` as a GitHub repository.
  return (await readdir(dir))
    .filter((file) => file.endsWith('.tgz'))
    .sort()
    .map((file) => resolve(dir, file));
}

async function publish(dir: string): Promise<void> {
  const files = await tarballs(dir);
  if (files.length === 0) throw new Error(`no tarballs in ${dir}`);
  for (const tarball of files) {
    const pkg: Package = JSON.parse(await run(['tar', '-xOzf', tarball, 'package/package.json']));
    if (await onNpm(pkg)) {
      console.log(`skip    ${pkg.name}@${pkg.version} (already on npm)`);
      continue;
    }
    console.log(`publish ${pkg.name}@${pkg.version}`);
    await run(['npm', 'publish', tarball, '--access', 'public']);
  }
}

async function dryRun(): Promise<void> {
  const out = await mkdtemp(join(tmpdir(), 'publish-dry-run-'));
  try {
    await pack(out);
    for (const tarball of await tarballs(out)) {
      console.log(summary(await run(['npm', 'pack', '--dry-run', '--json', tarball])));
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

function summary(json: string): string {
  const [info] = JSON.parse(json) as { name: string; version: string; entryCount: number }[];
  return `dry-run ${info!.name}@${info!.version} (${info!.entryCount} files)`;
}

const [command, dir = ''] = process.argv.slice(2);
const usage = 'usage: publish.ts pack <dir> | publish <dir> | --dry-run';
switch (command) {
  case '--dry-run':
    await dryRun();
    break;
  case 'pack':
  case 'publish':
    if (!dir) throw new Error(usage);
    await (command === 'pack' ? pack : publish)(resolve(dir));
    break;
  default:
    throw new Error(usage);
}
