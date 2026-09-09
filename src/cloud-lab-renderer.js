import { getInstrumentDefinition, resolveInstrumentRenderer } from "./cloud-lab-instruments.js";

let glbModelAdapter = null;

/**
 * Register one shared adapter that returns an Element immediately and may load
 * its GLB asynchronously inside that element. Passing null restores the
 * dependency-free procedural fallback.
 */
export function registerGLBModelAdapter(adapter) {
  if (adapter !== null && typeof adapter !== "function") throw new TypeError("GLB model adapter must be a function or null");
  glbModelAdapter = adapter;
  return () => { if (glbModelAdapter === adapter) glbModelAdapter = null; };
}

// Visual placement is independent from logical Bento coordinates. The latter
// governs compatibility; these art-directed anchors give the diorama rhythm.
export const SLOT_PRESENTATION = Object.freeze({
  "kick-slot": { x: "23%", y: "27%", w: "clamp(86px, 28vw, 116px)", h: "clamp(88px, 29vw, 120px)", depth: 3 },
  "snare-slot": { x: "55%", y: "21%", w: "clamp(76px, 24vw, 102px)", h: "clamp(78px, 25vw, 105px)", depth: 2 },
  "hat-slot": { x: "80%", y: "31%", w: "clamp(70px, 22vw, 94px)", h: "clamp(78px, 24vw, 102px)", depth: 4 },
  "bass-slot": { x: "20%", y: "55%", w: "clamp(83px, 25vw, 110px)", h: "clamp(132px, 39vw, 164px)", depth: 6 },
  "synth-slot": { x: "67%", y: "53%", w: "clamp(138px, 43vw, 185px)", h: "clamp(86px, 27vw, 116px)", depth: 7 },
  "reverb-slot": { x: "53%", y: "79%", w: "clamp(164px, 52vw, 218px)", h: "clamp(104px, 33vw, 140px)", depth: 9 },
});

function repeated(tag, count, className = "") {
  return Array.from({ length: count }, () => `<${tag}${className ? ` class="${className}"` : ""}></${tag}>`).join("");
}

export function getModelMarkup(builder) {
  const builders = {
    "inflated-drum": `
      <span class="foot foot--l"></span><span class="foot foot--r"></span>
      <span class="kick-shell"></span>`,
    "thunder-puff": `
      ${repeated("span", 5, "puff")}<span class="bolt"></span>`,
    "floating-cymbals": `
      <span class="hat-stem"></span><span class="plate plate--bottom"></span>
      <span class="plate plate--top"></span><span class="cap"></span>`,
    "puffy-bass-column": `
      <span class="bass-lobe bass-lobe--a"></span><span class="bass-lobe bass-lobe--b"></span>
      <span class="bass-body"></span><span class="bass-ribbon"><i></i></span>`,
    "inflated-keybed": `
      <span class="key-body"></span><span class="key-row">${repeated("i", 7)}</span>`,
    "deformable-cloud": `
      ${repeated("span", 5, "reverb-lobe")}<span class="reverb-ring"></span><span class="reverb-core"></span>`,
    "satellite-keyboard": `
      <span class="antenna"></span><span class="dish"></span><span class="orbit-body"></span>
      <span class="orbit-panel">${repeated("i", 6)}</span>`,
    "industrial-bass-rail": `
      <span class="cyber-body"></span><span class="cyber-coil"></span>
      <span class="cyber-rail"><i></i></span>${[1, 2, 3, 4].map((number) => `<span class="bolt b${number}"></span>`).join("")}`,
  };
  return builders[builder] || `<span class="unsupported-model" aria-hidden="true">?</span>`;
}

