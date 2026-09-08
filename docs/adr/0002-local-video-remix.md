# ADR 0002: Local rule-based Video Remix

Status: accepted

## Decision

Video Remix samples frames through a browser video element and a small Canvas. It
extracts average color, brightness, motion deltas and contrast spikes without uploading
the source. Web Audio decoding is attempted for onset and BPM estimation; unsupported
containers fall back to visual motion.

The generator is deterministic. A seed derived from file metadata controls variation,
so the same file produces the same pattern on the same browser.

## Mapping

- cuts and contrast spikes → snare accents;
- motion intensity → hat density;
- audio transients → additional kick candidates;
- bass follows selected kick events;
- dominant color and brightness → Cloud Piska atmosphere.

## Consequences

This does not claim stem separation or reconstruction of the source song. It reframes
the video as playable material and keeps the entire baseline flow offline.
