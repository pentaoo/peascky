const { launchChromium } = require("./browser-launch.cjs");

const origin = process.env.POCKET_JAM_ORIGIN || "http://127.0.0.1:4173";
const failures = [];
const errors = [];
let browser;

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function observeErrors(page, label) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      errors.push(`${label} console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
      errors.push(`${label} HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => errors.push(`${label} requestfailed: ${request.url()} (${request.failure()?.errorText})`));
}

async function checkEntryPoint(page, path, selector) {
  const response = await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  assert(response?.ok(), `${path} returned HTTP ${response?.status()}`);
  assert(await page.locator(selector).count() === 1, `${path} did not render ${selector}`);
}

(async () => {
  browser = await launchChromium();

  const mainContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const main = await mainContext.newPage();
  observeErrors(main, "main");
  await checkEntryPoint(main, "/index.html?desktop=1", "[data-app]");
  await main.locator('[data-entry="build"]').click();
  assert(await main.locator('[data-screen="presets"]').isVisible(), "main Build Track did not open presets");
  await main.locator('[data-preset="minimal"]').click();
  assert(await main.locator('[data-screen="build"]').isVisible(), "main preset did not open sequencer");
  await main.waitForTimeout(360);
  assert(await main.locator(".step.is-current").count() === 4, "main sequencer did not emit a visual step for all tracks");
  await main.locator('[data-live-pad="kick"]').click();
  assert(await main.locator('[data-live-pad="kick"]').evaluate((node) => node.classList.contains("is-hit")), "main pointer pad did not receive hit event");
  await main.keyboard.press("KeyF");
  assert(await main.locator('[data-live-pad="bass"]').evaluate((node) => node.classList.contains("is-hit")), "main F key did not trigger bass");
  await main.locator("[data-save]").click();
  const savedProject = await main.evaluate(() => JSON.parse(localStorage.getItem("pocket-jam.project.v1")));
  assert(savedProject?.version === 1 && savedProject?.tracks?.length === 4, "main save did not persist Project v1");
  await main.locator("[data-play]").click();
  await mainContext.close();

  const samplerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const sampler = await samplerContext.newPage();
  observeErrors(sampler, "sampler");
  await checkEntryPoint(sampler, "/sampler.html", ".sampler-page");
  assert(await sampler.locator("[data-sound]").count() === 8, "sampler did not render eight pads");
  await sampler.locator('[data-sound="snare"]').click();
  assert(await sampler.locator("[data-sample-name]").textContent() === "Snare 02", "sampler one-shot did not select Snare 02");
  await sampler.keyboard.press("8");
  assert(await sampler.locator("[data-sample-name]").textContent() === "Minor chord", "sampler keys 1-8 did not trigger pad 8");

  await sampler.locator('[data-mode="loop"]').click();
  const loopPad = sampler.locator('[data-sound="kick"]');
  const loopBox = await loopPad.boundingBox();
  await sampler.mouse.move(loopBox.x + loopBox.width / 2, loopBox.y + loopBox.height / 2);
  await sampler.mouse.down();
  await sampler.waitForTimeout(460);
  assert(await sampler.locator("[data-status]").textContent() === "Looping sample", "sampler hold loop did not repeat on its 420 ms JS timer");
  await sampler.mouse.up();
  assert(await sampler.locator("[data-status]").textContent() === "Loop released", "sampler pointerup did not stop loop");

  await sampler.locator('[data-fader="tone"] input').evaluate((input) => {
    input.value = "25";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert(await sampler.locator('[data-fader="tone"] output').evaluate((output) => output.value) === "25", "sampler tone fader did not update");
  const xy = sampler.locator("[data-xy-pad]");
  const xyBox = await xy.boundingBox();
  await sampler.mouse.click(xyBox.x + xyBox.width * 0.8, xyBox.y + xyBox.height * 0.2);
  assert(Number(await xy.getAttribute("aria-valuenow")) >= 79, "sampler XY surface did not follow pointer x");

  const capture = sampler.locator("[data-capture]");
  const captureBox = await capture.boundingBox();
  await sampler.mouse.move(captureBox.x + captureBox.width / 2, captureBox.y + captureBox.height / 2);
  await sampler.mouse.down();
  await sampler.waitForTimeout(140);
  assert(await sampler.locator("[data-status]").textContent() === "Capturing gesture", "sampler capture did not enter timer-only recording state");
  await sampler.mouse.up();
  assert(await sampler.locator("[data-status]").textContent() === "Gesture captured", "sampler capture did not finish its gesture timer");
  await samplerContext.close();

  const cloudContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cloud = await cloudContext.newPage();
  await cloud.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (duration) => { window.__vibrations.push(duration); return true; },
    });
  });
  observeErrors(cloud, "cloud");
  await checkEntryPoint(cloud, "/cloud-lab.html", "[data-cloud-lab]");
  await cloud.locator('[data-slot-id="kick-slot"]').click();
  assert(await cloud.locator('[data-slot-id="kick-slot"]').evaluate((node) => node.classList.contains("is-hit")), "Cloud one-shot did not fan out to visuals");
  assert((await cloud.evaluate(() => window.__vibrations)).includes(8), "Cloud one-shot did not fan out to haptics");

  const pointerResult = await cloud.evaluate(() => {
    const bass = document.querySelector('[data-slot-id="bass-slot"]');
    const synth = document.querySelector('[data-slot-id="synth-slot"]');
    const reverb = document.querySelector('[data-slot-id="reverb-slot"]');
    const dispatch = (node, type, pointerId, xRatio, yRatio) => {
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "touch",
        clientX: rect.left + rect.width * xRatio,
        clientY: rect.top + rect.height * yRatio,
      }));
    };
    dispatch(bass, "pointerdown", 101, 0.25, 0.75);
    dispatch(synth, "pointerdown", 202, 0.75, 0.25);
    const bothActive = bass.classList.contains("is-active") && synth.classList.contains("is-active");
    dispatch(bass, "pointermove", 101, 0.8, 0.2);
    dispatch(bass, "pointerup", 101, 0.8, 0.2);
    const independentRelease = !bass.classList.contains("is-active") && synth.classList.contains("is-active");
    dispatch(synth, "pointercancel", 202, 0.75, 0.25);
    const cancelReleased = !synth.classList.contains("is-active");
    dispatch(reverb, "pointerdown", 303, 0.8, 0.2);
    const xyMoved = reverb.style.getPropertyValue("--control-x") !== "" && reverb.style.getPropertyValue("--control-y") !== "";
    dispatch(reverb, "pointercancel", 303, 0.8, 0.2);
    return { bothActive, independentRelease, cancelReleased, xyMoved };
  });
  assert(pointerResult.bothActive, "Cloud did not keep independent simultaneous pointer states");
  assert(pointerResult.independentRelease, "releasing one Cloud pointer stopped another pointer state");
  assert(pointerResult.cancelReleased, "Cloud pointercancel did not release sustained state");
  assert(pointerResult.xyMoved, "Cloud XY interaction did not update its visual surface");

  const layoutValidation = await cloud.evaluate(async () => {
    const { createInitialCloudLabLayout } = await import("./src/cloud-lab-instruments.js");
    const valid = createInitialCloudLabLayout();
    valid.slots.find(({ id }) => id === "bass-slot").instrumentId = "cyber-bass";
    localStorage.setItem("pocket-jam:cloud-lab:v1", JSON.stringify(valid));
    return valid;
  });
  await cloud.reload({ waitUntil: "networkidle" });
  assert(await cloud.locator('[data-slot-id="bass-slot"]').getAttribute("data-instrument-id") === "cyber-bass", "Cloud did not load a valid same-footprint saved layout");
  layoutValidation.slots.find(({ id }) => id === "bass-slot").instrumentId = "cloud-kick";
  await cloud.evaluate((invalid) => localStorage.setItem("pocket-jam:cloud-lab:v1", JSON.stringify(invalid)), layoutValidation);
  await cloud.reload({ waitUntil: "networkidle" });
  assert(await cloud.locator('[data-slot-id="bass-slot"]').getAttribute("data-instrument-id") === "cloud-bass", "Cloud did not reset an invalid footprint layout");
  await cloudContext.close();

  console.log(JSON.stringify({ origin, failures, errors }, null, 2));
  await browser.close();
  process.exitCode = failures.length || errors.length ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  await browser?.close().catch(() => {});
  process.exitCode = 1;
});
