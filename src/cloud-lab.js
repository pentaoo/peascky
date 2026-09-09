import { CloudLabAudio } from "./cloud-lab-audio.js";
import {
  INSTRUMENTS,
  createInitialCloudLabLayout,
  getCompatibleInstruments,
  getInstrumentDefinition,
  replaceInstrumentInLayout,
} from "./cloud-lab-instruments.js";
import {
  clearGestureVisual,
  createInstrumentNode,
  createPickerCard,
  setGestureVisual,
} from "./cloud-lab-renderer.js";

const STORAGE_KEY = "pocket-jam:cloud-lab:v1";
const LONG_PRESS_MS = 620;
const MOVE_TOLERANCE = 9;
const NOTE_BANKS = {
  "cloud-keys": [60, 63, 65, 67, 70, 72, 75],
  "orbit-synth": [55, 58, 62, 65, 67, 70],
};
const DEMO_STEPS = [
  ["kick-slot", "bass-slot"], ["hat-slot"], ["snare-slot"], ["hat-slot"],
  ["kick-slot", "synth-slot"], ["hat-slot"], ["snare-slot"], ["hat-slot"],
];

const app = document.querySelector("[data-cloud-lab]");
const stage = document.querySelector("[data-stage]");
const scene = document.querySelector("[data-scene]");
const objectLayer = document.querySelector("[data-object-layer]");
const glow = document.querySelector("[data-field-glow]");
const picker = document.querySelector("[data-picker]");
const pickerGrid = document.querySelector("[data-picker-grid]");
const editToggle = document.querySelector("[data-edit-toggle]");
const demoButton = document.querySelector("[data-demo]");
const tiltButton = document.querySelector("[data-tilt]");
const tiltLabel = document.querySelector("[data-tilt-label]");
const hint = document.querySelector("[data-play-hint]");
const toast = document.querySelector("[data-toast]");
const meterBars = [...document.querySelectorAll("[data-meter] i")];

const audio = new CloudLabAudio({ master: 0.7, maxVoices: 28 });
const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const pointerStates = new Map();
const hitTimers = new WeakMap();
let layout = loadLayout();
let editMode = false;
let selectedSlotId = null;
let toastTimer = 0;
let meterEnergy = 0;
let demoTimer = 0;
let demoStep = 0;
let gyroEnabled = false;
let orientationListener = null;
let gyroProbeTimer = 0;
let lastParallaxFrame = 0;
let lastMeterFrame = 0;
let glowTimer = 0;
let hasPlayed = false;

app.dataset.quality = lowPower ? "low" : "high";

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const initial = createInitialCloudLabLayout();
    if (!saved || !Array.isArray(saved.slots)) return initial;
    const valid = initial.slots.every((slot) => {
      const candidate = saved.slots.find((item) => item.id === slot.id);
      const definition = getInstrumentDefinition(candidate?.instrumentId);
      return definition && definition.layoutSize === slot.layoutSize;
    });
    return valid ? { ...initial, slots: saved.slots } : initial;
  } catch {
    return createInitialCloudLabLayout();
  }
}

function saveLayout() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* Private browsing may reject storage. */ }
}

function renderLayout(spawnSlotId = null) {
  const fragment = document.createDocumentFragment();
  layout.slots.forEach((slot) => fragment.append(createInstrumentNode(slot, { spawning: slot.id === spawnSlotId })));
  objectLayer.replaceChildren(fragment);
  if (spawnSlotId) {
    window.setTimeout(() => objectLayer.querySelector(`[data-slot-id="${spawnSlotId}"]`)?.classList.remove("is-spawning"), 650);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  app.classList.add("has-toast");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    app.classList.remove("has-toast");
  }, 1900);
}

function setEditMode(next, announce = true) {
  editMode = Boolean(next);
  app.dataset.mode = editMode ? "edit" : "play";
  editToggle.setAttribute("aria-pressed", String(editMode));
  editToggle.setAttribute("aria-label", editMode ? "Finish editing instrument field" : "Edit instrument field");
  if (announce) showToast(editMode ? "Arrange mode · tap an object to swap" : "Back to playing");
  if (editMode) stopDemo();
}

async function unlockAudio() {
  try {
    await audio.unlock();
    app.dataset.audio = "ready";
  } catch {
    app.dataset.audio = "unavailable";
    showToast("Audio is unavailable · objects still respond visually");
  }
}

