import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";

import {
  buildChildEnvironment,
  calculateCls,
  classifyContinuingAnimations,
  computeCandidateFingerprint,
  evaluateControlPolicy,
  evaluateImagePolicy,
  orchestratePerformanceLab,
  rectanglesIntersect,
  resolveRunReportPath,
  validatePreflightSnapshot,
} from "./run-playwright-performance.mjs";

const rect = (left, top, width, height) => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
});

test("geometry policy records only the exact continuing header logo animation", () => {
  const known = {
    animationName: "header-brand-molecular-drift",
    targetSelector: "svg.header-brand-motion__field",
  };
  assert.deepEqual(classifyContinuingAnimations([known]), { errors: [], known: [known] });
  assert.deepEqual(classifyContinuingAnimations([
    known,
    { animationName: "unexpected-loop", targetSelector: "div.other" },
  ]), {
    errors: ["unexpected continuing animation: unexpected-loop on div.other"],
    known: [known],
  });
});

test("image policy fails rendered zero or broken images and records exact layout exclusions", () => {
  const visible = {
    alt: "Visible product",
    complete: true,
    layoutExclusion: null,
    naturalHeight: 600,
    naturalWidth: 800,
    rect: rect(0, 0, 320, 240),
    src: "/visible.webp",
  };
  const excluded = {
    alt: "Expected secondary",
    complete: true,
    layoutExclusion: { reason: "ancestor-display-none", selector: "div.hidden" },
    naturalHeight: 600,
    naturalWidth: 800,
    rect: rect(0, 0, 0, 0),
    src: "/hidden.webp",
  };
  assert.deepEqual(evaluateImagePolicy([visible, excluded], {
    expectedHiddenAltTexts: ["Expected secondary"],
    requireVisible: true,
  }), { errors: [], hidden: [excluded], visible: [visible] });

  const failed = evaluateImagePolicy([
    { ...visible, alt: "Zero", rect: rect(0, 0, 0, 0) },
    { ...visible, alt: "Broken", complete: false, naturalHeight: 0, naturalWidth: 0 },
    { ...excluded, alt: "Unexpected hidden" },
  ], { expectedHiddenAltTexts: [], requireVisible: true });
  assert.ok(failed.errors.some((error) => /rendered image lacks reserved dimensions: Zero/u.test(error)));
  assert.ok(failed.errors.some((error) => /rendered image is broken or undecoded: Broken/u.test(error)));
  assert.ok(failed.errors.some((error) => /unexpected layout-excluded image: Unexpected hidden/u.test(error)));
});

test("control policy requires inherited-fixed coverage and detects real rectangle overlap", () => {
  const search = [{
    fixedAncestor: ".site-search-launcher-lane",
    label: "Search PropeptIQ",
    rect: rect(100, 700, 44, 44),
  }];
  const footer = [{ label: "Footer link", rect: rect(0, 760, 100, 44) }];
  assert.deepEqual(evaluateControlPolicy({
    expectedPurchaseCount: 0,
    footerControls: footer,
    purchaseControls: [],
    searchControls: search,
  }), { collisions: [], errors: [] });
  assert.equal(rectanglesIntersect(search[0].rect, rect(100, 720, 100, 44)), true);
  const failed = evaluateControlPolicy({
    expectedPurchaseCount: 1,
    footerControls: [{ label: "Overlapping footer", rect: rect(100, 720, 100, 44) }],
    purchaseControls: [],
    searchControls: search,
  });
  assert.ok(failed.errors.some((error) => /expected 1 visible purchase control/u.test(error)));
  assert.ok(failed.errors.some((error) => /fixed control overlaps footer control/u.test(error)));
  assert.ok(evaluateControlPolicy({
    expectedPurchaseCount: 0,
    footerControls: footer,
    purchaseControls: [],
    searchControls: [],
  }).errors.some((error) => /visible search control set is empty/u.test(error)));
});

test("CLS math joins only contiguous sub-1000ms gaps through 4999ms", () => {
  assert.deepEqual(calculateCls([]), { allShiftSum: 0, maximumSessionWindow: 0 });
  const joined = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.01 },
    { hadRecentInput: false, startTime: 999, value: 0.01 },
    { hadRecentInput: false, startTime: 1_998, value: 0.01 },
    { hadRecentInput: false, startTime: 2_997, value: 0.01 },
    { hadRecentInput: false, startTime: 3_996, value: 0.01 },
    { hadRecentInput: false, startTime: 4_995, value: 0.01 },
  ]);
  assert.ok(Math.abs(joined.maximumSessionWindow - 0.06) < Number.EPSILON);
});

test("CLS math starts a new window at exactly 5000ms despite a preceding sub-1000ms gap", () => {
  const lengthBoundary = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.01 },
    { hadRecentInput: false, startTime: 999, value: 0.01 },
    { hadRecentInput: false, startTime: 1_998, value: 0.01 },
    { hadRecentInput: false, startTime: 2_997, value: 0.01 },
    { hadRecentInput: false, startTime: 3_996, value: 0.01 },
    { hadRecentInput: false, startTime: 4_995, value: 0.01 },
    { hadRecentInput: false, startTime: 5_000, value: 0.2 },
  ]);
  assert.equal(lengthBoundary.maximumSessionWindow, 0.2);
});

