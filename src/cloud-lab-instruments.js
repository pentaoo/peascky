/**
 * Declarative instrument catalogue for the Cloud Lab spatial prototype.
 *
 * This module deliberately has no DOM, Web Audio, or renderer dependencies.
 * Runtime layers consume the descriptors and decide how to render, animate,
 * interact with, and sonify an instrument. A procedural model can therefore be
 * replaced by a GLB asset without changing layout or musical state.
 */

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

export const INTERACTION_TYPES = deepFreeze({
  HIT: "hit",
  HOLD: "hold",
  KNOB: "knob",
  SLIDER: "slider",
  XY: "xy",
  NOTES: "notes",
  SEQUENCER: "sequencer",
});

export const LAYOUT_SIZES = deepFreeze({
  "1x1": { columns: 1, rows: 1 },
  "1x2": { columns: 1, rows: 2 },
  "2x1": { columns: 2, rows: 1 },
  "2x2": { columns: 2, rows: 2 },
});

export const WORLD_DEFINITIONS = deepFreeze({
  cloud: {
    id: "cloud",
    name: "Cloud World",
    palette: ["#f8fbff", "#bcecff", "#a993ff", "#ff9ed2"],
    materialLanguage: "Puffed pearl plastic, translucent membranes and soft rubber",
    motionLanguage: "Breathing, inflating and gently overshooting",
  },
  orbit: {
    id: "orbit",
    name: "Orbit World",
    palette: ["#dce8ee", "#354253", "#84f8ff", "#ffca6e"],
    materialLanguage: "Brushed alloy, dark spacecraft panels and emissive glass",
    motionLanguage: "Precise servos with low-gravity secondary motion",
  },
  cyber: {
    id: "cyber",
    name: "Cyber World",
    palette: ["#242230", "#5e6073", "#cbff45", "#ff4e8b"],
    materialLanguage: "Dark industrial polymer, exposed metal and acid light",
    motionLanguage: "Mechanical snaps, tension and controlled vibration",
  },
});

export const MATERIAL_PRESETS = deepFreeze({
  cloudPearl: {
    color: "#f8fbff",
    roughness: 0.3,
    metalness: 0.02,
    clearcoat: 0.72,
    clearcoatRoughness: 0.2,
  },
  cloudBlue: {
    color: "#bcecff",
    roughness: 0.38,
    metalness: 0,
    transmission: 0.12,
  },
  cloudLilac: {
    color: "#a993ff",
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.5,
  },
  cloudPink: {
    color: "#ff9ed2",
    roughness: 0.36,
    metalness: 0,
    clearcoat: 0.45,
  },
  cloudMembrane: {
    color: "#e9fbff",
    roughness: 0.2,
    metalness: 0,
    transmission: 0.42,
    thickness: 0.35,
  },
  cloudShadow: {
    color: "#766f9f",
    roughness: 0.62,
    metalness: 0,
  },
  orbitAlloy: {
    color: "#b8c7d0",
    roughness: 0.24,
    metalness: 0.86,
  },
  orbitPanel: {
    color: "#313b4d",
    roughness: 0.5,
    metalness: 0.38,
  },
  orbitGlow: {
    color: "#84f8ff",
    emissive: "#36ddea",
    emissiveIntensity: 1.8,
    roughness: 0.12,
  },
  cyberShell: {
    color: "#25232e",
    roughness: 0.58,
    metalness: 0.34,
  },
  cyberMetal: {
    color: "#77798a",
    roughness: 0.3,
    metalness: 0.82,
  },
  cyberAcid: {
    color: "#cbff45",
    emissive: "#8bd600",
    emissiveIntensity: 1.5,
    roughness: 0.2,
  },
});

