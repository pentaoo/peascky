const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;

function createNoiseBuffer(context, duration = 0.2) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function connectVoice(context, destination, time, trackId, velocity, noiseBuffer) {
  const level = Math.max(0.05, velocity);

  if (trackId === "kick") {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(145, time);
    oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.09);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(level * 0.9, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.4);
    return;
  }

  if (trackId === "snare" || trackId === "hat") {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = trackId === "hat" ? "highpass" : "bandpass";
    filter.frequency.value = trackId === "hat" ? 6200 : 1700;
    filter.Q.value = trackId === "hat" ? 0.8 : 1.1;
    const duration = trackId === "hat" ? 0.065 : 0.16;
    gain.gain.setValueAtTime(level * (trackId === "hat" ? 0.24 : 0.42), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(time);
    source.stop(time + duration + 0.02);
    return;
  }

  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(55, time);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(340, time);
  filter.frequency.exponentialRampToValueAtTime(95, time + 0.34);
  filter.Q.value = 5;
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(level * 0.34, time + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.48);
  oscillator.connect(filter).connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + 0.5);
}

export class AudioEngine {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.context = null;
    this.master = null;
    this.noise = null;
    this.project = null;
    this.playing = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = 0.76;
      this.master.connect(this.context.destination);
      this.noise = createNoiseBuffer(this.context);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setProject(project) {
    this.project = structuredClone(project);
  }

  play() {
    this.unlock();
    if (this.playing || !this.project) return;
    this.playing = true;
    this.nextStepTime = this.context.currentTime + 0.04;
    this.timer = window.setInterval(() => this.schedule(), LOOK_AHEAD_MS);
    this.schedule();
    this.eventBus.emit("transport", { playing: true, step: this.step });
  }

  pause() {
    this.playing = false;
    window.clearInterval(this.timer);
    this.timer = null;
    this.eventBus.emit("transport", { playing: false, step: this.step });
  }

  stop() {
    this.pause();
    this.step = 0;
    this.eventBus.emit("step", { step: 0, time: 0 });
  }

  stepDuration() {
    return 60 / this.project.bpm / 4;
  }

  schedule() {
    if (!this.playing || !this.context || !this.project) return;
    while (this.nextStepTime < this.context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      const scheduledStep = this.step;
      const scheduledTime = this.nextStepTime;
      const swing = scheduledStep % 2 ? this.project.swing * this.stepDuration() : 0;
      const eventTime = scheduledTime + swing;

      for (const track of this.project.tracks) {
        const velocity = Number(track.pattern[scheduledStep]) || 0;
        if (!track.mute && velocity > 0) {
          connectVoice(this.context, this.master, eventTime, track.id, velocity * track.volume, this.noise);
          const delay = Math.max(0, (eventTime - this.context.currentTime) * 1000);
          window.setTimeout(() => this.eventBus.emit("hit", {
            trackId: track.id,
            velocity,
            source: "sequence",
            step: scheduledStep,
          }), delay);
        }
      }

      const stepDelay = Math.max(0, (eventTime - this.context.currentTime) * 1000);
      window.setTimeout(() => this.eventBus.emit("step", { step: scheduledStep, time: eventTime }), stepDelay);
      this.nextStepTime += this.stepDuration();
      this.step = (this.step + 1) % this.project.steps;
    }
  }

  trigger(trackId, velocity = 1) {
    this.unlock();
    connectVoice(this.context, this.master, this.context.currentTime, trackId, velocity, this.noise);
    this.eventBus.emit("hit", { trackId, velocity, source: "live", step: this.step });
  }

  async renderWav(project, bars = 2) {
    const beats = bars * 4;
    const duration = beats * 60 / project.bpm;
    const sampleRate = 44100;
    const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const master = context.createGain();
    master.gain.value = 0.78;
    master.connect(context.destination);
    const noise = createNoiseBuffer(context);
    const stepDuration = 60 / project.bpm / 4;

    for (let step = 0; step < project.steps * bars; step += 1) {
      const index = step % project.steps;
      const time = step * stepDuration + (index % 2 ? project.swing * stepDuration : 0);
      for (const track of project.tracks) {
        const velocity = Number(track.pattern[index]) || 0;
        if (!track.mute && velocity > 0) {
          connectVoice(context, master, time, track.id, velocity * track.volume, noise);
        }
      }
    }

    const rendered = await context.startRendering();
    return encodeWav(rendered);
  }
}

function encodeWav(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const output = new ArrayBuffer(44 + frames * channels * bytesPerSample);
  const view = new DataView(output);
  const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * bytesPerSample, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * channels * bytesPerSample, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}
