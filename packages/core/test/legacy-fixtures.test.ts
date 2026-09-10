import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createLegacyCloudProjectFixture,
  createLegacyMainProjectFixture,
  LEGACY_FIXTURE_TICKS,
  validateProject,
} from "../src/index.js";

async function rootFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`../../../test/fixtures/${name}`, import.meta.url), "utf8"));
}

test("main four-track fixture maps current identities and 16-step velocity content", async () => {
  const source = await rootFixture("project-v1-default.json") as {
    bpm: number;
    steps: number;
    tracks: Array<{ id: string; volume: number; mute: boolean; pattern: number[] }>;
  };
  const project = createLegacyMainProjectFixture();
  assert.equal(validateProject(project).ok, true);
  assert.equal(project.transport.bpm, source.bpm);
  assert.equal(Object.keys(project.instruments).length, source.tracks.length);
  assert.equal(Object.values(project.patterns)[0]?.lengthTicks, source.steps * LEGACY_FIXTURE_TICKS.sixteenth);
  for (const track of source.tracks) {
    const instance = Object.values(project.instruments).find(({ id }) => id.endsWith(`.${track.id}`));
    assert.ok(instance, track.id);
    const channel = project.mixer.channels[instance!.mixerChannelId];
    assert.equal(channel?.gain, track.volume);
    assert.equal(channel?.mute, track.mute);
    const lane = Object.values(project.patterns)[0]?.lanes.find(({ targetInstanceId }) => targetInstanceId === instance!.id);
    assert.deepEqual(
      lane?.events.map(({ tick, velocity }) => [tick / LEGACY_FIXTURE_TICKS.sixteenth, velocity]),
      track.pattern.flatMap((velocity, step) => velocity > 0 ? [[step, velocity]] : []),
    );
  }
});

test("Cloud fixture maps logical placement and art direction without SLOT_PRESENTATION", async () => {
  const source = await rootFixture("cloud-layout-default.json") as {
    slots: Array<{
      id: string;
      instrumentId: string;
      column: number;
      row: number;
      layoutSize: string;
      yaw: number;
      elevation: number;
    }>;
  };
  const project = createLegacyCloudProjectFixture();
  assert.equal(validateProject(project).ok, true);
  assert.equal(project.scene.columns, 4);
  assert.equal(project.scene.rows, 5);
  assert.equal(project.scene.placements.length, source.slots.length);
  for (const slot of source.slots) {
    const instance = Object.values(project.instruments).find(({ id }) => id.endsWith(`.${slot.id}`));
    assert.ok(instance, slot.id);
    assert.equal(instance!.definitionId, `definition.${slot.instrumentId}`);
    const placement = project.scene.placements.find(({ instanceId }) => instanceId === instance!.id);
    const [columns, rows] = slot.layoutSize.split("x").map(Number);
    assert.deepEqual(placement?.cell, { column: slot.column, row: slot.row });
    assert.deepEqual(placement?.footprint, { columns, rows });
    assert.equal(placement?.transform?.yaw, slot.yaw);
    assert.equal(placement?.transform?.elevation, slot.elevation);
    assert.deepEqual(Object.keys(placement?.transform ?? {}).sort(), ["elevation", "offsetX", "offsetY", "scale", "yaw"]);
  }
  assert.ok(Object.values(project.instruments).some(({ definitionId }) => definitionId === "definition.orbit-synth"));
});
