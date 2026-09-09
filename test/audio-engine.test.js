import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/audio-engine.js";
import { createProject } from "../src/project-store.js";

class FakeParam {
  constructor(value = 0) { this.value = value; this.calls = []; }
  cancelScheduledValues(time) { this.calls.push(["cancel", time]); }
  setValueAtTime(value, time) { this.value = value; this.calls.push(["set", value, time]); }
  setTargetAtTime(value, time, smoothing) { this.value = value; this.calls.push(["target", value, time, smoothing]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.calls.push(["exponential", value, time]); }
}

class FakeNode {
  constructor() { this.connections = []; }
  connect(target) { this.connections.push(target); return target; }
  disconnect() {}
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeParam();
    this.startTimes = [];
    this.stopTimes = [];
    this.onended = null;
  }
  start(time) { this.startTimes.push(time); }
  stop(time) { this.stopTimes.push(time); }
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.channels[channel]; }
}

class FakeContext {
  constructor({ currentTime = 0, sampleRate = 44100, state = "running" } = {}) {
    this.currentTime = currentTime;
    this.sampleRate = sampleRate;
    this.state = state;
    this.destination = new FakeNode();
    this.oscillators = [];
    this.bufferSources = [];
  }
  createBuffer(channels, length, sampleRate) { return new FakeBuffer(channels, length, sampleRate); }
  createBufferSource() { const node = new FakeSource(); this.bufferSources.push(node); return node; }
  createOscillator() { const node = new FakeSource(); this.oscillators.push(node); return node; }
  createGain() { const node = new FakeNode(); node.gain = new FakeParam(); return node; }
  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    node.Q = new FakeParam();
    return node;
  }
  async resume() { this.state = "running"; }
}

const offlineContexts = [];
class FakeOfflineContext extends FakeContext {
  constructor(channels, length, sampleRate) {
    super({ sampleRate });
    this.numberOfChannels = channels;
    this.length = length;
    offlineContexts.push(this);
  }
  async startRendering() { return new FakeBuffer(this.numberOfChannels, this.length, this.sampleRate); }
}

class RecordingBus {
  constructor() { this.events = []; }
  emit(type, detail) { this.events.push({ type, detail }); }
}

function silentProject() {
  const project = createProject("minimal");
  project.bpm = 120;
  project.swing = 0.2;
  project.tracks.forEach((track) => { track.pattern.fill(0); });
  return project;
}

function installWindow(context) {
  const previousWindow = globalThis.window;
  const timeouts = [];
  const intervals = [];
  const clearedIntervals = [];
  globalThis.window = {
    AudioContext: class extends FakeContext { constructor() { super(); } },
    setInterval(callback, delay) { intervals.push({ callback, delay }); return intervals.length; },
    clearInterval(id) { clearedIntervals.push(id); },
    setTimeout(callback, delay) { timeouts.push({ callback, delay }); return timeouts.length; },
  };
  return {
    context,
    timeouts,
    intervals,
    clearedIntervals,
    restore() { globalThis.window = previousWindow; },
  };
}

test("scheduler polls every 25 ms but places notes against AudioContext.currentTime", () => {
  const context = new FakeContext({ currentTime: 2 });
  const harness = installWindow(context);
  try {
    const bus = new RecordingBus();
    const engine = new AudioEngine(bus);
    engine.context = context;
    engine.master = context.createGain();
    engine.noise = context.createBuffer(1, 32, context.sampleRate);
    engine.setProject(silentProject());
    engine.play();

    assert.equal(harness.intervals.length, 1);
    assert.equal(harness.intervals[0].delay, 25);
    assert.equal(engine.nextStepTime, 2.165, "play schedules from currentTime + 40 ms then advances one sixteenth");
    assert.equal(bus.events.at(-1).type, "transport");
    assert.deepEqual(bus.events.at(-1).detail, { playing: true, step: 1 });
  } finally {
    harness.restore();
  }
});

