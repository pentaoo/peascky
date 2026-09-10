export type InteractionCancellationReason = "app-inactive" | "app-dispose";

export type InteractionRuntimeDiagnostics = Readonly<{
  implementationId: string;
  enabled: boolean;
  activeContactCount: number;
  lastCancellationReason: InteractionCancellationReason | null;
}>;

export interface InteractionRuntime {
  setEnabled(enabled: boolean): void;
  cancelAll(reason: InteractionCancellationReason): void;
  diagnostics(): InteractionRuntimeDiagnostics;
  dispose(): void;
}

export class PlaceholderInteractionRuntime implements InteractionRuntime {
  private enabled = true;
  private lastCancellationReason: InteractionCancellationReason | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  cancelAll(reason: InteractionCancellationReason): void {
    this.lastCancellationReason = reason;
  }

  diagnostics(): InteractionRuntimeDiagnostics {
    return {
      implementationId: "placeholder",
      enabled: this.enabled,
      activeContactCount: 0,
      lastCancellationReason: this.lastCancellationReason,
    };
  }

  dispose(): void {
    this.cancelAll("app-dispose");
    this.enabled = false;
  }
}
