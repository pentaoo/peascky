import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProjectCommand,
  createLegacyCloudProjectFixture,
  createLegacyMainProjectFixture,
  parseAssetId,
  parseCommandId,
  parseEventId,
  parseInstrumentDefinitionId,
  parseInstrumentInstanceId,
  parseLoopId,
  parseMixerChannelId,
  parseParameterId,
  parsePatternId,
  parseProjectId,
  validateProjectCommand,
  type IsoDate,
  type Project,
  type ProjectCommand,
} from "../src/index.js";
import { clone, issueCodes, required } from "./helpers.js";

const ISSUED_AT = "2025-09-01T00:00:01.000Z" as IsoDate;

function envelope(project: Project, suffix: string) {
  return {
    commandId: required(parseCommandId(`command.test.${suffix}`)),
    projectId: project.id,
    baseRevision: project.revision,
    issuedAt: ISSUED_AT,
  } as const;
}

function accepted(project: Project, command: unknown): Project {
  const result = applyProjectCommand(project, command);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
  if (!result.ok) throw new Error("expected command to be accepted");
  return result.value;
}

test("accepted commands increment revision once, use envelope time, and are deterministic", () => {
  const project = createLegacyMainProjectFixture();
  const command: ProjectCommand = {
    ...envelope(project, "rename"),
    type: "project.rename",
    payload: { name: "A deterministic jam" },
  };
  const left = accepted(project, command);
  const right = accepted(project, command);
  assert.deepEqual(left, right);
  assert.equal(left.revision, project.revision + 1);
  assert.equal(left.updatedAt, ISSUED_AT);
  assert.equal(left.name, "A deterministic jam");
  assert.equal(project.name, "Minimal sketch");
  assert.equal(project.revision, 0);
});

test("invalid commands and rejected transitions do not mutate Project", () => {
  const project = createLegacyMainProjectFixture();
  const before = JSON.stringify(project);
  const invalid = {
    ...envelope(project, "bad-bpm"),
    type: "transport.bpm.set",
    payload: { bpm: 900 },
  };
  assert.ok(issueCodes(applyProjectCommand(project, invalid)).includes("transport.bpm.invalid"));
  assert.equal(JSON.stringify(project), before);

  const conflict = {
    ...envelope(project, "conflict"),
    baseRevision: 42,
    type: "project.rename",
    payload: { name: "Never applied" },
  };
  assert.ok(issueCodes(applyProjectCommand(project, conflict)).includes("command.base_revision.conflict"));
  assert.equal(JSON.stringify(project), before);
});

test("instrument move and parameter commands produce isolated next values", () => {
  const cloud = createLegacyCloudProjectFixture();
  const instance = Object.values(cloud.instruments).find(({ id }) => id.endsWith("kick-slot"));
  assert.ok(instance);
  const moved = accepted(cloud, {
    ...envelope(cloud, "move"),
    type: "instrument.move",
    payload: { instanceId: instance!.id, cell: { column: 3, row: 4 } },
  });
  assert.deepEqual(moved.scene.placements.find(({ instanceId }) => instanceId === instance!.id)?.cell, { column: 3, row: 4 });
  assert.deepEqual(cloud.scene.placements.find(({ instanceId }) => instanceId === instance!.id)?.cell, { column: 0, row: 0 });

  const parameterId = required(parseParameterId("parameter.tone"));
  const changed = accepted(moved, {
    ...envelope(moved, "parameter"),
    type: "instrument.parameter.set",
    payload: { instanceId: instance!.id, parameterId, value: 0.75 },
  });
  assert.equal(changed.instruments[instance!.id]?.parameters[parameterId], 0.75);
  assert.equal(moved.instruments[instance!.id]?.parameters[parameterId], undefined);
});

test("pattern event upsert and removal preserve flexible Pattern length", () => {
  const project = createLegacyMainProjectFixture();
  const pattern = Object.values(project.patterns)[0]!;
  const targetInstanceId = pattern.lanes[0]!.targetInstanceId;
  const eventId = required(parseEventId("event.command.upsert"));
  const updated = accepted(project, {
    ...envelope(project, "event-upsert"),
    type: "pattern.event.upsert",
    payload: {
      patternId: pattern.id,
      targetInstanceId,
      event: { id: eventId, tick: 13, kind: "trigger", velocity: 0.4 },
    },
  });
  assert.equal(updated.patterns[pattern.id]?.lengthTicks, pattern.lengthTicks);
  assert.equal(updated.patterns[pattern.id]?.lanes[0]?.events.some(({ id }) => id === eventId), true);

  const removed = accepted(updated, {
    ...envelope(updated, "event-remove"),
    type: "pattern.event.remove",
    payload: { patternId: pattern.id, eventId },
  });
  assert.equal(removed.patterns[pattern.id]?.lanes[0]?.events.some(({ id }) => id === eventId), false);
});

