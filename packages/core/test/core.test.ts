import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectId, type ProjectId } from "../src/index.js";

test("core owns the Project ID alias without defining a Project schema", () => {
  const result = parseProjectId("project-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    const projectId: ProjectId = result.value;
    assert.equal(projectId, "project-1");
  }
});
