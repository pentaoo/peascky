import test from "node:test";
import assert from "node:assert/strict";
import { isProtocolValue, type ProtocolValue } from "../src/index.js";

test("protocol establishes only a JSON-safe value boundary", () => {
  const value: ProtocolValue = { kind: "placeholder", values: [1, 2, 3] };
  assert.equal(isProtocolValue(value), true);
  assert.equal(isProtocolValue({ callback: () => undefined }), false);
});
