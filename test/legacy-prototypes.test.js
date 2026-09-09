import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRemixFromAnalysis } from "../src/video-remix.js";

const readRepositoryFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const readFixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("browser entry points retain their legacy module relationships", async () => {
  const [mainHtml, cloudHtml, samplerHtml, appSource, videoSource] = await Promise.all([
    readRepositoryFile("index.html"),
    readRepositoryFile("cloud-lab.html"),
    readRepositoryFile("sampler.html"),
    readRepositoryFile("src/app.js"),
    readRepositoryFile("src/video-remix.js"),
  ]);
  assert.match(mainHtml, /src="\.\/src\/app\.js\?v=10"/);
  assert.match(cloudHtml, /src="\.\/src\/cloud-lab\.js\?v=1"/);
  assert.match(samplerHtml, /src="\.\/src\/sampler\.js\?v=2"/);
  assert.match(appSource, /import \{ analyzeVideo \} from "\.\/video-remix\.js\?v=9"/);
  assert.match(videoSource, /import \{ createProject \} from "\.\/project-store\.js"/);
});

test("Video Remix still produces a deterministic extension of Project v1", () => {
  const file = { name: "reference.mov", size: 123456, lastModified: 1700000000000 };
  const frames = [
    { time: 0, motion: 0, brightness: 0.2, color: [10, 20, 30] },
    { time: 0.5, motion: 0.08, brightness: 0.4, color: [30, 40, 50] },
    { time: 1, motion: 0.01, brightness: 0.6, color: [50, 60, 70] },
  ];
  const audio = { bpm: 128, transients: [0.25, 0.75], level: 0.3 };
  const first = buildRemixFromAnalysis(file, frames, audio);
  const second = buildRemixFromAnalysis(file, frames, audio);
  const stable = ({ id, updatedAt, ...project }) => project;
  assert.deepEqual(stable(first), stable(second));
  assert.equal(first.version, 1);
  assert.equal(first.source, "video");
  assert.equal(first.presetId, "video");
  assert.equal(first.bpm, 128);
  assert.equal(first.steps, 16);
  assert.deepEqual(first.tracks.map(({ id }) => id), ["kick", "snare", "hat", "bass"]);
  assert.deepEqual(first.videoAnalysis, {
    fileName: "reference.mov",
    duration: 1,
    motion: 0.24,
    brightness: 0.4000000000000001,
    dominantColor: "#1e2832",
    cuts: 1,
    audioDecoded: true,
  });
});

test("main live-pad IDs and keyboard mapping remain A/S/D/F", async () => {
  const [html, source] = await Promise.all([readRepositoryFile("index.html"), readRepositoryFile("src/app.js")]);
  const pads = [...html.matchAll(/data-live-pad="([^"]+)"[^>]*>[\s\S]*?<small>([^<]+)<\/small>/g)]
    .map((match) => ({ id: match[1], key: match[2] }));
  assert.deepEqual(pads, [
    { id: "kick", key: "A" },
    { id: "snare", key: "S" },
    { id: "hat", key: "D" },
    { id: "bass", key: "F" },
  ]);
  assert.match(source, /const keyMap = \{ KeyA: "kick", KeyS: "snare", KeyD: "hat", KeyF: "bass" \}/);
  assert.match(source, /audio\.trigger\(trackId, 1\)/);
});

test("sampler pad identities and prototype-only timing/capture limitations stay explicit", async () => {
  const [html, source, expectedPads] = await Promise.all([
    readRepositoryFile("sampler.html"),
    readRepositoryFile("src/sampler.js"),
    readFixture("sampler-pads.json"),
  ]);
  const pads = [...html.matchAll(/data-sound="([^"]+)" data-label="([^"]+)"[^>]*><span>([^<]+)<\/span>/g)]
    .map((match) => ({ number: match[3], sound: match[1], label: match[2] }));
  assert.deepEqual(pads, expectedPads);
  assert.match(source, /let activeLoop = null/);
  assert.match(source, /window\.clearInterval\(activeLoop\)[\s\S]*window\.setInterval\(\(\) => pulsePad\(pad\), 420\)/);
  assert.match(source, /status\.textContent = "Capturing gesture"/);
  assert.match(source, /recordingStarted = performance\.now\(\)/);
  assert.doesNotMatch(source, /getUserMedia|MediaRecorder/);
  assert.match(source, /filter\.frequency\.setTargetAtTime\(260 \* Math\.pow\(32, x\)/);
  assert.match(source, /delayGain\.gain\.setTargetAtTime\(\(1 - y\) \* \.34/);
});

test("Cloud app retains storage, JS demo clock, cancellation, and direct fan-out behavior", async () => {
  const source = await readRepositoryFile("src/cloud-lab.js");
  assert.match(source, /const STORAGE_KEY = "pocket-jam:cloud-lab:v1"/);
  assert.match(source, /window\.setInterval\(playDemoStep, 260\)/);
  assert.match(source, /pointerStates = new Map\(\)/);
  assert.match(source, /voiceId: `\$\{instrument\.id\}:\$\{event\.pointerId\}`/);
  assert.match(source, /"pointercancel"[\s\S]*endPointer\(state\.node, event, true\)/);
  assert.match(source, /audio\.trigger[\s\S]*animateHit\(node\)[\s\S]*pulseGlow\(node[\s\S]*kickMeter\(/);
  assert.match(source, /navigator\.vibrate\(duration\)/);
});
