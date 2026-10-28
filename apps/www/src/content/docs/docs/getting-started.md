---
title: Getting started
description: Run NestJS on Bun in two minutes. Start a new project with @softtor/create-bunnest, or add the @softtor/bunnest-platform adapter to an existing Nest app with one line changed.
---

Requires **Bun 1.4 or newer** (`bun upgrade`) and **NestJS 12 or newer**.

## Start a new project

```bash
bunx @softtor/create-bunnest my-api --adapter bun
```

`bun create @softtor/bunnest my-api --adapter bun` does the same.

## Add it to an existing project

```bash
bun add @softtor/bunnest-platform
```

Then pass it to `NestFactory.create()`. This is the only code change:

```ts title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { BunAdapter, type NestBunApplication } from '@softtor/bunnest-platform';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestBunApplication>(AppModule, new BunAdapter());
await app.listen(3000);
```

See [Migrating from Express](../migrating-from-express/) for the handful of things worth checking in a larger app.

## Next steps

- [Configuration](../configuration/) for adapter and `Bun.serve()` options.
- [Testing without a port](../testing/) to drop supertest.
- [Compatibility](../compatibility/) for what works and what is planned.