export const ANIMATION_PROFILES = deepFreeze({
  "cloud-kick-hit": {
    idle: { type: "breathe", amplitude: 0.012, durationMs: 2600 },
    trigger: { type: "compress", axis: "z", amount: 0.24, attackMs: 24, releaseMs: 260, overshoot: 0.12 },
    spawn: { type: "inflate", durationMs: 520, overshoot: 0.16 },
  },
  "cloud-thunder-pop": {
    idle: { type: "drift", amplitude: 0.026, durationMs: 3200 },
    trigger: { type: "squash-flash", amount: 0.18, attackMs: 18, releaseMs: 230, secondaryJiggle: 0.1 },
    spawn: { type: "puff-in", durationMs: 460, overshoot: 0.13 },
  },
  "cloud-hat-clap": {
    idle: { type: "hover-gap", amplitude: 0.018, durationMs: 2100 },
    trigger: { type: "clap", travel: 0.2, attackMs: 12, releaseMs: 145, vibration: 0.07 },
    spawn: { type: "unfold", durationMs: 430, overshoot: 0.08 },
  },
  "cloud-slider-squish": {
    idle: { type: "breathe", amplitude: 0.009, durationMs: 2800 },
    trigger: { type: "squish-follow", amount: 0.1, attackMs: 28, releaseMs: 190, lag: 0.14 },
    spawn: { type: "inflate", durationMs: 560, overshoot: 0.14 },
  },
  "cloud-keys-press": {
    idle: { type: "float-keys", amplitude: 0.014, durationMs: 2500 },
    trigger: { type: "key-press", travel: 0.12, attackMs: 14, releaseMs: 120, bodyRecoil: 0.035 },
    spawn: { type: "keys-rise", durationMs: 510, staggerMs: 35 },
  },
  "cloud-xy-deform": {
    idle: { type: "billow", amplitude: 0.02, durationMs: 3000 },
    trigger: { type: "surface-pull", depth: 0.2, attackMs: 26, releaseMs: 310, lag: 0.18 },
    spawn: { type: "condense", durationMs: 620, overshoot: 0.1 },
  },
  "orbit-servo": {
    idle: { type: "orbital-scan", amplitude: 0.035, durationMs: 3400 },
    trigger: { type: "servo-tilt", amount: 0.16, attackMs: 20, releaseMs: 180, antennaSpring: 0.22 },
    spawn: { type: "soft-landing", durationMs: 580, bounce: 0.12 },
  },
  "cyber-fader": {
    idle: { type: "signal-pulse", amplitude: 0.04, durationMs: 1800 },
    trigger: { type: "rail-tension", amount: 0.1, attackMs: 16, releaseMs: 150, vibration: 0.04 },
    spawn: { type: "mechanical-assemble", durationMs: 500, staggerMs: 45 },
  },
});

const parameter = (id, label, config) => ({ id, label, ...config });

const renderer = (builder, config = {}) => ({
  strategy: "procedural",
  procedural: {
    builder,
    version: 1,
    ...config.procedural,
  },
  glb: {
    uri: null,
    sceneNode: config.sceneNode || null,
    scale: config.scale || 1,
    rotation: config.rotation || [0, 0, 0],
    anchor: config.anchor || [0, 0, 0],
  },
  bounds: config.bounds || [1, 1, 1],
  hitArea: config.hitArea || { shape: "box", padding: 0.16 },
  detailBudget: config.detailBudget || "medium",
});

