import {
  isJsonValue,
  type JsonPrimitive,
  type ValidationIssue,
  type ValidationResult,
} from "@pocket-jam/shared";
import {
  parseAssetId,
  parseEffectBusId,
  parseEventId,
  parseInstrumentDefinitionId,
  parseInstrumentInstanceId,
  parseLoopId,
  parseMixerChannelId,
  parseParameterId,
  parsePatternId,
  parseProjectId,
  parseVisualEnvironmentId,
} from "./ids.js";
import {
  MAX_BPM,
  MIN_BPM,
  MIN_SCENE_COLUMNS,
  MIN_SCENE_ROWS,
  PROJECT_SCHEMA_VERSION,
  type IsoDate,
  type Project,
} from "./project.js";

type Path = readonly (string | number)[];
type UnknownRecord = Record<string, unknown>;
type IdParser = (value: unknown) => ValidationResult<string>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const BINDING_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const TIME_SIGNATURE_DENOMINATORS = new Set([1, 2, 4, 8, 16, 32]);

export class ValidationContext {
  readonly issues: ValidationIssue[] = [];

  issue(code: string, message: string, path: Path): void {
    this.issues.push({ code, message, path });
  }
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function record(value: unknown, path: Path, context: ValidationContext, label: string): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    context.issue("type.object", `${label} must be an object`, path);
    return undefined;
  }
  return value as UnknownRecord;
}

function shape(
  value: unknown,
  path: Path,
  context: ValidationContext,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): UnknownRecord | undefined {
  const result = record(value, path, context, label);
  if (!result) return undefined;
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) context.issue("field.unknown", `${label} contains unknown field ${key}`, [...path, key]);
  }
  for (const key of required) {
    if (!hasOwn(result, key)) context.issue("field.required", `${label}.${key} is required`, [...path, key]);
  }
  return result;
}

function nonEmptyString(value: unknown, path: Path, context: ValidationContext, label: string): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    context.issue("string.invalid", `${label} must be a non-empty string without surrounding whitespace`, path);
    return false;
  }
  return true;
}

function finiteNumber(value: unknown, path: Path, context: ValidationContext, label: string): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    context.issue("number.invalid", `${label} must be a finite number`, path);
    return false;
  }
  return true;
}

function integer(value: unknown, path: Path, context: ValidationContext, label: string, minimum = 0): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    context.issue("integer.invalid", `${label} must be a safe integer greater than or equal to ${minimum}`, path);
    return false;
  }
  return true;
}

function boolean(value: unknown, path: Path, context: ValidationContext, label: string): value is boolean {
  if (typeof value !== "boolean") {
    context.issue("boolean.invalid", `${label} must be a boolean`, path);
    return false;
  }
  return true;
}

export function validateId(
  value: unknown,
  path: Path,
  context: ValidationContext,
  parser: IdParser,
): value is string {
  const parsed = parser(value);
  if (parsed.ok) return true;
  for (const issue of parsed.issues) context.issue(issue.code, issue.message, [...path, ...issue.path]);
  return false;
}

export function parseIsoDate(value: unknown): ValidationResult<IsoDate> {
  const timestamp = typeof value === "string" && ISO_DATE_PATTERN.test(value) ? Date.parse(value) : Number.NaN;
  const canonical = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  const matchesCanonical = canonical === value || canonical.replace(".000Z", "Z") === value;
  if (!matchesCanonical) {
    return {
      ok: false,
      issues: [{ code: "iso_date.invalid", message: "date must be an ISO-8601 UTC string", path: [] }],
    };
  }
  return { ok: true, value: value as IsoDate };
}

function isoDate(value: unknown, path: Path, context: ValidationContext): value is IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed.ok) return true;
  context.issue(parsed.issues[0]?.code ?? "iso_date.invalid", parsed.issues[0]?.message ?? "invalid date", path);
  return false;
}

function jsonPrimitive(value: unknown, path: Path, context: ValidationContext, label: string): value is JsonPrimitive {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ) return true;
  context.issue("json_primitive.invalid", `${label} must be a finite JSON primitive`, path);
  return false;
}

function validateIdKeyedRecord(
  value: unknown,
  path: Path,
  context: ValidationContext,
  label: string,
  parser: IdParser,
): UnknownRecord | undefined {
  const result = record(value, path, context, label);
  if (!result) return undefined;
  for (const key of Object.keys(result)) validateId(key, [...path, key], context, parser);
  return result;
}

