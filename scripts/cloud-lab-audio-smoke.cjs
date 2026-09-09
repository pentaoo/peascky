const { launchChromium } = require("./browser-launch.cjs");

const url = process.env.POCKET_JAM_URL || `${process.env.POCKET_JAM_ORIGIN || "http://127.0.0.1:4173"}/cloud-lab.html`;

let browser;

(async () => {
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.addInitScript(() => {
    window.__audioAudit = { pointerDowns: [], starts: [], scheduledStarts: [] };
    document.addEventListener("pointerdown", () => window.__audioAudit.pointerDowns.push(performance.now()), true);
    const patchStart = (Constructor) => {
      if (!Constructor?.prototype?.start) return;
      const original = Constructor.prototype.start;
      Constructor.prototype.start = function (...args) {
        window.__audioAudit.starts.push(performance.now());
        window.__audioAudit.scheduledStarts.push(args[0]);
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
    const unknownTriggerRejected = engine.trigger("unknown-sound") === null;
    const explicitWhen = engine.context.currentTime + 0.2;
    const scheduledStartIndex = window.__audioAudit.scheduledStarts.length;
    engine.trigger("cloud-kick", { velocity: .03, when: explicitWhen });
    const explicitStartTimes = window.__audioAudit.scheduledStarts.slice(scheduledStartIndex);
    const ids = ["cloud-kick", "cloud-snare", "cloud-hat", "cloud-bass", "cloud-keys", "orbit-synth", "cyber-bass"];
    const triggerResults = ids.map((id, index) => engine.trigger(id, { midi: 42 + index * 3, velocity: .1 }));
    const noiseAfterFirstNoiseVoice = engine._noiseBuffer;
    engine.trigger("cloud-hat", { velocity: .03 });
    const sharedNoiseBuffer = noiseAfterFirstNoiseVoice === engine._noiseBuffer;
    for (let index = 0; index < 48; index += 1) engine.trigger("cloud-kick", { velocity: .03 });
    const voicesAfterBurst = engine._voices.size;
    await new Promise((resolve) => setTimeout(resolve, 650));
    const voicesAfterDecay = engine._voices.size;
    const reverbPrepared = engine._nodes.convolver.buffer !== null;
    engine.stopContinuous();
    const cloudKey = engine.startContinuous("cloud-bass", { id: "pointer:1", velocity: .03 });
    const cyberKey = engine.startContinuous("cyber-bass", { id: "pointer:2", velocity: .03 });
    const independentContinuousVoices = engine._continuous.size;
    engine.startContinuous("cloud-bass", { id: "pointer:1", midi: 48, velocity: .04 });
    const updateReusesVoiceId = engine._continuous.size === 2;
    engine.stopContinuous("pointer:1", { release: .04 });
    const targetedStopPreservesOtherVoice = engine._continuous.size === 1 && engine._continuous.has("pointer:2");
    const contextState = engine.state;

    const injectedContext = new AudioContext();
    const injectedDestination = injectedContext.createGain();
    injectedDestination.connect(injectedContext.destination);
    const injected = new CloudLabAudio({ context: injectedContext, destination: injectedDestination, maxVoices: 8 });
    await injected.unlock();
    const injectedOwnership = !injected._ownsContext && injected.destination === injectedDestination;
    await injected.dispose();
    const injectedContextSurvivedDispose = injectedContext.state !== "closed";
    await injectedContext.close();

    const ownedContext = engine.context;
    await engine.dispose();
    const ownedContextClosed = ownedContext.state === "closed" && engine.state === "uninitialized";
    return {
      triggerResults,
      unknownTriggerRejected,
      voicesAfterBurst,
      voicesAfterDecay,
      cloudKey,
      cyberKey,
      independentContinuousVoices,
      updateReusesVoiceId,
      targetedStopPreservesOtherVoice,
      contextState,
      explicitWhen,
      explicitStartTimes,
      sharedNoiseBuffer,
      reverbPrepared,
      injectedOwnership,
      injectedContextSurvivedDispose,
      ownedContextClosed,
    };
  });

  const failures = [];
  if (!Number.isFinite(cold.callLatencyMs) || cold.callLatencyMs > 32) failures.push(`first pointer→source.start call took ${cold.callLatencyMs}ms`);
  if (afterRapid - beforeRapid < 12) failures.push(`rapid taps created only ${afterRapid - beforeRapid} sources`);
  if (engineChecks.triggerResults.some((result) => !result)) failures.push("one or more catalogue sound IDs did not trigger");
  if (!engineChecks.unknownTriggerRejected) failures.push("unknown sound id was not rejected");
  if (engineChecks.voicesAfterBurst > 8) failures.push(`voice cap exceeded: ${engineChecks.voicesAfterBurst}`);
  if (engineChecks.voicesAfterDecay !== 0) failures.push(`finished voices were not cleaned up: ${engineChecks.voicesAfterDecay}`);
  if (engineChecks.independentContinuousVoices !== 2) failures.push(`continuous instruments collided: ${engineChecks.independentContinuousVoices}`);
  if (!engineChecks.updateReusesVoiceId) failures.push("continuous update created a second voice for the same id");
  if (!engineChecks.targetedStopPreservesOtherVoice) failures.push("targeted continuous stop affected another voice");
  if (engineChecks.contextState !== "running") failures.push(`audio context state is ${engineChecks.contextState}`);
  if (!engineChecks.explicitStartTimes.length || engineChecks.explicitStartTimes.some((time) => Math.abs(time - engineChecks.explicitWhen) > .0001)) failures.push("explicit Web Audio scheduling time was not preserved");
  if (!engineChecks.sharedNoiseBuffer) failures.push("noise voices did not share one cached noise buffer");
  if (!engineChecks.reverbPrepared) failures.push("shared reverb impulse was not prepared after unlock");
  if (!engineChecks.injectedOwnership || !engineChecks.injectedContextSurvivedDispose) failures.push("injected context/destination ownership contract failed");
  if (!engineChecks.ownedContextClosed) failures.push("owned AudioContext was not closed on dispose");

  console.log(JSON.stringify({ cold, rapidSourceStarts: afterRapid - beforeRapid, engineChecks, failures, errors }, null, 2));
  await context.close();
  await browser.close();
  process.exitCode = failures.length || errors.length ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  await browser?.close().catch(() => {});
  process.exitCode = 1;
});