const definitions = [
  {
    id: "cloud-kick",
    name: "Cloud Kick",
    world: "cloud",
    category: "drums",
    layoutSize: "1x1",
    interactionType: INTERACTION_TYPES.HIT,
    interactionModes: [INTERACTION_TYPES.HIT],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cloud-kick",
      polyphony: 4,
      outputGain: 0.86,
      sample: { uri: null, chokeGroup: null },
      synthesis: { oscillator: "sine", pitchStartHz: 142, pitchEndHz: 45, pitchDropMs: 92 },
    },
    renderer: renderer("inflated-drum", {
      sceneNode: "CloudKick",
      bounds: [0.92, 0.82, 0.8],
      hitArea: { shape: "cylinder", target: "membrane", padding: 0.24 },
      procedural: { silhouette: "drop", membrane: true, feet: 3 },
    }),
    materials: ["cloudPearl", "cloudMembrane", "cloudShadow"],
    animationProfile: "cloud-kick-hit",
    parameters: [
      parameter("tone", "Tone", { min: 0, max: 1, default: 0.48, curve: "linear", audioTarget: "pitchEnd" }),
      parameter("decay", "Tail", { min: 0.08, max: 0.8, default: 0.36, unit: "s", curve: "exponential", audioTarget: "ampDecay" }),
      parameter("punch", "Puff", { min: 0, max: 1, default: 0.72, curve: "linear", audioTarget: "transient" }),
    ],
    accent: "#8eeaff",
    description: "A pillowy bass drum whose translucent face caves in under every tap.",
  },
  {
    id: "cloud-snare",
    name: "Cloud Snare",
    world: "cloud",
    category: "drums",
    layoutSize: "1x1",
    interactionType: INTERACTION_TYPES.HIT,
    interactionModes: [INTERACTION_TYPES.HIT],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cloud-snare",
      polyphony: 5,
      outputGain: 0.64,
      sample: { uri: null, chokeGroup: null },
      synthesis: { noise: "pink", bandpassHz: 1760, bodyHz: 184, snapMs: 155 },
    },
    renderer: renderer("thunder-puff", {
      sceneNode: "CloudSnare",
      bounds: [0.9, 0.76, 0.76],
      hitArea: { shape: "sphere", target: "cloud-body", padding: 0.25 },
      procedural: { lobes: 5, lightningBolt: true, suspended: true },
    }),
    materials: ["cloudBlue", "cloudLilac", "cloudPearl"],
    animationProfile: "cloud-thunder-pop",
    parameters: [
      parameter("snap", "Snap", { min: 0, max: 1, default: 0.66, curve: "linear", audioTarget: "noiseGain" }),
      parameter("body", "Body", { min: 120, max: 280, default: 184, unit: "Hz", curve: "exponential", audioTarget: "bodyFrequency" }),
      parameter("air", "Air", { min: 0, max: 1, default: 0.42, curve: "linear", audioTarget: "highShelf" }),
    ],
    accent: "#aa95ff",
    description: "A pocket thundercloud that flashes, squashes and cracks with a soft-edged snap.",
  },
  {
    id: "cloud-hat",
    name: "Cloud Hat",
    world: "cloud",
    category: "drums",
    layoutSize: "1x1",
    interactionType: INTERACTION_TYPES.HIT,
    interactionModes: [INTERACTION_TYPES.HIT, INTERACTION_TYPES.HOLD],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cloud-hat",
      polyphony: 6,
      outputGain: 0.38,
      sample: { uri: null, chokeGroup: "cloud-hats" },
      synthesis: { noise: "white", highpassHz: 5900, closedDecayMs: 68, openDecayMs: 410 },
    },
    renderer: renderer("floating-cymbals", {
      sceneNode: "CloudHat",
      bounds: [0.86, 0.54, 0.86],
      hitArea: { shape: "cylinder", target: "upper-plate", padding: 0.28 },
      procedural: { plates: 2, inflatedRims: true, centerStem: true },
    }),
    materials: ["cloudPearl", "cloudBlue", "cloudPink"],
    animationProfile: "cloud-hat-clap",
    parameters: [
      parameter("open", "Open", { min: 0, max: 1, default: 0.08, curve: "linear", gesture: "hold", audioTarget: "decay" }),
      parameter("brightness", "Shimmer", { min: 0, max: 1, default: 0.7, curve: "linear", audioTarget: "highpass" }),
    ],
    accent: "#ffb3dc",
    description: "Two weightless air-plates clap together, then shimmer apart when held.",
  },
  {
    id: "cloud-bass",
    name: "Cloud Bass",
    world: "cloud",
    category: "bass",
    layoutSize: "1x2",
    interactionType: INTERACTION_TYPES.SLIDER,
    interactionModes: [INTERACTION_TYPES.SLIDER, INTERACTION_TYPES.HOLD, INTERACTION_TYPES.NOTES],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cloud-bass",
      polyphony: 1,
      outputGain: 0.58,
      sample: { uri: null, chokeGroup: null },
      synthesis: { oscillator: "rounded-saw", subOscillator: true, filter: "lowpass", glideMs: 72 },
    },
    renderer: renderer("puffy-bass-column", {
      sceneNode: "CloudBass",
      bounds: [0.92, 1.18, 0.86],
      hitArea: { shape: "box", target: "vertical-ribbon", padding: 0.2 },
      procedural: { keys: 4, verticalRibbon: true, softKnob: true },
    }),
    materials: ["cloudLilac", "cloudPearl", "cloudMembrane"],
    animationProfile: "cloud-slider-squish",
    parameters: [
      parameter("note", "Note", { min: 36, max: 55, default: 43, step: 1, unit: "midi", curve: "linear", gesture: "y", audioTarget: "note" }),
      parameter("cutoff", "Softness", { min: 90, max: 1800, default: 420, unit: "Hz", curve: "exponential", gesture: "y", audioTarget: "filterFrequency" }),
      parameter("pressure", "Pressure", { min: 0, max: 1, default: 0.64, curve: "linear", gesture: "hold", audioTarget: "gain" }),
    ],
    accent: "#9f8cff",
    description: "A tall, squeezable mono synth: slide for pitch and press deeper for weight.",
  },
  {
    id: "cloud-keys",
    name: "Cloud Keys",
    world: "cloud",
    category: "melodic",
    layoutSize: "2x1",
    interactionType: INTERACTION_TYPES.NOTES,
    interactionModes: [INTERACTION_TYPES.NOTES, INTERACTION_TYPES.SLIDER],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cloud-keys",
      polyphony: 6,
      outputGain: 0.46,
      sample: { uri: null, chokeGroup: null },
      synthesis: { oscillator: "triangle-sine", unison: 3, detuneCents: 7, filter: "lowpass" },
    },
    renderer: renderer("inflated-keybed", {
      sceneNode: "CloudKeys",
      bounds: [1.5, 0.68, 0.84],
      hitArea: { shape: "key-strip", target: "keys", padding: 0.18, segments: 7 },
      procedural: { keys: 7, scale: "minor-pentatonic", ribbonEdge: true },
    }),
    materials: ["cloudPearl", "cloudPink", "cloudLilac", "cloudShadow"],
    animationProfile: "cloud-keys-press",
    parameters: [
      parameter("note", "Note", { min: 60, max: 72, default: 60, step: 1, unit: "midi", curve: "linear", gesture: "key", audioTarget: "note" }),
      parameter("glide", "Drift", { min: 0, max: 0.35, default: 0.08, unit: "s", curve: "quadratic", gesture: "x", audioTarget: "glide" }),
      parameter("brightness", "Glow", { min: 0, max: 1, default: 0.54, curve: "linear", gesture: "y", audioTarget: "filterFrequency" }),
    ],
    accent: "#ff9ed2",
    description: "Seven inflated keys for hazy chords and a ribbon edge that bends their glow.",
  },
  {
    id: "cloud-reverb",
    name: "Cloud Reverb",
    world: "cloud",
    category: "effect",
    layoutSize: "2x2",
    interactionType: INTERACTION_TYPES.XY,
    interactionModes: [INTERACTION_TYPES.XY, INTERACTION_TYPES.HOLD],
    sound: {
      type: "effect",
      engine: "procedural",
      voice: "cloud-reverb",
      polyphony: 0,
      outputGain: 1,
      routing: { input: "field", placement: "send", returnGain: 0.34 },
      synthesis: { algorithm: "filtered-feedback-network", preDelayMs: 18, decaySeconds: 3.8 },
    },
    renderer: renderer("deformable-cloud", {
      sceneNode: "CloudReverb",
      bounds: [1.58, 0.92, 1.48],
      hitArea: { shape: "plane", target: "cloud-surface", padding: 0.16 },
      detailBudget: "high",
      procedural: { lobes: 8, touchDimple: true, internalGlow: true, motes: 9 },
    }),
    materials: ["cloudBlue", "cloudMembrane", "cloudPearl", "cloudLilac"],
    animationProfile: "cloud-xy-deform",
    parameters: [
      parameter("size", "Sky", { min: 0.4, max: 0.98, default: 0.72, curve: "quadratic", gesture: "x", audioTarget: "decay" }),
      parameter("damping", "Mist", { min: 0.08, max: 0.94, default: 0.55, curve: "linear", gesture: "y", audioTarget: "damping" }),
      parameter("mix", "Wet", { min: 0, max: 0.72, default: 0.3, curve: "linear", gesture: "pressure", audioTarget: "wetGain" }),
    ],
    accent: "#b9f0ff",
    description: "Pull and knead a real cloud: horizontal travel opens space, vertical travel softens it.",
  },
  {
    id: "orbit-synth",
    name: "Orbit Synth",
    world: "orbit",
    category: "melodic",
    layoutSize: "2x1",
    interactionType: INTERACTION_TYPES.NOTES,
    interactionModes: [INTERACTION_TYPES.NOTES, INTERACTION_TYPES.KNOB],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "orbit-synth",
      polyphony: 4,
      outputGain: 0.44,
      sample: { uri: null, chokeGroup: null },
      synthesis: { oscillator: "fm", carrierRatio: 1, modulatorRatio: 2.01, modulationIndex: 2.4 },
    },
    renderer: renderer("satellite-keyboard", {
      sceneNode: "OrbitSynth",
      bounds: [1.55, 0.92, 0.86],
      hitArea: { shape: "key-strip", target: "light-panels", padding: 0.2, segments: 6 },
      detailBudget: "high",
      procedural: { lightPanels: 6, dish: true, antennae: 2, reactor: true },
    }),
    materials: ["orbitAlloy", "orbitPanel", "orbitGlow"],
    animationProfile: "orbit-servo",
    parameters: [
      parameter("note", "Signal", { min: 55, max: 74, default: 62, step: 1, unit: "midi", curve: "linear", gesture: "panel", audioTarget: "note" }),
      parameter("modulation", "Orbit", { min: 0.1, max: 8, default: 2.4, curve: "exponential", gesture: "knob", audioTarget: "modulationIndex" }),
      parameter("spread", "Telemetry", { min: 0, max: 1, default: 0.38, curve: "linear", gesture: "x", audioTarget: "stereoSpread" }),
    ],
    accent: "#74f4ff",
    description: "A tiny survey satellite that plays glassy FM signals from its illuminated panels.",
  },
  {
    id: "cyber-bass",
    name: "Cyber Bass",
    world: "cyber",
    category: "bass",
    layoutSize: "1x2",
    interactionType: INTERACTION_TYPES.SLIDER,
    interactionModes: [INTERACTION_TYPES.SLIDER, INTERACTION_TYPES.HOLD],
    sound: {
      type: "instrument",
      engine: "procedural",
      voice: "cyber-bass",
      polyphony: 1,
      outputGain: 0.55,
      sample: { uri: null, chokeGroup: null },
      synthesis: { oscillator: "sawtooth", subOscillator: true, filter: "ladder", drive: 0.26 },
    },
    renderer: renderer("industrial-bass-rail", {
      sceneNode: "CyberBass",
      bounds: [0.94, 1.15, 0.82],
      hitArea: { shape: "box", target: "acid-fader", padding: 0.2 },
      detailBudget: "high",
      procedural: { verticalRail: true, exposedCoil: true, bolts: 4, cable: true },
    }),
    materials: ["cyberShell", "cyberMetal", "cyberAcid"],
    animationProfile: "cyber-fader",
    parameters: [
      parameter("note", "Voltage", { min: 31, max: 50, default: 38, step: 1, unit: "midi", curve: "linear", gesture: "y", audioTarget: "note" }),
      parameter("cutoff", "Cut", { min: 70, max: 3200, default: 520, unit: "Hz", curve: "exponential", gesture: "y", audioTarget: "filterFrequency" }),
      parameter("drive", "Damage", { min: 0, max: 0.82, default: 0.26, curve: "quadratic", gesture: "hold", audioTarget: "drive" }),
    ],
    accent: "#cbff45",
    description: "A dark industrial bass rail with an acid-lit fader and a taut exposed coil.",
  },
];