function validateParameterValues(value: unknown, path: Path, context: ValidationContext): void {
  const values = validateIdKeyedRecord(value, path, context, "parameters", parseParameterId);
  if (!values) return;
  for (const [key, entry] of Object.entries(values)) jsonPrimitive(entry, [...path, key], context, "parameter value");
}

function validateNumericParameters(value: unknown, path: Path, context: ValidationContext): void {
  const values = validateIdKeyedRecord(value, path, context, "parameters", parseParameterId);
  if (!values) return;
  for (const [key, entry] of Object.entries(values)) finiteNumber(entry, [...path, key], context, "parameter value");
}

export function validateSceneCellValue(value: unknown, path: Path, context: ValidationContext): void {
  const cell = shape(value, path, context, "scene cell", ["column", "row"]);
  if (!cell) return;
  if (hasOwn(cell, "column")) integer(cell.column, [...path, "column"], context, "column");
  if (hasOwn(cell, "row")) integer(cell.row, [...path, "row"], context, "row");
}

function validateFootprintValue(value: unknown, path: Path, context: ValidationContext): void {
  const footprint = shape(value, path, context, "scene footprint", ["columns", "rows"]);
  if (!footprint) return;
  if (hasOwn(footprint, "columns")) integer(footprint.columns, [...path, "columns"], context, "footprint columns", 1);
  if (hasOwn(footprint, "rows")) integer(footprint.rows, [...path, "rows"], context, "footprint rows", 1);
}

export function validateSceneTransformValue(value: unknown, path: Path, context: ValidationContext): void {
  const transform = shape(
    value,
    path,
    context,
    "scene transform",
    ["offsetX", "offsetY", "elevation", "yaw", "scale"],
  );
  if (!transform) return;
  for (const key of ["offsetX", "offsetY", "elevation", "yaw", "scale"] as const) {
    if (hasOwn(transform, key)) finiteNumber(transform[key], [...path, key], context, key);
  }
  if (typeof transform.scale === "number" && transform.scale <= 0) {
    context.issue("scene.scale.invalid", "scene transform scale must be positive", [...path, "scale"]);
  }
}

export function validateScenePlacementValue(value: unknown, path: Path, context: ValidationContext): void {
  const placement = shape(value, path, context, "scene placement", ["instanceId", "cell", "footprint"], ["transform"]);
  if (!placement) return;
  if (hasOwn(placement, "instanceId")) validateId(placement.instanceId, [...path, "instanceId"], context, parseInstrumentInstanceId);
  if (hasOwn(placement, "cell")) validateSceneCellValue(placement.cell, [...path, "cell"], context);
  if (hasOwn(placement, "footprint")) validateFootprintValue(placement.footprint, [...path, "footprint"], context);
  if (hasOwn(placement, "transform")) validateSceneTransformValue(placement.transform, [...path, "transform"], context);
}

export function validateInstrumentInstanceValue(value: unknown, path: Path, context: ValidationContext): void {
  const instance = shape(
    value,
    path,
    context,
    "instrument instance",
    ["id", "definitionId", "parameters", "mixerChannelId"],
    ["audioAssetBindings"],
  );
  if (!instance) return;
  if (hasOwn(instance, "id")) validateId(instance.id, [...path, "id"], context, parseInstrumentInstanceId);
  if (hasOwn(instance, "definitionId")) validateId(instance.definitionId, [...path, "definitionId"], context, parseInstrumentDefinitionId);
  if (hasOwn(instance, "parameters")) validateParameterValues(instance.parameters, [...path, "parameters"], context);
  if (hasOwn(instance, "mixerChannelId")) validateId(instance.mixerChannelId, [...path, "mixerChannelId"], context, parseMixerChannelId);
  if (hasOwn(instance, "audioAssetBindings")) {
    const bindings = record(instance.audioAssetBindings, [...path, "audioAssetBindings"], context, "audio asset bindings");
    if (bindings) {
      for (const [key, assetId] of Object.entries(bindings)) {
        if (!BINDING_ID_PATTERN.test(key)) {
          context.issue("asset_binding.id.invalid", "asset binding ID is invalid", [...path, "audioAssetBindings", key]);
        }
        validateId(assetId, [...path, "audioAssetBindings", key], context, parseAssetId);
      }
    }
  }
}

