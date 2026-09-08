import { AudioEngine } from "./audio-engine.js?v=5";
import { EventBus } from "./event-bus.js";
import { TRACKS, PRESETS, createProject, applyPreset, saveProject, loadProject } from "./project-store.js";
import { analyzeVideo } from "./video-remix.js?v=9";

const flags = { videoRemix: true, quickLoop: false };
const bus = new EventBus();
const audio = new AudioEngine(bus);
const app = document.querySelector("[data-app]");
const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4;
app.dataset.quality = lowPower ? "low" : "high";
const screens = [...document.querySelectorAll("[data-screen]")];
const toast = document.querySelector("[data-toast]");
const playButton = document.querySelector("[data-play]");
const position = document.querySelector("[data-position]");
const projectName = document.querySelector("[data-project-name]");
const bpmInput = document.querySelector("[data-bpm]");
const saveState = document.querySelector("[data-save-state]");
const stepGrid = document.querySelector("[data-step-grid]");
const patternTabs = document.querySelector("[data-pattern-tabs]");
const presetGrid = document.querySelector("[data-preset-grid]");
const cloudStage = document.querySelector(".cloud-stage");
const cloudField = document.querySelector("[data-cloud-field]");
const cloudGlow = document.querySelector("[data-cloud-glow]");
const particles = document.querySelector("[data-particles]");
const videoDrop = document.querySelector("[data-video-drop]");
const videoInput = document.querySelector("[data-video-input]");
const videoAnalysis = document.querySelector("[data-video-analysis]");
const videoPreview = document.querySelector("[data-video-preview]");
const analysisLabel = document.querySelector("[data-analysis-label]");
const analysisPercent = document.querySelector("[data-analysis-percent]");
const analysisProgress = document.querySelector("[data-analysis-progress]");
const remixResult = document.querySelector("[data-remix-result]");
const livePads = [...document.querySelectorAll("[data-live-pad]")];
const padEnergy = new Map(TRACKS.map((track) => [track.id, 0]));
let project = loadProject();
let currentStep = 0;
let toastTimer;
let saveTimer;
let lastFrame = performance.now();
let pendingRemix = null;
let previewUrl = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1900);
}

function showScreen(name) {
  screens.forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
  app.dataset.view = name;
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function renderPresetCards() {
  presetGrid.innerHTML = Object.entries(PRESETS).map(([id, preset]) => `
    <button class="preset-card" type="button" data-preset="${id}">
      <span class="mini-pattern" aria-hidden="true">
        ${preset.patterns.kick.map((value) => `<i class="${value ? "on" : ""}"></i>`).join("")}
      </span>
      <b>${preset.name}</b>
      <small>${preset.note}<br>${preset.bpm} bpm</small>
    </button>
  `).join("");
}

function renderPatternTabs() {
  patternTabs.innerHTML = Object.entries(PRESETS).map(([id, preset]) => `
    <button class="pattern-tab ${project?.presetId === id ? "is-active" : ""}" type="button" data-pattern="${id}">${preset.name}</button>
  `).join("");
}

function renderSteps() {
  if (!project) return;
  stepGrid.innerHTML = project.tracks.map((track) => `
    <span class="step-label" style="--track-color:${track.color}"><i></i>${track.name}</span>
    ${track.pattern.map((velocity, step) => `
      <button
        class="step ${velocity ? "is-on" : ""} ${step === currentStep ? "is-current" : ""}"
        type="button"
        data-track="${track.id}"
        data-step="${step}"
        style="--track-color:${track.color};--velocity:${velocity || 0}"
        aria-label="${track.name} step ${step + 1}"
        aria-pressed="${Boolean(velocity)}"
      ></button>
    `).join("")}
    <button class="mute ${track.mute ? "is-muted" : ""}" type="button" data-mute="${track.id}" aria-label="Mute ${track.name}">M</button>
  `).join("");
}

function renderProject() {
  if (!project) return;
  projectName.value = project.name;
  bpmInput.value = project.bpm;
  renderPatternTabs();
  renderSteps();
  audio.setProject(project);
  cloudStage.style.setProperty("--video-color", project.videoAnalysis?.dominantColor || "#777a70");
}

async function startProject(nextProject, autoPlay = true) {
  project = nextProject;
  renderProject();
  showScreen("build");
  if (autoPlay) {
    await audio.play();
    playButton.classList.add("is-playing");
    playButton.setAttribute("aria-label", "Pause track");
  }
}

function commitProject(message = "Saved locally") {
  if (!project) return;
  project = saveProject(project);
  audio.setProject(project);
  saveState.textContent = "Saved just now";
  showToast(message);
}

function scheduleSave() {
  saveState.textContent = "Unsaved changes";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => commitProject("Autosaved locally"), 900);
}