export const INSTRUMENT_DEFINITIONS = deepFreeze(definitions.map((instrument) => ({
  ...instrument,
  shortDescription: instrument.description,
})));

export const INSTRUMENT_BY_ID = deepFreeze(Object.fromEntries(
  INSTRUMENT_DEFINITIONS.map((instrument) => [instrument.id, instrument]),
));

/**
 * Six physical slots, arranged on a deliberately irregular 4x4 field. The
 * empty cells are negative space rather than visible tiles. Orbit Synth ships
 * in the starter setup to demonstrate that worlds can be mixed immediately.
 */
export const INITIAL_CLOUD_LAB_LAYOUT = deepFreeze({
  id: "cloud-lab-starter",
  name: "Cloud Lab",
  columns: 4,
  rows: 4,
  slots: [
    { id: "kick-slot", instrumentId: "cloud-kick", column: 0, row: 0, layoutSize: "1x1", yaw: -0.07, elevation: 0 },
    { id: "snare-slot", instrumentId: "cloud-snare", column: 1, row: 0, layoutSize: "1x1", yaw: 0.05, elevation: 0.03 },
    { id: "hat-slot", instrumentId: "cloud-hat", column: 2, row: 0, layoutSize: "1x1", yaw: -0.04, elevation: 0.06 },
    { id: "bass-slot", instrumentId: "cloud-bass", column: 0, row: 1, layoutSize: "1x2", yaw: 0.04, elevation: 0 },
    { id: "synth-slot", instrumentId: "orbit-synth", column: 1, row: 1, layoutSize: "2x1", yaw: -0.025, elevation: 0.02 },
    { id: "reverb-slot", instrumentId: "cloud-reverb", column: 1, row: 2, layoutSize: "2x2", yaw: 0.035, elevation: 0.04 },
  ],
});

