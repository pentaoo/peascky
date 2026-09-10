"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const mobileRoot = path.resolve(__dirname, "..");
const expoCli = require.resolve("expo/bin/cli", { paths: [mobileRoot] });
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pocket-jam-metro-smoke-"));
const platforms = ["android", "ios"];

function containsFile(directory) {
  return fs.existsSync(directory) && fs.readdirSync(directory, { recursive: true }).some((entry) => {
    return fs.statSync(path.join(directory, entry)).isFile();
  });
}

try {
  for (const platform of platforms) {
    const outputDirectory = path.join(temporaryRoot, platform);
    const result = spawnSync(
      process.execPath,
      [expoCli, "export", "--platform", platform, "--output-dir", outputDirectory],
      {
        cwd: mobileRoot,
        env: {
          ...process.env,
          APP_VARIANT: "development",
          CI: "1",
          EXPO_NO_TELEMETRY: "1",
        },
        stdio: "inherit",
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Expo/Metro ${platform} export exited with status ${result.status ?? "unknown"}.`);
    }

    const bundleDirectory = path.join(outputDirectory, "_expo", "static", "js", platform);
    if (!containsFile(bundleDirectory)) {
      throw new Error(`Expo/Metro ${platform} export did not produce a platform bundle.`);
    }
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("Expo/Metro bundle smoke passed for Android and iOS.");
