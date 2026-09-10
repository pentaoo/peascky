import type { ValidationResult } from "@pocket-jam/shared";
import {
  parseEventId,
  parseInstrumentDefinitionId,
  parseInstrumentInstanceId,
  parseLoopId,
  parseMixerChannelId,
  parsePatternId,
  parseProjectId,
  parseVisualEnvironmentId,
} from "./ids.js";
import { PROJECT_SCHEMA_VERSION, type PatternEvent, type Project } from "./project.js";
import { parseIsoDate, validateProject } from "./project-validation.js";

const PPQN = 96;
const SIXTEENTH_TICKS = PPQN / 4;
const FIXTURE_DATE = required(parseIsoDate("2025-09-01T00:00:00.000Z"));

function required<Value>(result: ValidationResult<Value>): Value {
  if (!result.ok) throw new Error(result.issues.map(({ message }) => message).join("; "));
  return result.value;
}

function record<Id extends string, Value>(entries: readonly (readonly [Id, Value])[]): Record<Id, Value> {
  return Object.fromEntries(entries) as Record<Id, Value>;
}

function mixerChannel(gain: number) {
  return { gain, pan: 0, mute: false, solo: false, sends: {} } as const;
}

function validateFixture(project: Project): Project {
  const result = validateProject(project);
  if (!result.ok) throw new Error(result.issues.map(({ code, path }) => `${code}@${path.join(".")}`).join("; "));
  return result.value;
}

type LegacyTrack = Readonly<{
  id: "kick" | "snare" | "hat" | "bass";
  pattern: readonly number[];
}>;

const LEGACY_MAIN_TRACKS: readonly LegacyTrack[] = [
  { id: "kick", pattern: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0] },
  { id: "snare", pattern: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
  { id: "hat", pattern: [0.55, 0, 0.42, 0, 0.55, 0, 0.42, 0, 0.55, 0, 0.42, 0, 0.55, 0, 0.42, 0] },
  { id: "bass", pattern: [1, 0, 0, 0, 0, 0, 0.65, 0, 0, 0, 0, 0, 0.72, 0, 0, 0] },
];

function mainEvent(track: LegacyTrack, step: number, velocity: number): PatternEvent {
  const base = {
    id: required(parseEventId(`event.main.${track.id}.${step}`)),
    tick: step * SIXTEENTH_TICKS,
    velocity,
  };
  return track.id === "bass"
    ? { ...base, kind: "note", note: 36, durationTicks: SIXTEENTH_TICKS }
    : { ...base, kind: "trigger" };
}

export function createLegacyMainProjectFixture(): Project {
  const projectId = required(parseProjectId("project.legacy-main"));
  const patternId = required(parsePatternId("pattern.legacy-main"));
  const instanceEntries = LEGACY_MAIN_TRACKS.map((track) => {
    const instanceId = required(parseInstrumentInstanceId(`instance.main.${track.id}`));
    const definitionId = required(parseInstrumentDefinitionId(`definition.legacy.${track.id}`));
    const mixerChannelId = required(parseMixerChannelId(`channel.main.${track.id}`));
    return [instanceId, { id: instanceId, definitionId, parameters: {}, mixerChannelId }] as const;
  });
  const channelEntries = LEGACY_MAIN_TRACKS.map((track) => {
    const channelId = required(parseMixerChannelId(`channel.main.${track.id}`));
    return [channelId, mixerChannel(0.78)] as const;
  });
  const lanes = LEGACY_MAIN_TRACKS.map((track) => ({
    targetInstanceId: required(parseInstrumentInstanceId(`instance.main.${track.id}`)),
    events: track.pattern.flatMap((velocity, step) => velocity > 0 ? [mainEvent(track, step, velocity)] : []),
  }));
  const loopId = required(parseLoopId("loop.legacy-main"));
  return validateFixture({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: projectId,
    revision: 0,
    name: "Minimal sketch",
    createdAt: FIXTURE_DATE,
    updatedAt: FIXTURE_DATE,
    transport: {
      bpm: 112,
      timeSignature: { numerator: 4, denominator: 4 },
      swing: 0.08,
      swingSubdivision: "1/16",
      loopRange: { startTick: 0, endTick: PPQN * 4 },
    },
    scene: {
      columns: 4,
      rows: 5,
      placements: instanceEntries.map(([instanceId], column) => ({
        instanceId,
        cell: { column, row: 0 },
        footprint: { columns: 1, rows: 1 },
      })),
    },
    instruments: record(instanceEntries),
    patterns: {
      [patternId]: {
        id: patternId,
        name: "Legacy 16-step pattern",
        lengthTicks: PPQN * 4,
        resolution: PPQN,
        lanes,
      },
    },
    loops: {
      [loopId]: {
        id: loopId,
        enabled: true,
        source: { kind: "pattern", patternId },
        startTick: 0,
        lengthTicks: PPQN * 4,
        repeat: true,
      },
    },
    mixer: { master: { gain: 1 }, channels: record(channelEntries), buses: {} },
    assetRefs: {},
  });
}

