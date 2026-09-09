# Pocket Jam Cloud Lab — current MVP context

Last updated: 2026-09-09

## Status

Cloud Lab is a runnable, isolated mobile-first vertical slice at
[`/cloud-lab.html`](../cloud-lab.html). It does not replace or modify the
existing Pocket Jam home, sampler, sequencer, video remix, or saved projects.

The prototype tests the product formula:

> Collect weird instruments → place them into a personal field → touch them →
> make music → discover more.

It intentionally stays dependency-free: HTML, CSS, ES modules, Pointer Events,
Device Orientation, localStorage, and native Web Audio.

## What the MVP contains

- One shared studio-lit spatial field. Bento is the placement constraint, not a
  visible set of cards; objects share the ground, lighting, and contact shadows.
- Six starter objects with mixed footprints and silhouettes:
  Cloud Kick (`1×1` HIT), Cloud Snare (`1×1` HIT), Cloud Hat (`1×1` HIT/HOLD),
  Cloud Bass (`1×2` SLIDER), Orbit Synth (`2×1` NOTES), and Cloud Reverb
  (`2×2` XY).
- Eight objects in the library. Cloud Keys and Cyber Bass are replacement
  choices; Cyber Bass proves that objects from different worlds can coexist.
- Immediate object-specific motion: membrane compression, cloud squash,
  cymbal clap, fader travel, key depression, antenna recoil, and deformable XY
  feedback.
- Object-first editing. Tap the arrange control or long-press an instrument,
  then choose a footprint-compatible physical object. Replacement is saved to
  localStorage and arrives with a landing/inflation transition. The drawer also
  restores the full starter set in one action.
- A small Drift Loop for instant demonstration; the field stays playable over it.
- Subtle gyroscope parallax with the required iOS permission path. Pointer and
  touch parallax are the fallback. Only visual children move; hit-area geometry
  stays fixed.
- Keyboard fallback: Tab reaches every object, Enter/Space plays it, arrow keys
  adjust continuous surfaces, number keys `1`–`6` trigger field objects, and
  `E` toggles arrange mode.
- Optional short vibration feedback where the browser supports it.
- Portrait layouts verified at 320×568, 375×812, 390×844, and 430×932;
  dedicated landscape presentation verified at 844×390 and 932×430.
- Reduced-motion mode removes ambient/continuous motion while preserving usable
  direct feedback.

## Runtime architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Product data | `src/cloud-lab-instruments.js` | Instrument definitions, worlds, Bento footprints, materials, sound descriptors, animation profiles, initial layout, compatible replacement helpers, procedural/GLB resolver |
| Rendering | `src/cloud-lab-renderer.js` | Procedural model markup, GLB adapter hook/fallback, art-directed spatial anchors, accessible instrument nodes, picker previews, gesture deformation |
| Interaction/state | `src/cloud-lab.js` | Pointer and keyboard gestures, multitouch state, edit mode, object picker, local persistence, loop, haptics, meter, gyro/pointer parallax |
| Audio | `src/cloud-lab-audio.js` | Lazy Web Audio graph, safe idle prewarm, polyphonic voices, sustained voices, voice stealing, shared tone/delay/reverb, lifecycle cleanup |
| Presentation | `cloud-lab.css` | Shared field, material rendering, contact shadows, responsive composition, physical motion, drawer, safe areas, reduced-motion fallback |

The important dependency direction is:

```text
InstrumentDefinition
  ├── layout runtime
  ├── interaction runtime
  ├── audio runtime
  └── renderer descriptor → procedural now / GLB later
```

Music and interaction state do not live inside model markup. Replacing a visual
asset therefore does not change an instrument's sound, footprint, or gestures.

## Instrument definition contract

Each object declares:

```text
id, name, world, category
layoutSize, interactionType, interactionModes
sound
renderer.procedural + renderer.glb
materials, animationProfile, parameters
accent, description
```

