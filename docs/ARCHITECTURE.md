# Pocket Jam MVP architecture

## Runtime layers

- `src/audio-engine.js` owns the audio clock, look-ahead scheduler, voices and offline render. It never reads or writes DOM state.
- `src/project-store.js` owns the versioned local project schema and persistence.
- `src/app.js` owns navigation and UI state. It sends immutable pattern snapshots to the audio engine.
- `src/event-bus.js` is the boundary between musical events and Cloud Piska reactions.
- `src/video-remix.js` owns local frame/audio analysis and deterministic rule-based pattern generation.

## Timing model

The transport schedules Web Audio events 100 ms ahead while polling every 25 ms.
Animation follows musical events through the event bus, but animation timestamps never
control audio scheduling. Pattern edits replace the engine snapshot atomically and do
not restart the transport.

## Feature flags

`videoRemix` is enabled. `quickLoop` remains disabled and its entry point is visible
without presenting fake working functionality.

## Local-first storage

Projects use a versioned JSON schema in localStorage for this dependency-free slice.
The repository boundary in `project-store.js` is intentionally small so it can move to
IndexedDB/Dexie without changing transport or UI code.

## Performance fallback

Reduced-motion and low-power modes remove particles and spatial drift while retaining
clear pad light feedback. Audio behavior is unchanged.