type CloudSlot = Readonly<{
  id: string;
  definitionId: string;
  column: number;
  row: number;
  columns: number;
  rows: number;
  yaw: number;
  elevation: number;
}>;

const CLOUD_SLOTS: readonly CloudSlot[] = [
  { id: "kick-slot", definitionId: "cloud-kick", column: 0, row: 0, columns: 1, rows: 1, yaw: -0.07, elevation: 0 },
  { id: "snare-slot", definitionId: "cloud-snare", column: 1, row: 0, columns: 1, rows: 1, yaw: 0.05, elevation: 0.03 },
  { id: "hat-slot", definitionId: "cloud-hat", column: 2, row: 0, columns: 1, rows: 1, yaw: -0.04, elevation: 0.06 },
  { id: "bass-slot", definitionId: "cloud-bass", column: 0, row: 1, columns: 1, rows: 2, yaw: 0.04, elevation: 0 },
  { id: "synth-slot", definitionId: "orbit-synth", column: 1, row: 1, columns: 2, rows: 1, yaw: -0.025, elevation: 0.02 },
  { id: "reverb-slot", definitionId: "cloud-reverb", column: 1, row: 2, columns: 2, rows: 2, yaw: 0.035, elevation: 0.04 },
];

export function createLegacyCloudProjectFixture(): Project {
  const projectId = required(parseProjectId("project.legacy-cloud"));
  const environmentId = required(parseVisualEnvironmentId("environment.cloud-lab"));
  const instances = CLOUD_SLOTS.map((slot) => {
    const instanceId = required(parseInstrumentInstanceId(`instance.cloud.${slot.id}`));
    const definitionId = required(parseInstrumentDefinitionId(`definition.${slot.definitionId}`));
    const mixerChannelId = required(parseMixerChannelId(`channel.cloud.${slot.id}`));
    return { slot, instanceId, definitionId, mixerChannelId };
  });
  return validateFixture({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: projectId,
    revision: 0,
    name: "Cloud Lab",
    createdAt: FIXTURE_DATE,
    updatedAt: FIXTURE_DATE,
    transport: {
      bpm: 112,
      timeSignature: { numerator: 4, denominator: 4 },
      swing: 0,
      swingSubdivision: "1/16",
    },
    scene: {
      columns: 4,
      rows: 5,
      visualEnvironmentId: environmentId,
      placements: instances.map(({ slot, instanceId }) => ({
        instanceId,
        cell: { column: slot.column, row: slot.row },
        footprint: { columns: slot.columns, rows: slot.rows },
        transform: { offsetX: 0, offsetY: 0, elevation: slot.elevation, yaw: slot.yaw, scale: 1 },
      })),
    },
    instruments: record(instances.map(({ instanceId, definitionId, mixerChannelId }) => [
      instanceId,
      { id: instanceId, definitionId, parameters: {}, mixerChannelId },
    ] as const)),
    patterns: {},
    loops: {},
    mixer: {
      master: { gain: 1 },
      channels: record(instances.map(({ mixerChannelId }) => [mixerChannelId, mixerChannel(1)] as const)),
      buses: {},
    },
    assetRefs: {},
  });
}

export const LEGACY_FIXTURE_TICKS = Object.freeze({ ppqn: PPQN, sixteenth: SIXTEENTH_TICKS });
