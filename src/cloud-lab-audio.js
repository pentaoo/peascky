const SILENCE = 0.0001;
const START_PADDING = 0.003;
const DEFAULT_MASTER = 0.76;
const DEFAULT_MAX_VOICES = 32;
const NATIVE_OSCILLATORS = new Set(["sine", "square", "sawtooth", "triangle"]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function oscillatorType(value, fallback) {
  return NATIVE_OSCILLATORS.has(value) ? value : fallback;
}

function normalizedParams(params) {
  if (typeof params === "number") return { velocity: params };
  return params && typeof params === "object" ? params : {};
}

function voiceVelocity(params, fallback = 1) {
  const gestureLevel = finiteOr(
    params.velocity,
    finiteOr(params.pressure, finiteOr(params.gain, fallback)),
  );
  const outputGain = clamp(finiteOr(params.outputGain, 1), 0, 2);
  return clamp(gestureLevel * outputGain, 0.001, 1.25);
}

function canonicalSoundId(soundId) {
  const id = String(soundId || "")
    .toLowerCase()
    .replace(/cloud|lab/g, "")
    .replace(/[^a-z]/g, "");

  if (id === "hihat" || id === "closedhat" || id === "openhat") return "hat";
  if (id === "keys") return "synth";
  if (id === "cyberbass") return "bass";
  if (id === "orbitsynth" || id === "space" || id === "spacesynth") return "orbit";
  return id;
}

function noteNameToFrequency(note) {
  const match = /^([a-g])([#b]?)(-?\d)$/i.exec(String(note).trim());
  if (!match) return null;

  const semitones = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let pitch = semitones[match[1].toLowerCase()];
  if (match[2] === "#") pitch += 1;
  if (match[2] === "b") pitch -= 1;
  const midi = (Number(match[3]) + 1) * 12 + pitch;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function frequencyFrom(params, fallback) {
  if (typeof params.note === "string") {
    const frequency = noteNameToFrequency(params.note);
    if (frequency) return clamp(frequency, 20, 12000);
  }

  if (Number.isFinite(Number(params.midi))) {
    return clamp(440 * Math.pow(2, (Number(params.midi) - 69) / 12), 20, 12000);
  }

  // Catalogue parameters expose note as a MIDI number, while direct callers
  // can still use note names ("C3") or an explicit frequency.
  if (Number.isFinite(Number(params.note))) {
    return clamp(440 * Math.pow(2, (Number(params.note) - 69) / 12), 20, 12000);
  }

  return clamp(finiteOr(params.frequency, fallback), 20, 12000);
}

function safeDisconnect(node) {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // Some WebKit versions throw when an already disconnected node is released.
  }
}

function safeStop(source, time) {
  if (!source) return;
  try {
    source.stop(time);
  } catch {
    // A voice may already have naturally ended or been stolen.
  }
}

function setTarget(parameter, value, time, smoothing = 0.018) {
  if (!parameter) return;
  const safeValue = Number.isFinite(value) ? value : 0;
  parameter.cancelScheduledValues(time);
  parameter.setTargetAtTime(safeValue, time, Math.max(0.001, smoothing));
}

function setEnvelope(parameter, time, peak, attack, hold, release) {
  const attackEnd = time + Math.max(0.001, attack);
  const releaseStart = attackEnd + Math.max(0, hold);
  const releaseEnd = releaseStart + Math.max(0.008, release);

  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(SILENCE, time);
  parameter.exponentialRampToValueAtTime(Math.max(SILENCE * 2, peak), attackEnd);
  parameter.setValueAtTime(Math.max(SILENCE * 2, peak), releaseStart);
  parameter.exponentialRampToValueAtTime(SILENCE, releaseEnd);
  return releaseEnd;
}

function setSustainEnvelope(parameter, time, peak, attack) {
  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(SILENCE, time);
  parameter.exponentialRampToValueAtTime(Math.max(SILENCE * 2, peak), time + Math.max(0.002, attack));
}

function createNoiseBuffer(context, duration = 0.95) {
  const length = Math.max(1, Math.ceil(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.16 + white * 0.84;
    channel[index] = previous;
  }
  return buffer;
}

function createCloudImpulse(context, duration = 1.35) {
  const length = Math.max(1, Math.ceil(context.sampleRate * duration));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x6d2b79f5;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };

  for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
    const channel = impulse.getChannelData(channelIndex);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const envelope = Math.pow(1 - progress, 2.7);
      smoothed = smoothed * 0.32 + random() * 0.68;
      channel[index] = smoothed * envelope * (0.78 + channelIndex * 0.08);
    }
  }
  return impulse;
}

/**
 * Low-latency procedural audio for the Cloud Lab performance surface.
 *
 * The context is deliberately created lazily. Call unlock() from the first
 * pointer/touch event; trigger() and startContinuous() also attempt to resume it.
 */
export class CloudLabAudio {
  constructor(options = {}) {
    this.context = options.context || null;
    this.destination = options.destination || null;
    this.masterLevel = clamp(finiteOr(options.master, DEFAULT_MASTER), 0, 1);
    this.maxVoices = Math.max(8, Math.round(finiteOr(options.maxVoices, DEFAULT_MAX_VOICES)));
    this.xy = {
      x: clamp(finiteOr(options.x, 0.72), 0, 1),
      y: clamp(finiteOr(options.y, 0.28), 0, 1),
    };

    this._ownsContext = !options.context;
    this._graphReady = false;
    this._primed = false;
    this._resumePromise = null;
    this._disposed = false;
    this._voiceSerial = 0;
    this._voices = new Map();
    this._continuous = new Map();
    this._noiseBuffer = null;
    this._nodes = null;
    this._reverbTimer = null;
  }

  static get isSupported() {
    return typeof globalThis !== "undefined" && Boolean(globalThis.AudioContext || globalThis.webkitAudioContext);
  }

  get state() {
    return this.context ? this.context.state : "uninitialized";
  }

  /**
   * Prebuild the silent, lean graph without resuming or scheduling audio.
   * Safe to call from requestIdleCallback after render; unlock() still owns the
   * user-gesture resume. A later unlock retries if eager preparation failed.
   */
  prepare() {
    if (this._disposed) return false;
    try {
      this._ensureContext();
      return true;
    } catch {
      return false;
    }
  }

  async unlock() {
    const context = this._ensureContext();

    if (context.state !== "running" && context.state !== "closed") {
      if (!this._resumePromise) {
        this._resumePromise = context.resume().finally(() => { this._resumePromise = null; });
      }
      await this._resumePromise;
    }

    // A one-frame silent source reliably opens the output path on older iOS.
    if (!this._primed && context.state === "running") {
      this._primed = true;
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(this._nodes.input);
      source.start(context.currentTime);
      source.onended = () => safeDisconnect(source);
    }

    if (context.state === "running" && !this._nodes.convolver.buffer && this._reverbTimer === null) {
      this._prepareReverb(context, this._nodes.convolver);
    }

    return context;
  }

  /** Trigger a polyphonic one-shot. Returns a voice id, or null for an unknown sound. */
  trigger(soundId, params = {}) {
    const options = normalizedParams(params);
    const kind = canonicalSoundId(soundId);
    if (!["kick", "snare", "hat", "bass", "synth", "orbit"].includes(kind)) return null;

    const context = this._ensureContext();
    const unlocking = this.unlock();
    const time = this._eventTime(options, context);
    const voice = this._createVoice(kind, options, time, false, String(soundId));
    void unlocking.catch(() => this._hardStopVoice(voice, context.currentTime));
    return voice ? voice.id : null;
  }

  /**
   * Start or update a sustained bass, synth, or orbit voice.
   * Pass params.id for independent multitouch voices; the returned id can be
   * supplied to stopContinuous().
   */
  startContinuous(soundId, params = {}) {
    const options = normalizedParams(params);
    const kind = canonicalSoundId(soundId);

    if (!["bass", "synth", "orbit"].includes(kind)) return this.trigger(kind, options);

    const context = this._ensureContext();
    const unlocking = this.unlock();
    const instrumentId = String(soundId);
    const key = String(options.id ?? options.pointerId ?? instrumentId);
    const existing = this._continuous.get(key);

    if (existing && existing.state === "active" && existing.soundId === kind) {
      this._updateContinuousVoice(existing, options);
      void unlocking.catch(() => this._hardStopVoice(existing, context.currentTime));
      return key;
    }
    if (existing && existing.state === "active") {
      this._releaseVoice(existing, context.currentTime, 0.025);
    }

    const time = this._eventTime(options, context);
    const voice = this._createVoice(kind, options, time, true, instrumentId);
    if (!voice) return null;
    voice.key = key;
    this._continuous.set(key, voice);
    void unlocking.catch(() => this._hardStopVoice(voice, context.currentTime));
    return key;
  }

  /** Stop a sustained voice by returned id, sound id, or omit the id to stop all. */
  stopContinuous(id, params = {}) {
    if (!this.context) return;
    const options = normalizedParams(params);
    const release = clamp(finiteOr(options.release, 0.16), 0.015, 3);
    const time = this._eventTime(options, this.context, false);

    if (id === undefined || id === null) {
      [...this._continuous.values()].forEach((voice) => this._releaseVoice(voice, time, release));
      return;
    }

    const key = String(id);
    const exact = this._continuous.get(key);
    if (exact) {
      this._releaseVoice(exact, time, release);
      return;
    }

    const kind = canonicalSoundId(id);
    [...this._continuous.values()]
      .filter((voice) => voice.soundId === kind || voice.instrumentId === key)
      .forEach((voice) => this._releaseVoice(voice, time, release));
  }

  /**
   * XY is expressed as normalized screen coordinates: x opens the shared tone
   * filter; moving upward (lower y) increases delay and cloud reverb.
   */
  setXY(x, y) {
    this.xy.x = clamp(finiteOr(x, this.xy.x), 0, 1);
    this.xy.y = clamp(finiteOr(y, this.xy.y), 0, 1);
    if (!this._graphReady || !this.context) return { ...this.xy };

    this._applyXY(this.context.currentTime, true);
    return { ...this.xy };
  }

  setMaster(value) {
    this.masterLevel = clamp(finiteOr(value, this.masterLevel), 0, 1);
    if (this._nodes && this.context) {
      setTarget(this._nodes.master.gain, this.masterLevel, this.context.currentTime, 0.02);
    }
    return this.masterLevel;
  }

  async dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._reverbTimer !== null && typeof globalThis.clearTimeout === "function") {
      globalThis.clearTimeout(this._reverbTimer);
      this._reverbTimer = null;
    }

    if (this.context) {
      const time = this.context.currentTime;
      [...this._voices.values()].forEach((voice) => this._hardStopVoice(voice, time));
    }

    this._continuous.clear();
    this._voices.clear();
    if (this._nodes) Object.values(this._nodes).forEach(safeDisconnect);

    const context = this.context;
    this._nodes = null;
    this._noiseBuffer = null;
    this._resumePromise = null;
    this._graphReady = false;
    this.context = null;

    if (context && this._ownsContext && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // Closing may reject while Safari is transitioning between app states.
      }
    }
  }

  _ensureContext() {
    if (this._disposed) throw new Error("CloudLabAudio has been disposed");

    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not supported in this browser");

      try {
        this.context = new AudioContextClass({ latencyHint: "interactive" });
      } catch {
        this.context = new AudioContextClass();
      }
      this._ownsContext = true;
    }

    if (!this._graphReady) this._buildGraph();
    return this.context;
  }

  _buildGraph() {
    const context = this.context;
    const destination = this.destination || context.destination;
    const input = context.createGain();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delaySend = context.createGain();
    const delay = context.createDelay(0.8);
    const delayTone = context.createBiquadFilter();
    const delayReturn = context.createGain();
    const feedback = context.createGain();
    const reverbSend = context.createGain();
    const convolver = context.createConvolver();
    const reverbTone = context.createBiquadFilter();
    const reverbReturn = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();

    input.gain.value = 1;
    filter.type = "lowpass";
    dry.gain.value = 0.92;
    delay.delayTime.value = 0.24;
    delayTone.type = "lowpass";
    delayTone.frequency.value = 3900;
    delayReturn.gain.value = 0.62;
    feedback.gain.value = 0.24;
    reverbTone.type = "highpass";
    reverbTone.frequency.value = 180;
    reverbReturn.gain.value = 0.54;
    master.gain.value = this.masterLevel;

    compressor.threshold.value = -12;
    compressor.knee.value = 14;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;

    input.connect(filter);
    filter.connect(dry).connect(master);
    filter.connect(delaySend).connect(delay).connect(delayTone).connect(delayReturn).connect(master);
    delayTone.connect(feedback).connect(delay);
    filter.connect(reverbSend).connect(convolver).connect(reverbTone).connect(reverbReturn).connect(master);
    master.connect(compressor).connect(destination);

    this._nodes = {
      input,
      filter,
      dry,
      delaySend,
      delay,
      delayTone,
      delayReturn,
      feedback,
      reverbSend,
      convolver,
      reverbTone,
      reverbReturn,
      master,
      compressor,
    };
    this._graphReady = true;
    this._applyXY(context.currentTime, false);
  }

  _prepareReverb(context, convolver) {
    const installImpulse = () => {
      this._reverbTimer = null;
      if (this._disposed || this.context !== context || this._nodes?.convolver !== convolver) return;
      convolver.buffer = createCloudImpulse(context);
    };

    // Keep the first pointerdown path lean. The dry signal and filtered delay
    // are ready immediately; the reusable reverb tail joins a frame later.
    if (typeof globalThis.setTimeout === "function") {
      this._reverbTimer = globalThis.setTimeout(installImpulse, 24);
    } else {
      installImpulse();
    }
  }

  _applyXY(time, smooth) {
    const wet = 1 - this.xy.y;
    const cutoff = 300 * Math.pow(52, this.xy.x);
    const resonance = 0.7 + wet * 2.3 + (1 - this.xy.x) * 0.8;
    const delayAmount = 0.015 + wet * wet * 0.2;
    const reverbAmount = 0.045 + wet * 0.29;
    const delayTime = 0.105 + wet * 0.255;
    const feedback = 0.16 + wet * 0.29;
    const apply = (parameter, value, smoothing = 0.025) => {
      if (smooth) {
        setTarget(parameter, value, time, smoothing);
      } else {
        parameter.cancelScheduledValues(time);
        parameter.setValueAtTime(value, time);
      }
    };

    apply(this._nodes.filter.frequency, clamp(cutoff, 240, 18000));
    apply(this._nodes.filter.Q, resonance);
    apply(this._nodes.delaySend.gain, delayAmount);
    apply(this._nodes.reverbSend.gain, reverbAmount);
    apply(this._nodes.delay.delayTime, delayTime, 0.035);
    apply(this._nodes.feedback.gain, feedback, 0.04);
  }

  _eventTime(params, context, includePadding = true) {
    const now = context.currentTime;
    if (Number.isFinite(Number(params.when))) return Math.max(now, Number(params.when));
    if (Number.isFinite(Number(params.delay))) return Math.max(now, now + Number(params.delay));
    return now + (includePadding ? START_PADDING : 0);
  }

  _createVoice(kind, params, time, sustained, instrumentId = kind) {
    this._makeRoomForVoice(time);
    let voice = null;
    if (kind === "kick") voice = this._createKick(params, time);
    if (kind === "snare") voice = this._createSnare(params, time);
    if (kind === "hat") voice = this._createHat(params, time);
    if (kind === "bass") voice = this._createBass(params, time, sustained);
    if (kind === "synth") voice = this._createSynth(params, time, sustained);
    if (kind === "orbit") voice = this._createOrbit(params, time, sustained);
    if (voice) voice.instrumentId = instrumentId;
    return voice;
  }

  _voiceOutput(pan = 0) {
    const context = this.context;
    const output = context.createGain();
    const nodes = [output];

    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(finiteOr(pan, 0), -1, 1);
      output.connect(panner).connect(this._nodes.input);
      nodes.push(panner);
    } else {
      output.connect(this._nodes.input);
    }
    return { output, nodes };
  }

  _noiseSource() {
    if (!this._noiseBuffer) this._noiseBuffer = createNoiseBuffer(this.context);
    const source = this.context.createBufferSource();
    source.buffer = this._noiseBuffer;
    return source;
  }

  _createKick(params, time) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const tone = clamp(finiteOr(params.tone, 0.48), 0, 1);
    const bodyFrequency = frequencyFrom(params, 39 + tone * 19);
    const duration = clamp(finiteOr(params.duration, finiteOr(params.decay, 0.48)), 0.16, 1.1);
    const punch = clamp(finiteOr(params.punch, 0.72), 0, 1);
    const routed = this._voiceOutput(params.pan);
    const oscillator = context.createOscillator();
    const click = this._noiseSource();
    const clickFilter = context.createBiquadFilter();
    const clickGain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(clamp(bodyFrequency * 3.25, 70, 260), time);
    oscillator.frequency.exponentialRampToValueAtTime(bodyFrequency, time + Math.min(0.11, duration * 0.35));
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 1700;
    clickGain.gain.setValueAtTime(0.06 + punch * 0.17, time);
    clickGain.gain.exponentialRampToValueAtTime(SILENCE, time + 0.022);

    const end = setEnvelope(routed.output.gain, time, velocity * 0.86, 0.003, 0.012, duration);
    oscillator.connect(routed.output);
    click.connect(clickFilter).connect(clickGain).connect(routed.output);

    const voice = this._registerVoice({
      soundId: "kick",
      time,
      end,
      output: routed.output,
      sources: [oscillator, click],
      nodes: [...routed.nodes, clickFilter, clickGain],
      frequencyTargets: [],
    });
    oscillator.start(time);
    click.start(time);
    oscillator.stop(end + 0.025);
    click.stop(time + 0.04);
    return voice;
  }

  _createSnare(params, time) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const duration = clamp(finiteOr(params.duration, 0.26), 0.09, 0.7);
    const toneFrequency = Number.isFinite(Number(params.body))
      ? clamp(Number(params.body), 80, 520)
      : frequencyFrom(params, 176);
    const snap = clamp(finiteOr(params.snap, 0.66), 0, 1);
    const air = clamp(finiteOr(params.air, finiteOr(params.brightness, 0.5)), 0, 1);
    const routed = this._voiceOutput(params.pan);
    const noise = this._noiseSource();
    const noiseHighpass = context.createBiquadFilter();
    const noisePeak = context.createBiquadFilter();
    const tone = context.createOscillator();
    const toneGain = context.createGain();

    noiseHighpass.type = "highpass";
    noiseHighpass.frequency.value = 720;
    noisePeak.type = "bandpass";
    noisePeak.frequency.value = 1750 + air * 1900;
    noisePeak.Q.value = 0.72;
    tone.type = "triangle";
    tone.frequency.setValueAtTime(toneFrequency * 1.1, time);
    tone.frequency.exponentialRampToValueAtTime(toneFrequency * 0.82, time + 0.075);
    toneGain.gain.setValueAtTime(0.42, time);
    toneGain.gain.exponentialRampToValueAtTime(SILENCE, time + Math.min(0.13, duration));

    const end = setEnvelope(routed.output.gain, time, velocity * (0.35 + snap * 0.21), 0.002, 0.005, duration);
    noise.connect(noiseHighpass).connect(noisePeak).connect(routed.output);
    tone.connect(toneGain).connect(routed.output);

    const voice = this._registerVoice({
      soundId: "snare",
      time,
      end,
      output: routed.output,
      sources: [noise, tone],
      nodes: [...routed.nodes, noiseHighpass, noisePeak, toneGain],
      frequencyTargets: [],
    });
    noise.start(time);
    tone.start(time);
    noise.stop(end + 0.02);
    tone.stop(time + Math.min(0.16, duration + 0.02));
    return voice;
  }

  _createHat(params, time) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const openness = clamp(finiteOr(params.open, 0), 0, 1);
    const open = openness > 0.42;
    const naturalDuration = 0.065 + Math.pow(openness, 1.35) * 0.39;
    const duration = clamp(finiteOr(params.duration, naturalDuration), 0.035, 0.85);
    const routed = this._voiceOutput(params.pan);
    const noise = this._noiseSource();
    const highpass = context.createBiquadFilter();
    const brightness = clamp(finiteOr(params.brightness, 0.5), 0, 1);

    highpass.type = "highpass";
    highpass.frequency.value = 4800 + brightness * 2500;
    highpass.Q.value = 0.68;
    noise.playbackRate.value = 0.96 + Math.random() * 0.08;

    const end = setEnvelope(routed.output.gain, time, velocity * (open ? 0.2 : 0.27), 0.0015, 0, duration);
    noise.connect(highpass).connect(routed.output);
    const voice = this._registerVoice({
      soundId: "hat",
      time,
      end,
      output: routed.output,
      sources: [noise],
      nodes: [...routed.nodes, highpass],
      frequencyTargets: [],
    });
    noise.start(time);
    noise.stop(end + 0.02);
    return voice;
  }

  _createBass(params, time, sustained) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const frequency = frequencyFrom(params, 55);
    const duration = clamp(finiteOr(params.duration, 0.62), 0.16, 3);
    const brightness = clamp(finiteOr(params.brightness, 0.46), 0, 1);
    const routed = this._voiceOutput(params.pan);
    const body = context.createOscillator();
    const sub = context.createOscillator();
    const subGain = context.createGain();
    const filter = context.createBiquadFilter();

    body.type = oscillatorType(params.waveform, "sawtooth");
    sub.type = "sine";
    subGain.gain.value = 0.48;
    filter.type = "lowpass";
    filter.Q.value = 4.5 + brightness * 4;
    const cutoff = Number.isFinite(Number(params.cutoff))
      ? clamp(Number(params.cutoff), 70, 8000)
      : 380 + brightness * 1500;
    filter.frequency.setValueAtTime(cutoff, time);

    const glide = clamp(finiteOr(params.glide, 0.065), 0.001, 0.35);
    const glideFrom = clamp(finiteOr(params.fromFrequency, glide <= 0.002 ? frequency : frequency * 1.13), 20, 12000);
    body.frequency.setValueAtTime(glideFrom, time);
    body.frequency.exponentialRampToValueAtTime(frequency, time + glide);
    sub.frequency.setValueAtTime(glideFrom * 0.5, time);
    sub.frequency.exponentialRampToValueAtTime(frequency * 0.5, time + glide);

    let end = Infinity;
    if (sustained) {
      setSustainEnvelope(routed.output.gain, time, velocity * 0.31, 0.012);
    } else {
      end = setEnvelope(routed.output.gain, time, velocity * 0.34, 0.009, 0.035, duration);
      filter.frequency.exponentialRampToValueAtTime(Math.max(90, 150 + brightness * 390), end - 0.03);
    }

    body.connect(filter).connect(routed.output);
    sub.connect(subGain).connect(filter);
    const voice = this._registerVoice({
      soundId: "bass",
      time,
      end,
      output: routed.output,
      sources: [body, sub],
      nodes: [...routed.nodes, subGain, filter],
      frequencyTargets: [
        { parameter: body.frequency, ratio: 1 },
        { parameter: sub.frequency, ratio: 0.5 },
      ],
      filter,
      sustained,
    });
    body.start(time);
    sub.start(time);
    if (!sustained) {
      body.stop(end + 0.025);
      sub.stop(end + 0.025);
    }
    return voice;
  }

  _createSynth(params, time, sustained) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const frequency = frequencyFrom(params, 220);
    const duration = clamp(finiteOr(params.duration, 1.15), 0.22, 4);
    const brightness = clamp(finiteOr(params.brightness, 0.58), 0, 1);
    const routed = this._voiceOutput(params.pan);
    const filter = context.createBiquadFilter();
    const intervals = Array.isArray(params.intervals) && params.intervals.length
      ? params.intervals.slice(0, 4)
      : sustained ? [0, 12] : [0, 7, 12];
    const sources = [];
    const oscillatorGains = [];
    const frequencyTargets = [];

    filter.type = "lowpass";
    filter.frequency.value = 950 + brightness * 4700;
    filter.Q.value = 1.3 + brightness * 1.7;
    filter.connect(routed.output);

    intervals.forEach((interval, index) => {
      const ratio = Math.pow(2, finiteOr(interval, 0) / 12);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? "sine" : "triangle";
      oscillator.frequency.value = frequency * ratio;
      oscillator.detune.value = index === 0 ? -3 : index === 1 ? 4 : 1;
      gain.gain.value = (index === 0 ? 0.72 : 0.48) / Math.sqrt(intervals.length);
      oscillator.connect(gain).connect(filter);
      sources.push(oscillator);
      oscillatorGains.push(gain);
      frequencyTargets.push({ parameter: oscillator.frequency, ratio });
    });

    let end = Infinity;
    if (sustained) {
      setSustainEnvelope(routed.output.gain, time, velocity * 0.34, 0.035);
    } else {
      end = setEnvelope(routed.output.gain, time, velocity * 0.3, 0.026, 0.1, duration);
      filter.frequency.setValueAtTime(1000 + brightness * 5200, time);
      filter.frequency.exponentialRampToValueAtTime(460 + brightness * 900, end - 0.05);
    }

    const voice = this._registerVoice({
      soundId: "synth",
      time,
      end,
      output: routed.output,
      sources,
      nodes: [...routed.nodes, filter, ...oscillatorGains],
      frequencyTargets,
      filter,
      sustained,
    });
    sources.forEach((source) => {
      source.start(time);
      if (!sustained) source.stop(end + 0.03);
    });
    return voice;
  }

  _createOrbit(params, time, sustained) {
    const context = this.context;
    const velocity = voiceVelocity(params);
    const frequency = frequencyFrom(params, 164.81);
    const duration = clamp(finiteOr(params.duration, 0.82), 0.12, 4);
    const brightness = clamp(finiteOr(params.brightness, 0.66), 0, 1);
    const spread = clamp(finiteOr(params.spread, 0), 0, 1);
    const alternatingSide = this._voiceSerial % 2 ? -1 : 1;
    const routed = this._voiceOutput(Number.isFinite(Number(params.pan)) ? params.pan : spread * alternatingSide * 0.62);
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modulation = context.createGain();
    const filter = context.createBiquadFilter();

    carrier.type = "sine";
    modulator.type = "sine";
    carrier.frequency.value = frequency;
    modulator.frequency.value = frequency * 2.71;
    const modulationIndex = Number.isFinite(Number(params.modulation))
      ? clamp(Number(params.modulation), 0.05, 10)
      : 0.52 + brightness * 1.4;
    modulation.gain.value = frequency * modulationIndex;
    filter.type = "lowpass";
    filter.frequency.value = clamp(frequency * (4 + brightness * 10), 520, 10500);
    filter.Q.value = 0.7 + brightness * 2.2;

    modulator.connect(modulation).connect(carrier.frequency);
    carrier.connect(filter).connect(routed.output);

    let end = Infinity;
    if (sustained) {
      setSustainEnvelope(routed.output.gain, time, velocity * 0.26, 0.018);
    } else {
      end = setEnvelope(routed.output.gain, time, velocity * 0.31, 0.004, 0.025, duration);
      modulation.gain.exponentialRampToValueAtTime(Math.max(1, frequency * 0.12), end - 0.02);
    }

    const voice = this._registerVoice({
      soundId: "orbit",
      time,
      end,
      output: routed.output,
      sources: [carrier, modulator],
      nodes: [...routed.nodes, modulation, filter],
      frequencyTargets: [
        { parameter: carrier.frequency, ratio: 1 },
        { parameter: modulator.frequency, ratio: 2.71 },
      ],
      modulation,
      filter,
      sustained,
    });
    carrier.start(time);
    modulator.start(time);
    if (!sustained) {
      carrier.stop(end + 0.03);
      modulator.stop(end + 0.03);
    }
    return voice;
  }

  _registerVoice(definition) {
    const voice = {
      ...definition,
      id: `cloud-voice-${++this._voiceSerial}`,
      state: "active",
      endedSources: 0,
      createdAt: this.context.currentTime,
    };

    const sourceEnded = () => {
      voice.endedSources += 1;
      if (voice.endedSources >= voice.sources.length) this._cleanupVoice(voice);
    };
    voice.sources.forEach((source) => { source.onended = sourceEnded; });
    this._voices.set(voice.id, voice);
    return voice;
  }

  _updateContinuousVoice(voice, params) {
    if (!this.context || voice.state !== "active") return;
    const time = this.context.currentTime;
    const fallback = voice.frequencyTargets[0]?.parameter.value || 220;
    const frequency = frequencyFrom(params, fallback);
    const glide = clamp(finiteOr(params.glide, 0.018), 0.004, 0.35);
    voice.frequencyTargets.forEach(({ parameter, ratio }) => {
      setTarget(parameter, frequency * ratio, time, glide);
    });

    if (voice.modulation) {
      const brightness = clamp(finiteOr(params.brightness, 0.66), 0, 1);
      const modulationIndex = Number.isFinite(Number(params.modulation))
        ? clamp(Number(params.modulation), 0.05, 10)
        : 0.52 + brightness * 1.4;
      setTarget(voice.modulation.gain, frequency * modulationIndex, time, 0.025);
    }
    if (voice.filter && (Number.isFinite(Number(params.brightness)) || Number.isFinite(Number(params.cutoff)))) {
      const brightness = clamp(finiteOr(params.brightness, 0.5), 0, 1);
      let target = 800 + brightness * 5200;
      if (voice.soundId === "bass") {
        target = Number.isFinite(Number(params.cutoff))
          ? clamp(Number(params.cutoff), 70, 8000)
          : 280 + brightness * 1900;
      } else if (voice.soundId === "orbit") {
        target = clamp(frequency * (4 + brightness * 10), 520, 10500);
      }
      setTarget(voice.filter.frequency, target, time, 0.025);
    }
    if (
      Number.isFinite(Number(params.velocity))
      || Number.isFinite(Number(params.pressure))
      || Number.isFinite(Number(params.gain))
      || Number.isFinite(Number(params.outputGain))
    ) {
      const scale = voice.soundId === "bass" ? 0.31 : voice.soundId === "synth" ? 0.34 : 0.26;
      const currentLevel = Math.max(0.001, voice.output.gain.value / scale);
      setTarget(voice.output.gain, voiceVelocity(params, currentLevel) * scale, time, 0.018);
    }
  }

  _releaseVoice(voice, time, release) {
    if (!voice || voice.state !== "active") return;
    voice.state = "releasing";
    if (voice.key !== undefined) this._continuous.delete(voice.key);

    const gain = voice.output.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(Math.max(SILENCE, gain.value), time);
    gain.exponentialRampToValueAtTime(SILENCE, time + release);
    voice.sources.forEach((source) => safeStop(source, time + release + 0.025));
  }

  _hardStopVoice(voice, time) {
    if (!voice || voice.state === "ended") return;
    voice.state = "ended";
    this._voices.delete(voice.id);
    if (voice.key !== undefined && this._continuous.get(voice.key) === voice) {
      this._continuous.delete(voice.key);
    }
    voice.sources.forEach((source) => {
      source.onended = null;
      safeStop(source, time);
      safeDisconnect(source);
    });
    voice.nodes.forEach(safeDisconnect);
  }

  _makeRoomForVoice(time) {
    if (this._voices.size < this.maxVoices) return;
    const candidates = [...this._voices.values()]
      .sort((left, right) => left.createdAt - right.createdAt);
    const victim = candidates.find((voice) => voice.state === "releasing")
      || candidates.find((voice) => voice.state === "active" && !voice.sustained)
      || candidates.find((voice) => voice.state === "active");
    if (victim) this._hardStopVoice(victim, time);
  }

  _cleanupVoice(voice) {
    if (!voice || voice.state === "ended") return;
    voice.state = "ended";
    this._voices.delete(voice.id);
    if (voice.key !== undefined && this._continuous.get(voice.key) === voice) {
      this._continuous.delete(voice.key);
    }
    voice.nodes.forEach(safeDisconnect);
    voice.sources.forEach(safeDisconnect);
  }
}

export function createCloudLabAudio(options) {
  return new CloudLabAudio(options);
}

export default CloudLabAudio;
