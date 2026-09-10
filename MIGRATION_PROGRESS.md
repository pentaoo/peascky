# Pocket Jam migration progress

## N01

Status: PASS

The browser migration baseline is committed in `60834c2` and passes through `npm run test:baseline` with the documented browser configuration.

## N02

Status: PASS

### Summary

The repository now has npm workspace boundaries for shared primitives, the core domain foundation, protocol values, and instrument-definition program references. Strict TypeScript source checks omit platform ambient types, package tests exercise the minimal exports, and an automated boundary audit enforces the allowed dependency direction and rejects obvious platform imports, globals, escape paths, and cycles.

### Important files

- `package.json`, `package-lock.json`, `tsconfig.base.json`, and `tsconfig.json` establish reproducible workspace tooling.
- `packages/shared`, `packages/core`, `packages/protocol`, and `packages/instrument-definitions` contain the portable skeletons.
- `scripts/check-portable-boundaries.cjs` enforces source and dependency boundaries.
- `docs/WORKSPACE.md` documents responsibilities and commands.
- `.github/workflows/baseline.yml` validates N02 before the protected browser baseline.

### Commands and results

- `npm ci` — PASS.
- `npm run test:n02` — PASS: all four packages typecheck, five package tests pass, and the four-package boundary audit passes.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline` — PASS: the N01 deterministic and browser smoke suites remain green.

Running `npm run test:baseline` without browser configuration found no Playwright-managed Chromium on this machine. This was an environment-only browser discovery failure; the existing documented Chrome-channel fallback passed without baseline changes.

### Known limitations

- Package exports point to TypeScript source; N02 intentionally adds no emit/build/bundling pipeline.
- The boundary audit is a small static import/global/dependency check, not a general lint framework or runtime schema validator.
- Only foundational IDs, JSON-safe values, validation results, and program-reference types exist. There is no Project schema, command model, Transport, protocol message catalogue, or instrument catalogue migration.

### Next task

N03 and N04 are eligible according to dependency order.

## N03

Status: PASS

### Starting checkpoint

- `git status --short` was clean before N03 editing.
- N02 is committed in `cc00689` (`Add portable workspace validation to baseline CI`).
- `npm run test:n02` — PASS in checkpoint verification and again after the first implementation pass.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline` — PASS in checkpoint verification and again after the first implementation pass: 22 deterministic tests plus browser, six-viewport Cloud, and audio smoke checks reported no failures.

### Model and command decisions

- Project schema version 1 contains durable transport configuration, a minimum 4x5 logical Scene, independent InstrumentInstances, flexible Patterns, Pattern/audio MusicalLoops, Mixer intent, and stable Asset references.
- Semantic branded IDs remain distinct for projects, definitions, instances, patterns, events, loops, channels, buses, assets, parameters, commands, and actors.
- Runtime validation rejects unknown fields, non-JSON/runtime objects, invalid IDs/ranges, duplicate identities, overlapping or out-of-bounds placements, and broken cross-references.
- Pattern resolution means ticks per quarter note. Pattern and loop lengths are independent; 16 steps is not a schema invariant.
- Commands are pure JSON envelopes. They never generate IDs, timestamps, or random values; an accepted transition validates the complete candidate and increments revision once.
- Instrument removal is intentionally rejected while Pattern lanes or audio loops still depend on the instance/channel, avoiding implicit destructive cascades.
- The main four-track and Cloud layout fixtures are deterministic characterization mappings only, not persistence migration.

### Files changed

- `packages/core/src/ids.ts`, `project.ts`, `project-validation.ts`, `project-command.ts`, and `legacy-fixtures.ts` implement the domain contracts.
- `packages/core/src/index.ts` exposes the public core API; the N02-only `project-id.ts` is replaced by the semantic ID module.
- `packages/core/test/*.test.ts` cover serialization, placement, content, references, commands, JSON safety, and legacy fixture mapping.
- `docs/WORKSPACE.md` documents the portable semantics and limits.

