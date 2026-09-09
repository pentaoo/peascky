import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  INITIAL_CLOUD_LAB_LAYOUT,
  INSTRUMENT_BY_ID,
  INSTRUMENT_DEFINITIONS,
  WORLD_DEFINITIONS,
  clampParameterValue,
  createInitialCloudLabLayout,
  getCompatibleInstruments,
  getInstrumentDefinition,
  getLayoutFootprint,
  getParameterDefaults,
  replaceInstrumentInLayout,
  resolveInstrumentRenderer,
} from "../src/cloud-lab-instruments.js";
import { SLOT_PRESENTATION } from "../src/cloud-lab-renderer.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function definitionSummary(definition) {
  const { id, name, world, category, layoutSize, interactionType, interactionModes, sound, parameters } = definition;
  return {
    id,
    name,
    world,
    category,
    layoutSize,
    interactionType,
    interactionModes,
    sound: {
      type: sound.type,
      engine: sound.engine,
      voice: sound.voice,
      polyphony: sound.polyphony,
      outputGain: sound.outputGain,
      ...(sound.sample ? { sample: sound.sample } : {}),
      ...(sound.routing ? { routing: sound.routing } : {}),
    },
    parameters: parameters.map(({ id: parameterId, default: value }) => ({ id: parameterId, default: value })),
  };
}

test("Cloud definition IDs and portable catalogue metadata match the fixture", async () => {
  assert.deepEqual(INSTRUMENT_DEFINITIONS.map(definitionSummary), await fixture("cloud-definition-summary.json"));
  assert.deepEqual(Object.keys(WORLD_DEFINITIONS), ["cloud", "orbit", "cyber"]);
  assert.deepEqual([...new Set(INSTRUMENT_DEFINITIONS.map(({ world }) => world))], ["cloud", "orbit", "cyber"]);
  assert.ok(INSTRUMENT_DEFINITIONS.every(({ renderer, materials, animationProfile }) => (
    renderer.strategy === "procedural" && renderer.hitArea && materials.length && animationProfile
  )));
});

test("definition lookup is stable and deeply immutable", () => {
  const kick = getInstrumentDefinition("cloud-kick");
  assert.equal(kick, INSTRUMENT_BY_ID["cloud-kick"]);
  assert.equal(getInstrumentDefinition("missing"), null);
  assert.equal(Object.isFrozen(INSTRUMENT_DEFINITIONS), true);
  assert.equal(Object.isFrozen(kick), true);
  assert.equal(Object.isFrozen(kick.sound.synthesis), true);
  assert.throws(() => { kick.category = "changed"; }, TypeError);
  assert.equal(getInstrumentDefinition("cloud-kick").category, "drums");
});

test("layout footprints, compatibility, defaults, and parameter clamping are characterized", () => {
  assert.deepEqual(getLayoutFootprint("1x1"), { columns: 1, rows: 1 });
  assert.deepEqual(getLayoutFootprint({ layoutSize: "2x2" }), { columns: 2, rows: 2 });
  assert.equal(getLayoutFootprint("3x3"), null);
  assert.deepEqual(getCompatibleInstruments("1x2").map(({ id }) => id), ["cloud-bass", "cyber-bass"]);
  assert.deepEqual(getCompatibleInstruments("orbit-synth").map(({ id }) => id), ["cloud-keys", "orbit-synth"]);
  assert.deepEqual(getParameterDefaults("cloud-hat"), { open: 0.08, brightness: 0.7 });
  assert.equal(clampParameterValue("cloud-bass", "note", 48.6), 49);
  assert.equal(clampParameterValue("cloud-bass", "cutoff", 9000), 1800);
  assert.equal(clampParameterValue("cloud-bass", "cutoff", "bad"), 420);
  assert.equal(clampParameterValue("cloud-bass", "missing", 1), null);
});

test("initial logical layout is cloned from the fixture and deliberately mixes worlds", async () => {
  const expected = await fixture("cloud-layout-default.json");
  assert.deepEqual(INITIAL_CLOUD_LAB_LAYOUT, expected);
  const layout = createInitialCloudLabLayout();
  assert.deepEqual(layout, expected);
  assert.notEqual(layout, INITIAL_CLOUD_LAB_LAYOUT);
  assert.notEqual(layout.slots, INITIAL_CLOUD_LAB_LAYOUT.slots);
  layout.slots[0].instrumentId = "cloud-snare";
  assert.equal(INITIAL_CLOUD_LAB_LAYOUT.slots[0].instrumentId, "cloud-kick");
  assert.deepEqual([...new Set(INITIAL_CLOUD_LAB_LAYOUT.slots.map((slot) => getInstrumentDefinition(slot.instrumentId).world))], ["cloud", "orbit"]);
});

test("replacement is immutable and constrained to the same footprint", () => {
  const original = createInitialCloudLabLayout();
  const replacement = replaceInstrumentInLayout(original, "bass-slot", "cyber-bass");
  assert.notEqual(replacement, original);
  assert.notEqual(replacement.slots, original.slots);
  assert.equal(original.slots.find(({ id }) => id === "bass-slot").instrumentId, "cloud-bass");
  assert.equal(replacement.slots.find(({ id }) => id === "bass-slot").instrumentId, "cyber-bass");
  assert.ok(replacement.slots.every((slot, index) => slot !== original.slots[index]));
  assert.throws(() => replaceInstrumentInLayout(original, "bass-slot", "cloud-kick"), /requires 1x1; slot bass-slot is 1x2/);
  assert.throws(() => replaceInstrumentInLayout(original, "missing-slot", "cloud-kick"), /Unknown layout slot/);
  assert.throws(() => replaceInstrumentInLayout(original, "kick-slot", "missing"), /Unknown instrument/);
});

test("logical coordinates and visual anchors remain separate current sources", () => {
  assert.deepEqual(Object.keys(SLOT_PRESENTATION), INITIAL_CLOUD_LAB_LAYOUT.slots.map(({ id }) => id));
  assert.deepEqual(SLOT_PRESENTATION["kick-slot"], {
    x: "23%", y: "27%", w: "clamp(86px, 28vw, 116px)", h: "clamp(88px, 29vw, 120px)", depth: 3,
  });
  assert.deepEqual(resolveInstrumentRenderer("cloud-kick"), {
    type: "procedural", builder: "inflated-drum", version: 1, silhouette: "drop", membrane: true, feet: 3,
  });
  assert.deepEqual(resolveInstrumentRenderer("cloud-kick", { "cloud-kick": "./kick.glb" }), {
    type: "glb", uri: "./kick.glb", sceneNode: "CloudKick", scale: 1, rotation: [0, 0, 0], anchor: [0, 0, 0],
  });
});