function haptic(duration = 7) {
  if (typeof navigator.vibrate === "function") navigator.vibrate(duration);
}

function kickMeter(amount = .72) {
  meterEnergy = Math.min(1.4, meterEnergy + amount);
}

function pulseGlow(node, amount = .8) {
  const nodeRect = node.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  glow.style.setProperty("--glow-x", `${nodeRect.left + nodeRect.width / 2 - stageRect.left}px`);
  glow.style.setProperty("--glow-y", `${nodeRect.top + nodeRect.height / 2 - stageRect.top}px`);
  glow.style.setProperty("--glow-color", getComputedStyle(node).getPropertyValue("--accent"));
  glow.style.setProperty("--glow-energy", String(amount));
  window.clearTimeout(glowTimer);
  glowTimer = window.setTimeout(() => glow.style.setProperty("--glow-energy", "0"), 110);
}

function animateHit(node, className = "is-hit") {
  const previousTimer = hitTimers.get(node);
  if (previousTimer) window.clearTimeout(previousTimer);
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  hitTimers.set(node, window.setTimeout(() => {
    node.classList.remove(className);
    hitTimers.delete(node);
  }, 360));
}

function triggerOneShot(node, velocity = 1, parameters = {}) {
  const instrument = getInstrumentDefinition(node.dataset.instrumentId);
  if (!instrument) return;
  void unlockAudio();
  audio.trigger(instrument.sound.voice, { velocity, outputGain: instrument.sound.outputGain, ...parameters });
  animateHit(node);
  pulseGlow(node, Math.max(.35, velocity));
  kickMeter(velocity * .7);
  if (!hasPlayed) {
    hasPlayed = true;
    hint.classList.add("is-hidden");
  }
}

function getGesture(node, event) {
  const rect = node.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function updateContinuous(node, event, state, initial = false) {
  const instrument = getInstrumentDefinition(node.dataset.instrumentId);
  const { x, y } = getGesture(node, event);
  state.x = x;
  state.y = y;

  if (instrument.interactionType === "xy") {
    audio.setXY(x, y);
    setGestureVisual(node, x, y);
    node.setAttribute("aria-label", `${instrument.name}: sky ${Math.round(x * 100)}%, mist ${Math.round((1 - y) * 100)}%`);
    if (initial) audio.trigger("synth", { midi: 72, velocity: .13, brightness: x });
    pulseGlow(node, .28 + (1 - y) * .24);
    kickMeter(.1);
    return;
  }

  if (instrument.interactionType === "notes") {
    const notes = NOTE_BANKS[instrument.id] || NOTE_BANKS["cloud-keys"];
    const noteIndex = Math.min(notes.length - 1, Math.floor(x * notes.length));
    setGestureVisual(node, x, y, noteIndex);
    if (state.noteIndex === noteIndex && !initial) {
      audio.startContinuous(instrument.sound.voice, { id: state.voiceId, midi: notes[noteIndex], brightness: 1 - y, modulation: .7 + x * 5 });
      return;
    }
    state.noteIndex = noteIndex;
    audio.startContinuous(instrument.sound.voice, { id: state.voiceId, midi: notes[noteIndex], velocity: .46 + (1 - y) * .28, brightness: 1 - y, modulation: .8 + x * 4.8, outputGain: instrument.sound.outputGain });
    animateHit(node, "is-note-change");
    kickMeter(.28);
    return;
  }

  const midi = Math.round(36 + (1 - y) * 18);
  setGestureVisual(node, x, y);
  audio.startContinuous(instrument.sound.voice, {
    id: state.voiceId,
    midi,
    velocity: .46 + x * .28,
    cutoff: 150 + (1 - y) * 1450,
    pressure: .45 + x * .45,
    drive: x * .62,
    outputGain: instrument.sound.outputGain,
  });
  kickMeter(.08);
}

function endPointer(node, event, cancelled = false) {
  const state = pointerStates.get(event.pointerId);
  if (!state) return;
  window.clearTimeout(state.longPressTimer);
  window.clearTimeout(state.holdTimer);
  if (state.voiceId) audio.stopContinuous(state.voiceId, { release: cancelled ? .04 : .15 });
  node.classList.remove("is-active", "is-pressing");
  clearGestureVisual(node);
  pointerStates.delete(event.pointerId);
  try { if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId); } catch { /* The pointer may already be gone. */ }
}

