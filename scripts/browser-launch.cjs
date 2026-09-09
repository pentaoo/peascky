const { chromium } = require("playwright");

function launchChromium(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const channel = process.env.PLAYWRIGHT_CHANNEL;
  return chromium.launch({
    headless: process.env.HEADLESS !== "false",
    ...(executablePath ? { executablePath } : {}),
    ...(channel ? { channel } : {}),
    ...options,
  });
}

module.exports = { chromium, launchChromium };