test("look-ahead is 100 ms; odd-step swing delays audio and matching visual timers", () => {
  const context = new FakeContext({ currentTime: 1 });
  const harness = installWindow(context);
  try {
    const bus = new RecordingBus();
    const project = silentProject();
    project.tracks.find(({ id }) => id === "kick").pattern[0] = 1;
    project.tracks.find(({ id }) => id === "bass").pattern[1] = 0.5;
    const engine = new AudioEngine(bus);
    engine.context = context;
    engine.master = context.createGain();
    engine.noise = context.createBuffer(1, 32, context.sampleRate);
    engine.setProject(project);
    engine.playing = true;
    engine.step = 0;
    engine.nextStepTime = 1;

    engine.schedule();
    assert.equal(engine.step, 1, "the 125 ms next step is outside the 100 ms horizon");
    assert.equal(context.oscillators[0].startTimes[0], 1);
    assert.deepEqual(harness.timeouts.map(({ delay }) => delay), [0, 0], "hit and step visuals use JS timers");

    context.currentTime = 1.1;
    engine.schedule();
    assert.equal(engine.step, 2);
    assert.ok(Math.abs(context.oscillators[1].startTimes[0] - 1.15) < 1e-9, "odd step adds swing * stepDuration");
    assert.ok(harness.timeouts.slice(2).every(({ delay }) => Math.abs(delay - 50) < 1e-9));

    harness.timeouts.forEach(({ callback }) => callback());
    assert.deepEqual(bus.events.filter(({ type }) => type === "hit").map(({ detail }) => detail), [
      { trackId: "kick", velocity: 1, source: "sequence", step: 0 },
      { trackId: "bass", velocity: 0.5, source: "sequence", step: 1 },
    ]);
    assert.deepEqual(bus.events.filter(({ type }) => type === "step").map(({ detail }) => detail), [
      { step: 0, time: 1 },
      { step: 1, time: 1.15 },
    ]);
  } finally {
    harness.restore();
  }
});

test("pattern iteration wraps at project.steps and uses a cloned project snapshot", () => {
  const context = new FakeContext({ currentTime: 4 });
  const harness = installWindow(context);
  try {
    const project = silentProject();
    project.steps = 2;
    const engine = new AudioEngine(new RecordingBus());
    engine.context = context;
    engine.master = context.createGain();
    engine.noise = context.createBuffer(1, 4, context.sampleRate);
    engine.setProject(project);
    project.bpm = 60;
    assert.equal(engine.project.bpm, 120);
    engine.playing = true;
    engine.step = 1;
    engine.nextStepTime = 4;
    engine.schedule();
    assert.equal(engine.step, 0);
  } finally {
    harness.restore();
  }
});

test("pause and stop preserve the current stale-callback behavior", () => {
  const context = new FakeContext({ currentTime: 2 });
  const harness = installWindow(context);
  try {
    const bus = new RecordingBus();
    const project = silentProject();
    project.tracks[0].pattern[0] = 1;
    const engine = new AudioEngine(bus);
    engine.context = context;
    engine.master = context.createGain();
    engine.noise = context.createBuffer(1, 4, context.sampleRate);
    engine.setProject(project);
    engine.play();
    const queuedVisualCallbacks = harness.timeouts.length;
    engine.pause();
    assert.equal(engine.playing, false);
    assert.deepEqual(harness.clearedIntervals, [1]);
    assert.equal(harness.timeouts.length, queuedVisualCallbacks, "pause does not cancel already queued hit/step callbacks");
    engine.step = 7;
    engine.stop();
    assert.equal(engine.step, 0);
    assert.deepEqual(bus.events.at(-1), { type: "step", detail: { step: 0, time: 0 } });
  } finally {
    harness.restore();
  }
});

test("live pads trigger immediately and emit a live hit while transport remains active", () => {
  const context = new FakeContext({ currentTime: 8 });
  const harness = installWindow(context);
  try {
    const bus = new RecordingBus();
    const engine = new AudioEngine(bus);
    engine.context = context;
    engine.master = context.createGain();
    engine.noise = context.createBuffer(1, 4, context.sampleRate);
    engine.project = silentProject();
    engine.playing = true;
    engine.step = 3;
    engine.trigger("bass", 0.7);
    assert.equal(engine.playing, true);
    assert.equal(context.oscillators[0].startTimes[0], 8);
    assert.deepEqual(bus.events.at(-1), {
      type: "hit",
      detail: { trackId: "bass", velocity: 0.7, source: "live", step: 3 },
    });
  } finally {
    harness.restore();
  }
});

test("renderWav renders bars as repeated Project steps through the realtime voice builder", async () => {
  const previousOfflineContext = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = FakeOfflineContext;
  offlineContexts.length = 0;
  try {
    const project = silentProject();
    project.tracks[0].pattern[0] = 1;
    const blob = await new AudioEngine(new RecordingBus()).renderWav(project, 2);
    const context = offlineContexts[0];
    assert.equal(context.length, 176400, "two 4/4 bars at 120 BPM render four seconds at 44.1 kHz");
    assert.deepEqual(context.oscillators.map((source) => source.startTimes[0]), [0, 2]);
    assert.equal(blob.type, "audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
    assert.equal(blob.size, 44 + 176400 * 2 * 2);
  } finally {
    globalThis.OfflineAudioContext = previousOfflineContext;
  }
});