function handlePointerDown(event) {
  const node = event.target.closest(".instrument");
  if (!node || !objectLayer.contains(node)) return;
  event.preventDefault();

  if (editMode) {
    openPicker(node.dataset.slotId);
    return;
  }

  void unlockAudio();
  const instrument = getInstrumentDefinition(node.dataset.instrumentId);
  const state = {
    node,
    startX: event.clientX,
    startY: event.clientY,
    x: .5,
    y: .5,
    moved: false,
    longPressed: false,
    voiceId: `${instrument.id}:${event.pointerId}`,
    noteIndex: null,
    longPressTimer: 0,
    holdTimer: 0,
  };
  pointerStates.set(event.pointerId, state);
  try { node.setPointerCapture(event.pointerId); } catch { /* Synthetic and interrupted pointers may not be capturable. */ }
  node.classList.add("is-active", "is-pressing");
  haptic(instrument.interactionType === "hit" ? 8 : 4);

  state.longPressTimer = window.setTimeout(() => {
    if (state.moved || !pointerStates.has(event.pointerId)) return;
    state.longPressed = true;
    haptic(16);
    endPointer(node, event, true);
    setEditMode(true, false);
    openPicker(node.dataset.slotId);
  }, LONG_PRESS_MS);

  if (instrument.interactionType === "hit") {
    triggerOneShot(node, .96);
    if (instrument.id === "cloud-hat") {
      state.holdTimer = window.setTimeout(() => {
        if (!state.moved && pointerStates.has(event.pointerId)) triggerOneShot(node, .55, { open: .86 });
      }, 310);
    }
  } else {
    updateContinuous(node, event, state, true);
  }
}

function handlePointerMove(event) {
  const state = pointerStates.get(event.pointerId);
  if (!state) return;
  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (distance > MOVE_TOLERANCE) {
    state.moved = true;
    window.clearTimeout(state.longPressTimer);
    window.clearTimeout(state.holdTimer);
    state.node.classList.remove("is-pressing");
  }
  const instrument = getInstrumentDefinition(state.node.dataset.instrumentId);
  if (instrument.interactionType !== "hit") updateContinuous(state.node, event, state);
}

