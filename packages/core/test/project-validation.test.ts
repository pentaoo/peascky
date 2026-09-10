import test from "node:test";
import assert from "node:assert/strict";
import {
  createLegacyCloudProjectFixture,
  createLegacyMainProjectFixture,
  parseInstrumentDefinitionId,
  parseInstrumentInstanceId,
  parseMixerChannelId,
  validateProject,
  type InstrumentInstance,
  type MixerChannelState,
  type Project,
  type ScenePlacement,
} from "../src/index.js";
import { clone, issueCodes, required } from "./helpers.js";

test("Project JSON round-trips through runtime validation", () => {
  for (const project of [createLegacyMainProjectFixture(), createLegacyCloudProjectFixture()]) {
    const json = JSON.stringify(project);
    const result = validateProject(JSON.parse(json));
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, project);
  }
});

function createTwentyPlacementProject(): Project {
  const project = clone(createLegacyCloudProjectFixture());
  const instruments: Record<string, InstrumentInstance> = {};
  const channels: Record<string, MixerChannelState> = {};
  const placements: ScenePlacement[] = [];
  const sharedDefinition = required(parseInstrumentDefinitionId("definition.grid-pad"));
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column;
      const instanceId = required(parseInstrumentInstanceId(`instance.grid.${index}`));
      const mixerChannelId = required(parseMixerChannelId(`channel.grid.${index}`));
      instruments[instanceId] = { id: instanceId, definitionId: sharedDefinition, parameters: {}, mixerChannelId };
      channels[mixerChannelId] = { gain: 1, pan: 0, mute: false, solo: false, sends: {} };
      placements.push({ instanceId, cell: { column, row }, footprint: { columns: 1, rows: 1 } });
    }
  }
  project.instruments = instruments;
  project.mixer.channels = channels;
  project.scene.placements = placements;
  return project;
}

test("a complete 4x5 field validates with 20 independent same-definition instances", () => {
  const project = createTwentyPlacementProject();
  const result = validateProject(project);
  assert.equal(result.ok, true);
  assert.equal(project.scene.placements.length, 20);
  assert.equal(new Set(Object.values(project.instruments).map(({ id }) => id)).size, 20);
  assert.equal(new Set(Object.values(project.instruments).map(({ definitionId }) => definitionId)).size, 1);
  const [first, second] = Object.values(project.instruments);
  assert.ok(first && second);
  assert.notEqual(first!.parameters, second!.parameters);
});

test("scene validation rejects coordinates, footprints, overlaps, duplicates, and missing instances", () => {
  const cases: Array<[string, (project: ReturnType<typeof clone<Project>>) => void, string]> = [
    ["coordinate", (project) => { project.scene.placements[0]!.cell.column = 4; }, "scene.placement.out_of_bounds"],
    ["footprint", (project) => { project.scene.placements[0]!.footprint.columns = 0; }, "integer.invalid"],
    ["overlap", (project) => { project.scene.placements[1]!.cell.column = 0; }, "scene.placement.overlap"],
    ["duplicate", (project) => { project.scene.placements.push(clone(project.scene.placements[0]!)); }, "scene.placement.duplicate"],
    ["missing", (project) => { delete project.instruments[project.scene.placements[0]!.instanceId]; }, "scene.instance.missing"],
  ];
  for (const [label, change, expected] of cases) {
    const project = clone(createTwentyPlacementProject());
    change(project);
    assert.ok(issueCodes(validateProject(project)).includes(expected), label);
  }
});

test("Project validation rejects unsupported versions, malformed transport, and host values", () => {
  const version = clone(createLegacyMainProjectFixture());
  version.schemaVersion = 2 as 1;
  assert.ok(issueCodes(validateProject(version)).includes("project.schema_version.unsupported"));

  const bpm = clone(createLegacyMainProjectFixture());
  bpm.transport.bpm = 301;
  assert.ok(issueCodes(validateProject(bpm)).includes("transport.bpm.invalid"));

  const swing = clone(createLegacyMainProjectFixture());
  swing.transport.swing = -0.01;
  assert.ok(issueCodes(validateProject(swing)).includes("transport.swing.invalid"));

  const hostValue = clone(createLegacyMainProjectFixture()) as unknown as Record<string, unknown>;
  hostValue.runtime = new Date();
  assert.deepEqual(issueCodes(validateProject(hostValue)), ["project.json.invalid"]);

  const impossibleDate = clone(createLegacyMainProjectFixture());
  impossibleDate.updatedAt = "2025-02-30T00:00:00.000Z" as typeof impossibleDate.updatedAt;
  assert.ok(issueCodes(validateProject(impossibleDate)).includes("iso_date.invalid"));
});

test("strict Project shapes reject hidden filesystem paths", () => {
  const project = clone(createLegacyMainProjectFixture()) as unknown as Record<string, unknown>;
  project.filePath = "/private/project.json";
  assert.ok(issueCodes(validateProject(project)).includes("field.unknown"));
});

test("duplicate semantic IDs and non-JSON parameter values are rejected", () => {
  const duplicate = clone(createLegacyMainProjectFixture());
  const source = Object.values(duplicate.instruments)[0]!;
  const aliasId = required(parseInstrumentInstanceId("instance.alias"));
  duplicate.instruments[aliasId] = clone(source);
  const duplicateCodes = issueCodes(validateProject(duplicate));
  assert.ok(duplicateCodes.includes("record.key_mismatch"));
  assert.ok(duplicateCodes.includes("instrument.id.duplicate"));

  const runtimeValue = clone(createLegacyMainProjectFixture()) as unknown as {
    instruments: Record<string, { parameters: Record<string, unknown> }>;
  };
  Object.values(runtimeValue.instruments)[0]!.parameters["parameter.runtime"] = new Date();
  assert.deepEqual(issueCodes(validateProject(runtimeValue)), ["project.json.invalid"]);
});

test("mixer validation enforces per-instance channels and channel intent ranges", () => {
  const valid = clone(createLegacyMainProjectFixture());
  const first = Object.values(valid.mixer.channels)[0]!;
  first.gain = 0.6;
  first.pan = -0.5;
  first.mute = true;
  first.solo = true;
  assert.equal(validateProject(valid).ok, true);

  const missing = clone(createLegacyMainProjectFixture());
  const firstInstance = Object.values(missing.instruments)[0]!;
  delete missing.mixer.channels[firstInstance.mixerChannelId];
  assert.ok(issueCodes(validateProject(missing)).includes("instrument.channel.missing"));

  const shared = clone(createLegacyMainProjectFixture());
  const [left, right] = Object.values(shared.instruments);
  assert.ok(left && right);
  right!.mixerChannelId = left!.mixerChannelId;
  assert.ok(issueCodes(validateProject(shared)).includes("instrument.channel.duplicate"));

  const pan = clone(createLegacyMainProjectFixture());
  Object.values(pan.mixer.channels)[0]!.pan = 1.1;
  assert.ok(issueCodes(validateProject(pan)).includes("mixer.pan.invalid"));
});
