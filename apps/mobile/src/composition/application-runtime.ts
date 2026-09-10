import {
  createLegacyCloudProjectFixture,
  validateProject,
  type Project,
} from "@pocket-jam/core";
import { readMobileEnvironment, type MobileEnvironment } from "../config/environment";
import {
  PlaceholderInteractionRuntime,
  type InteractionRuntime,
  type InteractionRuntimeDiagnostics,
} from "../interaction/interaction-runtime";
import {
  LifecycleCoordinator,
  type AppStateSource,
  type LifecycleSnapshot,
} from "../lifecycle/lifecycle-coordinator";
import { createDevelopmentLogger, type DevelopmentLogger } from "../platform/development-logger";
import {
  PlaceholderVisualRuntime,
  type VisualRuntime,
  type VisualRuntimeDiagnostics,
} from "../visual/visual-runtime";

export type ProjectFixtureSummary = Readonly<{
  validation: "valid";
  id: string;
  name: string;
  schemaVersion: number;
  bpm: number;
  instrumentCount: number;
  placementCount: number;
  occupiedCellCount: number;
  patternCount: number;
  loopCount: number;
}>;

export type ApplicationRuntimeSnapshot = Readonly<{
  environment: MobileEnvironment;
  lifecycle: LifecycleSnapshot;
  project: ProjectFixtureSummary;
  interaction: InteractionRuntimeDiagnostics;
  visual: VisualRuntimeDiagnostics;
  futureRuntimes: Readonly<{
    audio: "not-installed-n05";
    transport: "not-installed-n06";
    persistence: "not-installed-n10";
    session: "not-installed-n13";
  }>;
}>;

type SnapshotListener = () => void;

export class PocketJamApplicationRuntime {
  readonly project: Project;

  private readonly environment: MobileEnvironment;
  private readonly interaction: InteractionRuntime;
  private readonly visual: VisualRuntime;
  private readonly lifecycle: LifecycleCoordinator;
  private readonly logger: DevelopmentLogger;
  private readonly listeners = new Set<SnapshotListener>();
  private snapshotValue: ApplicationRuntimeSnapshot;
  private started = false;

  constructor(appStateSource: AppStateSource) {
    this.environment = readMobileEnvironment();
    this.logger = createDevelopmentLogger(__DEV__);
    this.project = loadValidatedFixture();
    this.interaction = new PlaceholderInteractionRuntime();
    this.visual = new PlaceholderVisualRuntime();
    this.lifecycle = new LifecycleCoordinator(
      appStateSource,
      { interaction: this.interaction, visual: this.visual },
      this.logger,
      () => this.publish(),
    );
    this.snapshotValue = this.buildSnapshot();
  }

  readonly subscribe = (listener: SnapshotListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ApplicationRuntimeSnapshot => this.snapshotValue;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.interaction.setEnabled(true);
    this.visual.resume();
    this.visual.setSceneSnapshot({
      projectId: this.project.id,
      revision: this.project.revision,
      scene: this.project.scene,
      instruments: this.project.instruments,
    });
    this.lifecycle.start();
    this.logger.info("Application composition started", {
      appVariant: this.environment.appVariant,
      projectId: this.project.id,
    });
    this.publish();
  }

  attachVisualSurface(surfaceId: string): void {
    this.visual.attach({ surfaceId });
    this.publish();
  }

  detachVisualSurface(surfaceId: string): void {
    this.visual.detach(surfaceId);
    this.publish();
  }

  dispose(): void {
    if (!this.started) return;
    this.lifecycle.stop();
    this.interaction.dispose();
    this.visual.dispose();
    this.started = false;
    this.listeners.clear();
  }

  private publish(): void {
    this.snapshotValue = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ApplicationRuntimeSnapshot {
    return {
      environment: this.environment,
      lifecycle: this.lifecycle.snapshot(),
      project: summarizeProject(this.project),
      interaction: this.interaction.diagnostics(),
      visual: this.visual.diagnostics(),
      futureRuntimes: {
        audio: "not-installed-n05",
        transport: "not-installed-n06",
        persistence: "not-installed-n10",
        session: "not-installed-n13",
      },
    };
  }
}

function loadValidatedFixture(): Project {
  const result = validateProject(createLegacyCloudProjectFixture());
  if (result.ok) return result.value;
  const reasons = result.issues.map(({ code, path }) => `${code}@${path.join(".")}`).join(", ");
  throw new Error(`Portable Project fixture validation failed: ${reasons}`);
}

function summarizeProject(project: Project): ProjectFixtureSummary {
  return {
    validation: "valid",
    id: project.id,
    name: project.name,
    schemaVersion: project.schemaVersion,
    bpm: project.transport.bpm,
    instrumentCount: Object.keys(project.instruments).length,
    placementCount: project.scene.placements.length,
    occupiedCellCount: project.scene.placements.reduce(
      (sum, placement) => sum + placement.footprint.columns * placement.footprint.rows,
      0,
    ),
    patternCount: Object.keys(project.patterns).length,
    loopCount: Object.keys(project.loops).length,
  };
}
