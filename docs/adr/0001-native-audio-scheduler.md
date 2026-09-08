# ADR 0001: Native Web Audio look-ahead scheduler

Status: accepted

## Context

The first version needs stable timing, live pattern edits and offline rendering without
making the product dependent on a framework or audio library.

## Decision

Use `AudioContext.currentTime` as the authoritative clock. A 25 ms timer schedules steps
100 ms ahead. UI animation and rendering are consumers of emitted musical events and
cannot advance the transport.

## Consequences

- Audio timing remains independent from rendering load.
- Patterns can change while playing.
- The same voice definitions can be reused by `OfflineAudioContext` for WAV export.
- AudioWorklet remains the next step if the number of tracks or DSP complexity grows.
