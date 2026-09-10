export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export function isJsonValue(value: unknown): value is JsonValue {
  return visit(value, new WeakSet<object>());
}

function visit(value: unknown, ancestors: WeakSet<object>): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => visit(entry, ancestors))
    : isPlainObject(value) && Object.values(value).every((entry) => visit(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
