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

N03 and N04 are eligible according to dependency order. Neither has started.
