# Pocket Jam browser baseline (N01)

This document records observed behavior in the browser prototypes before the native migration. It is characterization evidence, not a target design. The semantic fixtures in `test/fixtures/` and the tests invoked by `npm run test:baseline` are the executable version of this record.

## Reproducing the baseline

Requirements:

- Node.js 20 or newer;
- npm;
- a Playwright-compatible Chromium browser.

From a clean checkout:

```bash
npm ci
npx playwright install chromium
npm run test:baseline
```

`npm run test:baseline` runs deterministic Node characterization tests, launches a temporary static HTTP server on an available loopback port, and then runs the main/sampler/Cloud browser checks plus both pre-existing Cloud smoke suites. Smoke screenshots go to `/tmp/pocket-jam-cloud-lab-audit` by default and are not repository artifacts.

The narrower commands are:

```bash
npm run test:characterization
npm run test:browser
npm run test:cloud
npm run test:audio
```

By default the locally installed Playwright-managed Chromium is used. Set `PLAYWRIGHT_EXECUTABLE_PATH` to an explicit browser executable or `PLAYWRIGHT_CHANNEL` to a Playwright browser channel such as `chrome` when a managed browser cannot be installed. `HEADLESS=false` shows the browser. `POCKET_JAM_URL` can still point either Cloud smoke directly at an already running Cloud Lab page; `POCKET_JAM_AUDIT_DIR` and `VIEWPORT` retain their previous smoke-script roles.

## Main Project v1

`createProject()` returns a mutable JSON-compatible object with these fields: `version`, generated `id`, `name`, `source`, `presetId`, `bpm`, `steps`, `swing`, generated ISO `updatedAt`, and `tracks`. The version is `1`; the default preset is `minimal`; the default is 112 BPM, 16 steps, swing `0.08`, and source `manual`.

The track order and identities are:

| ID | Name | Key | Color | Default volume | Default mute |
| --- | --- | --- | --- | --- | --- |
| `kick` | Kick | A | `#ff9c61` | 0.78 | false |
| `snare` | Snare | S | `#ff69b4` | 0.78 | false |
| `hat` | Hat | D | `#d8fbff` | 0.78 | false |
| `bass` | Bass | F | `#8c79ff` | 0.78 | false |

Each pattern is a separate 16-element number array. Zero is off; nonzero values are velocities. The exact default and all four preset patterns/BPM values are in `project-v1-default.json` and `project-v1-presets.json`. Applying a preset replaces BPM, `presetId`, `updatedAt`, and each track pattern. It preserves project identity/name/source/steps/swing and the existing track mixer fields.

Persistence keys are exact and unchanged:

- current: `pocket-jam.project.v1`;
- legacy: `piski.project.v1`.

`saveProject()` shallow-copies the project, refreshes `updatedAt`, JSON-serializes it under the current key, and returns the saved copy. `loadProject()` prefers the current key. When the current key is absent, valid legacy version-1 JSON is returned and copied verbatim to the current key. Missing, malformed, or non-v1 selected data returns `null`. A present but invalid current value prevents fallback to otherwise valid legacy data. The suite covers ordinary JSON round-trip behavior.

## Main sequencer and live pads

The main `AudioEngine` owns its browser `AudioContext`, master gain, one noise buffer, transport state, and a structured clone of the Project used as a scheduling snapshot.

- `play()` initiates audio unlock (without awaiting it), starts 40 ms after `AudioContext.currentTime`, calls the scheduler immediately, and installs a 25 ms `setInterval()` wake-up.
- Each scheduler wake generates steps while `nextStepTime < AudioContext.currentTime + 0.1`. The JS interval wakes the scheduler; Web Audio time places the sound.
- One step is a sixteenth note: `60 / bpm / 4` seconds.
- Odd steps add `project.swing * stepDuration` to their audio and visual event time. The unswung base clock is still advanced by one step duration.
- Tracks are iterated in project order. A voice is scheduled only when the track is not muted and its numeric pattern velocity is greater than zero. Scheduled velocity is pattern velocity multiplied by track volume.
- The step index wraps modulo `project.steps`.
- `hit` and `step` UI events are delivered with `setTimeout()` calculated from the scheduled audio time. A sequence hit contains `{ trackId, velocity, source: "sequence", step }`; a step contains `{ step, time }`.
- `pause()` stops the scheduler interval and emits `transport`, but does not cancel Web Audio already scheduled in the look-ahead window or already queued visual timeouts. `stop()` performs that pause, resets the generation step to zero, and immediately emits `{ step: 0, time: 0 }`.
- A late scheduler wake advances the `while` loop through every overdue step. Past audio times and UI delays therefore become immediate and can form a catch-up burst. This is captured as current behavior, not corrected here.