export function validatePatternEventValue(value: unknown, path: Path, context: ValidationContext): void {
  const event = shape(
    value,
    path,
    context,
    "pattern event",
    ["id", "tick", "kind", "velocity"],
    ["note", "durationTicks", "parameterLocks"],
  );
  if (!event) return;
  if (hasOwn(event, "id")) validateId(event.id, [...path, "id"], context, parseEventId);
  if (hasOwn(event, "tick")) integer(event.tick, [...path, "tick"], context, "event tick");
  if (hasOwn(event, "kind") && event.kind !== "trigger" && event.kind !== "note") {
    context.issue("pattern_event.kind.invalid", "event kind must be trigger or note", [...path, "kind"]);
  }
  if (hasOwn(event, "velocity") && finiteNumber(event.velocity, [...path, "velocity"], context, "event velocity")) {
    if (event.velocity < 0 || event.velocity > 1) {
      context.issue("pattern_event.velocity.invalid", "event velocity must be between 0 and 1", [...path, "velocity"]);
    }
  }
  if (event.kind === "note" && !hasOwn(event, "note")) {
    context.issue("field.required", "note events require a MIDI note", [...path, "note"]);
  }
  if (hasOwn(event, "note") && integer(event.note, [...path, "note"], context, "MIDI note")) {
    if (event.note > 127) context.issue("pattern_event.note.invalid", "MIDI note must be between 0 and 127", [...path, "note"]);
  }
  if (hasOwn(event, "durationTicks")) integer(event.durationTicks, [...path, "durationTicks"], context, "event duration", 1);
  if (hasOwn(event, "parameterLocks")) validateNumericParameters(event.parameterLocks, [...path, "parameterLocks"], context);
}

function validatePatternValue(value: unknown, path: Path, context: ValidationContext): void {
  const pattern = shape(value, path, context, "pattern", ["id", "name", "lengthTicks", "resolution", "lanes"]);
  if (!pattern) return;
  if (hasOwn(pattern, "id")) validateId(pattern.id, [...path, "id"], context, parsePatternId);
  if (hasOwn(pattern, "name")) nonEmptyString(pattern.name, [...path, "name"], context, "pattern name");
  if (hasOwn(pattern, "lengthTicks")) integer(pattern.lengthTicks, [...path, "lengthTicks"], context, "pattern length", 1);
  if (hasOwn(pattern, "resolution")) integer(pattern.resolution, [...path, "resolution"], context, "pattern resolution", 1);
  if (!hasOwn(pattern, "lanes")) return;
  if (!Array.isArray(pattern.lanes) || pattern.lanes.length === 0) {
    context.issue("pattern.lanes.invalid", "pattern must contain at least one lane", [...path, "lanes"]);
    return;
  }
  const laneTargets = new Set<string>();
  pattern.lanes.forEach((entry, laneIndex) => {
    const lanePath = [...path, "lanes", laneIndex];
    const lane = shape(entry, lanePath, context, "pattern lane", ["targetInstanceId", "events"]);
    if (!lane) return;
    if (hasOwn(lane, "targetInstanceId") && validateId(lane.targetInstanceId, [...lanePath, "targetInstanceId"], context, parseInstrumentInstanceId)) {
      if (laneTargets.has(lane.targetInstanceId as string)) {
        context.issue("pattern.lane.duplicate", "pattern cannot contain duplicate lanes for one instance", [...lanePath, "targetInstanceId"]);
      }
      laneTargets.add(lane.targetInstanceId as string);
    }
    if (!hasOwn(lane, "events")) return;
    if (!Array.isArray(lane.events)) {
      context.issue("type.array", "pattern lane events must be an array", [...lanePath, "events"]);
      return;
    }
    lane.events.forEach((event, eventIndex) => validatePatternEventValue(event, [...lanePath, "events", eventIndex], context));
  });
}