test("CLS math separates exact-1000ms and original 4000ms gaps and excludes recent input", () => {
  assert.equal(calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.02 },
    { hadRecentInput: false, startTime: 999, value: 0.03 },
    { hadRecentInput: false, startTime: 1_999, value: 0.5 },
  ]).maximumSessionWindow, 0.5);
  assert.equal(calculateCls([
    { hadRecentInput: false, startTime: 100, value: 0.01 },
    { hadRecentInput: false, startTime: 1_099, value: 0.02 },
    { hadRecentInput: false, startTime: 5_099, value: 0.03 },
  ]).maximumSessionWindow, 0.03);
  const input = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.02 },
    { hadRecentInput: true, startTime: 100, value: 0.8 },
    { hadRecentInput: false, startTime: 500, value: 0.03 },
  ]);
  assert.ok(Math.abs(input.allShiftSum - 0.85) < Number.EPSILON);
  assert.equal(input.maximumSessionWindow, 0.05);
});

test("child environment copies OS essentials case-insensitively and excludes secrets", () => {
  const environment = buildChildEnvironment({
    Path: "C:\\Windows\\System32",
    systemroot: "C:\\Windows",
    TEMP: "C:\\Temp",
    DATABASE_URL: "must-not-cross",
    NEXT_PUBLIC_UNREVIEWED: "must-not-cross",
    NODE_OPTIONS: "--inspect",
    npm_config_registry: "must-not-cross",
    HTTPS_PROXY: "must-not-cross",
  });

  assert.equal(environment.PATH, "C:\\Windows\\System32");
  assert.equal(environment.SystemRoot, "C:\\Windows");
  assert.equal(environment.TEMP, "C:\\Temp");
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.NEXT_PUBLIC_UNREVIEWED, undefined);
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.npm_config_registry, undefined);
  assert.equal(environment.HTTPS_PROXY, undefined);
  assert.deepEqual(
    {
      APP_ENV: environment.APP_ENV,
      APP_ORIGIN: environment.APP_ORIGIN,
      AUTH_MODE: environment.AUTH_MODE,
      BROWSE_CATALOG_PUBLICATION: environment.BROWSE_CATALOG_PUBLICATION,
      CATALOG_DEMO_MODE: environment.CATALOG_DEMO_MODE,
      COMMERCE_LIVE_CAPABILITY: environment.COMMERCE_LIVE_CAPABILITY,
      DATABASE_MODE: environment.DATABASE_MODE,
      EMAIL_MODE: environment.EMAIL_MODE,
      FULFILLMENT_MODE: environment.FULFILLMENT_MODE,
      LOCAL_TEST_DRIVER: environment.LOCAL_TEST_DRIVER,
      NEWSLETTER_MODE: environment.NEWSLETTER_MODE,
      NODE_ENV: environment.NODE_ENV,
      PAYMENTS_LIVE_CAPABILITY: environment.PAYMENTS_LIVE_CAPABILITY,
      PAYMENTS_MODE: environment.PAYMENTS_MODE,
      RECONSTITUTION_CALCULATOR_MODE: environment.RECONSTITUTION_CALCULATOR_MODE,
      SHIPPING_MODE: environment.SHIPPING_MODE,
      STORAGE_MODE: environment.STORAGE_MODE,
      TAX_MODE: environment.TAX_MODE,
      VERCEL_ENV: environment.VERCEL_ENV,
      VERCEL_TARGET_ENV: environment.VERCEL_TARGET_ENV,
    },
    {
      APP_ENV: "production",
      APP_ORIGIN: "https://propeptiq.com",
      AUTH_MODE: "disabled",
      BROWSE_CATALOG_PUBLICATION: "owner-pdf-2026-08-27-07cd4aa0-v1",
      CATALOG_DEMO_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      DATABASE_MODE: "disabled",
      EMAIL_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
      LOCAL_TEST_DRIVER: "disabled",
      NEWSLETTER_MODE: "disabled",
      NODE_ENV: "production",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      PAYMENTS_MODE: "disabled",
      RECONSTITUTION_CALCULATOR_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      STORAGE_MODE: "disabled",
      TAX_MODE: "disabled",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    },
  );
});

