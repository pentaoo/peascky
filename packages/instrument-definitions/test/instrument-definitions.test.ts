import test from "node:test";
import assert from "node:assert/strict";
import { parseStableId } from "@pocket-jam/shared";
import type { InstrumentProgramReferences } from "../src/index.js";

test("definition data points at program IDs without importing executable runtimes", () => {
  const audio = parseStableId("audio.cloud-kick", "audio-program");
  const visual = parseStableId("visual.cloud-kick", "visual-program");
  const interaction = parseStableId("interaction.hit", "interaction-strategy");
  assert.equal(audio.ok && visual.ok && interaction.ok, true);
  if (!audio.ok || !visual.ok || !interaction.ok) return;
  const references: InstrumentProgramReferences = {
    audioProgramId: audio.value,
    visualProgramId: visual.value,
    interactionStrategyId: interaction.value,
  };
  assert.deepEqual(Object.keys(references), ["audioProgramId", "visualProgramId", "interactionStrategyId"]);
});