export function validateMusicalLoopValue(value: unknown, path: Path, context: ValidationContext): void {
  const loop = shape(
    value,
    path,
    context,
    "musical loop",
    ["id", "enabled", "source", "startTick", "lengthTicks", "repeat"],
    ["sourceOffsetTicks"],
  );
  if (!loop) return;
  if (hasOwn(loop, "id")) validateId(loop.id, [...path, "id"], context, parseLoopId);
  if (hasOwn(loop, "enabled")) boolean(loop.enabled, [...path, "enabled"], context, "loop enabled");
  if (hasOwn(loop, "startTick")) integer(loop.startTick, [...path, "startTick"], context, "loop start tick");
  if (hasOwn(loop, "lengthTicks")) integer(loop.lengthTicks, [...path, "lengthTicks"], context, "loop length", 1);
  if (hasOwn(loop, "sourceOffsetTicks")) integer(loop.sourceOffsetTicks, [...path, "sourceOffsetTicks"], context, "loop source offset");
  if (hasOwn(loop, "repeat")) boolean(loop.repeat, [...path, "repeat"], context, "loop repeat");
  if (!hasOwn(loop, "source")) return;
  const source = record(loop.source, [...path, "source"], context, "loop source");
  if (!source) return;
  if (source.kind === "pattern") {
    const patternSource = shape(source, [...path, "source"], context, "pattern loop source", ["kind", "patternId"]);
    if (patternSource && hasOwn(patternSource, "patternId")) {
      validateId(patternSource.patternId, [...path, "source", "patternId"], context, parsePatternId);
    }
  } else if (source.kind === "audio") {
    const audioSource = shape(source, [...path, "source"], context, "audio loop source", ["kind", "assetId", "targetChannelId"]);
    if (audioSource && hasOwn(audioSource, "assetId")) {
      validateId(audioSource.assetId, [...path, "source", "assetId"], context, parseAssetId);
    }
    if (audioSource && hasOwn(audioSource, "targetChannelId")) {
      validateId(audioSource.targetChannelId, [...path, "source", "targetChannelId"], context, parseMixerChannelId);
    }
  } else {
    context.issue("loop.source.kind.invalid", "loop source kind must be pattern or audio", [...path, "source", "kind"]);
  }
}

export function validateMixerChannelValue(value: unknown, path: Path, context: ValidationContext): void {
  const channel = shape(value, path, context, "mixer channel", ["gain", "pan", "mute", "solo", "sends"]);
  if (!channel) return;
  if (hasOwn(channel, "gain") && finiteNumber(channel.gain, [...path, "gain"], context, "channel gain") && channel.gain < 0) {
    context.issue("mixer.gain.invalid", "channel gain cannot be negative", [...path, "gain"]);
  }
  if (hasOwn(channel, "pan") && finiteNumber(channel.pan, [...path, "pan"], context, "channel pan")) {
    if (channel.pan < -1 || channel.pan > 1) context.issue("mixer.pan.invalid", "channel pan must be between -1 and 1", [...path, "pan"]);
  }
  if (hasOwn(channel, "mute")) boolean(channel.mute, [...path, "mute"], context, "channel mute");
  if (hasOwn(channel, "solo")) boolean(channel.solo, [...path, "solo"], context, "channel solo");
  if (hasOwn(channel, "sends")) {
    const sends = validateIdKeyedRecord(channel.sends, [...path, "sends"], context, "mixer sends", parseEffectBusId);
    if (sends) {
      for (const [busId, amount] of Object.entries(sends)) {
        if (finiteNumber(amount, [...path, "sends", busId], context, "send amount") && (amount < 0 || amount > 1)) {
          context.issue("mixer.send.invalid", "send amount must be between 0 and 1", [...path, "sends", busId]);
        }
      }
    }
  }
}

