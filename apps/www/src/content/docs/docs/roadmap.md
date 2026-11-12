---
title: Roadmap
description: What is planned for bunnest after the HTTP adapter.
---

## Next

- **Multipart uploads**: `@UploadedFile()` / `@UploadedFiles()` backed by `Request.formData()`, with size and count limits. Reference behavior: Express with multer, and `@nestjs/platform-node`, which ships multer too.
- **Measure against `@nestjs/platform-node`**: NestJS 12.3's `node:http` adapter also runs on Bun, and the benchmark script includes it (`ADAPTERS=node`). Measure it against this adapter on bare metal, then profile routing (it uses `find-my-way`) and body reading, and bring over what fits before claiming a lead.

## Later

- Make `--adapter bun` the default in `@softtor/create-bunnest` once multipart lands.
- Backpressure on the streaming path (respect `ReadableStream` `desiredSize`).
- `@nestjs/serve-static` and `@nestjs/graphql` compatibility passes.
- HTTP/2 when `Bun.serve` exposes it.

## Not planned

- Running on Node. The adapter is Bun-native on purpose; on Node, use `@nestjs/platform-node` (NestJS 12.3+).
- Full Express middleware emulation. Anything beyond the documented compatible subset is out of scope.

Track progress and vote on items in [GitHub issues](https://github.com/joao-oliveira-softtor/bunnest/issues).
