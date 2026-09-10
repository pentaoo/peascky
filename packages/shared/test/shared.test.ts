import test from "node:test";
import assert from "node:assert/strict";
import {
  isJsonValue,
  parseStableId,
  validationFailure,
  validationSuccess,
} from "../src/index.js";

test("stable IDs use the shared validation result convention", () => {
  assert.deepEqual(parseStableId("project-1", "project"), validationSuccess("project-1"));
  assert.deepEqual(parseStableId(" project-1", "project"), validationFailure({
    code: "stable_id.invalid",
    message: "project ID must be a non-empty string without surrounding whitespace",
    path: [],
  }));
  assert.equal(parseStableId("", "project").ok, false);
});

test("JSON values reject non-finite, host, and cyclic values", () => {
  assert.equal(isJsonValue({ name: "Pocket Jam", values: [1, true, null] }), true);
  assert.equal(isJsonValue({ value: Number.NaN }), false);
  assert.equal(isJsonValue(new Date()), false);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.equal(isJsonValue(cyclic), false);
});
