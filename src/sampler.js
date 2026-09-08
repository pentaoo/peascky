const pads = [...document.querySelectorAll("[data-sound]")];
const displayName = document.querySelector("[data-sample-name]");
const status = document.querySelector("[data-status]");
const bankLabel = document.querySelector("[data-bank-label]");
const meters = [...document.querySelectorAll(".level-meter i")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const bankPopover = document.querySelector(".bank-popover");
const capture = document.querySelector(".capture-key");
const xyPad = document.querySelector(".xy-pad");
const faders = [...document.querySelectorAll(".vertical-fader")];

let context;
let master;
let filter;
let delay;
let delayGain;
let noise;
let currentMode = "one-shot";
let activeLoop = null;
let meterEnergy = 0;
let selectedBank = "A";
let recordingStarted = 0;
let recordingTimer = null;

function createNoiseBuffer(audioContext) {
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.35, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

async function ensureAudio() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass({ latencyHint: "interactive" });
    master = context.createGain();
    filter = context.createBiquadFilter();
    delay = context.createDelay(0.7);
    delayGain = context.createGain();
    master.gain.value = 0.78;
    filter.type = "lowpass";
    filter.frequency.value = 9000;
    delay.delayTime.value = 0.22;
    delayGain.gain.value = 0.08;
    master.connect(filter).connect(context.destination);
    filter.connect(delay).connect(delayGain).connect(context.destination);
    noise = createNoiseBuffer(context);
  }
  if (context.state === "suspended") await context.resume();
}

function envelope(gain, time, peak = 0.45, attack = 0.005, release = 0.25) {
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.002, peak), time + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, time + release);
}

function oscillatorVoice(type, frequency, duration, peak = 0.36, glide = null) {
  const time = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  if (glide) oscillator.frequency.exponentialRampToValueAtTime(glide, time + Math.min(duration, .18));
  envelope(gain, time, peak, .006, duration);
  oscillator.connect(gain).connect(master);
  oscillator.start(time);
  oscillator.stop(time + duration + .03);
}

function noiseVoice(kind) {
  const time = context.currentTime;
  const source = context.createBufferSource();
  const voiceFilter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noise;
  voiceFilter.type = kind === "hat" ? "highpass" : "bandpass";
  voiceFilter.frequency.value = kind === "hat" ? 6200 : kind === "clap" ? 1500 : 2300;
  voiceFilter.Q.value = kind === "hat" ? .7 : 1.4;
  const release = kind === "hat" ? .07 : .18;
  envelope(gain, time, kind === "hat" ? .2 : .33, .002, release);
  source.connect(voiceFilter).connect(gain).connect(master);
  source.start(time);
  source.stop(time + release + .03);
}

async function playSound(sound) {
  await ensureAudio();
  if (sound === "kick") oscillatorVoice("sine", 148, .38, .66, 45);
  if (sound === "snare" || sound === "hat" || sound === "clap") noiseVoice(sound);
  if (sound === "bass") oscillatorVoice("sawtooth", 55, .5, .3, 43);
  if (sound === "tom") oscillatorVoice("sine", 128, .3, .44, 76);
  if (sound === "perc") oscillatorVoice("triangle", 680, .18, .25, 370);
  if (sound === "chord") [220, 261.63, 329.63].forEach((frequency) => oscillatorVoice("sine", frequency, .64, .12));
  meterEnergy = Math.min(1.35, meterEnergy + .82);
}

function pulsePad(pad) {
  displayName.textContent = pad.dataset.label;
  status.textContent = currentMode === "loop" ? "Looping sample" : "Sample triggered";
  pad.classList.remove("is-hit");
  void pad.offsetWidth;
  pad.classList.add("is-hit");
  window.setTimeout(() => pad.classList.remove("is-hit"), 150);
  playSound(pad.dataset.sound);
}

function startPad(pad) {
  pulsePad(pad);
  if (currentMode === "loop") {
    window.clearInterval(activeLoop);
    activeLoop = window.setInterval(() => pulsePad(pad), 420);
  }
}

function stopLoop() {
  window.clearInterval(activeLoop);
  activeLoop = null;
  if (currentMode === "loop") status.textContent = "Loop released";
}

pads.forEach((pad) => {
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    startPad(pad);
  });
  pad.addEventListener("pointerup", stopLoop);
  pad.addEventListener("pointercancel", stopLoop);
});

