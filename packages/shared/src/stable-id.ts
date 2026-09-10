import { validationFailure, validationSuccess, type ValidationResult } from "./validation.js";

declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };
export type StableId<Kind extends string> = Brand<string, `pocket-jam:${Kind}`>;

export function parseStableId<Kind extends string>(value: unknown, kind: Kind): ValidationResult<StableId<Kind>> {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return validationFailure({
      code: "stable_id.invalid",
      message: `${kind} ID must be a non-empty string without surrounding whitespace`,
      path: [],
    });
  }
  return validationSuccess(value as StableId<Kind>);
}