// Short aliases keep consumers terse while the explicit names remain discoverable.
export const INSTRUMENTS = INSTRUMENT_DEFINITIONS;
export const INITIAL_LAYOUT = INITIAL_CLOUD_LAB_LAYOUT;

export function getInstrumentDefinition(instrumentId) {
  return INSTRUMENT_BY_ID[instrumentId] || null;
}

export function getLayoutFootprint(layoutSize) {
  const key = typeof layoutSize === "string" ? layoutSize : layoutSize?.layoutSize;
  const footprint = LAYOUT_SIZES[key];
  return footprint ? { ...footprint } : null;
}

export function getInstrumentsByWorld(world) {
  return INSTRUMENT_DEFINITIONS.filter((instrument) => instrument.world === world);
}

export function getCompatibleInstruments(slotOrInstrument) {
  const layoutSize = typeof slotOrInstrument === "string"
    ? getInstrumentDefinition(slotOrInstrument)?.layoutSize || slotOrInstrument
    : slotOrInstrument?.layoutSize;
  return INSTRUMENT_DEFINITIONS.filter((instrument) => instrument.layoutSize === layoutSize);
}

export function getParameterDefaults(instrumentId) {
  const instrument = getInstrumentDefinition(instrumentId);
  if (!instrument) return {};
  return Object.fromEntries(instrument.parameters.map(({ id, default: value }) => [id, value]));
}

