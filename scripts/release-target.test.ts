import { describe, expect, test } from 'bun:test';
import { bumpInternalDeps, isPublished, releaseBlocker, releaseTarget } from './release-target.js';

describe('releaseTarget', () => {
  test('sem env, mantém o comportamento do upstream', () => {
    expect(releaseTarget({})).toEqual({ remote: 'origin', branch: 'main', tagPrefix: 'v' });
  });
  test('lê remote, branch e prefixo da env', () => {
    expect(
      releaseTarget({
        RELEASE_REMOTE: 'fork',
        RELEASE_BRANCH: 'softtor',
        RELEASE_TAG_PREFIX: 'softtor-v',
      }),
    ).toEqual({ remote: 'fork', branch: 'softtor', tagPrefix: 'softtor-v' });
  });
});

describe('releaseBlocker', () => {
  const target = { branch: 'softtor' };
  const ok = {
    dryRun: false,
    branch: 'softtor',
    dirty: false,
    tagExists: false,
    tag: 'softtor-v0.2.0',
  };

  test('libera na branch alvo, com árvore limpa e tag nova', () => {
    expect(releaseBlocker(ok, target)).toBeNull();
  });
  test('reprova fora da branch alvo', () => {
    expect(releaseBlocker({ ...ok, branch: 'main' }, target)).toBe('switch to softtor first');
  });
  test('reprova com árvore suja', () => {
    expect(releaseBlocker({ ...ok, dirty: true }, target)).toBe('working tree is not clean');
  });
  test('reprova tag já existente, inclusive no dry-run', () => {
    expect(releaseBlocker({ ...ok, tagExists: true }, target)).toBe(
      'tag softtor-v0.2.0 already exists',
    );
    expect(releaseBlocker({ ...ok, dryRun: true, tagExists: true }, target)).toBe(
      'tag softtor-v0.2.0 already exists',
    );
  });
  test('no dry-run, não exige branch alvo nem árvore limpa', () => {
    expect(releaseBlocker({ ...ok, dryRun: true, branch: 'x', dirty: true }, target)).toBeNull();
  });
});

describe('bumpInternalDeps', () => {
  const source = `{
  "name": "@nestbun/ws",
  "version": "0.3.0",
  "peerDependencies": {
    "@nestbun/platform": "0.2.0",
    "@nestjs/websockets": "^12.0.0"
  },
  "devDependencies": {
    "@nestbun/platform": "workspace:*"
  }
}`;
  test('leva o range interno à versão nova e preserva workspace: e o resto do arquivo', () => {
    expect(bumpInternalDeps(source, ['@nestbun/platform', '@nestbun/ws'], '0.3.0')).toBe(
      source.replace('"@nestbun/platform": "0.2.0"', '"@nestbun/platform": "0.3.0"'),
    );
  });
  test('serve ao bun.lock: leva só o peer do workspace e deixa workspace:* e o mapa de pacotes', () => {
    const lock = `    "packages/ws": {
      "name": "@nestbun/ws",
      "version": "0.3.0",
      "devDependencies": {
        "@nestbun/platform": "workspace:*",
      },
      "peerDependencies": {
        "@nestbun/platform": "0.3.0",
      },
    },
  },
  "packages": {
    "@nestbun/platform": ["@nestbun/platform@workspace:packages/platform"],`;
    expect(bumpInternalDeps(lock, ['@nestbun/platform', '@nestbun/ws'], '0.4.0')).toBe(
      lock.replace('"@nestbun/platform": "0.3.0"', '"@nestbun/platform": "0.4.0"'),
    );
  });
  test('não confunde o nome do próprio pacote com uma dependência', () => {
    const own = '{\n  "name": "@nestbun/platform",\n  "version": "0.3.0"\n}';
    expect(bumpInternalDeps(own, ['@nestbun/platform'], '0.3.0')).toBe(own);
  });
});

describe('isPublished', () => {
  test('pula quando o npm devolve a mesma versão (idempotente)', () => {
    expect(isPublished(0, '0.2.0\n', '0.2.0')).toBe(true);
  });
  test('publica quando o npm não conhece a versão (404 sai com código diferente de 0)', () => {
    expect(isPublished(1, '', '0.2.0')).toBe(false);
  });
  test('publica quando o npm devolve outra versão', () => {
    expect(isPublished(0, '0.1.2\n', '0.2.0')).toBe(false);
  });
});