The live pad path is separate from sequenced scheduling. Pointer down or non-repeating A/S/D/F keydown calls `trigger(trackId, 1)`. The engine connects the same procedural voice types at the current audio time and immediately emits `{ trackId, velocity, source: "live", step }`. Live triggers remain available while the sequencer is running. Current live triggers do not consult track mute or volume.

## Offline WAV intent

`renderWav(project, bars = 2)` creates a stereo 44.1 kHz `OfflineAudioContext`. Duration is `bars * 4 * 60 / bpm`; scheduling iterates `project.steps * bars`, indexes the pattern modulo `project.steps`, uses the same sixteenth-note and odd-step swing rules, respects mute/volume, and calls the same internal procedural voice builder used in realtime. It renders, encodes 16-bit interleaved PCM with a RIFF/WAVE header, and returns `Blob` type `audio/wav`.

This assumes one `project.steps` pattern repetition per requested bar while independently assuming four beats per bar for output duration. The normal 16-step Project v1 makes those assumptions agree. Tails beyond the calculated offline duration are clipped. The fixture-driven fake offline context proves the expansion, voice reuse, result type, length, and WAV header without snapshotting generated audio.

## Cloud instrument catalogue and layout

The known definition IDs are `cloud-kick`, `cloud-snare`, `cloud-hat`, `cloud-bass`, `cloud-keys`, `cloud-reverb`, `orbit-synth`, and `cyber-bass`. Worlds present are `cloud`, `orbit`, and `cyber`; the starter layout mixes Cloud and Orbit, so world is classification rather than a compatibility boundary. Exact category, footprint, interaction modes, sound program metadata, polyphony declarations, output gain, routing/sample metadata, and parameter defaults are in `cloud-definition-summary.json`.

The catalogue and nested descriptors are deeply frozen. Lookup returns the immutable catalogue object. Parameter-default extraction returns new data; clamping observes min/max and step. Renderer resolution returns cloned procedural or GLB descriptors.

`cloud-layout-default.json` records the six starter slot IDs, definition IDs, 4x4 logical coordinates, footprints, yaw, and elevation. `createInitialCloudLabLayout()` returns a mutable deep clone. `replaceInstrumentInLayout()` returns a new layout and new slot objects and only permits a known instrument with the same `layoutSize` as the target slot.

Cloud persistence uses exactly `pocket-jam:cloud-lab:v1`. Loading starts from the six-slot default and accepts saved slots when every required slot ID exists and its selected definition matches the default slot footprint; malformed/missing/mismatched saved data resets to the default. Replacement saves immediately, and reset saves the starter layout. The current DOM/CSS visual anchors come from `SLOT_PRESENTATION` in `src/cloud-lab-renderer.js`, not from the layout's logical column/row values.

Several catalogue fields are descriptive or aspirational in this prototype. The UI directly consumes identity, world/category, layout size, interaction, voice/output gain, renderer/material/animation metadata, and some parameter ideas. Per-definition `polyphony`, choke declarations, and much of the detailed audio-target/renderer metadata are not comprehensively enforced by `cloud-lab.js` or `CloudLabAudio`; the audio runtime enforces a global cap instead.

## Cloud interaction and audio behavior