export function clampParameterValue(instrumentId, parameterId, value) {
  const descriptor = getInstrumentDefinition(instrumentId)?.parameters
    .find((candidate) => candidate.id === parameterId);
  if (!descriptor) return null;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return descriptor.default;
  const clamped = Math.min(descriptor.max, Math.max(descriptor.min, numericValue));
  if (!descriptor.step) return clamped;

  const steps = Math.round((clamped - descriptor.min) / descriptor.step);
  const stepped = descriptor.min + steps * descriptor.step;
  return Math.min(descriptor.max, Math.max(descriptor.min, stepped));
}

/**
 * Resolve a render descriptor without mutating the catalogue. Pass either a
 * string GLB URI or a partial GLB descriptor in modelOverrides[instrumentId].
 */
export function resolveInstrumentRenderer(instrumentId, modelOverrides = {}) {
  const instrument = getInstrumentDefinition(instrumentId);
  if (!instrument) return null;

  const override = modelOverrides[instrumentId];
  if (!override) {
    return { type: "procedural", ...clone(instrument.renderer.procedural) };
  }

  const glbOverride = typeof override === "string" ? { uri: override } : override;
  return {
    type: "glb",
    ...clone(instrument.renderer.glb),
    ...clone(glbOverride),
  };
}

export function createInitialCloudLabLayout() {
  return clone(INITIAL_CLOUD_LAB_LAYOUT);
}

/**
 * Immutable, footprint-safe replacement used by the object picker/edit mode.
 */
export function replaceInstrumentInLayout(layout, slotId, instrumentId) {
  const instrument = getInstrumentDefinition(instrumentId);
  if (!instrument) throw new Error(`Unknown instrument: ${instrumentId}`);

  const slot = layout?.slots?.find((candidate) => candidate.id === slotId);
  if (!slot) throw new Error(`Unknown layout slot: ${slotId}`);
  if (slot.layoutSize !== instrument.layoutSize) {
    throw new Error(`Instrument ${instrumentId} requires ${instrument.layoutSize}; slot ${slotId} is ${slot.layoutSize}`);
  }

  return {
    ...layout,
    slots: layout.slots.map((candidate) => (
      candidate.id === slotId ? { ...candidate, instrumentId } : { ...candidate }
    )),
  };
}

export function getMaterialsForInstrument(instrumentId) {
  const instrument = getInstrumentDefinition(instrumentId);
  if (!instrument) return {};
  return Object.fromEntries(instrument.materials.map((materialId) => [materialId, MATERIAL_PRESETS[materialId]]));
}

export default INSTRUMENT_DEFINITIONS;
