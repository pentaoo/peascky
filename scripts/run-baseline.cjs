const { spawnSync } = require("node:child_process");

const commands = [
  [process.execPath, ["--test", "test/project-store.test.js", "test/audio-engine.test.js", "test/cloud-catalogue.test.js", "test/legacy-prototypes.test.js"]],
  [process.execPath, ["scripts/run-browser-checks.cjs", "scripts/browser-baseline-smoke.cjs", "scripts/cloud-lab-smoke.cjs", "scripts/cloud-lab-audio-smoke.cjs"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