document.querySelector("[data-entry='build']").addEventListener("click", () => {
  if (project) startProject(project, true);
  else showScreen("presets");
});

document.querySelector("[data-entry='video']").addEventListener("click", () => {
  if (flags.videoRemix) showScreen("video");
  else showToast("Video Remix is behind a feature flag");
});

document.querySelector("[data-entry='loop']").addEventListener("click", () => {
  showToast(flags.quickLoop ? "Opening Quick Loop" : "Quick Loop is behind a feature flag");
});

function setAnalysisProgress(value, label) {
  const progress = Math.max(0, Math.min(1, value));
  analysisProgress.style.setProperty("--progress", progress.toFixed(3));
  analysisLabel.textContent = label;
  analysisPercent.textContent = `${Math.round(progress * 100)}%`;
  const activeIndex = progress < 0.46 ? 0 : progress < 0.7 ? 1 : progress < 0.9 ? 2 : 3;
  document.querySelectorAll("[data-analysis-step]").forEach((step, index) => step.classList.toggle("is-active", index <= activeIndex));
}

function resetVideoRemix() {
  pendingRemix = null;
  videoInput.value = "";
  videoDrop.hidden = false;
  videoAnalysis.hidden = true;
  remixResult.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  videoPreview.removeAttribute("src");
  videoPreview.load();
  setAnalysisProgress(0, "Opening video");
}

async function processVideo(file) {
  if (!file) return;
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
  if (!isVideo) return showToast("Choose a video file");
  if (file.size > 700 * 1024 * 1024) return showToast("Use a video smaller than 700 MB");
  videoDrop.hidden = true;
  remixResult.hidden = true;
  videoAnalysis.hidden = false;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  videoPreview.src = previewUrl;
  videoPreview.load();

  try {
    const result = await analyzeVideo(file, setAnalysisProgress);
    URL.revokeObjectURL(result.previewUrl);
    pendingRemix = result.project;
    const metrics = pendingRemix.videoAnalysis;
    document.querySelector("[data-result-name]").textContent = pendingRemix.name;
    document.querySelector("[data-result-summary]").textContent =
      `${pendingRemix.bpm} BPM · ${metrics.cuts} cut accents · ${Math.round(metrics.motion * 100)}% motion · ${metrics.audioDecoded ? "audio transients mapped" : "visual rhythm fallback"}`;
    document.querySelector("[data-result-color]").style.setProperty("--result-color", metrics.dominantColor);
    videoAnalysis.hidden = true;
    remixResult.hidden = false;
  } catch (error) {
    resetVideoRemix();
    showToast(error.message || "Could not analyze this video");
  }
}

videoInput.addEventListener("change", () => processVideo(videoInput.files[0]));
["dragenter", "dragover"].forEach((type) => videoDrop.addEventListener(type, (event) => {
  event.preventDefault();
  videoDrop.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach((type) => videoDrop.addEventListener(type, (event) => {
  event.preventDefault();
  videoDrop.classList.remove("is-dragging");
}));
videoDrop.addEventListener("drop", (event) => processVideo(event.dataTransfer.files[0]));
document.querySelector("[data-new-video]").addEventListener("click", resetVideoRemix);
document.querySelector("[data-open-remix]").addEventListener("click", async () => {
  if (!pendingRemix) return;
  await startProject(pendingRemix, true);
  commitProject("Video remix saved locally");
});

document.querySelectorAll("[data-home],[data-back-home]").forEach((button) => {
  button.addEventListener("click", () => {
    audio.pause();
    playButton.classList.remove("is-playing");
    showScreen("home");
  });
});

presetGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset]");
  if (!button) return;
  startProject(createProject(button.dataset.preset), true);
});

patternTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pattern]");
  if (!button || !project) return;
  project = applyPreset(project, button.dataset.pattern);
  renderProject();
  showToast(`${PRESETS[button.dataset.pattern].name} queued live`);
  scheduleSave();
});

playButton.addEventListener("click", async () => {
  if (audio.playing) {
    audio.pause();
    playButton.classList.remove("is-playing");
    playButton.setAttribute("aria-label", "Play track");
  } else {
    await audio.play();
    playButton.classList.add("is-playing");
    playButton.setAttribute("aria-label", "Pause track");
  }
});

document.querySelector("[data-save]").addEventListener("click", () => commitProject());

projectName.addEventListener("input", () => {
  project.name = projectName.value || "Untitled sketch";
  scheduleSave();
});

bpmInput.addEventListener("change", () => {
  project.bpm = Math.max(60, Math.min(180, Number(bpmInput.value) || 112));
  bpmInput.value = project.bpm;
  audio.setProject(project);
  scheduleSave();
});

