import { createProject } from "./project-store.js";

const waitFor = (target, event, timeout = 8000) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => {
    target.removeEventListener(event, done);
    reject(new Error(`Timed out waiting for ${event}`));
  }, timeout);
  function done() {
    window.clearTimeout(timer);
    target.removeEventListener(event, done);
    resolve();
  }
  target.addEventListener(event, done, { once: true });
});

function seek(video, time) {
  if (Math.abs(video.currentTime - time) < 0.015) return Promise.resolve();
  const promise = waitFor(video, "seeked");
  video.currentTime = time;
  return promise;
}

function frameMetrics(context, width, height, previous) {
  const { data } = context.getImageData(0, 0, width, height);
  let red = 0;
  let green = 0;
  let blue = 0;
  let brightness = 0;
  let motion = 0;
  let samples = 0;

  for (let index = 0; index < data.length; index += 16) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    red += r;
    green += g;
    blue += b;
    brightness += r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (previous) {
      motion += (Math.abs(r - previous[index]) + Math.abs(g - previous[index + 1]) + Math.abs(b - previous[index + 2])) / 765;
    }
    samples += 1;
  }

  return {
    brightness: brightness / samples / 255,
    color: [red / samples, green / samples, blue / samples],
    motion: previous ? motion / samples : 0,
    pixels: new Uint8ClampedArray(data),
  };
}

async function analyzeFrames(video, onProgress) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 54;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const sampleCount = Math.max(16, Math.min(64, Math.ceil(video.duration * 2)));
  const frames = [];
  let previous = null;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = Math.min(video.duration - 0.04, (index / Math.max(1, sampleCount - 1)) * video.duration);
    await seek(video, Math.max(0, time));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const metrics = frameMetrics(context, canvas.width, canvas.height, previous);
    previous = metrics.pixels;
    frames.push({ time, brightness: metrics.brightness, color: metrics.color, motion: metrics.motion });
    onProgress?.(0.08 + (index / sampleCount) * 0.62, "Reading motion and cuts");
  }
  return frames;
}

async function analyzeAudio(file, duration, onProgress) {
  if (file.size > 120 * 1024 * 1024) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    onProgress?.(0.73, "Listening for transients");
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const windows = 128;
    const size = Math.max(256, Math.floor(channel.length / windows));
    const envelope = [];
    for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
      let sum = 0;
      const start = windowIndex * size;
      const end = Math.min(channel.length, start + size);
      for (let index = start; index < end; index += 8) sum += channel[index] * channel[index];
      envelope.push(Math.sqrt(sum / Math.max(1, (end - start) / 8)));
    }
    const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
    const deviation = Math.sqrt(envelope.reduce((sum, value) => sum + (value - mean) ** 2, 0) / envelope.length);
    const transients = envelope
      .map((value, index) => ({ value: Math.max(0, value - (envelope[index - 1] || 0)), index }))
      .filter((item) => item.value > mean * 0.32)
      .sort((a, b) => b.value - a.value)
      .slice(0, 18)
      .map((item) => item.index / envelope.length);
    const bpm = transients.length >= 3 && deviation / Math.max(0.0001, mean) > 0.16
      ? estimateBpm(envelope, duration)
      : null;
    return { bpm, transients, level: mean };
  } catch {
    return null;
  } finally {
    context.close();
  }
}

function estimateBpm(envelope, duration) {
  let bestBpm = 0;
  let bestScore = -Infinity;
  const windowsPerSecond = envelope.length / duration;
  for (let bpm = 72; bpm <= 156; bpm += 1) {
    const lag = Math.max(1, Math.round(windowsPerSecond * 60 / bpm));
    let score = 0;
    for (let index = lag; index < envelope.length; index += 1) score += envelope[index] * envelope[index - lag];
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestBpm || 112;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function rgbToHex(color) {
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function hashFile(file) {
  const source = `${file.name}:${file.size}:${file.lastModified}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildRemixFromAnalysis(file, frames, audio) {
  const seed = hashFile(file);
  const random = seeded(seed);
  const motions = frames.map((frame) => frame.motion);
  const meanMotion = average(motions);
  const motionThreshold = meanMotion * 1.65 + 0.018;
  const cuts = frames
    .map((frame, index) => ({ index, amount: frame.motion }))
    .filter((item) => item.amount > motionThreshold)
    .map((item) => item.index / Math.max(1, frames.length - 1));
  const dominantColor = rgbToHex([
    average(frames.map((frame) => frame.color[0])),
    average(frames.map((frame) => frame.color[1])),
    average(frames.map((frame) => frame.color[2])),
  ]);
  const meanBrightness = average(frames.map((frame) => frame.brightness));
  const bpm = audio?.bpm || Math.round(92 + Math.min(1, meanMotion * 7) * 48);
  const project = createProject("minimal");
  const pattern = Object.fromEntries(project.tracks.map((track) => [track.id, Array(16).fill(0)]));

  pattern.kick[0] = 1;
  pattern.kick[8] = 0.9;
  pattern.snare[4] = 0.9;
  pattern.snare[12] = 0.9;

  const energy = Math.min(1, meanMotion * 8);
  const hatInterval = energy > 0.62 ? 1 : energy > 0.28 ? 2 : 4;
  for (let step = 0; step < 16; step += hatInterval) {
    pattern.hat[step] = 0.35 + energy * 0.35 + random() * 0.12;
  }

  cuts.forEach((position) => {
    const step = Math.min(15, Math.round(position * 15));
    pattern.snare[step] = Math.max(pattern.snare[step], 0.55 + random() * 0.35);
    if (step % 4 !== 0) pattern.kick[Math.max(0, step - 1)] = 0.48 + random() * 0.3;
  });

  audio?.transients.forEach((position, index) => {
    const step = Math.min(15, Math.round(position * 15));
    if (index % 2 === 0) pattern.kick[step] = Math.max(pattern.kick[step], 0.5 + random() * 0.4);
  });

  pattern.kick.forEach((velocity, step) => {
    if (velocity > 0 && (step % 4 === 0 || random() > 0.45)) pattern.bass[step] = velocity * (0.62 + random() * 0.22);
  });

  project.name = `${file.name.replace(/\.[^.]+$/, "") || "Video"} remix`;
  project.source = "video";
  project.presetId = "video";
  project.bpm = Math.max(72, Math.min(156, bpm));
  project.seed = seed;
  project.tracks = project.tracks.map((track) => ({ ...track, pattern: pattern[track.id] }));
  project.videoAnalysis = {
    fileName: file.name,
    duration: Number(frames.at(-1)?.time || 0),
    motion: energy,
    brightness: meanBrightness,
    dominantColor,
    cuts: cuts.length,
    audioDecoded: Boolean(audio),
  };
  return project;
}

export async function analyzeVideo(file, onProgress) {
  const isVideo = file?.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file?.name || "");
  if (!isVideo) throw new Error("Choose a video file");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    onProgress?.(0.02, "Opening video");
    await waitFor(video, "loadedmetadata", 12000);
    if (video.readyState < 2) await waitFor(video, "loadeddata", 12000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no readable duration");
    const frames = await analyzeFrames(video, onProgress);
    const audio = await analyzeAudio(file, video.duration, onProgress);
    onProgress?.(0.94, "Building a playable pattern");
    const project = buildRemixFromAnalysis(file, frames, audio);
    onProgress?.(1, "Remix ready");
    return { project, previewUrl: url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
