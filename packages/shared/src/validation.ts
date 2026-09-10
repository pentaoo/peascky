export type ValidationIssue = Readonly<{
  code: string;
  message: string;
  path: readonly (string | number)[];
}>;

export type ValidationSuccess<Value> = Readonly<{
  ok: true;
  value: Value;
}>;

export type ValidationFailure = Readonly<{
  ok: false;
  issues: readonly ValidationIssue[];
}>;

export type ValidationResult<Value> = ValidationSuccess<Value> | ValidationFailure;

export function validationSuccess<Value>(value: Value): ValidationSuccess<Value> {
  return { ok: true, value };
}

export function validationFailure(issue: ValidationIssue): ValidationFailure {
  return { ok: false, issues: [issue] };
}
