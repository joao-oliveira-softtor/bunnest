# Contributing

Thanks for helping out. Bug reports, compatibility findings, docs fixes and pull requests are all welcome.

## Reporting a bug or an incompatibility

[Open an issue](https://github.com/joao-oliveira-softtor/bunnest/issues) with:

- your Bun, NestJS and `@softtor/bunnest-platform` versions
- the smallest controller or module that reproduces it
- what you expected, and what happened instead (if it behaves differently on `@nestjs/platform-express`, say so: matching Express is the goal)

Check the [compatibility table](https://joao-oliveira-softtor.github.io/bunnest/docs/compatibility/) and the [roadmap](https://joao-oliveira-softtor.github.io/bunnest/docs/roadmap/) first; some gaps are known and planned.

## Setup

Requires Bun ≥ 1.4 (`bun upgrade`).

```bash
git clone https://github.com/<you>/bunnest.git
cd bunnest
bun install         # also installs the git hooks
bun run build       # first: the example type-checks against the adapter's emitted declarations
```

## Where things live

```
packages/platform   the adapter (src/) and its integration tests (test/)
packages/ws         @softtor/bunnest-ws: WebSocket gateways on the HTTP port
packages/socket.io  @softtor/bunnest-socket.io: Socket.IO gateways on the HTTP port
packages/create     the generator; templates/base is the starter it copies
examples/basic      minimal app: REST + Zod validation + SSE
bench/              same app on express / fastify / bun adapters
apps/www            landing page + docs (Astro + Starlight); pages are in src/content/docs/docs/
```

## Making a change

1. Branch off `main`.
2. Make the change, with a test:
   - Adapter behavior gets an integration test in `packages/platform/test` that boots a real Nest app on `BunAdapter` and asserts what a client would observe. `swagger.test.ts` is a good one to copy.
   - Generator changes get a test in `packages/create/test`.
3. Update the docs in `apps/www/src/content/docs/docs/` if users will notice the change. A new ✅ row in the compatibility table goes in both `compatibility.md` and `packages/platform/README.md`, and needs a test behind it.
4. Run the checks CI runs:

   ```bash
   bun run build
   bun run lint
   bun run format:check   # bun run format fixes it
   bun run typecheck
   bun run test
   ```

Useful while working:

```bash
bun test packages/platform/test/routing.test.ts   # one test file
cd examples/basic && bun dev                      # http://localhost:3000/cats
bun run --filter '@softtor/bunnest-www' dev               # docs site
```

## Dependencies

- Keep `@softtor/bunnest-platform`'s runtime dependencies minimal; talk to us in an issue before adding one.
- Pin dev dependencies to exact versions (`bun add -d -E <pkg>`) and commit `bun.lock`. CI installs with `--frozen-lockfile`.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org), checked by a git hook:

```
type(scope): summary
```

- **type**: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `revert`, `style`
- **scope** (optional): `platform`, `create`, `ws`, `socket.io`, `www`, `bench`

```
fix(platform): honor bodyLimit on urlencoded bodies
test(platform): cover @nestjs/throttler
docs: explain trustProxy
```

A second hook lints and formats the files you staged.

## Pull requests

- Keep a pull request to one change, and give it a Conventional Commits title: it becomes the commit on `main` when we squash-merge.
- Say what the change does and how you tested it.
- On your first pull request, CI does not start until a maintainer approves the run, so the checks may be missing for a while. That is expected.
- A failure only on Bun `canary` is usually upstream and will not block your change.

By contributing you agree that your work is licensed under the [MIT License](./LICENSE).

## Releasing (maintainers)

`main` is protected, so a release goes through a pull request and the tag sits on the squash commit:

```bash
git checkout main && git pull
git checkout -b chore/release-X.Y.Z
RELEASE_BRANCH=chore/release-X.Y.Z bun run release <patch|minor|major|X.Y.Z>   # --dry-run previews
# answer "N" to the push prompt, then:
git tag -d vX.Y.Z
git push origin chore/release-X.Y.Z          # PR "chore(release): vX.Y.Z", squash-merge
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z     # publishes to npm
```

The script bumps every public package (`@softtor/bunnest-platform`, `@softtor/bunnest-ws`, `@softtor/bunnest-socket.io` and `@softtor/create-bunnest`) to the same version, points the generator's `PLATFORM_VERSION` at it, runs the build and tests, commits and tags. The pushed tag triggers `release.yml`, which refuses a tag that does not match `packages/platform/package.json` or is not on `main`, then publishes what is not on npm yet (it needs the `NPM_TOKEN` secret of the `@softtor` scope) and creates the GitHub release.