export function createModelNode(instrument, { modelOverrides = {} } = {}) {
  const requestedRenderer = resolveInstrumentRenderer(instrument.id, modelOverrides);
  if (requestedRenderer?.type === "glb" && glbModelAdapter) {
    try {
      const externalModel = glbModelAdapter({ instrument, descriptor: requestedRenderer });
      if (externalModel instanceof Element) {
        externalModel.classList.add("instrument-model", "model-glb");
        externalModel.dataset.renderer = "glb";
        externalModel.dataset.glbUri = requestedRenderer.uri || "";
        externalModel.setAttribute("aria-hidden", "true");
        return externalModel;
      }
    } catch {
      // A failed model never removes the musical control; procedural art stays live.
    }
  }

  const renderer = resolveInstrumentRenderer(instrument.id);
  const model = document.createElement("span");
  model.className = `instrument-model model-${renderer.builder || "unsupported"}`;
  model.dataset.renderer = renderer.type;
  model.setAttribute("aria-hidden", "true");
  model.innerHTML = getModelMarkup(renderer.builder);
  return model;
}

export function createInstrumentNode(slot, { spawning = false, modelOverrides = {} } = {}) {
  const instrument = getInstrumentDefinition(slot.instrumentId);
  const placement = SLOT_PRESENTATION[slot.id] || SLOT_PRESENTATION["kick-slot"];
  const node = document.createElement("button");
  node.type = "button";
  node.className = `instrument${spawning ? " is-spawning" : ""}`;
  node.dataset.slotId = slot.id;
  node.dataset.instrumentId = instrument.id;
  node.dataset.interaction = instrument.interactionType;
  node.dataset.world = instrument.world;
  node.dataset.sound = instrument.sound.voice;
  node.style.cssText = `--x:${placement.x};--y:${placement.y};--w:${placement.w};--h:${placement.h};--depth:${placement.depth};--accent:${instrument.accent};`;
  node.setAttribute("aria-label", `${interactionVerb(instrument.interactionType)} ${instrument.name}. ${instrument.description}`);
  node.setAttribute("aria-keyshortcuts", String(Object.keys(SLOT_PRESENTATION).indexOf(slot.id) + 1));
  node.append(createModelNode(instrument, { modelOverrides }));
  node.insertAdjacentHTML("beforeend", `
    <span class="instrument-name"><i></i>${instrument.name}</span>
    <span class="edit-badge" aria-hidden="true">+</span>`);
  return node;
}

export function createPickerCard(instrument, { current = false, compatible = true } = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `picker-card${current ? " is-current" : ""}`;
  card.dataset.instrumentChoice = instrument.id;
  card.dataset.world = instrument.world;
  card.disabled = !compatible;
  card.setAttribute("aria-label", compatible
    ? `${current ? "Current object: " : "Choose "}${instrument.name}, ${instrument.world} world, ${instrument.category}`
    : `${instrument.name} requires a ${instrument.layoutSize} space`);
  const preview = document.createElement("span");
  preview.className = "picker-preview";
  preview.setAttribute("aria-hidden", "true");
  preview.append(createModelNode(instrument));
  card.append(preview);
  card.insertAdjacentHTML("beforeend", `
    <span class="picker-copy">
      <span class="world-chip">${instrument.world}</span>
      <b>${instrument.name}</b>
      <small>${instrument.category} · ${compatible ? instrument.interactionType : `needs ${instrument.layoutSize}`}</small>
    </span>`);
  return card;
}

export function setGestureVisual(node, x, y, noteIndex = null) {
  const safeX = Math.max(0, Math.min(1, x));
  const safeY = Math.max(0, Math.min(1, y));
  node.style.setProperty("--control-x", `${(safeX * 72 + 14).toFixed(1)}%`);
  node.style.setProperty("--control-y", `${(safeY * 72 + 14).toFixed(1)}%`);
  if (noteIndex === null) return;
  node.querySelectorAll(".key-row i,.orbit-panel i").forEach((key, index) => key.classList.toggle("is-key", index === noteIndex));
}

export function clearGestureVisual(node) {
  node.querySelectorAll(".is-key").forEach((key) => key.classList.remove("is-key"));
}

function interactionVerb(type) {
  if (type === "hit") return "Tap to play";
  if (type === "xy") return "Drag to shape";
  if (type === "notes") return "Drag across notes on";
  return "Drag to control";
}

// Export name intentionally stable for future camera/layout debug tooling.
export const SLOT_THEMES = SLOT_PRESENTATION;
