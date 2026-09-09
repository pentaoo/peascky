const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const scripts = process.argv.slice(2);

if (!scripts.length) {
  console.error("Usage: node scripts/run-browser-checks.cjs <script.cjs> [...]");
  process.exit(2);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(repositoryRoot, relativePath);
  return candidate === repositoryRoot || candidate.startsWith(`${repositoryRoot}${path.sep}`)
    ? candidate
    : null;
}

function runScript(script, baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(repositoryRoot, script)], {
      cwd: repositoryRoot,
      env: { ...process.env, POCKET_JAM_ORIGIN: baseUrl },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${script} exited on signal ${signal}`));
      else if (code) reject(new Error(`${script} exited with code ${code}`));
      else resolve();
    });
  });
}

const server = http.createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    for (const script of scripts) await runScript(script, baseUrl);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
