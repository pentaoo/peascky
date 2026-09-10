import type { InteractionRuntime } from "../interaction/interaction-runtime";
import type { DevelopmentLogger } from "../platform/development-logger";
import type { VisualRuntime } from "../visual/visual-runtime";

export type AppLifecycleState = "active" | "inactive" | "background";

export type LifecycleIntent =
  | "running"
  | "cancel-pause-release-flush"
  | "restored-paused-awaiting-user";

export type LifecycleSnapshot = Readonly<{
  appState: AppLifecycleState;
  intent: LifecycleIntent;
  transitionCount: number;
}>;

export interface AppStateSubscription {
  remove(): void;
}

export interface AppStateSource {
  current(): AppLifecycleState;
  subscribe(listener: (nextState: AppLifecycleState) => void): AppStateSubscription;
}

type LifecycleTargets = Readonly<{
  interaction: InteractionRuntime;
  visual: VisualRuntime;
}>;

export class LifecycleCoordinator {
  private appState: AppLifecycleState;
  private intent: LifecycleIntent;
  private transitionCount = 0;
  private subscription: AppStateSubscription | null = null;

  constructor(
    private readonly source: AppStateSource,
    private readonly targets: LifecycleTargets,
    private readonly logger: DevelopmentLogger,
    private readonly onChange: () => void,
  ) {
    this.appState = source.current();
    this.intent = this.appState === "active" ? "running" : "cancel-pause-release-flush";
  }

  start(): void {
    if (this.subscription) return;
    if (this.appState !== "active") this.applySuspendIntent();
    this.subscription = this.source.subscribe((nextState) => this.transition(nextState));
    this.logger.info("Lifecycle coordinator started", { appState: this.appState });
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  snapshot(): LifecycleSnapshot {
    return {
      appState: this.appState,
      intent: this.intent,
      transitionCount: this.transitionCount,
    };
  }

  private transition(nextState: AppLifecycleState): void {
    if (nextState === this.appState) return;

    const wasSuspended = this.appState !== "active";
    const willSuspend = nextState !== "active";
    this.appState = nextState;
    this.transitionCount += 1;

    if (willSuspend && !wasSuspended) {
      this.applySuspendIntent();
    } else if (!willSuspend && wasSuspended) {
      this.targets.visual.resume();
      this.targets.interaction.setEnabled(true);
      this.intent = "restored-paused-awaiting-user";
    }

    this.logger.info("Lifecycle transition", {
      appState: nextState,
      intent: this.intent,
      transitionCount: this.transitionCount,
    });
    this.onChange();
  }

  private applySuspendIntent(): void {
    this.targets.interaction.setEnabled(false);
    this.targets.interaction.cancelAll("app-inactive");
    this.targets.visual.suspend();
    this.intent = "cancel-pause-release-flush";
  }
}
