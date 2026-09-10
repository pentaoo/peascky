import { parseStableId, type StableId, type ValidationResult } from "@pocket-jam/shared";

export type ProjectId = StableId<"project">;

export function parseProjectId(value: unknown): ValidationResult<ProjectId> {
  return parseStableId(value, "project");
}