function validateTransport(value: unknown, path: Path, context: ValidationContext): void {
  const transport = shape(
    value,
    path,
    context,
    "transport",
    ["bpm", "timeSignature", "swing", "swingSubdivision"],
    ["loopRange"],
  );
  if (!transport) return;
  if (hasOwn(transport, "bpm") && finiteNumber(transport.bpm, [...path, "bpm"], context, "BPM")) {
    if (transport.bpm < MIN_BPM || transport.bpm > MAX_BPM) {
      context.issue("transport.bpm.invalid", `BPM must be between ${MIN_BPM} and ${MAX_BPM}`, [...path, "bpm"]);
    }
  }
  if (hasOwn(transport, "swing") && finiteNumber(transport.swing, [...path, "swing"], context, "swing")) {
    if (transport.swing < 0 || transport.swing > 1) {
      context.issue("transport.swing.invalid", "swing must be between 0 and 1", [...path, "swing"]);
    }
  }
  if (hasOwn(transport, "swingSubdivision") && transport.swingSubdivision !== "1/8" && transport.swingSubdivision !== "1/16") {
    context.issue("transport.swing_subdivision.invalid", "swing subdivision must be 1/8 or 1/16", [...path, "swingSubdivision"]);
  }
  if (hasOwn(transport, "timeSignature")) {
    const signature = shape(transport.timeSignature, [...path, "timeSignature"], context, "time signature", ["numerator", "denominator"]);
    if (signature) {
      if (hasOwn(signature, "numerator")) integer(signature.numerator, [...path, "timeSignature", "numerator"], context, "time signature numerator", 1);
      if (hasOwn(signature, "denominator") && integer(signature.denominator, [...path, "timeSignature", "denominator"], context, "time signature denominator", 1)) {
        if (!TIME_SIGNATURE_DENOMINATORS.has(signature.denominator)) {
          context.issue("transport.time_signature.invalid", "time signature denominator must be a supported power of two", [...path, "timeSignature", "denominator"]);
        }
      }
    }
  }
  if (hasOwn(transport, "loopRange")) {
    const range = shape(transport.loopRange, [...path, "loopRange"], context, "transport loop range", ["startTick", "endTick"]);
    if (range) {
      if (hasOwn(range, "startTick")) integer(range.startTick, [...path, "loopRange", "startTick"], context, "loop start tick");
      if (hasOwn(range, "endTick")) integer(range.endTick, [...path, "loopRange", "endTick"], context, "loop end tick", 1);
      if (typeof range.startTick === "number" && typeof range.endTick === "number" && range.endTick <= range.startTick) {
        context.issue("transport.loop_range.invalid", "loop range end must be after its start", [...path, "loopRange"]);
      }
    }
  }
}

function validateScene(value: unknown, path: Path, context: ValidationContext): void {
  const scene = shape(value, path, context, "scene", ["columns", "rows", "placements"], ["visualEnvironmentId"]);
  if (!scene) return;
  const columnsValid = hasOwn(scene, "columns") && integer(scene.columns, [...path, "columns"], context, "scene columns", MIN_SCENE_COLUMNS);
  const rowsValid = hasOwn(scene, "rows") && integer(scene.rows, [...path, "rows"], context, "scene rows", MIN_SCENE_ROWS);
  if (hasOwn(scene, "visualEnvironmentId")) validateId(scene.visualEnvironmentId, [...path, "visualEnvironmentId"], context, parseVisualEnvironmentId);
  if (!hasOwn(scene, "placements")) return;
  if (!Array.isArray(scene.placements)) {
    context.issue("type.array", "scene placements must be an array", [...path, "placements"]);
    return;
  }
  const placedInstances = new Set<string>();
  const occupiedCells = new Map<string, number>();
  scene.placements.forEach((entry, index) => {
    const placementPath = [...path, "placements", index];
    validateScenePlacementValue(entry, placementPath, context);
    const placement = entry as UnknownRecord;
    if (typeof placement?.instanceId === "string") {
      if (placedInstances.has(placement.instanceId)) {
        context.issue("scene.placement.duplicate", "an instrument instance may be placed only once", [...placementPath, "instanceId"]);
      }
      placedInstances.add(placement.instanceId);
    }
    const cell = placement?.cell as UnknownRecord | undefined;
    const footprint = placement?.footprint as UnknownRecord | undefined;
    if (
      columnsValid && rowsValid
      && Number.isSafeInteger(cell?.column) && Number.isSafeInteger(cell?.row)
      && Number.isSafeInteger(footprint?.columns) && Number.isSafeInteger(footprint?.rows)
      && (footprint?.columns as number) > 0 && (footprint?.rows as number) > 0
    ) {
      const column = cell?.column as number;
      const row = cell?.row as number;
      const width = footprint?.columns as number;
      const height = footprint?.rows as number;
      if (column + width > (scene.columns as number) || row + height > (scene.rows as number)) {
        context.issue("scene.placement.out_of_bounds", "placement footprint must fit inside the scene", placementPath);
      } else {
        for (let x = column; x < column + width; x += 1) {
          for (let y = row; y < row + height; y += 1) {
            const key = `${x}:${y}`;
            const previous = occupiedCells.get(key);
            if (previous !== undefined) {
              context.issue("scene.placement.overlap", `placement overlaps placement ${previous}`, placementPath);
            } else {
              occupiedCells.set(key, index);
            }
          }
        }
      }
    }
  });
}

