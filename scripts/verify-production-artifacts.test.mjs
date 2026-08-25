import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scannerPath = fileURLToPath(new URL("./verify-production-artifacts.mjs", import.meta.url));

function createWorkspace(t) {
  const root = mkdtempSync(join(tmpdir(), "propeptiq-artifact-guard-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function writeArtifact(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function runScanner({ cwd, artifactRoot }) {
  return spawnSync(
    process.execPath,
    artifactRoot ? [scannerPath, artifactRoot] : [scannerPath],
    { cwd, encoding: "utf8" },
  );
}

test("passes a recursively scanned production tree containing only disabled stubs", (t) => {
  const workspace = createWorkspace(t);
  const artifactRoot = join(workspace, ".next");

  writeArtifact(
    artifactRoot,
    "server/disabled.js",
    [
      "The local deterministic test driver is unavailable in this build",
      "Synthetic demo fixtures are unavailable in this build",
      "local-auth-driver catalog-demo-fixtures",
    ].join("\n"),
  );
  writeArtifact(
    artifactRoot,
    "server/disabled.js.map",
    JSON.stringify({
      version: 3,
      sources: [
        "webpack://app/./src/auth/local-driver-disabled.ts",
        "webpack://app/./src/auth/local-driver-types.ts",
        "webpack://app/./src/catalog/catalog-demo-disabled.ts",
      ],
      sourcesContent: [null, null, null],
    }),
  );
  writeArtifact(
    artifactRoot,
    "server/config.js.map",
    JSON.stringify({
      version: 3,
      sources: ["webpack://app/./next.config.ts"],
      sourcesContent: [
        'const local = "./src/auth/local-driver.ts"; const demo = "./src/catalog/demo-fixtures.ts";',
      ],
    }),
  );
  writeArtifact(
    artifactRoot,
    "standalone/server.js",
    "The local deterministic test driver is unavailable in this build",
  );
  writeArtifact(artifactRoot, "build-manifest.json", JSON.stringify({ pages: {} }));
  for (const ignoredPath of [
    "build/compiler.js",
    "cache/turbopack/graph.bin",
    "dev/server/chunks/local.js",
    "diagnostics/build-diagnostics.json",
    "types/routes.d.ts",
  ]) {
    writeArtifact(artifactRoot, ignoredPath, "LOCAL_TEST_ONLY_PROPEPTIQ_91C4E7");
  }

  const result = runScanner({ cwd: workspace });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /^PASS production artifact scan: 5 files, \d+ bytes, 0 forbidden matches\r?\n$/u,
  );
  assert.equal(result.stderr, "");
});

test("fails without echoing fixture values when local identities, products, or modules are bundled", (t) => {
  const workspace = createWorkspace(t);
  const artifactRoot = join(workspace, "closed-production-output");
  const fixtureSentinel = "LOCAL_TEST_ONLY_PROPEPTIQ_91C4E7";
  const fixedEmail = "fixed-admin@local.test";
  const fixedUserId = "50000000-0000-4000-8000-000000000003";
  const demoProductAlpha = "demo-product-alpha";
  const demoProductBeta = "demo-product-beta";

  writeArtifact(
    artifactRoot,
    "server/local.js",
    `${fixtureSentinel}\n${fixedEmail}\n${fixedUserId}`,
  );
  writeArtifact(
    artifactRoot,
    "static/catalog.js",
    `${demoProductAlpha}\n${demoProductBeta}`,
  );
  writeArtifact(
    artifactRoot,
    "server/local.js.map",
    JSON.stringify({
      version: 3,
      sources: ["webpack://app/./src/auth/local-driver.ts"],
      sourcesContent: [null],
    }),
  );
  writeArtifact(
    artifactRoot,
    "server/catalog.js.map",
    JSON.stringify({
      version: 3,
      sources: ["C:\\repo\\src\\catalog\\demo-fixtures.ts"],
      sourcesContent: [null],
    }),
  );

  const result = runScanner({ cwd: workspace, artifactRoot });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(
    result.stderr,
    /^FAIL production artifact scan: 4 files, \d+ bytes, 4 matching files, 7 forbidden matches\r?\n/u,
  );
  assert.match(result.stderr, /local fixture sentinel: 1 match in 1 file/u);
  assert.match(result.stderr, /fixed local actor identity: 2 matches in 1 file/u);
  assert.match(result.stderr, /demo fixture product: 2 matches in 1 file/u);
  assert.match(result.stderr, /local implementation module: 2 matches in 2 files/u);
  for (const forbiddenValue of [
    fixtureSentinel,
    fixedEmail,
    fixedUserId,
    demoProductAlpha,
    demoProductBeta,
  ]) {
    assert.equal(output.includes(forbiddenValue), false);
  }
});

test("fails clearly when the requested artifact root does not exist", (t) => {
  const workspace = createWorkspace(t);
  const missingRoot = join(workspace, "missing-output");

  const result = runScanner({ cwd: workspace, artifactRoot: missingRoot });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact root does not exist/u);
  assert.equal(result.stdout, "");
});

test("does not treat an empty directory as production-artifact proof", (t) => {
  const workspace = createWorkspace(t);
  const artifactRoot = join(workspace, "empty-output");
  mkdirSync(artifactRoot);

  const result = runScanner({ cwd: workspace, artifactRoot });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact root contains no deployable runtime files/u);
  assert.equal(result.stdout, "");
});

test("does not treat a cache-only tree as production-artifact proof", (t) => {
  const workspace = createWorkspace(t);
  const artifactRoot = join(workspace, "cache-only-output");
  writeArtifact(artifactRoot, "cache/turbopack/graph.bin", "clean cache payload");
  writeArtifact(artifactRoot, "build-manifest.json", JSON.stringify({ pages: {} }));

  const result = runScanner({ cwd: workspace, artifactRoot });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact root contains no deployable runtime files/u);
  assert.equal(result.stdout, "");
});

test("detects a local-driver module chunk even when its payload is minified", (t) => {
  const workspace = createWorkspace(t);
  const artifactRoot = join(workspace, "closed-production-output");
  writeArtifact(
    artifactRoot,
    "server/chunks/src_auth_local-driver_ts_7f9a.js",
    "(()=>{})();",
  );

  const result = runScanner({ cwd: workspace, artifactRoot });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /local implementation module: 1 match in 1 file/u);
});