test("preflight rejects dotenv files, reserved ports, build locks, and concurrent lab locks", () => {
  const cases = [
    [{ dotenvFiles: [".env.local"], occupiedPorts: [], buildLocks: [], labLockExists: false }, "dotenv"],
    [{ dotenvFiles: [], occupiedPorts: [4641], buildLocks: [], labLockExists: false }, "4641"],
    [{ dotenvFiles: [], occupiedPorts: [], buildLocks: [".next/lock"], labLockExists: false }, ".next/lock"],
    [{ dotenvFiles: [], occupiedPorts: [], buildLocks: [], labLockExists: true }, "lab lock"],
  ];

  for (const [snapshot, message] of cases) {
    assert.throws(() => validatePreflightSnapshot(snapshot), new RegExp(message, "iu"));
  }
  assert.doesNotThrow(() => validatePreflightSnapshot({
    dotenvFiles: [".env.example"],
    occupiedPorts: [],
    buildLocks: [],
    labLockExists: false,
    reportExists: false,
  }));
  assert.doesNotThrow(() => validatePreflightSnapshot({
    dotenvFiles: [".env.example"],
    occupiedPorts: [],
    buildLocks: [],
    labLockExists: false,
    reportExists: true,
  }));
});

test("each unique run owns an exclusive report path inside that run directory", () => {
  const first = resolveRunReportPath(join("test-results", "performance", "run-a"));
  const second = resolveRunReportPath(join("test-results", "performance", "run-b"));
  assert.equal(first, join("test-results", "performance", "run-a", "report.md"));
  assert.equal(second, join("test-results", "performance", "run-b", "report.md"));
  assert.notEqual(first, second);
});

test("candidate fingerprint is order-independent and binds HEAD, status, and harness hashes", () => {
  const left = computeCandidateFingerprint({
    head: "abc",
    statusPaths: ["z", "a"],
    harnessHashes: { z: "2", a: "1" },
  });
  const right = computeCandidateFingerprint({
    head: "abc",
    statusPaths: ["a", "z"],
    harnessHashes: { a: "1", z: "2" },
  });
  assert.equal(left, right);
  assert.notEqual(left, computeCandidateFingerprint({
    head: "def",
    statusPaths: ["a", "z"],
    harnessHashes: { a: "1", z: "2" },
  }));
});

function labDouble({ failStage } = {}) {
  const events = [];
  let serverAlive = false;
  const candidate = {
    fingerprint: "candidate-1",
    harnessDirty: true,
    harnessHashes: { a: "1" },
    head: "5a91313d8f997b61b563216d1a0e61f77d973fd7",
    statusPaths: ["scripts/run-playwright-performance.mjs"],
  };
  const fail = (stage) => {
    if (failStage === stage) throw new Error(`${stage} failed`);
  };
  return {
    events,
    dependencies: {
      acquireLock: async () => { events.push("lock:acquire"); return { owned: true }; },
      build: async () => { events.push("build"); fail("build"); },
      captureCandidate: async () => { events.push("candidate:capture"); return candidate; },
      checkServerAlive: async () => { events.push("server:alive"); if (!serverAlive) throw new Error("server exited"); },
      compareCandidate: (before, after) => { events.push("candidate:compare"); assert.equal(before.fingerprint, after.fingerprint); },
      createRun: async () => { events.push("run:create"); },
      preflight: async () => { events.push("preflight"); fail("preflight"); },
      readBuildId: async () => { events.push("build-id:read"); return "build-1"; },
      readiness: async () => { events.push("readiness"); fail("readiness"); },
      releaseLock: async () => { events.push("lock:release"); },
      runBrowser: async () => { events.push("browser"); fail("browser"); },
      scan: async () => { events.push("scan"); fail("scan"); },
      startServer: async () => {
        events.push("server:start");
        serverAlive = true;
        return { owned: true };
      },
      stopBrowser: async () => { events.push("browser:stop"); },
      stopServer: async () => { events.push("server:stop"); serverAlive = false; },
      writeReport: async () => { events.push("report:write"); },
    },
  };
}

test("normal lab ordering keeps the owned server alive through browser completion and cleans up", async () => {
  const { dependencies, events } = labDouble();
  await orchestratePerformanceLab(dependencies);
  assert.deepEqual(events, [
    "preflight", "lock:acquire", "run:create", "candidate:capture", "build", "scan",
    "build-id:read", "server:start", "readiness", "server:alive", "browser",
    "server:alive", "candidate:capture", "candidate:compare", "server:stop",
    "report:write", "lock:release",
  ]);
});

for (const failure of [
  { stage: "build", forbidden: ["scan", "server:start", "browser"] },
  { stage: "scan", forbidden: ["server:start", "browser"] },
  { stage: "readiness", forbidden: ["browser"] },
  { stage: "browser", forbidden: [] },
]) {
  test(`${failure.stage} failure stops later unsafe stages and cleans only owned resources`, async () => {
    const { dependencies, events } = labDouble({ failStage: failure.stage });
    await assert.rejects(orchestratePerformanceLab(dependencies), new RegExp(`${failure.stage} failed`, "u"));
    for (const event of failure.forbidden) assert.equal(events.includes(event), false, event);
    if (events.includes("server:start")) assert.equal(events.includes("server:stop"), true);
    assert.equal(events.includes("browser:stop"), failure.stage === "browser");
    assert.equal(events.at(-1), "lock:release");
    assert.equal(events.includes("report:write"), true);
    if (failure.stage === "browser") {
      assert.equal(events.filter((event) => event === "candidate:capture").length, 2);
      assert.equal(events.includes("candidate:compare"), true);
    }
  });
}
