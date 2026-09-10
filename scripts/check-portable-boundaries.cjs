const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(repositoryRoot, "packages");
const packageNames = ["shared", "core", "protocol", "instrument-definitions"];
const packageScopes = new Map(packageNames.map((name) => [name, `@pocket-jam/${name}`]));
const localNames = new Map([...packageScopes].map(([directory, name]) => [name, directory]));
const allowedLocalDependencies = {
  shared: new Set(),
  core: new Set(["shared"]),
  protocol: new Set(["shared", "core"]),
  "instrument-definitions": new Set(["shared", "core"]),
};
const forbiddenImports = [
  /^node:/,
  /^(?:react|react-dom)(?:$|\/)/,
  /(?:^|[@/])react-native(?:$|[-/])/,
  /^expo(?:$|[-/])/,
  /^@react-three\//,
  /filament/i,
  /^(?:three|ws|isomorphic-ws|socket\.io-client)$/,
  /^(?:node:)?(?:fs|fs\/promises|path|net|tls|http|https|dgram)$/,
  /(?:^|[/@-])(?:sqlite|better-sqlite3|op-sqlite)(?:$|[/@-])/i,
];
const forbiddenGlobals = /\b(?:window|document|navigator|localStorage|sessionStorage|AudioContext|OfflineAudioContext|AudioNode|HTMLElement|WebSocket)\b/;
const importPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const failures = [];
const dependencyGraph = new Map(packageNames.map((name) => [name, []]));

function fail(message) {
  failures.push(message);
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [entryPath] : [];
  });
}

function inspectImport(packageName, packageDirectory, sourceFile, specifier, declaredDependencies) {
  if (forbiddenImports.some((pattern) => pattern.test(specifier))) {
    fail(`${path.relative(repositoryRoot, sourceFile)} imports forbidden platform/runtime module ${specifier}`);
  }

  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(sourceFile), specifier);
    if (resolved !== packageDirectory && !resolved.startsWith(`${packageDirectory}${path.sep}`)) {
      fail(`${path.relative(repositoryRoot, sourceFile)} escapes its portable package through ${specifier}`);
    }
    return;
  }

  const dependency = localNames.get(specifier);
  if (dependency && !allowedLocalDependencies[packageName].has(dependency)) {
    fail(`${packageName} cannot depend on ${dependency}`);
  }
  if (dependency && !declaredDependencies.has(specifier)) {
    fail(`${path.relative(repositoryRoot, sourceFile)} imports undeclared workspace dependency ${specifier}`);
  }
}

for (const packageName of packageNames) {
  const directory = path.join(packageRoot, packageName);
  const manifestPath = path.join(directory, "package.json");
  const sourceDirectory = path.join(directory, "src");
  const tsconfigPath = path.join(directory, "tsconfig.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(sourceDirectory) || !fs.existsSync(tsconfigPath)) {
    fail(`${packageName} is missing package.json, tsconfig.json, or src/`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const sourceConfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  if (manifest.name !== packageScopes.get(packageName)) fail(`${packageName} has unexpected package name ${manifest.name}`);
  if (!manifest.private) fail(`${packageName} must remain private during migration`);
  if (!manifest.exports?.["."]) fail(`${packageName} must declare an explicit root export`);
  if (sourceConfig.extends !== "../../tsconfig.base.json") {
    fail(`${packageName}/tsconfig.json must extend the portable root configuration`);
  }
  if ((sourceConfig.compilerOptions?.lib || []).some((library) => /^dom(?:\.|$)/i.test(library))) {
    fail(`${packageName}/tsconfig.json cannot add DOM libraries`);
  }
  if ((sourceConfig.compilerOptions?.types || []).length) {
    fail(`${packageName}/tsconfig.json cannot add environment-specific ambient types`);
  }

  const runtimeDependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
  const declaredDependencies = new Set(Object.keys(runtimeDependencies));
  for (const dependencyName of Object.keys(runtimeDependencies)) {
    if (forbiddenImports.some((pattern) => pattern.test(dependencyName))) {
      fail(`${packageName} declares forbidden platform/runtime dependency ${dependencyName}`);
    }
    const localDependency = localNames.get(dependencyName);
    if (!localDependency) continue;
    dependencyGraph.get(packageName).push(localDependency);
    if (!allowedLocalDependencies[packageName].has(localDependency)) {
      fail(`${packageName} cannot declare a dependency on ${localDependency}`);
    }
  }

  for (const sourceFile of listSourceFiles(sourceDirectory)) {
    const source = fs.readFileSync(sourceFile, "utf8");
    if (forbiddenGlobals.test(source)) {
      fail(`${path.relative(repositoryRoot, sourceFile)} references a forbidden platform global`);
    }
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        inspectImport(packageName, directory, sourceFile, match[1], declaredDependencies);
      }
    }
  }
}

const baseConfig = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "tsconfig.base.json"), "utf8"));
if ((baseConfig.compilerOptions?.lib || []).some((library) => /^dom(?:\.|$)/i.test(library))) {
  fail("tsconfig.base.json must not include DOM libraries for portable packages");
}

function visit(packageName, visiting = [], visited = new Set()) {
  if (visiting.includes(packageName)) {
    fail(`portable package dependency cycle: ${[...visiting.slice(visiting.indexOf(packageName)), packageName].join(" -> ")}`);
    return;
  }
  if (visited.has(packageName)) return;
  for (const dependency of dependencyGraph.get(packageName) || []) visit(dependency, [...visiting, packageName], visited);
  visited.add(packageName);
}

const visited = new Set();
for (const packageName of packageNames) visit(packageName, [], visited);

if (failures.length) {
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Portable boundary check passed for ${packageNames.length} packages.`);
}
