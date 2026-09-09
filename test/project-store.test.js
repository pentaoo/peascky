import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PRESETS,
  TRACKS,
  applyPreset,
  createProject,
  loadProject,
  saveProject,
} from "../src/project-store.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const normalizeGeneratedFields = (project) => ({ ...project, id: "<generated>", updatedAt: "<generated>" });

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test("createProject() matches the Project v1 default fixture", async () => {
  const project = createProject();
  assert.deepEqual(normalizeGeneratedFields(project), await fixture("project-v1-default.json"));
  assert.match(project.id, /.+/);
  assert.equal(new Date(project.updatedAt).toISOString(), project.updatedAt);
  assert.deepEqual(project.tracks.map(({ id }) => id), TRACKS.map(({ id }) => id));
  assert.equal(new Set(project.tracks.map(({ pattern }) => pattern)).size, 4, "track patterns are independent arrays");
});

test("all preset metadata and velocity patterns remain exact", async () => {
  assert.deepEqual(PRESETS, await fixture("project-v1-presets.json"));
  for (const presetId of Object.keys(PRESETS)) {
    const project = createProject(presetId);
    assert.equal(project.presetId, presetId);
    assert.equal(project.bpm, PRESETS[presetId].bpm);
    assert.deepEqual(Object.fromEntries(project.tracks.map((track) => [track.id, track.pattern])), PRESETS[presetId].patterns);
  }
});

test("applyPreset changes BPM/patterns but preserves Project v1 identity and mixer fields", () => {
  const project = createProject("minimal");
  project.id = "project-one";
  project.name = "Keep me";
  project.source = "video";
  project.swing = 0.21;
  project.tracks[0].volume = 0.31;
  project.tracks[0].mute = true;
  project.updatedAt = "2000-01-01T00:00:00.000Z";
  const next = applyPreset(project, "heavy");

  assert.notEqual(next, project);
  assert.equal(next.id, "project-one");
  assert.equal(next.name, "Keep me");
  assert.equal(next.source, "video");
  assert.equal(next.swing, 0.21);
  assert.equal(next.bpm, 126);
  assert.equal(next.presetId, "heavy");
  assert.equal(next.tracks[0].volume, 0.31);
  assert.equal(next.tracks[0].mute, true);
  assert.deepEqual(next.tracks.map((track) => track.pattern), Object.values(PRESETS.heavy.patterns));
  assert.notEqual(next.updatedAt, project.updatedAt);
});

test("save/load uses the current key and Project v1 JSON round-trips", () => {
  const originalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    const original = createProject("broken");
    original.id = "round-trip";
    const saved = saveProject(original);
    assert.deepEqual(JSON.parse(storage.getItem("pocket-jam.project.v1")), saved);
    assert.deepEqual(loadProject(), JSON.parse(JSON.stringify(saved)));
    assert.notEqual(loadProject(), saved);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("legacy key piski.project.v1 loads and migrates only valid Project v1 data", () => {
  const originalStorage = globalThis.localStorage;
  try {
    const legacy = { ...createProject("ambient"), id: "legacy-project" };
    const storage = new MemoryStorage({ "piski.project.v1": JSON.stringify(legacy) });
    globalThis.localStorage = storage;
    assert.deepEqual(loadProject(), legacy);
    assert.equal(storage.getItem("pocket-jam.project.v1"), JSON.stringify(legacy));

    const current = { ...createProject("heavy"), id: "current-project" };
    storage.setItem("pocket-jam.project.v1", JSON.stringify(current));
    assert.equal(loadProject().id, "current-project", "current key wins over legacy data");

    globalThis.localStorage = new MemoryStorage({ "piski.project.v1": JSON.stringify({ version: 2 }) });
    assert.equal(loadProject(), null);
    assert.equal(globalThis.localStorage.getItem("pocket-jam.project.v1"), null);

    globalThis.localStorage = new MemoryStorage({
      "pocket-jam.project.v1": JSON.stringify({ version: 2 }),
      "piski.project.v1": JSON.stringify(legacy),
    });
    assert.equal(loadProject(), null, "a present invalid current value prevents legacy fallback");

    globalThis.localStorage = new MemoryStorage({ "pocket-jam.project.v1": "not json" });
    assert.equal(loadProject(), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
