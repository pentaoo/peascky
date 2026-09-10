import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAssetId,
  parseInstrumentInstanceId,
  parseProjectId,
  type AssetId,
  type InstrumentInstanceId,
  type ProjectId,
} from "../src/index.js";

test("semantic IDs retain distinct branded types at the public boundary", () => {
  const result = parseProjectId("project-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    const projectId: ProjectId = result.value;
    assert.equal(projectId, "project-1");
  }
  const instance = parseInstrumentInstanceId("instance-1");
  const asset = parseAssetId("asset-1");
  assert.equal(instance.ok && asset.ok, true);
  if (instance.ok && asset.ok) {
    const instanceId: InstrumentInstanceId = instance.value;
    const assetId: AssetId = asset.value;
    assert.notEqual(instanceId, assetId);
  }
  assert.equal(parseProjectId("bad project").ok, false);
  assert.equal(parseProjectId("__proto__").ok, false);
  assert.equal(parseProjectId("toString").ok, false);
});
