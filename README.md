# Pocket Jam

Pocket Jam is a local-first browser instrument for quickly turning ideas and video into playable music.

## Included prototypes

- Main flow with Video Remix, Quick Loop placeholder, and Build Track.
- Local Video Remix analysis using Canvas and Web Audio.
- Four-track, 16-step sequencer with live editing.
- Cloud Piska audiovisual performance surface.
- Figma-derived tactile sampler draft with eight playable pads.
- Local project persistence and WAV export.

## Run locally

```bash
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173).

The standalone sampler draft is available at
[http://localhost:4173/sampler.html](http://localhost:4173/sampler.html).

## Architecture

The project uses native HTML, CSS, JavaScript, Web Audio, Canvas, and browser storage.
Audio scheduling is independent from UI rendering. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the ADRs in [`docs/adr`](docs/adr).
