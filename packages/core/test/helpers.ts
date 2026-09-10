import type { ValidationResult } from "@pocket-jam/shared";

export type Mutable<Value> = Value extends string | number | boolean | null
  ? Value
  : Value extends readonly (infer Entry)[]
    ? Mutable<Entry>[]
    : Value extends object
      ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
      : Value;

export function clone<Value>(value: Value): Mutable<Value> {
  return JSON.parse(JSON.stringify(value)) as Mutable<Value>;
}

export function required<Value>(result: ValidationResult<Value>): Value {
  if (!result.ok) throw new Error(result.issues.map(({ message }) => message).join("; "));
  return result.value;
}

export function issueCodes(result: ValidationResult<unknown>): string[] {
  return result.ok ? [] : result.issues.map(({ code }) => code);
}
