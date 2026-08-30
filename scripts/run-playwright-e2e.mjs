import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = require.resolve("@playwright/test/cli");
const extraArguments = process.argv.slice(2);

function runCommand(command, arguments_, options = {}) {
  return spawnSync(
    process.execPath,
    [playwrightCli, command, ...arguments_],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
      ...options,
    },
  );
}

function run(arguments_, options = {}) {
  return runCommand(
    "test",
    ["--config=playwright.config.ts", ...arguments_],
    options,
  );
}

function fail(result) {
  if (result.error) throw result.error;
  if (result.status === 0) return false;
  process.exitCode = result.status ?? 1;
  return true;
}

function collectSpecs(report) {
  const rootDir = report.config?.rootDir;
  if (typeof rootDir !== "string") throw new Error("Playwright report omitted rootDir.");

  const specs = [];
  const targets = new Set();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (
        typeof spec.file !== "string"
        || !Number.isInteger(spec.line)
        || spec.line < 1
        || !Number.isInteger(spec.column)
        || spec.column < 1
      ) {
        throw new Error("Playwright report returned an invalid test location.");
      }
      const absoluteFile = path.resolve(rootDir, spec.file);
      const file = path.relative(projectRoot, absoluteFile).replaceAll("\\", "/");
      const target = `${file}:${spec.line}:${spec.column}`;
      if (targets.has(target)) {
        throw new Error(`Playwright report returned duplicate test location: ${target}`);
      }
      targets.add(target);
      specs.push({
        file,
        line: spec.line,
        column: spec.column,
        target,
        isolated: Array.isArray(spec.tags)
          && (spec.tags.includes("isolated") || spec.tags.includes("@isolated")),
      });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  specs.sort(
    (left, right) => left.file.localeCompare(right.file)
      || left.line - right.line
      || left.column - right.column,
  );
  return specs;
}

function createBatches(specs) {
  const batches = [];
  const specsByFile = new Map();
  for (const spec of specs) {
    const fileSpecs = specsByFile.get(spec.file) ?? [];
    fileSpecs.push(spec);
    specsByFile.set(spec.file, fileSpecs);
  }

  const maximumSharedBatchSize = 4;
  for (const fileSpecs of specsByFile.values()) {
    let sharedTargets = [];
    const flushSharedTargets = () => {
      if (sharedTargets.length > 0) batches.push(sharedTargets);
      sharedTargets = [];
    };
    for (const spec of fileSpecs) {
      if (spec.isolated) {
        flushSharedTargets();
        batches.push([spec.target]);
        continue;
      }
      sharedTargets.push(spec.target);
      if (sharedTargets.length === maximumSharedBatchSize) flushSharedTargets();
    }
    flushSharedTargets();
  }
  return batches;
}

if (extraArguments.length > 0) {
  fail(run(extraArguments));
} else {
  const discovery = run(["--list", "--reporter=json"], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 10 * 1024 * 1024,
    stdio: "pipe",
  });
  if (fail(discovery)) {
    process.stdout.write(discovery.stdout ?? "");
    process.stderr.write(discovery.stderr ?? "");
  } else {
    const report = JSON.parse(discovery.stdout);
    const specs = collectSpecs(report);
    if (specs.length === 0) throw new Error("Playwright discovery found no E2E tests.");
    const batches = createBatches(specs);
    console.log(`Running ${specs.length} Playwright tests in ${batches.length} isolated batches.`);

    const blobParent = path.join(projectRoot, "blob-report");
    mkdirSync(blobParent, { recursive: true });
    const runRoot = mkdtempSync(path.join(blobParent, "run-"));
    const runName = path.basename(runRoot);
    const artifactRoot = path.join(projectRoot, "test-results", runName);
    mkdirSync(artifactRoot, { recursive: true });
    let testExitCode = 0;

    for (const [index, batch] of batches.entries()) {
      const label = `batch-${String(index + 1).padStart(2, "0")}`;
      const blobBatchDir = path.join(runRoot, label);
      const blobName = `${label}.zip`;
      const blobBatchFile = path.join(blobBatchDir, blobName);
      const blobRunFile = path.join(runRoot, blobName);
      const artifactBatchDir = path.join(artifactRoot, label);
      console.log(`\nE2E batch ${index + 1}/${batches.length} (${batch.length} tests)`);
      const result = run(
        [...batch, "--reporter=list,blob", "--output", artifactBatchDir],
        {
          env: {
            ...process.env,
            PLAYWRIGHT_BLOB_OUTPUT_DIR: blobBatchDir,
            PLAYWRIGHT_BLOB_OUTPUT_NAME: blobName,
          },
        },
      );
      if (result.error) throw result.error;
      if (!existsSync(blobBatchFile)) {
        throw new Error(`Playwright batch ${index + 1} did not produce ${blobBatchFile}.`);
      }
      renameSync(blobBatchFile, blobRunFile);
      if (result.status !== 0) {
        testExitCode = result.status ?? 1;
        break;
      }
    }

    const mergedJsonFile = path.join(runRoot, "merged-results.json");
    const merge = runCommand(
      "merge-reports",
      [
        "--config=playwright.config.ts",
        "--reporter=html,json",
        runRoot,
      ],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(projectRoot, "playwright-report"),
          PLAYWRIGHT_JSON_OUTPUT_FILE: mergedJsonFile,
        },
      },
    );
    if (merge.error) throw merge.error;
    if (!existsSync(mergedJsonFile)) {
      throw new Error("Playwright report merge did not produce merged-results.json.");
    }

    const mergedSpecs = collectSpecs(JSON.parse(readFileSync(mergedJsonFile, "utf8")));
    const mergedTargets = new Set(mergedSpecs.map((spec) => spec.target));
    const missingTargets = specs
      .filter((spec) => !mergedTargets.has(spec.target))
      .map((spec) => spec.target);
    if (testExitCode === 0 && (mergedSpecs.length !== specs.length || missingTargets.length > 0)) {
      throw new Error(
        `Merged Playwright report contains ${mergedSpecs.length} of ${specs.length} discovered tests.`,
      );
    }
    console.log(`Merged Playwright report: ${mergedSpecs.length}/${specs.length} discovered tests.`);
    console.log(`Playwright evidence: ${path.relative(projectRoot, runRoot)}`);

    if (testExitCode !== 0) process.exitCode = testExitCode;
    else if (merge.status !== 0) process.exitCode = merge.status ?? 1;
  }
}
