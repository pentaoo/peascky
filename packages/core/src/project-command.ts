import { isJsonValue, type JsonPrimitive, type ValidationIssue, type ValidationResult } from "@pocket-jam/shared";
import {
  parseActorId,
  parseAssetId,
  parseCommandId,
  parseEventId,
  parseInstrumentInstanceId,
  parseLoopId,
  parseMixerChannelId,
  parseParameterId,
  parsePatternId,
  parseProjectId,
  type ActorId,
  type AssetId,
  type CommandId,
  type EventId,
  type InstrumentInstanceId,
  type LoopId,
  type MixerChannelId,
  type ParameterId,
  type PatternId,
  type ProjectId,
} from "./ids.js";
import type {
  InstrumentInstance,
  IsoDate,
  MixerChannelState,
  MusicalLoop,
  PatternEvent,
  Project,
  SceneCell,
  ScenePlacement,
  SceneTransform,
  TickRange,
} from "./project.js";
import {
  parseIsoDate,
  validateId,
  validateInstrumentInstanceValue,
  validateMixerChannelValue,
  validateMusicalLoopValue,
  validatePatternEventValue,
  validateProject,
  validateSceneCellValue,
  validateScenePlacementValue,
  validateSceneTransformValue,
  ValidationContext,
} from "./project-validation.js";

type CommandEnvelope = Readonly<{
  commandId: CommandId;
  projectId: ProjectId;
  baseRevision?: number;
  actorId?: ActorId;
  issuedAt?: IsoDate;
}>;

type Command<Type extends string, Payload> = CommandEnvelope & Readonly<{
  type: Type;
  payload: Readonly<Payload>;
}>;

export type ProjectCommand =
  | Command<"project.rename", { name: string }>
  | Command<"instrument.add", { instance: InstrumentInstance; placement: ScenePlacement; channel: MixerChannelState }>
  | Command<"instrument.move", { instanceId: InstrumentInstanceId; cell: SceneCell; transform?: SceneTransform }>
  | Command<"instrument.remove", { instanceId: InstrumentInstanceId }>
  | Command<"instrument.parameter.set", { instanceId: InstrumentInstanceId; parameterId: ParameterId; value: JsonPrimitive }>
  | Command<"instrument.asset.bind", { instanceId: InstrumentInstanceId; bindingId: string; assetId: AssetId }>
  | Command<"mixer.gain.set", { channelId: MixerChannelId; gain: number }>
  | Command<"mixer.pan.set", { channelId: MixerChannelId; pan: number }>
  | Command<"mixer.mute.set", { channelId: MixerChannelId; mute: boolean }>
  | Command<"transport.bpm.set", { bpm: number }>
  | Command<"transport.loopRange.set", { loopRange?: TickRange }>
  | Command<"pattern.event.upsert", { patternId: PatternId; targetInstanceId: InstrumentInstanceId; event: PatternEvent }>
  | Command<"pattern.event.remove", { patternId: PatternId; eventId: EventId }>
  | Command<"loop.upsert", { loop: MusicalLoop }>
  | Command<"loop.remove", { loopId: LoopId }>;

type UnknownRecord = Record<string, unknown>;
type Mutable<Value> = Value extends string | number | boolean | null
  ? Value
  : Value extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value;

const COMMAND_TYPES = new Set<ProjectCommand["type"]>([
  "project.rename",
  "instrument.add",
  "instrument.move",
  "instrument.remove",
  "instrument.parameter.set",
  "instrument.asset.bind",
  "mixer.gain.set",
  "mixer.pan.set",
  "mixer.mute.set",
  "transport.bpm.set",
  "transport.loopRange.set",
  "pattern.event.upsert",
  "pattern.event.remove",
  "loop.upsert",
  "loop.remove",
]);

function own(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function shape(
  value: unknown,
  path: readonly (string | number)[],
  context: ValidationContext,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    context.issue("type.object", `${label} must be an object`, path);
    return undefined;
  }
  const result = value as UnknownRecord;
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) context.issue("field.unknown", `${label} contains unknown field ${key}`, [...path, key]);
  }
  for (const key of required) {
    if (!own(result, key)) context.issue("field.required", `${label}.${key} is required`, [...path, key]);
  }
  return result;
}

