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

const packagesRoot = join(import.meta.dirname, '..', 'packages');

async function run(cmd: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'inherit' });
  const out = await new Response(proc.stdout).text();
  // Throw, not process.exit: callers' `finally` must still remove their temp folder.
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(' ')} failed`);
  return out;
}

async function onNpm(pkg: Pick<Package, 'name' | 'version'>, npm: string): Promise<boolean> {
  const view = Bun.spawn([npm, 'view', `${pkg.name}@${pkg.version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await view.exited;
  return isPublished(code, await new Response(view.stdout).text(), pkg.version);
}

/** Public packages under `root`, by folder name. */
async function publicPackages(root: string): Promise<Map<string, Package>> {
  const packages = new Map<string, Package>();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg: Package = JSON.parse(await readFile(join(root, entry.name, 'package.json'), 'utf8'));
    if (!pkg.private) packages.set(entry.name, pkg);
  }
  return packages;
}

export async function pack(out: string, root = packagesRoot): Promise<void> {
  await mkdir(out, { recursive: true });
  const packages = await publicPackages(root);
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

const id = (pkg: Pick<Package, 'name' | 'version'>) => `${pkg.name}@${pkg.version}`;

async function tarballs(dir: string): Promise<string[]> {
  // Absolute paths: npm reads a relative `a/b.tgz` as a GitHub repository.
  return (await readdir(dir))
    .filter((file) => file.endsWith('.tgz'))
    .sort()
    .map((file) => resolve(dir, file));
}

/**
 * `npm` is the command to run; tests pass a fake one so they can never reach the registry.
 * The tarballs come from the pack job, where dependency code runs, so each one must match a
 * package of this checkout by name and version before anything is uploaded: the fallback
 * token can publish any @softtor package.
 */
export async function publish(dir: string, npm = 'npm', root = packagesRoot): Promise<void> {
  const files = await tarballs(dir);
  if (files.length === 0) throw new Error(`no tarballs in ${dir}`);
  const expected = new Set([...(await publicPackages(root)).values()].map(id));
  const manifests: Package[] = [];
  for (const tarball of files) {
    const pkg = await packed(tarball, npm);
    if (!expected.has(id(pkg))) throw new Error(`${id(pkg)} is not a package of this checkout`);
    manifests.push(pkg);
  }
  for (const [index, tarball] of files.entries()) {
    const pkg = manifests[index]!;
    if (await onNpm(pkg, npm)) {
      console.log(`skip    ${pkg.name}@${pkg.version} (already on npm)`);
      continue;
    }
    console.log(`publish ${pkg.name}@${pkg.version}`);
    await run([npm, 'publish', tarball, '--access', 'public']);
  }
}

async function dryRun(): Promise<void> {
  const out = await mkdtemp(join(tmpdir(), 'publish-dry-run-'));
  try {
    await pack(out);
    for (const tarball of await tarballs(out)) {
      const info = await packed(tarball, 'npm');
      console.log(`dry-run ${id(info)} (${info.entryCount} files)`);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * What npm itself reads from a tarball, offline. Not `tar -xO package/package.json`: npm strips
 * the first folder of every entry, so a later `other/package.json` would win over it.
 */
async function packed(
  tarball: string,
  npm: string,
): Promise<{ name: string; version: string; entryCount: number }> {
  const [info] = JSON.parse(await run([npm, 'pack', '--dry-run', '--json', tarball]));
  return info;
}

if (import.meta.main) {
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
}
