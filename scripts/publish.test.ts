import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack, publish } from './publish.js';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'publish-test-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const manifest = (tarball: string) =>
  new Response(Bun.spawn(['tar', '-xOzf', tarball, 'package/package.json']).stdout).text();

describe('pack', () => {
  // Needs dist/: `bun run test` runs after `bun run build`, locally and in CI.
  test('empacota os quatro pacotes na ordem de publicação, sem workspace:', async () => {
    const out = join(tmp, 'release', 'packed'); // created on demand, parents included
    await pack(out);
    const files = (await readdir(out)).sort();
    expect(files.map((file) => file.replace(/-\d+\.\d+\.\d+.*$/, ''))).toEqual([
      '00-softtor-bunnest-platform',
      '01-softtor-bunnest-ws',
      '02-softtor-bunnest-socket.io',
      '03-softtor-create-bunnest',
    ]);
    for (const file of files) {
      expect(await manifest(join(out, file))).not.toContain('workspace:');
    }
  });

  test('recusa pacote com entrada de "files" ausente (dist/ sem build)', async () => {
    const root = join(tmp, 'packages');
    await mkdir(join(root, 'platform'), { recursive: true });
    await writeFile(
      join(root, 'platform', 'package.json'),
      JSON.stringify({ name: '@softtor/bunnest-platform', version: '9.9.9', files: ['dist'] }),
    );
    await expect(pack(join(tmp, 'packed'), root)).rejects.toThrow('dist');
  });
});

describe('publish', () => {
  /** A fake npm that logs its calls and knows only `published` as already on npm. */
  async function fakeNpm(published: string): Promise<{ npm: string; log: string }> {
    const bin = join(tmp, 'bin');
    const log = join(tmp, 'npm.log');
    await mkdir(bin);
    await writeFile(
      join(bin, 'npm'),
      `#!/bin/sh\necho "$*" >> ${log}\n[ "$1" = view ] || exit 0\n[ "$2" = "${published}" ] && echo "${published.split('@').pop()}" && exit 0\nexit 1\n`,
    );
    await chmod(join(bin, 'npm'), 0o755);
    return { npm: join(bin, 'npm'), log };
  }

  /** A packages/ folder whose public packages are `names`, all at 1.0.0. */
  async function packagesOf(names: string[]): Promise<string> {
    const root = join(tmp, 'packages');
    for (const name of names) {
      await mkdir(join(root, name), { recursive: true });
      await writeFile(join(root, name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    }
    return root;
  }

  async function tarball(dir: string, name: string, version: string): Promise<void> {
    const pkg = join(tmp, 'src', name.replace(/\W/g, ''));
    await mkdir(join(pkg, 'package'), { recursive: true });
    await writeFile(join(pkg, 'package', 'package.json'), JSON.stringify({ name, version }));
    await Bun.spawn([
      'tar',
      '-czf',
      join(dir, `${name.replace(/\W/g, '-')}.tgz`),
      '-C',
      pkg,
      'package',
    ]).exited;
  }

  test('pula o que já está no npm e publica o resto em ordem, por caminho absoluto', async () => {
    const dir = join(tmp, 'packed');
    await mkdir(dir);
    await tarball(dir, '00-a', '1.0.0');
    await tarball(dir, '01-b', '1.0.0');
    const { npm, log } = await fakeNpm('00-a@1.0.0');

    await publish(dir, npm, await packagesOf(['00-a', '01-b']));

    expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
      'view 00-a@1.0.0 version',
      'view 01-b@1.0.0 version',
      `publish ${join(dir, '01-b.tgz')} --access public`,
    ]);
  });

  test('recusa tarball cujo nome@versão não é de um pacote do checkout, antes de enviar qualquer um', async () => {
    const dir = join(tmp, 'packed');
    await mkdir(dir);
    await tarball(dir, '00-a', '1.0.0');
    await tarball(dir, '01-other', '1.0.0');
    const { npm, log } = await fakeNpm('none@0.0.0');

    await expect(publish(dir, npm, await packagesOf(['00-a']))).rejects.toThrow('01-other@1.0.0');
    expect(await Bun.file(log).exists()).toBe(false);
  });

  test('falha quando não há tarball, em vez de terminar sem publicar nada', async () => {
    await expect(publish(tmp, '/nonexistent/npm', tmp)).rejects.toThrow('no tarballs');
  });
});