function validInteger(value: unknown, minimum: number): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function validateFinite(value: unknown, path: readonly (string | number)[], context: ValidationContext, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) context.issue("number.invalid", `${label} must be a finite number`, path);
}

function validateRequiredId(
  payload: UnknownRecord,
  key: string,
  path: readonly (string | number)[],
  context: ValidationContext,
  parser: (value: unknown) => ValidationResult<string>,
): void {
  if (own(payload, key)) validateId(payload[key], [...path, key], context, parser);
}

function validateLoopRange(value: unknown, path: readonly (string | number)[], context: ValidationContext): void {
  const range = shape(value, path, context, "loop range", ["startTick", "endTick"]);
  if (!range) return;
  if (own(range, "startTick") && !validInteger(range.startTick, 0)) context.issue("integer.invalid", "loop start tick must be a non-negative safe integer", [...path, "startTick"]);
  if (own(range, "endTick") && !validInteger(range.endTick, 1)) context.issue("integer.invalid", "loop end tick must be a positive safe integer", [...path, "endTick"]);
  if (typeof range.startTick === "number" && typeof range.endTick === "number" && range.endTick <= range.startTick) {
    context.issue("transport.loop_range.invalid", "loop range end must be after its start", path);
  }
}

function validatePayload(command: UnknownRecord, context: ValidationContext): void {
  if (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type as ProjectCommand["type"])) return;
  const path = ["payload"] as const;
  switch (command.type as ProjectCommand["type"]) {
    case "project.rename": {
      const payload = shape(command.payload, path, context, "project.rename payload", ["name"]);
      if (payload && own(payload, "name") && (typeof payload.name !== "string" || payload.name.trim().length === 0 || payload.name !== payload.name.trim())) {
        context.issue("project.name.invalid", "Project name must be non-empty without surrounding whitespace", [...path, "name"]);
      }
      break;
    }
    case "instrument.add": {
      const payload = shape(command.payload, path, context, "instrument.add payload", ["instance", "placement", "channel"]);
      if (!payload) break;
      if (own(payload, "instance")) validateInstrumentInstanceValue(payload.instance, [...path, "instance"], context);
      if (own(payload, "placement")) validateScenePlacementValue(payload.placement, [...path, "placement"], context);
      if (own(payload, "channel")) validateMixerChannelValue(payload.channel, [...path, "channel"], context);
      break;
    }
    case "instrument.move": {
      const payload = shape(command.payload, path, context, "instrument.move payload", ["instanceId", "cell"], ["transform"]);
      if (!payload) break;
      validateRequiredId(payload, "instanceId", path, context, parseInstrumentInstanceId);
      if (own(payload, "cell")) validateSceneCellValue(payload.cell, [...path, "cell"], context);
      if (own(payload, "transform")) validateSceneTransformValue(payload.transform, [...path, "transform"], context);
      break;
    }
    case "instrument.remove": {
      const payload = shape(command.payload, path, context, "instrument.remove payload", ["instanceId"]);
      if (payload) validateRequiredId(payload, "instanceId", path, context, parseInstrumentInstanceId);
      break;
    }
    case "instrument.parameter.set": {
      const payload = shape(command.payload, path, context, "instrument.parameter.set payload", ["instanceId", "parameterId", "value"]);
      if (!payload) break;
      validateRequiredId(payload, "instanceId", path, context, parseInstrumentInstanceId);
      validateRequiredId(payload, "parameterId", path, context, parseParameterId);
      if (own(payload, "value") && !(
        payload.value === null
        || typeof payload.value === "string"
        || typeof payload.value === "boolean"
        || (typeof payload.value === "number" && Number.isFinite(payload.value))
      )) context.issue("json_primitive.invalid", "parameter value must be a finite JSON primitive", [...path, "value"]);
      break;
    }
    case "instrument.asset.bind": {
      const payload = shape(command.payload, path, context, "instrument.asset.bind payload", ["instanceId", "bindingId", "assetId"]);
      if (!payload) break;
      validateRequiredId(payload, "instanceId", path, context, parseInstrumentInstanceId);
      validateRequiredId(payload, "assetId", path, context, parseAssetId);
      if (own(payload, "bindingId") && (typeof payload.bindingId !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,63}$/.test(payload.bindingId))) {
        context.issue("asset_binding.id.invalid", "asset binding ID is invalid", [...path, "bindingId"]);
      }
      break;
    }
    case "mixer.gain.set":
    case "mixer.pan.set": {
      const valueKey = command.type === "mixer.gain.set" ? "gain" : "pan";
      const payload = shape(command.payload, path, context, `${command.type} payload`, ["channelId", valueKey]);
      if (!payload) break;
      validateRequiredId(payload, "channelId", path, context, parseMixerChannelId);
      if (own(payload, valueKey)) validateFinite(payload[valueKey], [...path, valueKey], context, valueKey);
      break;
    }
    case "mixer.mute.set": {
      const payload = shape(command.payload, path, context, "mixer.mute.set payload", ["channelId", "mute"]);
      if (!payload) break;
      validateRequiredId(payload, "channelId", path, context, parseMixerChannelId);
      if (own(payload, "mute") && typeof payload.mute !== "boolean") context.issue("boolean.invalid", "mute must be a boolean", [...path, "mute"]);
      break;
    }
    case "transport.bpm.set": {
      const payload = shape(command.payload, path, context, "transport.bpm.set payload", ["bpm"]);
      if (payload && own(payload, "bpm")) validateFinite(payload.bpm, [...path, "bpm"], context, "BPM");
      break;
    }
    case "transport.loopRange.set": {
      const payload = shape(command.payload, path, context, "transport.loopRange.set payload", [], ["loopRange"]);
      if (payload && own(payload, "loopRange")) validateLoopRange(payload.loopRange, [...path, "loopRange"], context);
      break;
    }
    case "pattern.event.upsert": {
      const payload = shape(command.payload, path, context, "pattern.event.upsert payload", ["patternId", "targetInstanceId", "event"]);
      if (!payload) break;
      validateRequiredId(payload, "patternId", path, context, parsePatternId);
      validateRequiredId(payload, "targetInstanceId", path, context, parseInstrumentInstanceId);
      if (own(payload, "event")) validatePatternEventValue(payload.event, [...path, "event"], context);
      break;
    }
    case "pattern.event.remove": {
      const payload = shape(command.payload, path, context, "pattern.event.remove payload", ["patternId", "eventId"]);
      if (!payload) break;
      validateRequiredId(payload, "patternId", path, context, parsePatternId);
      validateRequiredId(payload, "eventId", path, context, parseEventId);
      break;
    }
    case "loop.upsert": {
      const payload = shape(command.payload, path, context, "loop.upsert payload", ["loop"]);
      if (payload && own(payload, "loop")) validateMusicalLoopValue(payload.loop, [...path, "loop"], context);
      break;
    }
    case "loop.remove": {
      const payload = shape(command.payload, path, context, "loop.remove payload", ["loopId"]);
      if (payload) validateRequiredId(payload, "loopId", path, context, parseLoopId);
      break;
    }
  }
}