function handleKeyboard(event) {
  const node = event.target.closest(".instrument");
  if (!node || !["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const instrument = getInstrumentDefinition(node.dataset.instrumentId);
  if (event.key.startsWith("Arrow") && instrument.interactionType === "hit") return;
  event.preventDefault();
  if (editMode) {
    if (["Enter", " "].includes(event.key)) openPicker(node.dataset.slotId);
    return;
  }
  if (["Enter", " "].includes(event.key)) {
    triggerOneShot(node, .9, { midi: instrument.world === "orbit" ? 62 : 60 });
    return;
  }
  const x = Number(node.dataset.keyX || .5) + (event.key === "ArrowRight" ? .1 : event.key === "ArrowLeft" ? -.1 : 0);
  const y = Number(node.dataset.keyY || .5) + (event.key === "ArrowDown" ? .1 : event.key === "ArrowUp" ? -.1 : 0);
  node.dataset.keyX = String(Math.max(0, Math.min(1, x)));
  node.dataset.keyY = String(Math.max(0, Math.min(1, y)));
  const nextX = Number(node.dataset.keyX);
  const nextY = Number(node.dataset.keyY);
  if (instrument.interactionType === "xy") {
    audio.setXY(nextX, nextY);
    setGestureVisual(node, nextX, nextY);
    pulseGlow(node, .28);
    return;
  }
  if (instrument.interactionType === "notes") {
    const notes = NOTE_BANKS[instrument.id] || NOTE_BANKS["cloud-keys"];
    const noteIndex = Math.min(notes.length - 1, Math.floor(nextX * notes.length));
    setGestureVisual(node, nextX, nextY, noteIndex);
    triggerOneShot(node, .58, { midi: notes[noteIndex], brightness: 1 - nextY });
    return;
  }
  setGestureVisual(node, nextX, nextY);
  triggerOneShot(node, .52, {
    midi: Math.round(36 + (1 - nextY) * 18),
    cutoff: 150 + (1 - nextY) * 1450,
    pressure: .45 + nextX * .45,
  });
}

function openPicker(slotId) {
  if (picker.open) return;
  selectedSlotId = slotId;
  const slot = layout.slots.find((candidate) => candidate.id === slotId);
  const compatible = new Set(getCompatibleInstruments(slot).map((instrument) => instrument.id));
  pickerGrid.replaceChildren(...INSTRUMENTS.map((instrument) => createPickerCard(instrument, {
    current: instrument.id === slot.instrumentId,
    compatible: compatible.has(instrument.id),
  })));
  if (typeof picker.showModal === "function") picker.showModal();
  else picker.setAttribute("open", "");
  requestAnimationFrame(() => picker.querySelector(".is-current:not(:disabled),.picker-card:not(:disabled)")?.focus());
}

function closePicker() {
  if (picker.open && typeof picker.close === "function") picker.close();
  else picker.removeAttribute("open");
  editToggle.focus({ preventScroll: true });
}

function chooseInstrument(instrumentId) {
  if (!selectedSlotId) return;
  const currentSlot = layout.slots.find((slot) => slot.id === selectedSlotId);
  if (currentSlot.instrumentId === instrumentId) return closePicker();
  try {
    layout = replaceInstrumentInLayout(layout, selectedSlotId, instrumentId);
    saveLayout();
    const next = getInstrumentDefinition(instrumentId);
    const slotId = selectedSlotId;
    closePicker();
    renderLayout(slotId);
    showToast(`${next.name} landed · ${next.world} world`);
    haptic(18);
  } catch (error) {
    showToast(error.message);
  }
}

function findNodeByInstrument(instrumentId) {
  return [...objectLayer.querySelectorAll(".instrument")].find((node) => node.dataset.instrumentId === instrumentId);
}

function playDemoStep() {
  const ids = DEMO_STEPS[demoStep % DEMO_STEPS.length];
  ids.forEach((id, index) => {
    const node = objectLayer.querySelector(`[data-slot-id="${id}"]`) || findNodeByInstrument(id);
    if (!node) return;
    const isBass = node.dataset.slotId === "bass-slot";
    const isHat = node.dataset.slotId === "hat-slot";
    window.setTimeout(() => triggerOneShot(node, isHat ? .48 : isBass ? .38 : .72, {
      midi: isBass ? 38 + (demoStep % 3) * 2 : 55 + demoStep,
    }), index * 16);
  });
  demoStep += 1;
}

function startDemo() {
  if (demoTimer) return;
  void unlockAudio();
  demoButton.setAttribute("aria-pressed", "true");
  playDemoStep();
  demoTimer = window.setInterval(playDemoStep, 260);
  showToast("Drift loop playing · objects stay live");
}

function stopDemo() {
  window.clearInterval(demoTimer);
  demoTimer = 0;
  demoStep = 0;
  demoButton.setAttribute("aria-pressed", "false");
}

function setParallax(x, y, following = false) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const now = performance.now();
  if (now - lastParallaxFrame < 25) return;
  lastParallaxFrame = now;
  const safeX = Math.max(-1, Math.min(1, x));
  const safeY = Math.max(-1, Math.min(1, y));
  scene.classList.toggle("is-following", following);
  scene.style.setProperty("--view-x", `${(safeX * 4.2).toFixed(2)}px`);
  scene.style.setProperty("--view-y", `${(safeY * 3.2).toFixed(2)}px`);
  scene.style.setProperty("--ground-x", `${(safeX * 1.5).toFixed(2)}px`);
  scene.style.setProperty("--ground-y", `${(safeY * 1.1).toFixed(2)}px`);
  scene.style.setProperty("--sheen-x", `${(safeX * 28).toFixed(2)}px`);
  scene.style.setProperty("--sheen-y", `${(safeY * 20).toFixed(2)}px`);
}

async function toggleTilt() {
  if (gyroEnabled) {
    gyroEnabled = false;
    window.clearTimeout(gyroProbeTimer);
    tiltButton.setAttribute("aria-pressed", "false");
    tiltLabel.textContent = "move to peek";
    if (orientationListener) window.removeEventListener("deviceorientation", orientationListener);
    orientationListener = null;
    setParallax(0, 0);
    return;
  }
  try {
    if (typeof window.DeviceOrientationEvent?.requestPermission === "function") {
      const permission = await window.DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") throw new Error("permission denied");
    }
    if (!("DeviceOrientationEvent" in window)) throw new Error("unsupported");
    let sensorSeen = false;
    orientationListener = (event) => {
      if (!Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
      sensorSeen = true;
      window.clearTimeout(gyroProbeTimer);
      setParallax(event.gamma / 18, event.beta / 26, true);
    };
    window.addEventListener("deviceorientation", orientationListener, { passive: true });
    gyroEnabled = true;
    tiltButton.setAttribute("aria-pressed", "true");
    tiltLabel.textContent = "sensor is live";
    showToast("Tilt gently · controls stay in place");
    gyroProbeTimer = window.setTimeout(() => {
      if (sensorSeen || !gyroEnabled) return;
      gyroEnabled = false;
      window.removeEventListener("deviceorientation", orientationListener);
      orientationListener = null;
      tiltButton.setAttribute("aria-pressed", "false");
      tiltLabel.textContent = "touch parallax";
      showToast("No motion sensor · touch parallax is active");
    }, 1200);
  } catch {
    tiltLabel.textContent = "touch parallax";
    showToast("Tilt unavailable · touch parallax is active");
  }
}

function meterFrame(time = 0) {
  const interval = lowPower ? 50 : 32;
  if (time - lastMeterFrame < interval) {
    requestAnimationFrame(meterFrame);
    return;
  }
  lastMeterFrame = time;
  meterEnergy *= .9;
  if (meterEnergy > .001) {
    meterBars.forEach((bar, index) => {
      const threshold = index / meterBars.length;
      const level = Math.max(0, Math.min(1, (meterEnergy - threshold) * 2.7));
      bar.style.setProperty("--meter", level.toFixed(3));
    });
  } else if (meterEnergy !== 0) {
    meterEnergy = 0;
    meterBars.forEach((bar) => bar.style.setProperty("--meter", "0"));
  }
  requestAnimationFrame(meterFrame);
}

objectLayer.addEventListener("pointerdown", handlePointerDown);
objectLayer.addEventListener("pointermove", handlePointerMove);
objectLayer.addEventListener("pointerup", (event) => {
  const state = pointerStates.get(event.pointerId);
  if (state) endPointer(state.node, event);
});
objectLayer.addEventListener("pointercancel", (event) => {
  const state = pointerStates.get(event.pointerId);
  if (state) endPointer(state.node, event, true);
});
objectLayer.addEventListener("keydown", handleKeyboard);

editToggle.addEventListener("click", () => setEditMode(!editMode));
demoButton.addEventListener("click", () => demoTimer ? stopDemo() : startDemo());
tiltButton.addEventListener("click", toggleTilt);
document.querySelector("[data-picker-close]").addEventListener("click", closePicker);
document.querySelector("[data-reset-layout]").addEventListener("click", () => {
  layout = createInitialCloudLabLayout();
  saveLayout();
  closePicker();
  renderLayout();
  setEditMode(false, false);
  showToast("Cloud Lab starter set restored");
});
pickerGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-instrument-choice]");
  if (card && !card.disabled) chooseInstrument(card.dataset.instrumentChoice);
});
picker.addEventListener("click", (event) => {
  if (event.target !== picker) return;
  const rect = picker.getBoundingClientRect();
  if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right) closePicker();
});
picker.addEventListener("cancel", (event) => { event.preventDefault(); closePicker(); });

