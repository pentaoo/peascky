import type { Project } from "@pocket-jam/core";

export type VisualPresentationState = "field" | "focus" | "transition" | "background";

export type VisualSurfaceAttachment = Readonly<{
  surfaceId: string;
}>;

export type VisualSceneSnapshot = Readonly<{
  projectId: Project["id"];
  revision: Project["revision"];
  scene: Project["scene"];
  instruments: Project["instruments"];
}>;

export type VisualRuntimeDiagnostics = Readonly<{
  implementationId: string;
  attachedSurfaceId: string | null;
  presentationState: VisualPresentationState;
  sceneRevision: number | null;
}>;

export interface VisualRuntime {
  attach(surface: VisualSurfaceAttachment): void;
  detach(surfaceId: string): void;
  setSceneSnapshot(snapshot: VisualSceneSnapshot): void;
  setPresentationState(state: VisualPresentationState): void;
  suspend(): void;
  resume(): void;
  diagnostics(): VisualRuntimeDiagnostics;
  dispose(): void;
}

export class PlaceholderVisualRuntime implements VisualRuntime {
  private attachedSurfaceId: string | null = null;
  private presentationState: VisualPresentationState = "field";
  private presentationBeforeSuspend: Exclude<VisualPresentationState, "background"> = "field";
  private sceneRevision: number | null = null;

  attach({ surfaceId }: VisualSurfaceAttachment): void {
    this.attachedSurfaceId = surfaceId;
  }

  detach(surfaceId: string): void {
    if (this.attachedSurfaceId === surfaceId) this.attachedSurfaceId = null;
  }

  setSceneSnapshot(snapshot: VisualSceneSnapshot): void {
    this.sceneRevision = snapshot.revision;
  }

  setPresentationState(state: VisualPresentationState): void {
    this.presentationState = state;
    if (state !== "background") this.presentationBeforeSuspend = state;
  }

  suspend(): void {
    if (this.presentationState !== "background") {
      this.presentationBeforeSuspend = this.presentationState;
    }
    this.presentationState = "background";
  }

  resume(): void {
    this.presentationState = this.presentationBeforeSuspend;
  }

  diagnostics(): VisualRuntimeDiagnostics {
    return {
      implementationId: "placeholder",
      attachedSurfaceId: this.attachedSurfaceId,
      presentationState: this.presentationState,
      sceneRevision: this.sceneRevision,
    };
  }

  dispose(): void {
    this.attachedSurfaceId = null;
    this.sceneRevision = null;
    this.suspend();
  }
}
