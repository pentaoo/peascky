const { chromium } = require("/Users/penta/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/node_modules/playwright-core");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.env.POCKET_JAM_URL || "http://127.0.0.1:4173/cloud-lab.html";

let browser;

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.addInitScript(() => {
    window.__audioAudit = { pointerDowns: [], starts: [] };
    document.addEventListener("pointerdown", () => window.__audioAudit.pointerDowns.push(performance.now()), true);
    const patchStart = (Constructor) => {
      if (!Constructor?.prototype?.start) return;
      const original = Constructor.prototype.start;
      Constructor.prototype.start = function (...args) {
        window.__audioAudit.starts.push(performance.now());
        return original.apply(this, args);
      };
    };
    patchStart(window.OscillatorNode);
    patchStart(window.AudioBufferSourceNode);
  });

  await page.goto(url, { waitUntil: "networkidle" });
  const kick = page.locator('[data-slot-id="kick-slot"]');
  const kickBox = await kick.boundingBox();
  await page.mouse.click(kickBox.x + kickBox.width / 2, kickBox.y + kickBox.height / 2);
  await page.waitForTimeout(80);

  const cold = await page.evaluate(() => {
    const pointer = window.__audioAudit.pointerDowns[0];
    const nextStart = window.__audioAudit.starts.find((time) => time >= pointer);
    return { pointer, start: nextStart, callLatencyMs: nextStart - pointer, starts: window.__audioAudit.starts.length };
  });

  const beforeRapid = await page.evaluate(() => window.__audioAudit.starts.length);
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.move(kickBox.x + kickBox.width / 2, kickBox.y + kickBox.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(65);
  }
  const afterRapid = await page.evaluate(() => window.__audioAudit.starts.length);

  for (const slotId of ["bass-slot", "synth-slot", "reverb-slot"]) {
    const node = page.locator(`[data-slot-id="${slotId}"]`);
    const box = await node.boundingBox();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .75);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .25, { steps: 5 });
    await page.mouse.up();
  }

  const engineChecks = await page.evaluate(async () => {
    const { CloudLabAudio } = await import("./src/cloud-lab-audio.js");
    const engine = new CloudLabAudio({ maxVoices: 8 });
    await engine.unlock();
    const ids = ["cloud-kick", "cloud-snare", "cloud-hat", "cloud-bass", "cloud-keys", "orbit-synth", "cyber-bass"];
    const triggerResults = ids.map((id, index) => engine.trigger(id, { midi: 42 + index * 3, velocity: .1 }));
    for (let index = 0; index < 48; index += 1) engine.trigger("cloud-kick", { velocity: .03 });
    const voicesAfterBurst = engine._voices.size;
    await new Promise((resolve) => setTimeout(resolve, 650));
    const voicesAfterDecay = engine._voices.size;
    engine.stopContinuous();
    const cloudKey = engine.startContinuous("cloud-bass", { velocity: .03 });
    const cyberKey = engine.startContinuous("cyber-bass", { velocity: .03 });
    const independentContinuousVoices = engine._continuous.size;
    const contextState = engine.state;
    await engine.dispose();
    return { triggerResults, voicesAfterBurst, voicesAfterDecay, cloudKey, cyberKey, independentContinuousVoices, contextState };
  });

  const failures = [];
  if (!Number.isFinite(cold.callLatencyMs) || cold.callLatencyMs > 32) failures.push(`first pointer→source.start call took ${cold.callLatencyMs}ms`);
  if (afterRapid - beforeRapid < 12) failures.push(`rapid taps created only ${afterRapid - beforeRapid} sources`);
  if (engineChecks.triggerResults.some((result) => !result)) failures.push("one or more catalogue sound IDs did not trigger");
  if (engineChecks.voicesAfterBurst > 8) failures.push(`voice cap exceeded: ${engineChecks.voicesAfterBurst}`);
  if (engineChecks.voicesAfterDecay !== 0) failures.push(`finished voices were not cleaned up: ${engineChecks.voicesAfterDecay}`);
  if (engineChecks.independentContinuousVoices !== 2) failures.push(`continuous instruments collided: ${engineChecks.independentContinuousVoices}`);
  if (engineChecks.contextState !== "running") failures.push(`audio context state is ${engineChecks.contextState}`);

  console.log(JSON.stringify({ cold, rapidSourceStarts: afterRapid - beforeRapid, engineChecks, failures, errors }, null, 2));
  await context.close();
  await browser.close();
  process.exitCode = failures.length || errors.length ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  await browser?.close().catch(() => {});
  process.exitCode = 1;
});
