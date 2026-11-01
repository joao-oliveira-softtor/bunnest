type Env = Record<string, string | undefined>;

export interface ReleaseState {
  dryRun: boolean;
  branch: string;
  dirty: boolean;
  tagExists: boolean;
  tag: string;
}

export function releaseTarget(env: Env) {
  return {
    remote: env.RELEASE_REMOTE || 'origin',
    branch: env.RELEASE_BRANCH || 'main',
    tagPrefix: env.RELEASE_TAG_PREFIX ?? 'v',
  };
}

/** Same checks, same order and same messages as the upstream release.ts. */
export function releaseBlocker(state: ReleaseState, target: { branch: string }): string | null {
  if (!state.dryRun && state.branch !== target.branch) return `switch to ${target.branch} first`;
  if (!state.dryRun && state.dirty) return 'working tree is not clean';
  if (state.tagExists) return `tag ${state.tag} already exists`;
  return null;
}

/**
 * Sets the range of every internal dependency (one of `names`) to `version` in a package.json
 * source, keeping its formatting. `workspace:` ranges (devDependencies) are left alone.
 */
export function bumpInternalDeps(source: string, names: string[], version: string): string {
  return names.reduce(
    (text, name) =>
      text.replaceAll(
        new RegExp(
          `("${name.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}": )"(?!workspace:)[^"]*"`,
          'g',
        ),
        `$1"${version}"`,
      ),
    source,
  );
}

export function isPublished(exitCode: number, stdout: string, version: string): boolean {
  return exitCode === 0 && stdout.trim() === version;
}

/** ws, socket.io and create pin the exact platform version, so platform goes out first. */
const PUBLISH_ORDER = ['platform', 'ws', 'socket.io', 'create'];

/** Folder names of the public packages in publish order; throws on a package with no slot. */
export function publishOrder(dirs: string[]): string[] {
  const unknown = dirs.filter((dir) => !PUBLISH_ORDER.includes(dir));
  if (unknown.length > 0) {
    throw new Error(`no slot in PUBLISH_ORDER for ${unknown.join(', ')}; nothing was published`);
  }
  return PUBLISH_ORDER.filter((dir) => dirs.includes(dir));
}