`resolveInstrumentRenderer(instrumentId, modelOverrides)` returns either the
procedural builder descriptor or a normalized GLB descriptor. The current slice
renders the procedural branch and keeps GLB metadata beside it so asset changes
remain data-driven.

## Add a new procedural instrument

1. Add one object to `definitions` in `src/cloud-lab-instruments.js` and reuse or
   add material and animation profiles.
2. Give it a supported `layoutSize` and one of the shared interaction archetypes.
3. Add one renderer builder case to `getModelMarkup()` in
   `src/cloud-lab-renderer.js`, then add its material styling to
   `cloud-lab.css`.
4. Reuse a supported audio voice or add one voice behind `CloudLabAudio` without
   putting audio code in the renderer.
5. Add it to `INITIAL_CLOUD_LAB_LAYOUT` only if it belongs in the starter field;
   otherwise it automatically appears in the object library and is enabled for
   compatible slots.
6. Run both smoke checks from the repository root:

   ```bash
   node scripts/cloud-lab-smoke.cjs
   node scripts/cloud-lab-audio-smoke.cjs
   ```

## Replace a procedural placeholder with GLB

1. Export an optimized `.glb` with a predictable origin, baked material names,
   compressed textures, and mobile-appropriate triangle count.
2. Set the instrument renderer override, for example:

   ```js
   resolveInstrumentRenderer("cloud-kick", {
     "cloud-kick": {
       uri: "./assets/instruments/cloud-kick.glb",
       sceneNode: "CloudKick",
       scale: 0.86,
       rotation: [0, -0.08, 0],
       anchor: [0, 0, 0],
     },
   });
   ```

3. Register one shared Three.js/GLTFLoader bridge with
   `registerGLBModelAdapter(factory)` from `src/cloud-lab-renderer.js`, then pass
   the overrides into `createInstrumentNode`. The factory returns a visual
   `Element` immediately and can load the GLB inside it asynchronously. Keep the
   existing `.instrument` element as the stable, accessible hit volume.
4. Map the existing `animationProfile` actions to named morph targets, bones, or
   material uniforms. Do not move hit volumes with gyro or idle animation.
5. Keep the procedural builder as the loading, unsupported-WebGL, context-loss,
   and reduced-power fallback.

The deliberate missing production piece is the Three.js/GLTFLoader dependency
itself. Adding it before approved models exist would increase payload without
improving this procedural proof of concept; the definition, adapter hook, and
fallback boundary are already in place.

## Validation completed

- Automated screenshots and geometry checks across all six target viewports.
- No horizontal overflow, missing accessible names, undersized visible controls,
  console errors, failed requests, or page errors.
- HIT, vertical continuous drag, NOTES, XY, edit mode, long-press, picker,
  Cloud→Cyber replacement, spawn transition, and fixed parallax hit rects tested.
- Reduced-motion behavior verified.
- Low-power mode, missing-gyro touch fallback, idle meter throttling, and an
  active-loop long-task check verified.
- First `pointerdown → AudioScheduledSourceNode.start()` call measured around
  2–3 ms after idle prewarm in headless Chrome (machine-dependent).
- Twelve rapid kick taps produced all expected sources; catalogue sound IDs,
  independent Cloud/Cyber continuous voices, and hard voice limits were verified.

## Known limits and next steps

- Real-device iPhone Safari validation is still required for perceived audio
  latency, vibration behavior, safe-area geometry, and Device Orientation
  permission UX. Those cannot be faithfully validated without hardware.
- Procedural DOM/CSS models are the current renderer. Add the shared GLB adapter
  only when the first optimized production model is ready.
- The Drift Loop is intentionally a tiny interaction demo, not a sequencer or DAW.
- A later product pass can add drag-to-rearrange, pack discovery, onboarding, and
  saved multi-set collections without changing the object definition contract.
- When production assets arrive, profile draw calls, shader cost, texture memory,
  DPR caps, context loss, and thermal behavior on mid-range phones.
