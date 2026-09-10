import assert from "node:assert/strict";
import test from "node:test";
import { PlaceholderInteractionRuntime } from "../src/interaction/interaction-runtime";
import {
  LifecycleCoordinator,
  type AppLifecycleState,
  type AppStateSource,
} from "../src/lifecycle/lifecycle-coordinator";
import type { DevelopmentLogger } from "../src/platform/development-logger";
import { PlaceholderVisualRuntime } from "../src/visual/visual-runtime";

class FakeAppStateSource implements AppStateSource {
  private listener: ((state: AppLifecycleState) => void) | null = null;

  constructor(private state: AppLifecycleState) {}

  current(): AppLifecycleState {
    return this.state;
  }

  subscribe(listener: (state: AppLifecycleState) => void) {
    this.listener = listener;
    return { remove: () => { this.listener = null; } };
  }

  emit(state: AppLifecycleState): void {
    this.state = state;
    this.listener?.(state);
  }
}

const silentLogger: DevelopmentLogger = { info: () => undefined };

test("background cancels interaction and foreground remains paused", () => {
  const source = new FakeAppStateSource("active");
  const interaction = new PlaceholderInteractionRuntime();
  const visual = new PlaceholderVisualRuntime();
  let changes = 0;
  const coordinator = new LifecycleCoordinator(
    source,
    { interaction, visual },
    silentLogger,
    () => { changes += 1; },
  );

  coordinator.start();
  source.emit("background");

  assert.deepEqual(coordinator.snapshot(), {
    appState: "background",
    intent: "cancel-pause-release-flush",
    transitionCount: 1,
  });
  assert.equal(interaction.diagnostics().enabled, false);
  assert.equal(interaction.diagnostics().implementationId, "placeholder");
  assert.equal(interaction.diagnostics().lastCancellationReason, "app-inactive");
  assert.equal(visual.diagnostics().presentationState, "background");

  source.emit("inactive");
  source.emit("active");

  assert.deepEqual(coordinator.snapshot(), {
    appState: "active",
    intent: "restored-paused-awaiting-user",
    transitionCount: 3,
  });
  assert.equal(interaction.diagnostics().enabled, true);
  assert.equal(visual.diagnostics().presentationState, "field");
  assert.equal(changes, 3);
  coordinator.stop();
});

test("visual placeholder preserves presentation across suspend and resume", () => {
  const visual = new PlaceholderVisualRuntime();
  visual.attach({ surfaceId: "jam" });
  visual.setPresentationState("focus");
  visual.suspend();
  assert.equal(visual.diagnostics().presentationState, "background");
  visual.resume();
  assert.deepEqual(visual.diagnostics(), {
    implementationId: "placeholder",
    attachedSurfaceId: "jam",
    presentationState: "focus",
    sceneRevision: null,
  });
});
