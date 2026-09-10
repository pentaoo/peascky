import type { StableId } from "@pocket-jam/shared";

export type AudioProgramId = StableId<"audio-program">;
export type VisualProgramId = StableId<"visual-program">;
export type InteractionStrategyId = StableId<"interaction-strategy">;

export type InstrumentProgramReferences = Readonly<{
  audioProgramId: AudioProgramId;
  visualProgramId: VisualProgramId;
  interactionStrategyId: InteractionStrategyId;
}>;