stepGrid.addEventListener("click", (event) => {
  const stepButton = event.target.closest("[data-step]");
  const muteButton = event.target.closest("[data-mute]");
  if (stepButton) {
    const track = project.tracks.find((item) => item.id === stepButton.dataset.track);
    const index = Number(stepButton.dataset.step);
    track.pattern[index] = track.pattern[index] ? 0 : 0.85;
    audio.setProject(project);
    renderSteps();
    scheduleSave();
  }
  if (muteButton) {
    const track = project.tracks.find((item) => item.id === muteButton.dataset.mute);
    track.mute = !track.mute;
    audio.setProject(project);
    renderSteps();
    scheduleSave();
  }
});

async function triggerPad(trackId) {
  await audio.trigger(trackId, 1);
}

livePads.forEach((pad) => {
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    triggerPad(pad.dataset.livePad);
  });
});

const keyMap = { KeyA: "kick", KeyS: "snare", KeyD: "hat", KeyF: "bass" };
const heldKeys = new Set();
document.addEventListener("keydown", (event) => {
  const trackId = keyMap[event.code];
  if (!trackId || heldKeys.has(event.code) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  event.preventDefault();
  heldKeys.add(event.code);
  triggerPad(trackId);
});
document.addEventListener("keyup", (event) => heldKeys.delete(event.code));

bus.on("transport", ({ playing }) => {
  playButton.classList.toggle("is-playing", playing);
});

bus.on("step", ({ step }) => {
  currentStep = step;
  position.textContent = `${String(Math.floor(step / 4) + 1).padStart(2, "0")} / ${String(step % 4 + 1).padStart(2, "0")}`;
  document.querySelectorAll(".step.is-current").forEach((item) => item.classList.remove("is-current"));
  document.querySelectorAll(`[data-step="${step}"]`).forEach((item) => item.classList.add("is-current"));
});

bus.on("hit", ({ trackId, velocity }) => {
  const pad = document.querySelector(`[data-live-pad="${trackId}"]`);
  const color = TRACKS.find((track) => track.id === trackId).color;
  padEnergy.set(trackId, Math.min(1.5, padEnergy.get(trackId) + velocity));
  pad.classList.remove("is-hit");
  void pad.offsetWidth;
  pad.classList.add("is-hit");
  cloudStage.style.setProperty("--hit-color", color);
  cloudStage.style.setProperty("--gx", pad.style.getPropertyValue("--x"));
  cloudStage.style.setProperty("--gy", pad.style.getPropertyValue("--y"));
  if (trackId === "hat" && app.dataset.quality !== "low" && !matchMedia("(prefers-reduced-motion: reduce)").matches) makeParticles(pad, color);
});

function makeParticles(pad, color) {
  const stageRect = cloudStage.getBoundingClientRect();
  const padRect = pad.getBoundingClientRect();
  const x = ((padRect.left + padRect.width / 2 - stageRect.left) / stageRect.width) * 100;
  const y = ((padRect.top + padRect.height / 2 - stageRect.top) / stageRect.height) * 100;
  for (let index = 0; index < 7; index += 1) {
    const particle = document.createElement("i");
    particle.style.cssText = `--px:${x}%;--py:${y}%;--pc:${color};--dx:${(Math.random()-.5)*74}px;--dy:${-18-Math.random()*55}px`;
    particles.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

document.querySelector("[data-export]").addEventListener("click", async () => {
  if (!project) return showToast("Start a track before exporting");
  showToast("Rendering two bars…");
  const blob = await audio.renderWav(project, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "pocket-jam-loop"}.wav`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("WAV ready");
});

function visualFrame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  let combined = 0;
  livePads.forEach((pad, index) => {
    const id = pad.dataset.livePad;
    const energy = Math.max(0, padEnergy.get(id) - dt * (id === "bass" ? 1.1 : id === "kick" ? 2.4 : 4.6));
    padEnergy.set(id, energy);
    combined += energy;
    pad.style.setProperty("--energy", Math.min(1, energy).toFixed(3));
    const idleAmount = app.dataset.quality === "low" || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3;
    pad.style.setProperty("--float", (Math.sin(now * 0.00065 + index * 1.7) * idleAmount).toFixed(2));
  });
  const normalized = 1 - Math.exp(-combined * 0.7);
  cloudStage?.style.setProperty("--energy", normalized.toFixed(3));
  cloudField?.style.setProperty("--fx", `${50 + Math.sin(now * .0002) * 18}%`);
  cloudField?.style.setProperty("--fy", `${52 + Math.cos(now * .00017) * 12}%`);
  requestAnimationFrame(visualFrame);
}

renderPresetCards();
if (project) {
  const buildCta = document.querySelector("[data-entry='build'] .entry-cta");
  buildCta.innerHTML = "Resume saved sketch <i>↗</i>";
  saveState.textContent = "Saved project found";
}
requestAnimationFrame(visualFrame);