test("loop upsert and removal support a length unrelated to its source Pattern", () => {
  const project = createLegacyMainProjectFixture();
  const patternId = Object.values(project.patterns)[0]!.id;
  const loopId = required(parseLoopId("loop.command"));
  const updated = accepted(project, {
    ...envelope(project, "loop-upsert"),
    type: "loop.upsert",
    payload: {
      loop: {
        id: loopId,
        enabled: true,
        source: { kind: "pattern", patternId },
        startTick: 48,
        lengthTicks: 192,
        sourceOffsetTicks: 24,
        repeat: false,
      },
    },
  });
  assert.equal(updated.loops[loopId]?.lengthTicks, 192);
  const removed = accepted(updated, {
    ...envelope(updated, "loop-remove"),
    type: "loop.remove",
    payload: { loopId },
  });
  assert.equal(removed.loops[loopId], undefined);
});

test("instrument add and remove own placement and mixer channel atomically", () => {
  const project = createLegacyCloudProjectFixture();
  const instanceId = required(parseInstrumentInstanceId("instance.cloud.extra"));
  const mixerChannelId = required(parseMixerChannelId("channel.cloud.extra"));
  const definitionId = required(parseInstrumentDefinitionId("definition.cloud-extra"));
  const added = accepted(project, {
    ...envelope(project, "instrument-add"),
    type: "instrument.add",
    payload: {
      instance: { id: instanceId, definitionId, parameters: {}, mixerChannelId },
      placement: { instanceId, cell: { column: 3, row: 4 }, footprint: { columns: 1, rows: 1 } },
      channel: { gain: 0.8, pan: 0.1, mute: false, solo: false, sends: {} },
    },
  });
  assert.ok(added.instruments[instanceId]);
  assert.ok(added.mixer.channels[mixerChannelId]);
  assert.ok(added.scene.placements.some((placement) => placement.instanceId === instanceId));

  const removed = accepted(added, {
    ...envelope(added, "instrument-remove"),
    type: "instrument.remove",
    payload: { instanceId },
  });
  assert.equal(removed.instruments[instanceId], undefined);
  assert.equal(removed.mixer.channels[mixerChannelId], undefined);
  assert.equal(removed.scene.placements.some((placement) => placement.instanceId === instanceId), false);
});

test("asset binding, mixer, and transport commands update durable intent only", () => {
  const project = clone(createLegacyCloudProjectFixture());
  const instance = Object.values(project.instruments)[0]!;
  const assetId = required(parseAssetId("asset.sample"));
  project.assetRefs[assetId] = { assetId, expectedKind: "audio" };
  let next = accepted(project, {
    ...envelope(project, "asset-bind"),
    type: "instrument.asset.bind",
    payload: { instanceId: instance.id, bindingId: "primarySample", assetId },
  });
  assert.equal(next.instruments[instance.id]?.audioAssetBindings?.primarySample, assetId);

  next = accepted(next, { ...envelope(next, "gain"), type: "mixer.gain.set", payload: { channelId: instance.mixerChannelId, gain: 0.5 } });
  next = accepted(next, { ...envelope(next, "pan"), type: "mixer.pan.set", payload: { channelId: instance.mixerChannelId, pan: -0.25 } });
  next = accepted(next, { ...envelope(next, "mute"), type: "mixer.mute.set", payload: { channelId: instance.mixerChannelId, mute: true } });
  next = accepted(next, { ...envelope(next, "bpm"), type: "transport.bpm.set", payload: { bpm: 123 } });
  next = accepted(next, { ...envelope(next, "range"), type: "transport.loopRange.set", payload: { loopRange: { startTick: 24, endTick: 408 } } });
  assert.deepEqual(next.mixer.channels[instance.mixerChannelId], { gain: 0.5, pan: -0.25, mute: true, solo: false, sends: {} });
  assert.equal(next.transport.bpm, 123);
  assert.deepEqual(next.transport.loopRange, { startTick: 24, endTick: 408 });
});

test("command validation rejects runtime values, unknown fields, and mismatched Project IDs", () => {
  const project = createLegacyMainProjectFixture();
  assert.deepEqual(issueCodes(validateProjectCommand({ callback: () => undefined })), ["command.json.invalid"]);
  const unknown = {
    ...envelope(project, "unknown-field"),
    type: "project.rename",
    payload: { name: "Name", socket: "metadata" },
  };
  assert.ok(issueCodes(validateProjectCommand(unknown)).includes("field.unknown"));
  const mismatch = {
    ...envelope(project, "wrong-project"),
    projectId: required(parseProjectId("project.other")),
    type: "project.rename",
    payload: { name: "No" },
  };
  assert.ok(issueCodes(applyProjectCommand(project, mismatch)).includes("command.project_id.mismatch"));
});

test("instrument removal is rejected while Pattern content still targets it", () => {
  const project = createLegacyMainProjectFixture();
  const instanceId = Object.values(project.instruments)[0]!.id;
  const before = JSON.stringify(project);
  const result = applyProjectCommand(project, {
    ...envelope(project, "remove-used"),
    type: "instrument.remove",
    payload: { instanceId },
  });
  assert.ok(issueCodes(result).includes("instrument.in_use.pattern"));
  assert.equal(JSON.stringify(project), before);
});

test("explicit Pattern IDs remain semantic across commands", () => {
  const patternId = required(parsePatternId("pattern.explicit"));
  assert.equal(patternId, "pattern.explicit");
});