stage.addEventListener("pointermove", (event) => {
  if (gyroEnabled) return;
  const rect = stage.getBoundingClientRect();
  setParallax(((event.clientX - rect.left) / rect.width - .5) * 2, ((event.clientY - rect.top) / rect.height - .5) * 2, true);
}, { passive: true });
stage.addEventListener("pointerleave", () => { if (!gyroEnabled) setParallax(0, 0); });
stage.addEventListener("pointerup", (event) => { if (!gyroEnabled && event.pointerType === "touch") setParallax(0, 0); }, { passive: true });

document.addEventListener("keydown", (event) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || event.repeat) return;
  if (picker.open) return;
  const index = Number(event.key) - 1;
  const node = index >= 0 ? objectLayer.children[index] : null;
  if (node) {
    event.preventDefault();
    node.focus();
    triggerOneShot(node, .85, { midi: 55 + index * 3 });
  }
  if (event.key === "Escape" && editMode && !picker.open) setEditMode(false);
  if (event.key.toLowerCase() === "e") setEditMode(!editMode);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopDemo();
    audio.stopContinuous();
    pointerStates.clear();
  }
});
window.addEventListener("pagehide", () => void audio.dispose(), { once: true });

renderLayout();
requestAnimationFrame(meterFrame);
const prepareAudio = () => {
  try { audio.prepare?.(); } catch { /* Gesture-time unlock remains the fallback. */ }
};
if (typeof requestIdleCallback === "function") requestIdleCallback(prepareAudio, { timeout: 320 });
else window.setTimeout(prepareAudio, 80);
