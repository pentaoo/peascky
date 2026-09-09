const fs = require("node:fs");
const path = require("node:path");
const { launchChromium } = require("./browser-launch.cjs");

const baseUrl = process.env.POCKET_JAM_URL || `${process.env.POCKET_JAM_ORIGIN || "http://127.0.0.1:4173"}/cloud-lab.html`;
const outputDirectory = process.env.POCKET_JAM_AUDIT_DIR || "/tmp/pocket-jam-cloud-lab-audit";
const viewportMatrix = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "844x390", width: 844, height: 390 },
  { name: "932x430", width: 932, height: 430 },
];
const viewports = process.env.VIEWPORT
  ? viewportMatrix.filter(({ name }) => name === process.env.VIEWPORT)
  : viewportMatrix;

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

let browser;

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  browser = await launchChromium();
  const report = [];

  for (const viewport of viewports) {
    console.error(`Checking ${viewport.name}`);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    const failures = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) errors.push(`console.${message.type()}: ${message.text()}`);
    });
    page.on("requestfailed", (request) => errors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`));

    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert(response?.ok(), `HTTP ${response?.status()}`, failures);
    await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-idle.png`), fullPage: true });

    if (viewport.name === "390x844") {
      const adapterCheck = await page.evaluate(async () => {
        const renderer = await import("./src/cloud-lab-renderer.js");
        const catalogue = await import("./src/cloud-lab-instruments.js");
        const unregister = renderer.registerGLBModelAdapter(({ descriptor }) => {
          const element = document.createElement("span");
          element.dataset.adapterSaw = descriptor.uri;
          return element;
        });
        const node = renderer.createModelNode(catalogue.getInstrumentDefinition("cloud-kick"), {
          modelOverrides: { "cloud-kick": "./assets/cloud-kick.glb" },
        });
        unregister();
        return { renderer: node.dataset.renderer, uri: node.dataset.glbUri, adapterSaw: node.dataset.adapterSaw };
      });
      assert(adapterCheck.renderer === "glb" && adapterCheck.uri.endsWith("cloud-kick.glb") && adapterCheck.adapterSaw === adapterCheck.uri, "GLB adapter contract failed", failures);
    }

    const metrics = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      instruments: [...document.querySelectorAll(".instrument")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.instrumentId, x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: element.getAttribute("aria-label") };
      }),
      controls: [...document.querySelectorAll("button:not(:disabled),a[href]")].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }).map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") || element.textContent.trim(), width: rect.width, height: rect.height };
      }),
    }));

    assert(metrics.document[0] <= metrics.viewport[0] + 1, `horizontal overflow ${metrics.document[0]} > ${metrics.viewport[0]}`, failures);
    assert(metrics.instruments.length === 6, `expected 6 instruments, got ${metrics.instruments.length}`, failures);
    metrics.instruments.forEach((item) => {
      assert(item.width >= 44 && item.height >= 44, `${item.id} has small hit area ${item.width}x${item.height}`, failures);
      assert(Boolean(item.label), `${item.id} has no accessible name`, failures);
      assert(item.x >= -1 && item.x + item.width <= metrics.viewport[0] + 1, `${item.id} exits horizontal viewport`, failures);
    });
    metrics.controls.forEach((item) => assert(item.width >= 44 && item.height >= 44, `small control: ${item.label} (${item.width}x${item.height})`, failures));

    const kick = page.locator('[data-slot-id="kick-slot"]');
    const kickBox = await kick.boundingBox();
    if (viewport.name === "390x844") {
      await page.mouse.move(kickBox.x + kickBox.width / 2, kickBox.y + kickBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(35);
      await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-hit.png`), fullPage: true });
      await page.mouse.up();
    }
    await page.touchscreen.tap(kickBox.x + kickBox.width / 2, kickBox.y + kickBox.height / 2);
    assert(await page.locator("[data-play-hint]").evaluate((element) => element.classList.contains("is-hidden")), "tap did not dismiss play hint", failures);

    const bass = page.locator('[data-slot-id="bass-slot"]');
    const bassBox = await bass.boundingBox();
    await page.mouse.move(bassBox.x + bassBox.width / 2, bassBox.y + bassBox.height * .8);
    await page.mouse.down();
    await page.mouse.move(bassBox.x + bassBox.width / 2, bassBox.y + bassBox.height * .2, { steps: 5 });
    assert(await bass.evaluate((element) => element.classList.contains("is-active")), "bass drag did not enter active state", failures);
    if (viewport.name === "390x844") await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-drag.png`), fullPage: true });
    await page.mouse.up();

    const hitRectBefore = await kick.boundingBox();
    await page.mouse.move(viewport.width - 4, Math.floor(viewport.height / 2));
    await page.waitForTimeout(90);
    const hitRectAfter = await kick.boundingBox();
    assert(Math.abs(hitRectBefore.x - hitRectAfter.x) < .1 && Math.abs(hitRectBefore.y - hitRectAfter.y) < .1, "parallax moved the kick hit target", failures);

    await page.locator("[data-edit-toggle]").click();
    assert(await page.locator("[data-cloud-lab]").getAttribute("data-mode") === "edit", "edit mode did not activate", failures);
    await bass.click();
    assert(await page.locator("[data-picker]").evaluate((element) => element.open), "picker did not open", failures);
    const compatibleCards = await page.locator(".picker-card:not(:disabled)").count();
    assert(compatibleCards >= 2, `picker has only ${compatibleCards} compatible objects for bass`, failures);
    const drawerMetrics = await page.locator("[data-picker]").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      controls: [...element.querySelectorAll("button:not(:disabled)")].map((control) => {
        const rect = control.getBoundingClientRect();
        return { label: control.getAttribute("aria-label") || control.textContent.trim(), width: rect.width, height: rect.height };
      }),
    }));
    assert(drawerMetrics.scrollWidth <= drawerMetrics.clientWidth + 1, `picker horizontal overflow ${drawerMetrics.scrollWidth} > ${drawerMetrics.clientWidth}`, failures);
    drawerMetrics.controls.forEach((item) => assert(item.width >= 44 && item.height >= 44, `small picker control: ${item.label} (${item.width}x${item.height})`, failures));
    if (viewport.name === "390x844") {
      await page.waitForTimeout(360);
      await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-picker.png`), fullPage: true });
    }
    await page.locator('[data-instrument-choice="cyber-bass"]').click();
    assert(await page.locator('[data-slot-id="bass-slot"]').getAttribute("data-instrument-id") === "cyber-bass", "replacement did not install Cyber Bass", failures);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem("pocket-jam:cloud-lab:v1"))?.slots?.some((slot) => slot.id === "bass-slot" && slot.instrumentId === "cyber-bass")), "replacement was not persisted", failures);
    if (viewport.name === "390x844") {
      await page.waitForTimeout(380);
      await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-replaced.png`), fullPage: true });
    }

    await page.locator("[data-edit-toggle]").click();
    const hat = page.locator('[data-slot-id="hat-slot"]');
    const hatBox = await hat.boundingBox();
    await page.mouse.move(hatBox.x + hatBox.width / 2, hatBox.y + hatBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(680);
    await page.mouse.up();
    assert(await page.locator("[data-picker]").evaluate((element) => element.open), "long press did not open picker", failures);
    await page.locator("[data-reset-layout]").click();
    assert(await page.locator('[data-slot-id="bass-slot"]').getAttribute("data-instrument-id") === "cloud-bass", "reset did not restore starter layout", failures);

    const keyboardKick = page.locator('[data-slot-id="kick-slot"]');
    await keyboardKick.focus();
    await keyboardKick.press("Space");
    assert(await keyboardKick.evaluate((element) => element.classList.contains("is-hit")), "Space did not trigger focused instrument", failures);
    const keyboardReverb = page.locator('[data-slot-id="reverb-slot"]');
    await keyboardReverb.focus();
    await keyboardReverb.press("ArrowRight");
    assert(Number(await keyboardReverb.getAttribute("data-key-x")) > .5, "arrow key did not adjust continuous surface", failures);

    await page.locator("[data-demo]").click();
    assert(await page.locator("[data-demo]").getAttribute("aria-pressed") === "true", "demo loop did not start", failures);
    await page.waitForTimeout(310);
    await page.locator("[data-demo]").click();
    assert(await page.locator("[data-demo]").getAttribute("aria-pressed") === "false", "demo loop did not stop", failures);

    report.push({ viewport: viewport.name, metrics, errors, failures });
    await context.close();
  }

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(baseUrl, { waitUntil: "networkidle" });
  const reduced = await reducedPage.evaluate(() => ({
    sceneTransform: getComputedStyle(document.querySelector("[data-scene]")).transform,
    reverbAnimation: getComputedStyle(document.querySelector(".reverb-ring")).animationDuration,
  }));
  assert(reduced.sceneTransform === "none", `reduced-motion scene transform is ${reduced.sceneTransform}`, report[0].failures);
  await reducedPage.screenshot({ path: path.join(outputDirectory, "390x844-reduced.png"), fullPage: true });
  await reducedContext.close();

  const lowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const lowPage = await lowContext.newPage();
  await lowPage.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 2 });
    try { delete window.DeviceOrientationEvent; } catch { /* Test the fallback where deletion is supported. */ }
    window.__longTasks = [];
    if (typeof PerformanceObserver === "function") {
      try {
        new PerformanceObserver((list) => window.__longTasks.push(...list.getEntries().map(({ duration }) => duration)))
          .observe({ type: "longtask", buffered: true });
      } catch { /* Long Task API may be disabled in headless browsers. */ }
    }
  });
  await lowPage.goto(baseUrl, { waitUntil: "networkidle" });
  assert(await lowPage.locator("[data-cloud-lab]").getAttribute("data-quality") === "low", "low-power mode did not activate", report[0].failures);
  await lowPage.locator("[data-tilt]").click();
  assert(await lowPage.locator("[data-tilt-label]").textContent() === "touch parallax", "missing gyro did not select touch fallback", report[0].failures);
  await lowPage.evaluate(() => { window.__longTasks = []; });
  await lowPage.locator("[data-demo]").click();
  await lowPage.waitForTimeout(850);
  await lowPage.locator("[data-demo]").click();
  const activeLongTasks = await lowPage.evaluate(() => window.__longTasks);
  assert(!activeLongTasks.some((duration) => duration > 100), `low-power jam produced a ${Math.max(0, ...activeLongTasks).toFixed(1)}ms long task`, report[0].failures);
  await lowPage.screenshot({ path: path.join(outputDirectory, "390x844-low-power.png"), fullPage: true });
  await lowContext.close();
  await browser.close();

  const failures = report.flatMap((entry) => entry.failures.map((failure) => `${entry.viewport}: ${failure}`));
  const errors = report.flatMap((entry) => entry.errors.map((error) => `${entry.viewport}: ${error}`));
  console.log(JSON.stringify({ baseUrl, outputDirectory, reduced, lowPower: { activeLongTasks }, failures, errors }, null, 2));
  process.exitCode = failures.length || errors.length ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  await browser?.close().catch(() => {});
  process.exitCode = 1;
});
