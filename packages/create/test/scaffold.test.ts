import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLATFORM_VERSION, scaffold, type Adapter } from '../src/scaffold.js';

const root = await mkdtemp(join(tmpdir(), 'create-bunnest-'));
afterAll(() => rm(root, { recursive: true, force: true }));

/** Generate, install, type-check, test, and boot the result. The real thing, not a snapshot. */
async function generateAndVerify(adapter: Adapter) {
  const dir = join(root, `app-${adapter}`);
  const result = await scaffold({ dir, adapter });
  expect(result.files).toContain('.gitignore');
  expect(result.files).not.toContain('gitignore');

  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  expect(pkg.name).toBe(`app-${adapter}`);
  expect(pkg['bun-create']).toBeUndefined();

  if (adapter === 'bun') {
    // Install the adapter at this commit, packed as npm ships it: before a release its new
    // version (or, before the first one, its name) is not on npm yet.
    expect(pkg.dependencies['@softtor/bunnest-platform']).toBe(PLATFORM_VERSION);
    const dependencies = { ...pkg.dependencies, '@softtor/bunnest-platform': await packPlatform() };
    await writeFile(join(dir, 'package.json'), JSON.stringify({ ...pkg, dependencies }, null, 2));
  }

  await exec(['bun', 'install'], dir);
  await exec(['bun', 'run', 'typecheck'], dir);
  await exec(['bun', 'test'], dir);

  // Boot it on a random port and hit it.
  const server = Bun.spawn(['bun', 'src/main.ts'], {
    cwd: dir,
    env: { ...process.env, PORT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const port = await waitForPort(server.stdout);
    const res = await fetch(`http://localhost:${port}/`);
    expect(await res.text()).toBe('Hello World!');
  } finally {
    server.kill();
  }
  return { dir, pkg };
}

describe('@softtor/create-bunnest', () => {
  it('express (default) generates the same project as the nest-bun template', async () => {
    const { pkg } = await generateAndVerify('express');
    expect(pkg.dependencies['@nestjs/platform-express']).toBeDefined();
    expect(pkg.dependencies['@softtor/bunnest-platform']).toBeUndefined();
  }, 120_000);

  it('--adapter bun swaps in @softtor/bunnest-platform', async () => {
    const { dir, pkg } = await generateAndVerify('bun');
    expect(pkg.dependencies['@softtor/bunnest-platform']).toBeDefined();
    expect(pkg.dependencies['@nestjs/platform-express']).toBeUndefined();
    expect(pkg.devDependencies['@types/express']).toBeUndefined();
    expect(await readFile(join(dir, 'src/main.ts'), 'utf8')).toContain('new BunAdapter()');
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toContain('@softtor/bunnest-platform');
  }, 120_000);

  it('refuses a non-empty directory unless forced', async () => {
    const dir = join(root, 'app-express');
    await expect(scaffold({ dir })).rejects.toThrow(/not empty/);
    await expect(scaffold({ dir, force: true, name: 'forced' })).resolves.toMatchObject({
      name: 'forced',
    });
  });
});

/** Packs packages/platform into `root` and returns a `file:` spec for the tarball. */
async function packPlatform(): Promise<string> {
  const platform = join(import.meta.dir, '../../platform');
  if (!existsSync(join(platform, 'dist/index.d.ts')))
    throw new Error('packages/platform/dist is missing: run `bun run build` before the tests');
  await exec(['bun', 'pm', 'pack', '--destination', root, '--ignore-scripts', '--quiet'], platform);
  const tarball = (await readdir(root)).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('bun pm pack wrote no tarball');
  return `file:${join(root, tarball)}`;
}

async function exec(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if ((await proc.exited) !== 0)
    throw new Error(`${cmd.join(' ')} failed in ${cwd}\n${out}\n${err}`);
}

async function waitForPort(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stdout.getReader();
  let buffered = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`Server exited before listening:\n${buffered}`);
    buffered += new TextDecoder().decode(value);
    const match = /Listening on https?:\/\/\S+:(\d+)/.exec(buffered);
    if (match) return match[1]!;
  }
}