Cloud Lab keeps a `Map` keyed by pointer ID. A hit object triggers a one-shot on pointer down. Non-hit slider/note/XY objects update continuously; sustained voice IDs are `${instrument.id}:${pointerId}`, so simultaneous pointers remain independent. Moving beyond 9 px cancels the 620 ms long-press edit gesture. Pointer up ends only its voice; pointer cancel ends it with a short release. Visibility loss stops the demo, stops every continuous voice, and clears pointer state.

Cloud Hat additionally fires an open-hat one-shot after a stationary 310 ms hold. Notes select from definition-specific note banks by x and shape brightness by y. Slider interaction maps y to MIDI/cutoff and x to velocity/pressure/drive. XY changes the shared effect graph and produces a quiet synth pulse on initial contact. The 260 ms Drift Loop is a JS-timer demo clock, not an audio look-ahead transport; objects remain live while it runs.

Focused objects support Enter/Space and arrow controls, and number keys 1–6 directly trigger field objects. Enter/Space use the one-shot path even for normally continuous objects; arrows adjust continuous surfaces. Haptics (`navigator.vibrate`), visual class/gesture changes, glow, meter energy, and audio are direct fan-out side effects in `cloud-lab.js`; there is no normalized interaction event layer yet.

`CloudLabAudio` lazily owns one context/graph unless a context and/or destination are injected. `prepare()` can build the graph silently; `unlock()` deduplicates an in-flight resume, primes older iOS with a one-frame silent source, and prepares shared reverb after the gesture-time path. Default global voice cap is 32 with a minimum of 8; the Cloud UI configures 28. Voice stealing prefers releasing voices, then active one-shots, then active sustained voices. One cached random noise buffer is reused; one deterministic stereo impulse is attached to the shared convolver.

One-shots and sustained voices accept explicit `when` or relative `delay` values clamped no earlier than current audio time; otherwise one-shots receive 3 ms start padding. Sustained bass/synth/orbit voices use stable caller IDs, update an existing matching voice, support targeted/all stop, remove their continuous registry entry on release, and clean nodes after sources end. `dispose()` stops and disconnects all voices/nodes and closes only a context it owns; an injected context survives disposal.

The browser audio smoke measures pointer-to-`source.start()` JavaScript call time. It is not acoustic output latency and is not a mobile-device latency claim.

## Sampler reference prototype

The sampler has eight pad identities recorded in `sampler-pads.json`; number keys 1–8 trigger them. Pointer down triggers a procedural placeholder: oscillator synthesis for kick/bass/tom/perc/chord and a shared generated-noise buffer for snare/hat/clap. These are not recorded samples.

One-shot mode fires once. Loop mode starts one global 420 ms `setInterval()` for the held pad; starting a pad clears the previous global interval, and pointer up/cancel clears it. Callback time is note time, so it is reference-only and can drift or stall. There is no per-pad or multi-loop state.

The volume fader controls master gain and the tone fader controls a low-pass filter. Pointer XY maps x to filter frequency and upward y to delay send. Arrow keys update only the XY cursor's x/ARIA value in the current prototype; they do not update audio parameters. Capture is only a `performance.now()` duration display driven by a 100 ms interval. It creates no microphone permission, `MediaRecorder`, audio buffer, or file.

## Legacy Video Remix

`index.html` imports `src/app.js`, which imports `analyzeVideo()` from `src/video-remix.js`. Video Remix imports `createProject()` from `src/project-store.js`; deterministic analysis extends Project v1 with `source: "video"`, `presetId: "video"`, a seed, remapped four-track patterns, and `videoAnalysis`. Moving or removing these modules would break the legacy browser entry point. Video Remix remains outside the Winter target and has not been migrated or expanded by N01.

## Scope and known observations

The baseline protects behavior and contracts, not pixel-perfect rendering or acoustic output. It intentionally records queued visual callbacks after pause, late-wake catch-up, the sampler's global JS loop and fake capture, declarative Cloud fields that are only partially consumed, and browser call-time latency limitations. N01 does not correct those behaviors.

No React, React Native, Expo, TypeScript conversion, bundler, runtime dependency, Project v2, audio port, UI redesign, sampler recording, Video Remix migration, or entry-point move is part of this baseline.
