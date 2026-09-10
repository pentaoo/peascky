import { parseStableId, type StableId, type ValidationResult } from "@pocket-jam/shared";

export type ProjectId = StableId<"project">;
export type InstrumentInstanceId = StableId<"instrument-instance">;
export type InstrumentDefinitionId = StableId<"instrument-definition">;
export type PatternId = StableId<"pattern">;
export type EventId = StableId<"event">;
export type LoopId = StableId<"loop">;
export type MixerChannelId = StableId<"mixer-channel">;
export type EffectBusId = StableId<"effect-bus">;
export type AssetId = StableId<"asset">;
export type ParameterId = StableId<"parameter">;
export type CommandId = StableId<"command">;
export type ActorId = StableId<"actor">;
export type VisualEnvironmentId = StableId<"visual-environment">;

type DomainId =
  | ProjectId
  | InstrumentInstanceId
  | InstrumentDefinitionId
  | PatternId
  | EventId
  | LoopId
  | MixerChannelId
  | EffectBusId
  | AssetId
  | ParameterId
  | CommandId
  | ActorId
  | VisualEnvironmentId;

const DOMAIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNSAFE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "toLocaleString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

function parseDomainId<Id extends DomainId>(value: unknown, kind: string): ValidationResult<Id> {
  const stable = parseStableId(value, kind);
  if (!stable.ok) return stable as ValidationResult<Id>;
  if (!DOMAIN_ID_PATTERN.test(stable.value) || UNSAFE_KEYS.has(stable.value)) {
    return {
      ok: false,
      issues: [{
        code: "stable_id.invalid",
        message: `${kind} ID must start with an alphanumeric character and contain only letters, numbers, dot, underscore, colon, or hyphen`,
        path: [],
      }],
    };
  }
  return { ok: true, value: stable.value as Id };
}

export const parseProjectId = (value: unknown) => parseDomainId<ProjectId>(value, "project");
export const parseInstrumentInstanceId = (value: unknown) => parseDomainId<InstrumentInstanceId>(value, "instrument-instance");
export const parseInstrumentDefinitionId = (value: unknown) => parseDomainId<InstrumentDefinitionId>(value, "instrument-definition");
export const parsePatternId = (value: unknown) => parseDomainId<PatternId>(value, "pattern");
export const parseEventId = (value: unknown) => parseDomainId<EventId>(value, "event");
export const parseLoopId = (value: unknown) => parseDomainId<LoopId>(value, "loop");
export const parseMixerChannelId = (value: unknown) => parseDomainId<MixerChannelId>(value, "mixer-channel");
export const parseEffectBusId = (value: unknown) => parseDomainId<EffectBusId>(value, "effect-bus");
export const parseAssetId = (value: unknown) => parseDomainId<AssetId>(value, "asset");
export const parseParameterId = (value: unknown) => parseDomainId<ParameterId>(value, "parameter");
export const parseCommandId = (value: unknown) => parseDomainId<CommandId>(value, "command");
export const parseActorId = (value: unknown) => parseDomainId<ActorId>(value, "actor");
export const parseVisualEnvironmentId = (value: unknown) => parseDomainId<VisualEnvironmentId>(value, "visual-environment");