export function validateProjectCommand(value: unknown): ValidationResult<ProjectCommand> {
  if (!isJsonValue(value)) {
    return {
      ok: false,
      issues: [{ code: "command.json.invalid", message: "Project command must be a finite JSON value", path: [] }],
    };
  }
  const context = new ValidationContext();
  const command = shape(
    value,
    [],
    context,
    "Project command",
    ["type", "commandId", "projectId", "payload"],
    ["baseRevision", "actorId", "issuedAt"],
  );
  if (!command) return { ok: false, issues: context.issues };
  if (own(command, "type") && (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type as ProjectCommand["type"]))) {
    context.issue("command.type.unsupported", "Project command type is unsupported", ["type"]);
  }
  if (own(command, "commandId")) validateId(command.commandId, ["commandId"], context, parseCommandId);
  if (own(command, "projectId")) validateId(command.projectId, ["projectId"], context, parseProjectId);
  if (own(command, "baseRevision") && !validInteger(command.baseRevision, 0)) {
    context.issue("command.base_revision.invalid", "baseRevision must be a non-negative safe integer", ["baseRevision"]);
  }
  if (own(command, "actorId")) validateId(command.actorId, ["actorId"], context, parseActorId);
  if (own(command, "issuedAt")) {
    const parsed = parseIsoDate(command.issuedAt);
    if (!parsed.ok) context.issue(parsed.issues[0]?.code ?? "iso_date.invalid", parsed.issues[0]?.message ?? "issuedAt is invalid", ["issuedAt"]);
  }
  if (own(command, "payload")) validatePayload(command, context);
  return context.issues.length > 0
    ? { ok: false, issues: context.issues }
    : { ok: true, value: value as ProjectCommand };
}

