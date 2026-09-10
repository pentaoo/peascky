# Portable workspace

N02 adds TypeScript package boundaries beside the protected browser prototypes. It does not move or convert the legacy application and does not create native or companion applications.

## Structure and responsibilities

```text
packages/
  shared/                  JSON-safe values, stable IDs, validation results
  core/                    portable Pocket Jam domain foundation
  protocol/                JSON-safe protocol/schema boundary
  instrument-definitions/  definition data and program-reference types
```

- `@pocket-jam/shared` is the lowest layer and has no workspace dependencies.
- `@pocket-jam/core` may depend on shared. N02 exports only a branded `ProjectId` parser; the Project schema, music model, commands, and Transport remain N03 work.
- `@pocket-jam/protocol` may depend on shared and core. N02 defines only a JSON-safe protocol value boundary—no messages, sockets, client, session model, or clock.
- `@pocket-jam/instrument-definitions` may depend on shared and core. N02 defines only branded audio/visual/interaction program-reference types—no catalogue migration or executable programs.
- Protocol and instrument definitions do not depend on one another at this stage. No portable package may depend on an application or legacy browser module.

Each package has an explicit `src/index.ts` public entry point, its own manifest, TypeScript configuration, and focused test. Package exports point at TypeScript source during this skeleton phase; no build output or bundler is introduced.

## Automated boundaries

`npm run test:boundaries` inspects portable source imports, declared runtime package dependencies, TypeScript library configuration, relative imports that escape a package, and workspace dependency cycles. It rejects obvious browser/native/UI/audio/filesystem/database/socket dependencies and platform globals. Strict source TypeScript is configured without DOM or Node ambient types; separate test configs add Node test types only.

This deliberately small check is not a replacement for future runtime schema validation or a general-purpose lint stack. Add a heavier tool only when a concrete need appears.

## Commands

```bash
npm ci
npm run typecheck
npm run test:packages
npm run test:boundaries
npm test
npm run test:n02
npm run test:baseline
```

`npm test` runs portable package tests plus the boundary check. `npm run test:n02` adds TypeScript checking. The protected N01 browser baseline remains a separate command because it includes the longer real-browser smoke matrix. If the Playwright-managed browser is unavailable, use the documented N01 fallback, for example `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline`.

## Legacy status and next scope

`index.html`, `cloud-lab.html`, `sampler.html`, root CSS, `src/*.js`, the N01 fixtures, and the existing browser smoke scripts remain legacy migration evidence in their original locations. Existing storage keys and behavior are unchanged.

N03 Project/music/command contracts and N04 Expo application work have not started. There is no `apps/` directory, Project schema, Transport, persistence, network implementation, native runtime, audio port, renderer, UI migration, or Cloud catalogue conversion in N02.