### Commands and results

- `npm run test:n02` — PASS: every workspace typecheck passed, 28 portable tests passed (24 core plus 4 existing package tests), and all four package boundaries passed.
- `npm run test -w @pocket-jam/core` — PASS: 24 deterministic domain, validation, command, and fixture tests.
- `npm run typecheck` — PASS for all four portable packages and their tests.
- `npm run test:boundaries` — PASS for all four portable packages.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline` — PASS in every completed review iteration: 22 deterministic legacy tests plus browser, six-viewport Cloud, and audio smoke checks reported no failures.
- `git diff --check` and repository scope searches — PASS.
- `npm audit` — PASS with zero vulnerabilities; `npm ls --all` exited successfully with only expected unavailable-platform esbuild optional packages.

### Self-review

1. The initial implementation passed all gates. Diff review tightened canonical ISO-date validation, replaced locale-sensitive event sorting with code-unit ordering, and replaced inherited-property record checks with own-property checks.
2. Added explicit duplicate-ID and non-JSON parameter tests. A test that attempted to mutate a public readonly contract was corrected to assert separate instance data; independent mutation behavior remains tested through a pure command transition.
3. Removed an unused fixture API type and ran the complete final matrix successfully. Scope audits found no platform imports, nondeterministic generators, portable paths/blobs, generated build artifacts, `apps/` directory, or legacy product changes.

### Known limitations

- N03 defines data and pure transitions only. It does not schedule playback, persist data, resolve assets, execute audio/visual programs, or define network ordering.
- Only schema version 1 is accepted; future migrations belong with the persistence/import boundaries that need them.
- Definition catalogue validation remains N07 scope. InstrumentInstances carry stable definition references and overrides only.

### Architecture v2 compatibility audit

Status: PASS — no N03 code amendment required.

N03 already has no fixed Project duration, keeps Pattern and MusicalLoop lengths explicit and independent, permits all validated rectangular footprints including 1x1, 2x1, 3x1, and 2x2, validates a fully occupied 20-cell field, preserves independent InstrumentInstances, models per-instance mixer channels plus master intent, and imposes no one-note global polyphony rule. These contracts support indefinite incremental Zen playback and leave a clean future seam for finite Phrase references and a lightweight Track whose duration is derived from arranged content. N17, not N03, owns that future product model once its UX is known.

### Architecture v2 decisions recorded

- Zen Mode is indefinite; finite phrases/loops repeat without a fixed Project duration or unbounded event history.
- A future finite Track derives its duration from arranged finite Phrase content.
- Export v1 produces one stereo master; stems remain a future capability behind the existing channel/bus/master routing seam.
- User microphone/imported samples remain local-only in multiplayer v1 with explicit missing/local-only peer state.
- Background audio is off for v1; background cancels/releases/invalidates/pauses and foreground remains paused without catch-up.
- Pixel 5 is the Android performance floor; stable 60 FPS is required and 90 FPS is optional.
- Speaker/wired output are realtime latency acceptance routes; Bluetooth is reported separately as high latency.
- InteractionRuntime owns at least ten independent active contacts and separate lightweight interaction geometry outside React/render-mesh picking.
- One AudioRuntime owns the device output graph; Filament is the preferred but replaceable VisualRuntime candidate and Unity is not selected.

### Next task

N04 is eligible under Architecture v2.

## N04

Status: CODE PASS / DEVICE VALIDATION REQUIRED

### Summary

- `apps/mobile` is an Expo SDK 57, Expo Router, React Native, and TypeScript development-build application workspace.
- One application composition root owns the validated read-only N03 Project fixture, placeholder InteractionRuntime, replaceable VisualRuntime port, and the single LifecycleCoordinator. Routes own none of these long-lived objects.
- The temporary safe-area-aware Jam shell uses a responsive 7:3 visual-slot/control split. It is engineering UI only and does not encode layout in portable Core.
- AppState transition intent is centralized: inactive/background disables and cancels interaction plus suspends visuals while reserving pause/release/flush work; foreground restores available runtimes but reports `restored-paused-awaiting-user` rather than catch-up or auto-play.
- Development, preview, and production variants have separate names, schemes, and stable repository-placeholder identifiers. No backend URL, credential, microphone/camera permission, background-audio mode, or analytics service is configured.
- Native `ios/` and `android/` projects are generated through Expo prebuild and remain ignored artifacts.

### Runtime boundaries

- React Native owns routes, safe area, temporary controls, diagnostics, and composition.
- Portable Core remains the only Project schema and supplies `createLegacyCloudProjectFixture()` plus `validateProject()`.
- InteractionRuntime and VisualRuntime are distinct mobile ports. The former reserves latency-critical ownership; the latter exposes attach, scene snapshot, presentation, suspend/resume, diagnostics, and dispose without a renderer-specific type.
- AudioRuntime, Transport, persistence, and SessionRuntime are diagnostic `not-installed` labels only; N04 defines no fake production interface or implementation for them.

### Commands and results

- `npm ci` — PASS from the updated lockfile (590 packages audited).
- `npm run test:n04` — PASS: 28 portable tests, four-package typechecks and boundary audit, 2 mobile lifecycle/visual tests, mobile TypeScript, and Expo public-config validation.
- `APP_VARIANT=preview npm run config:check --workspace @pocket-jam/mobile` — PASS.
- `APP_VARIANT=production npm run config:check --workspace @pocket-jam/mobile` — PASS.
- `npx expo install --check` — PASS: dependencies are current for Expo SDK 57.
- `npx expo-doctor@latest` — dependency/project checks PASS. It reported 21/21 before generated native directories existed; after prebuild it reports 20/21 because CocoaPods 1.15.2+ is not installed in this host environment.
- `npx expo export --platform android` and `npx expo export --platform ios` to temporary output directories — PASS; both Metro bundles consume the portable N03 fixture.
- `APP_VARIANT=development npx expo prebuild --no-install --clean` — PASS; generated bundle/application IDs are `com.pocketjam.mobile.dev`, with no microphone, camera, or background-audio capability found.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:baseline` — PASS: 22 deterministic legacy tests plus browser, six-viewport Cloud, and audio smoke checks reported no failures.
- `npm audit` reports 13 moderate advisories in the current Expo/Expo Router toolchain dependency graph. npm offers only forced breaking downgrades (`expo@46` / `expo-router@5`), so N04 does not override the SDK's tested graph; no high or critical advisory is reported.

