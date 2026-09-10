import type { Brand, JsonPrimitive } from "@pocket-jam/shared";
import type {
  AssetId,
  EffectBusId,
  EventId,
  InstrumentDefinitionId,
  InstrumentInstanceId,
  LoopId,
  MixerChannelId,
  ParameterId,
  PatternId,
  ProjectId,
  VisualEnvironmentId,
} from "./ids.js";

export const PROJECT_SCHEMA_VERSION = 1 as const;
export const MIN_SCENE_COLUMNS = 4 as const;
export const MIN_SCENE_ROWS = 5 as const;
export const MIN_BPM = 20 as const;
export const MAX_BPM = 300 as const;

export type IsoDate = Brand<string, "pocket-jam:iso-date">;

export type TickRange = Readonly<{
  startTick: number;
  endTick: number;
}>;

export type TransportConfig = Readonly<{
  bpm: number;
  timeSignature: Readonly<{
    numerator: number;
    denominator: number;
  }>;
  swing: number;
  swingSubdivision: "1/8" | "1/16";
  loopRange?: TickRange;
}>;

export type SceneCell = Readonly<{
  column: number;
  row: number;
}>;

export type SceneFootprint = Readonly<{
  columns: number;
  rows: number;
}>;

export type SceneTransform = Readonly<{
  offsetX: number;
  offsetY: number;
  elevation: number;
  yaw: number;
  scale: number;
}>;

export type ScenePlacement = Readonly<{
  instanceId: InstrumentInstanceId;
  cell: SceneCell;
  footprint: SceneFootprint;
  transform?: SceneTransform;
}>;

export type Scene = Readonly<{
  columns: number;
  rows: number;
  placements: readonly ScenePlacement[];
  visualEnvironmentId?: VisualEnvironmentId;
}>;

export type InstrumentInstance = Readonly<{
  id: InstrumentInstanceId;
  definitionId: InstrumentDefinitionId;
  parameters: Readonly<Record<ParameterId, JsonPrimitive>>;
  audioAssetBindings?: Readonly<Record<string, AssetId>>;
  mixerChannelId: MixerChannelId;
}>;

export type PatternEvent = Readonly<{
  id: EventId;
  tick: number;
  kind: "trigger" | "note";
  velocity: number;
  note?: number;
  durationTicks?: number;
  parameterLocks?: Readonly<Record<ParameterId, number>>;
}>;

export type PatternLane = Readonly<{
  targetInstanceId: InstrumentInstanceId;
  events: readonly PatternEvent[];
}>;

export type Pattern = Readonly<{
  id: PatternId;
  name: string;
  lengthTicks: number;
  resolution: number;
  lanes: readonly PatternLane[];
}>;

export type PatternLoopSource = Readonly<{
  kind: "pattern";
  patternId: PatternId;
}>;

export type AudioLoopSource = Readonly<{
  kind: "audio";
  assetId: AssetId;
  targetChannelId: MixerChannelId;
}>;

export type MusicalLoop = Readonly<{
  id: LoopId;
  enabled: boolean;
  source: PatternLoopSource | AudioLoopSource;
  startTick: number;
  lengthTicks: number;
  sourceOffsetTicks?: number;
  repeat: boolean;
}>;

export type MixerChannelState = Readonly<{
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  sends: Readonly<Record<EffectBusId, number>>;
}>;

export type EffectBusState = Readonly<{
  effectProgramId: string;
  parameters: Readonly<Record<ParameterId, number>>;
}>;

export type MixerState = Readonly<{
  master: Readonly<{
    gain: number;
    effectChainPresetId?: string;
  }>;
  channels: Readonly<Record<MixerChannelId, MixerChannelState>>;
  buses: Readonly<Record<EffectBusId, EffectBusState>>;
}>;

export type AssetReference = Readonly<{
  assetId: AssetId;
  expectedKind: "audio" | "visual";
}>;

export type Project = Readonly<{
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: ProjectId;
  revision: number;
  name: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  transport: TransportConfig;
  scene: Scene;
  instruments: Readonly<Record<InstrumentInstanceId, InstrumentInstance>>;
  patterns: Readonly<Record<PatternId, Pattern>>;
  loops: Readonly<Record<LoopId, MusicalLoop>>;
  mixer: MixerState;
  assetRefs: Readonly<Record<AssetId, AssetReference>>;
}>;