function validateMixer(value: unknown, path: Path, context: ValidationContext): void {
  const mixer = shape(value, path, context, "mixer", ["master", "channels", "buses"]);
  if (!mixer) return;
  if (hasOwn(mixer, "master")) {
    const master = shape(mixer.master, [...path, "master"], context, "master mixer", ["gain"], ["effectChainPresetId"]);
    if (master) {
      if (hasOwn(master, "gain") && finiteNumber(master.gain, [...path, "master", "gain"], context, "master gain") && master.gain < 0) {
        context.issue("mixer.gain.invalid", "master gain cannot be negative", [...path, "master", "gain"]);
      }
      if (hasOwn(master, "effectChainPresetId")) nonEmptyString(master.effectChainPresetId, [...path, "master", "effectChainPresetId"], context, "effect chain preset ID");
    }
  }
  if (hasOwn(mixer, "channels")) {
    const channels = validateIdKeyedRecord(mixer.channels, [...path, "channels"], context, "mixer channels", parseMixerChannelId);
    if (channels) {
      for (const [channelId, channel] of Object.entries(channels)) validateMixerChannelValue(channel, [...path, "channels", channelId], context);
    }
  }
  if (hasOwn(mixer, "buses")) {
    const buses = validateIdKeyedRecord(mixer.buses, [...path, "buses"], context, "effect buses", parseEffectBusId);
    if (buses) {
      for (const [busId, entry] of Object.entries(buses)) {
        const bus = shape(entry, [...path, "buses", busId], context, "effect bus", ["effectProgramId", "parameters"]);
        if (!bus) continue;
        if (hasOwn(bus, "effectProgramId")) nonEmptyString(bus.effectProgramId, [...path, "buses", busId, "effectProgramId"], context, "effect program ID");
        if (hasOwn(bus, "parameters")) validateNumericParameters(bus.parameters, [...path, "buses", busId, "parameters"], context);
      }
    }
  }
}

function validateAssetReferenceValue(value: unknown, path: Path, context: ValidationContext): void {
  const asset = shape(value, path, context, "asset reference", ["assetId", "expectedKind"]);
  if (!asset) return;
  if (hasOwn(asset, "assetId")) validateId(asset.assetId, [...path, "assetId"], context, parseAssetId);
  if (hasOwn(asset, "expectedKind") && asset.expectedKind !== "audio" && asset.expectedKind !== "visual") {
    context.issue("asset.kind.invalid", "asset expectedKind must be audio or visual", [...path, "expectedKind"]);
  }
}

function hasKey(value: unknown, key: string): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && hasOwn(value as UnknownRecord, key);
}

