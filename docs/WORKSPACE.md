# Pocket Jam workspace

N02 adds TypeScript package boundaries beside the protected browser prototypes. N03 extends the portable core with the Winter Project domain contract. N04 adds the first native application shell without moving or converting the legacy applications.

## Structure and responsibilities

```text
apps/
  mobile/                  Expo Router native development-build shell
packages/
  shared/                  JSON-safe values, stable IDs, validation results
  core/                    portable Pocket Jam domain foundation
  protocol/                JSON-safe protocol/schema boundary
  instrument-definitions/  definition data and program-reference types
```

- `@pocket-jam/mobile` is a React Native/Expo application workspace. Its one composition root owns the placeholder InteractionRuntime, replaceable VisualRuntime port, and centralized LifecycleCoordinator. Route modules consume snapshots/intents and do not own long-lived runtimes.

- `@pocket-jam/shared` is the lowest layer and has no workspace dependencies.
- `@pocket-jam/core` depends only on shared. N03 owns semantic IDs, the versioned Project schema, runtime validation, musical content, durable mixer/transport intent, deterministic commands, and legacy mapping fixtures. It contains no scheduler or runtime service.
- `@pocket-jam/protocol` may depend on shared and core. N02 defines only a JSON-safe protocol value boundary—no messages, sockets, client, session model, or clock.
- `@pocket-jam/instrument-definitions` may depend on shared and core. N02 defines only branded audio/visual/interaction program-reference types—no catalogue migration or executable programs.
- Protocol and instrument definitions do not depend on one another at this stage. No portable package may depend on an application or legacy browser module.

Each portable package has an explicit `src/index.ts` public entry point, its own manifest, TypeScript configuration, and focused test. Package exports point at TypeScript source during this skeleton phase. The mobile Metro adapter resolves the packages' NodeNext `.js` specifiers to their checked-in TypeScript source without changing the portable contracts.

## Core domain semantics

- `schemaVersion` identifies the Project JSON contract; N03 supports version 1 only. Unknown fields and unsupported versions are rejected at the boundary.
- Scene dimensions are explicit and must be at least 4 columns by 5 rows. Logical cells and integer footprints are authoritative; optional offset, elevation, yaw, and scale values are art direction rather than renderer coordinates.
- Each InstrumentInstance has its own semantic ID and mixer channel, even when multiple instances share an InstrumentDefinition ID.
- Pattern `resolution` is ticks per quarter note. `lengthTicks` and event ticks are explicit, so a 16-step grid is one projection rather than a schema rule.
- MusicalLoop can reference Pattern content or an audio Asset ID. Each loop owns its length, start, optional source offset, enabled state, and repeat intent.
- Parameters contain JSON primitives. Assets are referenced by stable ID and kind; paths, bytes, decoded buffers, and runtime handles are not Project data.
- Durable commands validate their envelope and the complete candidate Project. Accepted commands return a new Project and increment `revision` exactly once. An optional `issuedAt` becomes `updatedAt`; when absent, the existing timestamp is retained so command execution never generates time.
- `instrument.remove` rejects an instance still targeted by Pattern lanes or audio loops. Callers must remove dependent musical content explicitly rather than relying on hidden cascading edits.

`createLegacyMainProjectFixture()` and `createLegacyCloudProjectFixture()` are deterministic characterization mappings. They do not read or modify legacy localStorage and are not automatic production migrations. The Cloud mapping preserves logical placement and art-directed yaw/elevation without copying `SLOT_PRESENTATION` renderer anchors.

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
npm run test:n04
npm run test -w @pocket-jam/core
npm run test -w @pocket-jam/mobile
npm run test:baseline
```

Use Node.js 22.13 or newer for the SDK 57 workspace. `npm test` runs portable package tests plus the boundary check. `npm run test:n02` adds portable TypeScript checking while intentionally excluding application workspaces. `npm run test:n04` adds mobile type, unit, and Expo public-config checks. The protected N01 browser baseline remains a separate command because it includes the longer real-browser smoke matrix. If the Playwright-managed browser is unavailable, use the documented N01 fallback, for example `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline`.

The root manifest repeats the official Expo SDK 57 React/navigation peer versions and pins them with npm overrides. This prevents npm workspace hoisting from installing duplicate native-module versions; the mobile manifest remains the application dependency declaration.

Exact local/EAS native development-build and physical-device commands are in [`apps/mobile/README.md`](../apps/mobile/README.md). Expo Go is not the native-runtime acceptance environment.

## Legacy status and next scope

`index.html`, `cloud-lab.html`, `sampler.html`, root CSS, `src/*.js`, the N01 fixtures, and the existing browser smoke scripts remain legacy migration evidence in their original locations. Existing storage keys and behavior are unchanged.

N03 defines Project/music/command data semantics only. N04 provides an engineering shell, a validated read-only Project fixture integration, lifecycle intent, and empty runtime ownership seams. There is still no authoritative Transport, production persistence, network implementation, AudioRuntime, production renderer, sampling, final UI migration, or Cloud catalogue conversion.
