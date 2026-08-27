import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const markerGroups = Object.freeze([
  {
    label: "local fixture sentinel",
    patterns: [/LOCAL_TEST_ONLY_PROPEPTIQ_91C4E7/gu],
  },
  {
    label: "local payment provider sentinel",
    patterns: [/LOCAL_PAYMENT_PROVIDER_TEST_ONLY_PROPEPTIQ_6D_C8A13F/gu],
  },
  {
    label: "synthetic hosted checkout implementation",
    patterns: [
      /Hosted payment test double/gu,
      /action=["']\/__synthetic_local_checkout\/[^"'\s<>/]{1,96}\/(?:return|complete)["']/gu,
    ],
  },
  {
    label: "fixed local actor identity",
    patterns: [
      /50000000-0000-4000-8000-00000000000[1-6]/gu,
      /fixed-(?:customer|blocked|admin|non-admin|no-mfa|limited-admin)@local\.test/gu,
    ],
  },
  {
    label: "demo fixture product",
    patterns: [
      /61000000-0000-4000-8000-00000000000[12]/gu,
      /Synthetic Reference (?:Alpha|Beta) — Demo Only/gu,
    ],
  },
]);

const localModulePattern = /(?:src[\\/]+auth[\\/]+local-driver\.ts|src_auth_local-driver_ts|src[\\/]+catalog[\\/]+demo-fixtures\.ts|src_catalog_demo-fixtures_ts|src[\\/]+commerce[\\/]+local-payment-provider\.ts|src_commerce_local-payment-provider_ts|src[\\/]+commerce[\\/]+local-commerce-harness-routes\.ts|src_commerce_local-commerce-harness-routes_ts)/gu;
const deployableDirectoryNames = new Set(["server", "standalone", "static"]);
const deployableRootFilePattern = /\.(?:json|[cm]?js|map)$/iu;

function countPatternMatches(text, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  pattern.lastIndex = 0;
  return count;
}

function listArtifactFiles(root) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      if (entry.isFile()) files.push(path);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

// Scan only files shipped by Next.js. Build/dev caches, generated types, and
// diagnostics can mention source modules without including them in deployment.
function listDeployableArtifactFiles(root) {
  const rootFiles = [];
  const runtimeFiles = [];
  const entries = readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && deployableDirectoryNames.has(entry.name)) {
      runtimeFiles.push(...listArtifactFiles(path));
    }
    if (
      entry.isFile() &&
      (entry.name === "BUILD_ID" || deployableRootFilePattern.test(entry.name))
    ) {
      rootFiles.push(path);
    }
  }

  return {
    files: [...rootFiles, ...runtimeFiles]
      .sort((left, right) => left.localeCompare(right)),
    runtimeFileCount: runtimeFiles.length,
  };
}

function collectSourceMapSources(value, sources) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value.sources)) {
    for (const source of value.sources) {
      if (typeof source === "string") sources.push(source);
    }
  }
  if (Array.isArray(value.sections)) {
    for (const section of value.sections) {
      collectSourceMapSources(section?.map, sources);
    }
  }
}

function moduleEvidenceText(path, artifactText) {
  if (extname(path).toLowerCase() !== ".map") return `${path}\n${artifactText}`;

  try {
    const sources = [];
    collectSourceMapSources(JSON.parse(artifactText), sources);
    return `${path}\n${sources.join("\n")}`;
  } catch {
    return `${path}\n${artifactText}`;
  }
}

export function scanProductionArtifacts(inputRoot = ".next") {
  const root = resolve(inputRoot);
  if (!existsSync(root)) {
    throw new Error("artifact root does not exist");
  }
  if (!statSync(root).isDirectory()) {
    throw new Error("artifact root is not a directory");
  }

  const groups = [
    ...markerGroups.map(({ label }) => ({ label, matches: 0, files: new Set() })),
    { label: "local implementation module", matches: 0, files: new Set() },
  ];
  const matchingFiles = new Set();
  let bytesScanned = 0;
  const { files, runtimeFileCount } = listDeployableArtifactFiles(root);
  if (runtimeFileCount === 0) {
    throw new Error("artifact root contains no deployable runtime files");
  }

  for (const path of files) {
    const contents = readFileSync(path);
    const artifactText = contents.toString("utf8");
    bytesScanned += contents.byteLength;

    for (let index = 0; index < markerGroups.length; index += 1) {
      const count = markerGroups[index].patterns.reduce(
        (total, pattern) => total + countPatternMatches(artifactText, pattern),
        0,
      );
      if (count > 0) {
        groups[index].matches += count;
        groups[index].files.add(path);
        matchingFiles.add(path);
      }
    }

    const moduleMatches = countPatternMatches(
      moduleEvidenceText(path, artifactText),
      localModulePattern,
    );
    if (moduleMatches > 0) {
      const group = groups.at(-1);
      group.matches += moduleMatches;
      group.files.add(path);
      matchingFiles.add(path);
    }
  }

  return {
    root,
    filesScanned: files.length,
    bytesScanned,
    matchingFiles: matchingFiles.size,
    matches: groups.reduce((total, group) => total + group.matches, 0),
    groups: groups.map((group) => ({
      label: group.label,
      matches: group.matches,
      matchingFiles: group.files.size,
    })),
  };
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function run() {
  try {
    const result = scanProductionArtifacts(process.argv[2] ?? ".next");
    if (result.matches === 0) {
      console.log(
        `PASS production artifact scan: ${result.filesScanned} files, ${result.bytesScanned} bytes, 0 forbidden matches`,
      );
      return;
    }

    console.error(
      `FAIL production artifact scan: ${result.filesScanned} files, ${result.bytesScanned} bytes, ${result.matchingFiles} matching ${plural(result.matchingFiles, "file")}, ${result.matches} forbidden ${plural(result.matches, "match", "matches")}`,
    );
    for (const group of result.groups.filter(({ matches }) => matches > 0)) {
      console.error(
        `- ${group.label}: ${group.matches} ${plural(group.matches, "match", "matches")} in ${group.matchingFiles} ${plural(group.matchingFiles, "file")}`,
      );
    }
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "artifact scan failed";
    console.error(`FAIL production artifact scan: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run();
}