function commandFailure(code: string, message: string, path: readonly (string | number)[]): ValidationResult<Project> {
  return { ok: false, issues: [{ code, message, path }] };
}

function cloneProject(project: Project): Mutable<Project> {
  return JSON.parse(JSON.stringify(project)) as Mutable<Project>;
}

function eventOrder(left: Mutable<PatternEvent>, right: Mutable<PatternEvent>): number {
  if (left.tick !== right.tick) return left.tick - right.tick;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function applyProjectCommand(project: Project, input: unknown): ValidationResult<Project> {
  const current = validateProject(project);
  if (!current.ok) return current;
  const parsed = validateProjectCommand(input);
  if (!parsed.ok) return parsed;
  const command = parsed.value;
  if (command.projectId !== project.id) {
    return commandFailure("command.project_id.mismatch", "command projectId does not match Project", ["projectId"]);
  }
  if (command.baseRevision !== undefined && command.baseRevision !== project.revision) {
    return commandFailure("command.base_revision.conflict", "command baseRevision does not match Project revision", ["baseRevision"]);
  }
  if (project.revision === Number.MAX_SAFE_INTEGER) {
    return commandFailure("project.revision.exhausted", "Project revision cannot be incremented safely", ["revision"]);
  }

  const next = cloneProject(project);
  switch (command.type) {
    case "project.rename":
      next.name = command.payload.name;
      break;
    case "instrument.add": {
      const { instance, placement, channel } = command.payload;
      if (own(next.instruments, instance.id)) return commandFailure("instrument.id.conflict", "instrument instance already exists", ["payload", "instance", "id"]);
      if (own(next.mixer.channels, instance.mixerChannelId)) return commandFailure("mixer.channel.conflict", "mixer channel already exists", ["payload", "instance", "mixerChannelId"]);
      if (placement.instanceId !== instance.id) return commandFailure("instrument.placement.mismatch", "placement instanceId must match the new instrument", ["payload", "placement", "instanceId"]);
      next.instruments[instance.id] = cloneProjectValue(instance);
      next.mixer.channels[instance.mixerChannelId] = cloneProjectValue(channel);
      next.scene.placements.push(cloneProjectValue(placement));
      break;
    }
    case "instrument.move": {
      const index = next.scene.placements.findIndex(({ instanceId }) => instanceId === command.payload.instanceId);
      if (!own(next.instruments, command.payload.instanceId)) return commandFailure("instrument.missing", "instrument instance does not exist", ["payload", "instanceId"]);
      if (index < 0) return commandFailure("instrument.placement.missing", "instrument has no scene placement", ["payload", "instanceId"]);
      const placement = next.scene.placements[index];
      if (!placement) return commandFailure("instrument.placement.missing", "instrument has no scene placement", ["payload", "instanceId"]);
      next.scene.placements[index] = {
        ...placement,
        cell: cloneProjectValue(command.payload.cell),
        ...(command.payload.transform === undefined ? {} : { transform: cloneProjectValue(command.payload.transform) }),
      };
      break;
    }
    case "instrument.remove": {
      const instance = next.instruments[command.payload.instanceId];
      if (!instance) return commandFailure("instrument.missing", "instrument instance does not exist", ["payload", "instanceId"]);
      const usedByPattern = Object.values(next.patterns).some(({ lanes }) => lanes.some(({ targetInstanceId }) => targetInstanceId === instance.id));
      if (usedByPattern) return commandFailure("instrument.in_use.pattern", "remove pattern lanes before removing this instrument", ["payload", "instanceId"]);
      const usedByLoop = Object.values(next.loops).some(({ source }) => source.kind === "audio" && source.targetChannelId === instance.mixerChannelId);
      if (usedByLoop) return commandFailure("instrument.in_use.loop", "remove audio loops before removing this instrument", ["payload", "instanceId"]);
      delete next.instruments[instance.id];
      delete next.mixer.channels[instance.mixerChannelId];
      next.scene.placements = next.scene.placements.filter(({ instanceId }) => instanceId !== instance.id);
      break;
    }
    case "instrument.parameter.set": {
      const instance = next.instruments[command.payload.instanceId];
      if (!instance) return commandFailure("instrument.missing", "instrument instance does not exist", ["payload", "instanceId"]);
      instance.parameters[command.payload.parameterId] = command.payload.value;
      break;
    }
    case "instrument.asset.bind": {
      const instance = next.instruments[command.payload.instanceId];
      if (!instance) return commandFailure("instrument.missing", "instrument instance does not exist", ["payload", "instanceId"]);
      const asset = next.assetRefs[command.payload.assetId];
      if (!asset) return commandFailure("asset.missing", "audio asset does not exist", ["payload", "assetId"]);
      if (asset.expectedKind !== "audio") return commandFailure("asset.kind", "instrument binding requires an audio asset", ["payload", "assetId"]);
      instance.audioAssetBindings ??= {};
      instance.audioAssetBindings[command.payload.bindingId] = command.payload.assetId;
      break;
    }
    case "mixer.gain.set": {
      const channel = next.mixer.channels[command.payload.channelId];
      if (!channel) return commandFailure("mixer.channel.missing", "mixer channel does not exist", ["payload", "channelId"]);
      channel.gain = command.payload.gain;
      break;
    }
    case "mixer.pan.set": {
      const channel = next.mixer.channels[command.payload.channelId];
      if (!channel) return commandFailure("mixer.channel.missing", "mixer channel does not exist", ["payload", "channelId"]);
      channel.pan = command.payload.pan;
      break;
    }
    case "mixer.mute.set": {
      const channel = next.mixer.channels[command.payload.channelId];
      if (!channel) return commandFailure("mixer.channel.missing", "mixer channel does not exist", ["payload", "channelId"]);
      channel.mute = command.payload.mute;
      break;
    }
    case "transport.bpm.set":
      next.transport.bpm = command.payload.bpm;
      break;
    case "transport.loopRange.set":
      if (command.payload.loopRange === undefined) delete next.transport.loopRange;
      else next.transport.loopRange = cloneProjectValue(command.payload.loopRange);
      break;
    case "pattern.event.upsert": {
      const pattern = next.patterns[command.payload.patternId];
      if (!pattern) return commandFailure("pattern.missing", "pattern does not exist", ["payload", "patternId"]);
      if (!own(next.instruments, command.payload.targetInstanceId)) return commandFailure("instrument.missing", "target instrument does not exist", ["payload", "targetInstanceId"]);
      for (const lane of pattern.lanes) lane.events = lane.events.filter(({ id }) => id !== command.payload.event.id);
      let lane = pattern.lanes.find(({ targetInstanceId }) => targetInstanceId === command.payload.targetInstanceId);
      if (!lane) {
        lane = { targetInstanceId: command.payload.targetInstanceId, events: [] };
        pattern.lanes.push(lane);
      }
      lane.events.push(cloneProjectValue(command.payload.event));
      lane.events.sort(eventOrder);
      break;
    }
    case "pattern.event.remove": {
      const pattern = next.patterns[command.payload.patternId];
      if (!pattern) return commandFailure("pattern.missing", "pattern does not exist", ["payload", "patternId"]);
      const present = pattern.lanes.some(({ events }) => events.some(({ id }) => id === command.payload.eventId));
      if (!present) return commandFailure("pattern_event.missing", "pattern event does not exist", ["payload", "eventId"]);
      for (const lane of pattern.lanes) lane.events = lane.events.filter(({ id }) => id !== command.payload.eventId);
      break;
    }
    case "loop.upsert":
      next.loops[command.payload.loop.id] = cloneProjectValue(command.payload.loop);
      break;
    case "loop.remove":
      if (!own(next.loops, command.payload.loopId)) return commandFailure("loop.missing", "loop does not exist", ["payload", "loopId"]);
      delete next.loops[command.payload.loopId];
      break;
  }

  next.revision = project.revision + 1;
  if (command.issuedAt !== undefined) next.updatedAt = command.issuedAt;
  return validateProject(next);
}

function cloneProjectValue<Value>(value: Value): Mutable<Value> {
  return JSON.parse(JSON.stringify(value)) as Mutable<Value>;
}