function crossValidate(project: UnknownRecord, context: ValidationContext): void {
  const instruments = record(project.instruments, ["instruments"], context, "instruments") ?? {};
  const patterns = record(project.patterns, ["patterns"], context, "patterns") ?? {};
  const loops = record(project.loops, ["loops"], context, "loops") ?? {};
  const assets = record(project.assetRefs, ["assetRefs"], context, "asset references") ?? {};
  const mixer = project.mixer as UnknownRecord | undefined;
  const channels = record(mixer?.channels, ["mixer", "channels"], context, "mixer channels") ?? {};
  const buses = record(mixer?.buses, ["mixer", "buses"], context, "effect buses") ?? {};

  const seenInstanceIds = new Set<string>();
  const usedChannels = new Set<string>();
  for (const [key, value] of Object.entries(instruments)) {
    const instance = value as UnknownRecord;
    if (typeof instance?.id === "string") {
      if (instance.id !== key) context.issue("record.key_mismatch", "instrument record key must match instance ID", ["instruments", key, "id"]);
      if (seenInstanceIds.has(instance.id)) context.issue("instrument.id.duplicate", "instrument instance IDs must be unique", ["instruments", key, "id"]);
      seenInstanceIds.add(instance.id);
    }
    if (typeof instance?.mixerChannelId === "string") {
      if (!hasKey(channels, instance.mixerChannelId)) {
        context.issue("instrument.channel.missing", "instrument mixer channel does not exist", ["instruments", key, "mixerChannelId"]);
      }
      if (usedChannels.has(instance.mixerChannelId)) {
        context.issue("instrument.channel.duplicate", "each instrument instance must own a distinct mixer channel", ["instruments", key, "mixerChannelId"]);
      }
      usedChannels.add(instance.mixerChannelId);
    }
    const bindings = instance?.audioAssetBindings as UnknownRecord | undefined;
    if (bindings && typeof bindings === "object") {
      for (const [bindingId, assetId] of Object.entries(bindings)) {
        if (typeof assetId === "string" && !hasKey(assets, assetId)) {
          context.issue("instrument.asset.missing", "bound audio asset does not exist", ["instruments", key, "audioAssetBindings", bindingId]);
        } else if (typeof assetId === "string" && (assets[assetId] as UnknownRecord)?.expectedKind !== "audio") {
          context.issue("instrument.asset.kind", "instrument bindings require audio assets", ["instruments", key, "audioAssetBindings", bindingId]);
        }
      }
    }
  }

  const placements = (project.scene as UnknownRecord | undefined)?.placements;
  if (Array.isArray(placements)) {
    placements.forEach((placement, index) => {
      const instanceId = (placement as UnknownRecord)?.instanceId;
      if (typeof instanceId === "string" && !hasKey(instruments, instanceId)) {
        context.issue("scene.instance.missing", "scene placement references a missing instrument", ["scene", "placements", index, "instanceId"]);
      }
    });
  }

  const seenPatternIds = new Set<string>();
  const seenEventIds = new Set<string>();
  for (const [key, value] of Object.entries(patterns)) {
    const pattern = value as UnknownRecord;
    if (typeof pattern?.id === "string") {
      if (pattern.id !== key) context.issue("record.key_mismatch", "pattern record key must match pattern ID", ["patterns", key, "id"]);
      if (seenPatternIds.has(pattern.id)) context.issue("pattern.id.duplicate", "pattern IDs must be unique", ["patterns", key, "id"]);
      seenPatternIds.add(pattern.id);
    }
    const lanes = pattern?.lanes;
    if (!Array.isArray(lanes)) continue;
    lanes.forEach((laneValue, laneIndex) => {
      const lane = laneValue as UnknownRecord;
      if (typeof lane?.targetInstanceId === "string" && !hasKey(instruments, lane.targetInstanceId)) {
        context.issue("pattern.instance.missing", "pattern lane targets a missing instrument", ["patterns", key, "lanes", laneIndex, "targetInstanceId"]);
      }
      if (!Array.isArray(lane?.events)) return;
      lane.events.forEach((eventValue, eventIndex) => {
        const event = eventValue as UnknownRecord;
        const eventPath = ["patterns", key, "lanes", laneIndex, "events", eventIndex] as const;
        if (typeof event?.id === "string") {
          if (seenEventIds.has(event.id)) context.issue("pattern_event.id.duplicate", "event IDs must be unique across the Project", [...eventPath, "id"]);
          seenEventIds.add(event.id);
        }
        if (typeof event?.tick === "number" && typeof pattern?.lengthTicks === "number" && event.tick >= pattern.lengthTicks) {
          context.issue("pattern_event.tick.invalid", "event tick must be before pattern length", [...eventPath, "tick"]);
        }
      });
    });
  }

  const seenLoopIds = new Set<string>();
  for (const [key, value] of Object.entries(loops)) {
    const loop = value as UnknownRecord;
    if (typeof loop?.id === "string") {
      if (loop.id !== key) context.issue("record.key_mismatch", "loop record key must match loop ID", ["loops", key, "id"]);
      if (seenLoopIds.has(loop.id)) context.issue("loop.id.duplicate", "loop IDs must be unique", ["loops", key, "id"]);
      seenLoopIds.add(loop.id);
    }
    const source = loop?.source as UnknownRecord | undefined;
    if (source?.kind === "pattern" && typeof source.patternId === "string" && !hasKey(patterns, source.patternId)) {
      context.issue("loop.pattern.missing", "loop references a missing pattern", ["loops", key, "source", "patternId"]);
    }
    if (source?.kind === "audio" && typeof source.assetId === "string") {
      if (!hasKey(assets, source.assetId)) {
        context.issue("loop.asset.missing", "loop references a missing asset", ["loops", key, "source", "assetId"]);
      } else if ((assets[source.assetId] as UnknownRecord)?.expectedKind !== "audio") {
        context.issue("loop.asset.kind", "audio loop requires an audio asset", ["loops", key, "source", "assetId"]);
      }
    }
    if (source?.kind === "audio" && typeof source.targetChannelId === "string" && !hasKey(channels, source.targetChannelId)) {
      context.issue("loop.channel.missing", "audio loop target channel does not exist", ["loops", key, "source", "targetChannelId"]);
    }
  }

  const seenAssetIds = new Set<string>();
  for (const [key, value] of Object.entries(assets)) {
    const asset = value as UnknownRecord;
    if (typeof asset?.assetId === "string") {
      if (asset.assetId !== key) context.issue("record.key_mismatch", "asset record key must match asset ID", ["assetRefs", key, "assetId"]);
      if (seenAssetIds.has(asset.assetId)) context.issue("asset.id.duplicate", "asset IDs must be unique", ["assetRefs", key, "assetId"]);
      seenAssetIds.add(asset.assetId);
    }
  }

  for (const [channelId, channelValue] of Object.entries(channels)) {
    const sends = (channelValue as UnknownRecord)?.sends as UnknownRecord | undefined;
    if (!sends || typeof sends !== "object") continue;
    for (const busId of Object.keys(sends)) {
      if (!hasKey(buses, busId)) context.issue("mixer.bus.missing", "channel send references a missing effect bus", ["mixer", "channels", channelId, "sends", busId]);
    }
  }
}

