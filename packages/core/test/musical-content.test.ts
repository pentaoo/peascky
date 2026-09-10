import test from "node:test";
import assert from "node:assert/strict";
import {
  createLegacyMainProjectFixture,
  parseAssetId,
  parseEventId,
  parseLoopId,
  parseInstrumentInstanceId,
  parseMixerChannelId,
  parsePatternId,
  validateProject,
  type MusicalLoop,
  type Pattern,
} from "../src/index.js";
import { clone, issueCodes, required } from "./helpers.js";

function addFlexibleContent() {
  const project = clone(createLegacyMainProjectFixture());
  const targetInstanceId = Object.values(project.instruments)[0]!.id;
  const fiveStepId = required(parsePatternId("pattern.five-step"));
  const sevenStepId = required(parsePatternId("pattern.seven-step"));
  const fiveStep: Pattern = {
    id: fiveStepId,
    name: "Five steps",
    lengthTicks: 120,
    resolution: 96,
    lanes: [{
      targetInstanceId,
      events: [{ id: required(parseEventId("event.five.4")), tick: 96, kind: "trigger", velocity: 0.7 }],
    }],
  };
  const sevenStep: Pattern = {
    id: sevenStepId,
    name: "Seven steps",
    lengthTicks: 168,
    resolution: 96,
    lanes: [{
      targetInstanceId,
      events: [{ id: required(parseEventId("event.seven.note")), tick: 144, kind: "note", velocity: 1, note: 64, durationTicks: 24 }],
    }],
  };
  project.patterns[fiveStepId] = clone(fiveStep);
  project.patterns[sevenStepId] = clone(sevenStep);
  return { project, fiveStepId, sevenStepId };
}

test("patterns support legacy 16-step content and unrelated non-16 lengths", () => {
  const { project } = addFlexibleContent();
  const lengths = Object.values(project.patterns).map(({ lengthTicks }) => lengthTicks).sort((a, b) => a - b);
  assert.deepEqual(lengths, [120, 168, 384]);
  assert.equal(validateProject(project).ok, true);
  const kinds = new Set(Object.values(project.patterns).flatMap(({ lanes }) => lanes.flatMap(({ events }) => events.map(({ kind }) => kind))));
  assert.deepEqual(kinds, new Set(["trigger", "note"]));
});

test("pattern validation rejects bad ticks, velocities, durations, and targets", () => {
  const tick = clone(addFlexibleContent().project);
  tick.patterns[required(parsePatternId("pattern.five-step"))]!.lanes[0]!.events[0]!.tick = 120;
  assert.ok(issueCodes(validateProject(tick)).includes("pattern_event.tick.invalid"));

  const velocity = clone(addFlexibleContent().project);
  velocity.patterns[required(parsePatternId("pattern.five-step"))]!.lanes[0]!.events[0]!.velocity = 1.1;
  assert.ok(issueCodes(validateProject(velocity)).includes("pattern_event.velocity.invalid"));

  const duration = clone(addFlexibleContent().project);
  duration.patterns[required(parsePatternId("pattern.seven-step"))]!.lanes[0]!.events[0]!.durationTicks = 0;
  assert.ok(issueCodes(validateProject(duration)).includes("integer.invalid"));

  const target = clone(addFlexibleContent().project);
  target.patterns[required(parsePatternId("pattern.five-step"))]!.lanes[0]!.targetInstanceId = required(parseInstrumentInstanceId("instance.missing"));
  assert.ok(issueCodes(validateProject(target)).includes("pattern.instance.missing"));

  const duplicateEvent = clone(createLegacyMainProjectFixture());
  const lanes = Object.values(duplicateEvent.patterns)[0]!.lanes;
  lanes[1]!.events.push(clone(lanes[0]!.events[0]!));
  assert.ok(issueCodes(validateProject(duplicateEvent)).includes("pattern_event.id.duplicate"));
});

test("pattern and audio loops permit independent lengths", () => {
  const { project, fiveStepId } = addFlexibleContent();
  const assetId = required(parseAssetId("asset.audio-loop"));
  project.assetRefs[assetId] = { assetId, expectedKind: "audio" };
  const channelId = Object.values(project.instruments)[0]!.mixerChannelId;
  const patternLoopId = required(parseLoopId("loop.five-step"));
  const audioLoopId = required(parseLoopId("loop.audio"));
  const loops: MusicalLoop[] = [
    { id: patternLoopId, enabled: true, source: { kind: "pattern", patternId: fiveStepId }, startTick: 0, lengthTicks: 120, repeat: true },
    { id: audioLoopId, enabled: true, source: { kind: "audio", assetId, targetChannelId: channelId }, startTick: 24, lengthTicks: 288, sourceOffsetTicks: 12, repeat: true },
  ];
  for (const loop of loops) project.loops[loop.id] = loop;
  assert.equal(validateProject(project).ok, true);
  assert.deepEqual(loops.map(({ lengthTicks }) => lengthTicks), [120, 288]);
});

test("loop validation rejects missing pattern, asset, and channel references", () => {
  const pattern = clone(createLegacyMainProjectFixture());
  const patternLoop = Object.values(pattern.loops)[0]!;
  if (patternLoop.source.kind !== "pattern") throw new Error("expected pattern fixture loop");
  patternLoop.source.patternId = "pattern.missing" as typeof patternLoop.source.patternId;
  assert.ok(issueCodes(validateProject(pattern)).includes("loop.pattern.missing"));

  const { project } = addFlexibleContent();
  const loopId = required(parseLoopId("loop.bad-audio"));
  project.loops[loopId] = {
    id: loopId,
    enabled: true,
    source: {
      kind: "audio",
      assetId: required(parseAssetId("asset.missing")),
      targetChannelId: required(parseMixerChannelId("channel.missing")),
    },
    startTick: 0,
    lengthTicks: 96,
    repeat: false,
  };
  const codes = issueCodes(validateProject(project));
  assert.ok(codes.includes("loop.asset.missing"));
  assert.ok(codes.includes("loop.channel.missing"));
});