### Self-review

1. Initial type/config checks passed, but Expo Doctor found npm-workspace peer duplication. The official SDK 57 template's React/navigation peer versions are now pinned at the workspace root and mobile manifest; the dependency/project checks then passed without duplicates.
2. The first Metro export exposed that portable NodeNext `.js` specifiers do not automatically resolve the packages' checked-in `.ts` source. A scoped mobile Metro resolver now retries only those relative specifiers originating under `packages/`; Android and iOS exports pass without changing N03.
3. Native prebuild exposed an optional `userInterfaceStyle` dependency warning, so the unnecessary setting was removed. The clean prebuild is warning-free, the temporary shell's rigid minimum heights were removed for smaller aspect ratios, and final scope/diff checks found no generated native artifacts staged.

### Physical-device status

No physical validation was possible in this environment: `adb` and a Java runtime are absent, and the active macOS developer directory contains Command Line Tools rather than full Xcode (`xctrace` is unavailable). Android/iPhone install, launch, background/foreground, and responsive-shell evidence therefore remains required. Exact Pixel 5 and physical-iPhone commands are documented in `apps/mobile/README.md`.

## N05

Status: NOT STARTED

N05 remains the next technical gate. It must validate a single low-latency native AudioRuntime and stereo offline feasibility on physical hardware before broad audio implementation.