export function validateProject(value: unknown): ValidationResult<Project> {
  if (!isJsonValue(value)) {
    return {
      ok: false,
      issues: [{
        code: "project.json.invalid",
        message: "Project must contain only finite JSON values and plain acyclic objects",
        path: [],
      }],
    };
  }
  const context = new ValidationContext();
  const project = shape(
    value,
    [],
    context,
    "Project",
    ["schemaVersion", "id", "revision", "name", "createdAt", "updatedAt", "transport", "scene", "instruments", "patterns", "loops", "mixer", "assetRefs"],
  );
  if (!project) return { ok: false, issues: context.issues };

  if (hasOwn(project, "schemaVersion") && project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    context.issue("project.schema_version.unsupported", `schemaVersion must be ${PROJECT_SCHEMA_VERSION}`, ["schemaVersion"]);
  }
  if (hasOwn(project, "id")) validateId(project.id, ["id"], context, parseProjectId);
  if (hasOwn(project, "revision")) integer(project.revision, ["revision"], context, "Project revision");
  if (hasOwn(project, "name")) nonEmptyString(project.name, ["name"], context, "Project name");
  if (hasOwn(project, "createdAt")) isoDate(project.createdAt, ["createdAt"], context);
  if (hasOwn(project, "updatedAt")) isoDate(project.updatedAt, ["updatedAt"], context);
  if (hasOwn(project, "transport")) validateTransport(project.transport, ["transport"], context);
  if (hasOwn(project, "scene")) validateScene(project.scene, ["scene"], context);

  const instruments = hasOwn(project, "instruments")
    ? validateIdKeyedRecord(project.instruments, ["instruments"], context, "instruments", parseInstrumentInstanceId)
    : undefined;
  if (instruments) {
    for (const [id, instance] of Object.entries(instruments)) validateInstrumentInstanceValue(instance, ["instruments", id], context);
  }
  const patterns = hasOwn(project, "patterns")
    ? validateIdKeyedRecord(project.patterns, ["patterns"], context, "patterns", parsePatternId)
    : undefined;
  if (patterns) {
    for (const [id, pattern] of Object.entries(patterns)) validatePatternValue(pattern, ["patterns", id], context);
  }
  const loops = hasOwn(project, "loops")
    ? validateIdKeyedRecord(project.loops, ["loops"], context, "loops", parseLoopId)
    : undefined;
  if (loops) {
    for (const [id, loop] of Object.entries(loops)) validateMusicalLoopValue(loop, ["loops", id], context);
  }
  if (hasOwn(project, "mixer")) validateMixer(project.mixer, ["mixer"], context);
  const assets = hasOwn(project, "assetRefs")
    ? validateIdKeyedRecord(project.assetRefs, ["assetRefs"], context, "asset references", parseAssetId)
    : undefined;
  if (assets) {
    for (const [id, asset] of Object.entries(assets)) validateAssetReferenceValue(asset, ["assetRefs", id], context);
  }

  crossValidate(project, context);
  return context.issues.length > 0
    ? { ok: false, issues: context.issues }
    : { ok: true, value: value as Project };
}
