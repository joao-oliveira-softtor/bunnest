# bunnest

[![CI](https://github.com/joao-oliveira-softtor/bunnest/actions/workflows/ci.yml/badge.svg)](https://github.com/joao-oliveira-softtor/bunnest/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@softtor/bunnest-platform)](https://www.npmjs.com/package/@softtor/bunnest-platform)
[![license](https://img.shields.io/npm/l/@softtor/bunnest-platform)](./LICENSE)

Run [NestJS](https://nestjs.com) natively on the [Bun](https://bun.com) runtime: an HTTP adapter built on `Bun.serve()`, with no Express and no `node:http` underneath, plus a project generator.

**[Documentation](https://joao-oliveira-softtor.github.io/bunnest/docs/getting-started/)** · [Compatibility](https://joao-oliveira-softtor.github.io/bunnest/docs/compatibility/) · [Benchmarks](https://joao-oliveira-softtor.github.io/bunnest/docs/benchmarks/) · [Roadmap](https://joao-oliveira-softtor.github.io/bunnest/docs/roadmap/)

## Quick start

Requires **Bun ≥ 1.4** (`bun upgrade`) and **NestJS ≥ 12**.

### New project

```bash
bunx @softtor/create-bunnest my-api --adapter bun
cd my-api
bun dev
```

This generates a NestJS 12 project with Zod validation, `bun test`, and no build step. Leave out `--adapter bun` to start on Express instead. All flags are in the [`@softtor/create-bunnest` README](./packages/create).

### Existing NestJS project

```bash
bun add @softtor/bunnest-platform
```

Pass the adapter to `NestFactory.create()`. This is the only code change:

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { BunAdapter, type NestBunApplication } from '@softtor/bunnest-platform';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestBunApplication>(AppModule, new BunAdapter());
await app.listen(3000);
```

```bash
bun src/main.ts
```

Controllers, pipes, guards, interceptors, filters, middleware, SSE, static assets and `@nestjs/swagger` work unchanged. For a larger app, read [Migrating from Express](https://joao-oliveira-softtor.github.io/bunnest/docs/migrating-from-express/) and [Differences from Express](https://joao-oliveira-softtor.github.io/bunnest/docs/differences-from-express/).

### Configure and test

```ts
new BunAdapter({
  trustProxy: true, // honor X-Forwarded-For / -Proto / -Host
  bodyLimit: '1mb', // default 100kb, same as Express
  serve: { idleTimeout: 120 }, // forwarded to Bun.serve()
});
```

Tests can run requests through the full Nest pipeline in-process, with no port and no supertest:

```ts
const adapter = new BunAdapter();
const app = moduleRef.createNestApplication(adapter);
await app.init();

const res = await adapter.fetch(new Request('http://localhost/users/1'));
expect(res.status).toBe(200);
```

More in [Configuration](https://joao-oliveira-softtor.github.io/bunnest/docs/configuration/) and [Testing](https://joao-oliveira-softtor.github.io/bunnest/docs/testing/).

## Packages

| Package | What | Status |
|---|---|---|
| [`@softtor/bunnest-platform`](./packages/platform) | HTTP adapter running Nest on `Bun.serve()` | ready |
| [`@softtor/create-bunnest`](./packages/create) | `nest new`, but on Bun: `bunx @softtor/create-bunnest my-api` | ready |
| [`@softtor/bunnest-ws`](./packages/ws) | WebSocket gateways on `Bun.serve({ websocket })`, on the HTTP port | ready |
| [`@softtor/bunnest-socket.io`](./packages/socket.io) | Socket.IO gateways on `Bun.serve()` through `@socket.io/bun-engine`, on the HTTP port | ready |

## Repo layout

```
packages/platform   the adapter and its integration tests against real Nest apps
packages/ws         WebSocket gateways (@softtor/bunnest-ws)
packages/socket.io  Socket.IO gateways (@softtor/bunnest-socket.io)
packages/create     the generator (@softtor/create-bunnest); templates/base is the starter it copies
examples/basic      minimal app: REST + Zod validation + SSE
bench/              same app on express / fastify / bun adapters, one runtime
apps/www            landing page + docs (Astro + Starlight)
```

## Contributing

Pull requests and bug reports are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md), or [open an issue](https://github.com/joao-oliveira-softtor/bunnest/issues).

## License

[MIT](./LICENSE). bunnest started as a copy of [nestbun](https://github.com/mguay22/nestbun) by Michael Guay.