modeButtons.forEach((button) => button.addEventListener("click", () => {
  currentMode = button.dataset.mode;
  modeButtons.forEach((item) => {
    const selected = item === button;
    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  stopLoop();
  status.textContent = currentMode === "loop" ? "Hold a pad to loop" : "One-shot mode";
}));

faders.forEach((fader) => {
  const input = fader.querySelector("input");
  const output = fader.querySelector("output");
  const update = async () => {
    const value = Number(input.value);
    output.value = value;
    fader.style.setProperty("--value", (value / 100).toFixed(3));
    await ensureAudio();
    if (fader.dataset.fader === "volume") master.gain.setTargetAtTime(value / 100, context.currentTime, .02);
    else filter.frequency.setTargetAtTime(220 * Math.pow(38, value / 100), context.currentTime, .025);
  };
  input.addEventListener("input", update);
  fader.style.setProperty("--value", (Number(input.value) / 100).toFixed(3));
});

function setXY(clientX, clientY) {
  const rect = xyPad.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  xyPad.style.setProperty("--xy-x", `${(x * 100).toFixed(1)}%`);
  xyPad.style.setProperty("--xy-y", `${(y * 100).toFixed(1)}%`);
  xyPad.setAttribute("aria-valuenow", String(Math.round(x * 100)));
  ensureAudio().then(() => {
    filter.frequency.setTargetAtTime(260 * Math.pow(32, x), context.currentTime, .025);
    delayGain.gain.setTargetAtTime((1 - y) * .34, context.currentTime, .03);
  });
}

xyPad.addEventListener("pointerdown", (event) => { xyPad.setPointerCapture(event.pointerId); setXY(event.clientX, event.clientY); });
xyPad.addEventListener("pointermove", (event) => { if (xyPad.hasPointerCapture(event.pointerId)) setXY(event.clientX, event.clientY); });
xyPad.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 10 : 3;
  const current = Number(xyPad.getAttribute("aria-valuenow"));
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); xyPad.style.setProperty("--xy-x", `${Math.max(0, current - step)}%`); xyPad.setAttribute("aria-valuenow", String(Math.max(0, current - step))); }
  if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); xyPad.style.setProperty("--xy-x", `${Math.min(100, current + step)}%`); xyPad.setAttribute("aria-valuenow", String(Math.min(100, current + step))); }
});

capture.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  capture.setPointerCapture(event.pointerId);
  recordingStarted = performance.now();
  capture.classList.add("is-recording");
  status.textContent = "Capturing gesture";
  displayName.textContent = "Recording… 0.0s";
  recordingTimer = window.setInterval(() => displayName.textContent = `Recording… ${((performance.now() - recordingStarted) / 1000).toFixed(1)}s`, 100);
});
function stopRecording() {
  if (!recordingTimer) return;
  window.clearInterval(recordingTimer);
  recordingTimer = null;
  capture.classList.remove("is-recording");
  displayName.textContent = `Take ${((performance.now() - recordingStarted) / 1000).toFixed(1)}s`;
  status.textContent = "Gesture captured";
}
capture.addEventListener("pointerup", stopRecording);
capture.addEventListener("pointercancel", stopRecording);

function setNav(active) {
  document.querySelectorAll(".nav-key").forEach((button) => {
    const selected = button.dataset.nav === active;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

document.querySelector('[data-nav="grid"]').addEventListener("click", () => {
  bankPopover.hidden = true;
  setNav("grid");
  status.textContent = "Performance view";
});
document.querySelector('[data-nav="bank"]').addEventListener("click", () => {
  bankPopover.hidden = !bankPopover.hidden;
  setNav(bankPopover.hidden ? "grid" : "bank");
  status.textContent = bankPopover.hidden ? "Performance view" : "Choose a sample bank";
});
document.querySelector('[data-nav="random"]').addEventListener("click", () => {
  bankPopover.hidden = true;
  setNav("random");
  selectedBank = String.fromCharCode(65 + Math.floor(Math.random() * 9));
  bankLabel.textContent = `Bank ${selectedBank}`;
  status.textContent = "Fresh variation loaded";
  pads.forEach((pad, index) => window.setTimeout(() => {
    pad.classList.add("is-hit");
    window.setTimeout(() => pad.classList.remove("is-hit"), 130);
  }, index * 24));
  window.setTimeout(() => setNav("grid"), 500);
});

document.querySelectorAll("[data-bank]").forEach((button) => button.addEventListener("click", () => {
  selectedBank = button.dataset.bank;
  bankLabel.textContent = `Bank ${selectedBank}`;
  document.querySelectorAll("[data-bank]").forEach((item) => item.classList.toggle("is-selected", item === button));
  status.textContent = `Bank ${selectedBank} loaded`;
  window.setTimeout(() => { bankPopover.hidden = true; setNav("grid"); }, 140);
}));

let composing = false;
document.addEventListener("compositionstart", () => composing = true);
document.addEventListener("compositionend", () => composing = false);
document.addEventListener("keydown", (event) => {
  if (composing || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < pads.length && !event.repeat) pulsePad(pads[index]);
  if (event.key === "Escape") { bankPopover.hidden = true; setNav("grid"); }
});

function meterFrame() {
  meterEnergy *= .91;
  meters.forEach((bar, index) => {
    const threshold = index / meters.length;
    const level = Math.max(0, Math.min(1, (meterEnergy - threshold) * 3));
    bar.style.setProperty("--level", level.toFixed(3));
  });
  requestAnimationFrame(meterFrame);
}

document.querySelector('[data-bank="A"]').classList.add("is-selected");
requestAnimationFrame(meterFrame);
