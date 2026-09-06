import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as performanceHarness from "./run-playwright-performance.mjs";

import {
  buildBrowserContextOptions,
  buildChildEnvironment,
  calculateLcpBreakdown,
  calculateCls,
  classifyBrowserRequest,
  classifyContinuingAnimations,
  computeCandidateFingerprint,
  evaluateClippingPolicy,
  evaluateControlPolicy,
  evaluateImagePolicy,
  orchestratePerformanceLab,
  rectanglesIntersect,
  resolveRunReportPath,
  selectWindowLongtasks,
  serializeError,
  sortStagesChronologically,
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
  assert.deepEqual(classifyContinuingAnimations([known], { allowKnownHeaderLogo: false }), {
    errors: ["unexpected continuing animation: header-brand-molecular-drift on svg.header-brand-motion__field"],
    known: [],
  });
});

test("every manual browser context blocks service workers without allowing an override", () => {
  assert.deepEqual(buildBrowserContextOptions({
    reducedMotion: "no-preference",
    serviceWorkers: "allow",
    viewport: { height: 812, width: 375 },
  }), {
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    viewport: { height: 812, width: 375 },
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
  assert.ok(failed.errors.some((error) => /rendered image lacks reserved dimensions before activation: Zero/u.test(error)));
  assert.ok(failed.errors.some((error) => /rendered image is broken or undecoded after activation: Broken/u.test(error)));
  assert.ok(failed.errors.some((error) => /unexpected layout-excluded image: Unexpected hidden/u.test(error)));
});

test("image policy gates pre-activation reservation and post-activation decode evidence", () => {
  const healthy = {
    alt: "Lazy product",
    after: { complete: true, layoutExclusion: null, naturalHeight: 600, naturalWidth: 800, rect: rect(0, 0, 320, 240) },
    before: { complete: false, layoutExclusion: null, naturalHeight: 0, naturalWidth: 0, rect: rect(0, 900, 320, 240) },
    src: "/lazy.webp",
  };
  assert.deepEqual(evaluateImagePolicy([healthy], {
    expectedHiddenAltTexts: [],
    requireVisible: true,
  }).errors, []);
  assert.ok(evaluateImagePolicy([{ ...healthy, before: { ...healthy.before, rect: rect(0, 900, 0, 0) } }], {
    expectedHiddenAltTexts: [],
    requireVisible: true,
  }).errors.some((error) => /before activation/u.test(error)));
  assert.ok(evaluateImagePolicy([{ ...healthy, after: { ...healthy.after, complete: false, naturalWidth: 0 } }], {
    expectedHiddenAltTexts: [],
    requireVisible: true,
  }).errors.some((error) => /after activation/u.test(error)));
  assert.ok(evaluateImagePolicy([{ ...healthy, after: { ...healthy.after, rect: rect(0, 0, 0, 0) } }], {
    expectedHiddenAltTexts: [],
    requireVisible: true,
  }).errors.some((error) => /lacks positive dimensions after activation/u.test(error)));
  assert.ok(evaluateImagePolicy([{
    ...healthy,
    after: {
      ...healthy.after,
      layoutExclusion: { reason: "ancestor-display-none", selector: "div.collapsed" },
    },
  }], {
    expectedHiddenAltTexts: [],
    requireVisible: true,
  }).errors.some((error) => /became layout-excluded after activation/u.test(error)));
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

test("clipping policy rejects genuine clipping but records intentional horizontal carousel clipping", () => {
  const result = evaluateClippingPolicy([
    { ancestorClips: [], label: "Search", requiredInViewport: true, viewportClipped: false, viewportRelevant: true },
    {
      ancestorClips: [{ axis: "x", intentionalScroll: false, selector: "div.card" }],
      label: "Visible heading",
      requiredInViewport: false,
      viewportClipped: false,
      viewportRelevant: true,
    },
    {
      ancestorClips: [{
        axis: "x",
        intentionalScroll: true,
        selector: 'ul[role="list"][aria-label^="Related products,"]',
      }],
      label: "Partially visible related product",
      requiredInViewport: false,
      viewportClipped: false,
      viewportRelevant: true,
    },
    { ancestorClips: [], label: "Earlier footer link", requiredInViewport: false, viewportClipped: true, viewportRelevant: false },
  ]);
  assert.deepEqual(result.errors, ["relevant target is ancestor-clipped: Visible heading by div.card"]);
  assert.equal(result.skippedOffscreen.length, 1);
  assert.equal(result.intentionalScrollClips.length, 1);
  assert.ok(evaluateClippingPolicy([
    { ancestorClips: [], label: "Purchase", requiredInViewport: true, viewportClipped: true, viewportRelevant: true },
  ]).errors.some((error) => /viewport-clipped: Purchase/u.test(error)));
});

test("owned termination helper timeout is retained while an owned child keeps the lock", async () => {
  assert.equal(typeof performanceHarness.awaitOwnedTerminationHelper, "function");
  let helperTimeout;
  await assert.rejects(async () => {
    try {
      await performanceHarness.awaitOwnedTerminationHelper({
        child: { exitCode: null, pid: 8123, signalCode: null },
        completed: new Promise(() => {}),
      }, { timeout: async () => undefined, timeoutMs: 5_000 });
    } catch (error) {
      helperTimeout = error;
      throw error;
    }
  },
    /taskkill helper PID 8123 did not complete within 5000ms/u,
  );
  const { dependencies, events, reportedErrors } = labDouble({
    aliveAfterStop: true,
    failStage: "browser",
    stopServerError: helperTimeout,
  });
  await assert.rejects(performanceHarness.orchestratePerformanceLab(dependencies), AggregateError);
  assert.equal(events.includes("lock:release"), false);
  const serialized = JSON.stringify(reportedErrors[0]);
  assert.match(serialized, /taskkill helper PID 8123 did not complete within 5000ms/u);
  assert.match(serialized, /Owned child remains alive; preserving the lab ownership lock/u);
});

test("context setup failure is retained and finalizes the created context", async () => {
  assert.equal(typeof performanceHarness.setupOwnedBrowserCase, "function");
  const events = [];
  const shell = {
    artifactStem: "001-setup",
    context: {
      close: async () => { events.push("context:close"); },
      tracing: { stop: async () => { events.push("trace:stop"); } },
    },
    page: {
      screenshot: async () => { events.push("screenshot"); },
    },
    traceStarted: true,
  };
  await assert.rejects(performanceHarness.setupOwnedBrowserCase(
    shell,
    async () => { events.push("setup"); throw new Error("observer setup failed"); },
    { artifactDirectory: "artifacts", outputDirectory: "." },
    { makeDirectory: () => { events.push("mkdir"); } },
  ), /observer setup failed/u);
  assert.deepEqual(events, ["setup", "mkdir", "screenshot", "trace:stop", "context:close"]);
  assert.equal(shell.finalized, true);
  assert.deepEqual(shell.finalization.errors, []);
});

test("artifact directory failure cannot prevent trace finalization or context close", async () => {
  assert.equal(typeof performanceHarness.finalizeOwnedBrowserCase, "function");
  const events = [];
  const shell = {
    artifactStem: "002-artifact-output",
    context: {
      close: async () => { events.push("context:close"); },
      tracing: {
        stop: async (options) => { events.push(options ? "trace:path" : "trace:discard"); },
      },
    },
    page: { screenshot: async () => { events.push("screenshot"); } },
    traceStarted: true,
  };
  const closure = await performanceHarness.finalizeOwnedBrowserCase(
    shell,
    true,
    { artifactDirectory: "artifacts", outputDirectory: "." },
    { makeDirectory: () => { events.push("mkdir"); throw new Error("disk denied"); } },
  );
  assert.deepEqual(events, ["mkdir", "trace:discard", "context:close"]);
  assert.deepEqual(closure.artifacts, []);
  assert.deepEqual(closure.errors, ["failure artifact directory creation failed: disk denied"]);
});

test("LCP phases prefer requestStart and clamp early or continuing resources without negative phases", () => {
  const navigation = { responseStart: 80, startTime: 0 };
  const lcp = { startTime: 600, url: "http://127.0.0.1:4641/front.webp" };
  assert.deepEqual(calculateLcpBreakdown({
    lcp,
    navigation,
    resources: [{ name: lcp.url, requestStart: 220, responseEnd: 400, startTime: 100 }],
  }), {
    classification: "matched-lcp-resource",
    elementRenderDelay: 200,
    resource: { name: lcp.url, requestStart: 220, responseEnd: 400, startTime: 100 },
    resourceLoadDelay: 140,
    resourceLoadDuration: 180,
    ttfb: 80,
  });
  const fallback = calculateLcpBreakdown({
    lcp: { ...lcp, startTime: 300 },
    navigation,
    resources: [{ name: lcp.url, requestStart: 0, responseEnd: 500, startTime: 20 }],
  });
  assert.deepEqual({
    elementRenderDelay: fallback.elementRenderDelay,
    resourceLoadDelay: fallback.resourceLoadDelay,
    resourceLoadDuration: fallback.resourceLoadDuration,
  }, { elementRenderDelay: 0, resourceLoadDelay: 0, resourceLoadDuration: 220 });
  assert.ok([fallback.elementRenderDelay, fallback.resourceLoadDelay, fallback.resourceLoadDuration].every((value) => value >= 0));
  assert.equal(calculateLcpBreakdown({ lcp: { startTime: 200, url: "" }, navigation, resources: [] }).classification, "text-lcp-empty-url");
  assert.equal(calculateLcpBreakdown({ lcp, navigation, resources: [] }).resourceLoadDuration, null);
});

test("LCP attribution excludes later repeated URLs and refuses ambiguous or invalid chronology", () => {
  const navigation = { responseStart: 80, startTime: 0 };
  const lcp = { startTime: 600, url: "http://127.0.0.1:4641/front.webp" };
  const valid = { name: lcp.url, requestStart: 100, responseEnd: 400, startTime: 90 };
  const later = { name: lcp.url, requestStart: 700, responseEnd: 800, startTime: 690 };
  assert.deepEqual(calculateLcpBreakdown({ lcp, navigation, resources: [valid, later] }), {
    classification: "matched-lcp-resource",
    elementRenderDelay: 200,
    resource: valid,
    resourceLoadDelay: 20,
    resourceLoadDuration: 300,
    ttfb: 80,
  });

  const ambiguous = calculateLcpBreakdown({
    lcp,
    navigation,
    resources: [valid, { ...valid, requestStart: 120, startTime: 110 }],
  });
  assert.equal(ambiguous.classification, "ambiguous-lcp-resource");
  assert.equal(ambiguous.resource, null);
  assert.equal(ambiguous.resourceLoadDuration, null);

  const invalid = calculateLcpBreakdown({ lcp, navigation, resources: [later] });
  assert.equal(invalid.classification, "invalid-lcp-resource-chronology");
  assert.equal(invalid.resource, null);
  assert.equal(invalid.elementRenderDelay, null);

  const truncated = calculateLcpBreakdown({
    lcp,
    navigation,
    resources: [valid],
    resourcesTruncated: true,
  });
  assert.equal(truncated.classification, "resource-timing-input-truncated");
  assert.equal(truncated.resource, null);
});

// Minimal test doubles execute the actual pre-navigation init and collection code;
// they model retained browser entries and event delivery without launching a browser.
async function resourceTimingDouble() {
  const source = readFileSync(new URL("../tests/performance/public-storefront.performance.spec.ts", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("async function installPerformanceObservers("), source.indexOf("async function initializeObservedContext("));
  const limitDeclaration = source.match(/^const resourceTimingLimit = .+;$/mu)?.[0];
  assert.ok(limitDeclaration);
  const window = {};
  const events = [];
  const listeners = new Map();
  let entries = [];
  let initScript;
  let capacity = 250;
  const page = {
    addInitScript: async (callback, argument) => { initScript = () => callback(argument); },
    evaluate: async (callback, argument) => callback(argument),
  };
  const performance = {
    addEventListener: (name, callback) => {
      events.push(`listen:${name}`);
      listeners.set(name, callback);
    },
    getEntriesByType: (type) => type === "resource" ? entries : [{ responseStart: 80, startTime: 0 }],
    setResourceTimingBufferSize: (limit) => {
      events.push(`capacity:${limit}`);
      capacity = limit;
    },
  };
  const compiled = ts.transpileModule(`${limitDeclaration}\n${functions}\n({ installPerformanceObservers, collectPerformance });`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const actual = runInNewContext(compiled, {
    PerformanceObserver: { supportedEntryTypes: [] }, performance, window,
  });
  await actual.installPerformanceObservers(page);
  assert.equal(window.__task18fPerformance, undefined, "installation registers the script for navigation");
  initScript();
  const append = (count) => {
    for (let index = 0; index < count; index += 1) {
      if (entries.length < capacity) entries.push({
        name: `https://example.test/resource-${entries.length}`, requestStart: 100, responseEnd: 400, startTime: 90,
      });
    }
  };
  const collect = async () => JSON.parse(JSON.stringify(await actual.collectPerformance(page)));
  return { append, collect, events, listeners, replaceRetained: (next) => { entries = next; } };
}

test("resource timing init sets the native capacity before resource loads; below capacity stays complete", async () => {
  const browser = await resourceTimingDouble();
  assert.deepEqual(browser.events, ["listen:resourcetimingbufferfull", "capacity:1000"]);
  browser.append(999);
  const raw = await browser.collect();
  assert.equal(raw.resourceTimings.limit, 1_000);
  assert.equal(raw.resourceTimings.entries.length, 999);
  assert.equal(raw.resourceTimings.retainedCount, 999);
  assert.equal(raw.resourceTimings.serializationOverflow, 0);
  assert.equal(raw.resourceTimings.resourceBufferFull, false);
  assert.equal(raw.resourceTimings.upstreamLossPossible, false);
  assert.equal(raw.resourceTimings.truncated, false);
  assert.equal(calculateLcpBreakdown({
    lcp: { startTime: 600, url: raw.resourceTimings.entries[0].name }, navigation: raw.navigation,
    resources: raw.resourceTimings.entries, resourcesTruncated: raw.resourceTimings.truncated,
  }).classification, "matched-lcp-resource");
});

test("resource timing overflow retains a sticky upstream loss flag and null LCP phases", async () => {
  const browser = await resourceTimingDouble();
  browser.append(1_001);
  assert.equal(typeof browser.listeners.get("resourcetimingbufferfull"), "function");
  browser.listeners.get("resourcetimingbufferfull")();
  const raw = await browser.collect();
  assert.equal(raw.resourceTimings.entries.length, 1_000);
  assert.equal(raw.resourceTimings.retainedCount, 1_000);
  assert.equal(raw.resourceTimings.serializationOverflow, 0, "upstream dropped count is unknown");
  assert.equal(raw.resourceTimings.resourceBufferFull, true);
  assert.equal(raw.resourceTimings.upstreamLossPossible, true);
  assert.equal(raw.resourceTimings.truncated, true);
  // Test-double snapshot shrinks to prove completeness cannot reset after the event.
  browser.replaceRetained([]);
  const later = await browser.collect();
  assert.equal(later.resourceTimings.resourceBufferFull, true);
  assert.equal(later.resourceTimings.upstreamLossPossible, true);
  assert.deepEqual(calculateLcpBreakdown({
    lcp: { startTime: 600, url: "https://example.test/unretained-lcp" }, navigation: later.navigation,
    resources: later.resourceTimings.entries, resourcesTruncated: later.resourceTimings.truncated,
  }), {
    classification: "resource-timing-input-truncated", elementRenderDelay: null, resource: null,
    resourceLoadDelay: null, resourceLoadDuration: null, ttfb: 80,
  });
});

test("a full retained resource buffer stays incomplete before a pending full event is delivered", async () => {
  const browser = await resourceTimingDouble();
  browser.append(1_000);
  assert.equal((await browser.collect()).resourceTimings.truncated, true, "exact capacity is conservatively incomplete");
  browser.append(1);
  const raw = await browser.collect();
  assert.equal(raw.resourceTimings.entries.length, 1_000);
  assert.equal(raw.resourceTimings.resourceBufferFull, false);
  assert.equal(raw.resourceTimings.upstreamLossPossible, true);
  assert.equal(raw.resourceTimings.truncated, true);
  assert.equal(calculateLcpBreakdown({
    lcp: { startTime: 600, url: "https://example.test/unretained-lcp" }, navigation: raw.navigation,
    resources: raw.resourceTimings.entries, resourcesTruncated: raw.resourceTimings.truncated,
  }).classification, "resource-timing-input-truncated");
});

test("network policy records safe local reads and rejects exact attribution, auth, mutation, and external routes", () => {
  const local = "http://127.0.0.1:4641";
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "GET", url: `${local}/sign-in?next=%2Fcatalog` }).classification, "allowed-local-read");
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "GET", url: `${local}/a/research-code` }).classification, "effectful-local-read");
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "HEAD", url: `${local}/r/referral-code/` }).classification, "effectful-local-read");
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "GET", url: `${local}/api/auth/session` }).classification, "unexpected-auth-read");
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "POST", url: `${local}/catalog` }).classification, "mutating-local-request");
  assert.equal(classifyBrowserRequest({ baseURL: local, method: "GET", url: "https://example.com/pixel" }).classification, "blocked-external-read");
});

test("network failure policy separates only exact correlated Next prefetch and no-JS script evidence", () => {
  assert.equal(typeof performanceHarness.classifyLocalNetworkFailure, "function");
  const base = {
    baseURL: "http://127.0.0.1:4641",
    errorText: "net::ERR_ABORTED",
    isNavigationRequest: false,
    javaScriptEnabled: true,
    method: "GET",
    resourceType: "fetch",
    response: { contentType: "text/x-component; charset=utf-8", status: 200 },
    url: "http://127.0.0.1:4641/catalog?_rsc=abc",
  };
  assert.equal(performanceHarness.classifyLocalNetworkFailure({
    ...base,
    requestHeaders: {
      "next-router-prefetch": "1",
      "next-router-segment-prefetch": "/_tree",
      rsc: "1",
    },
  }).classification, "unresolved-speculative-prefetch");

  const canonicalPdp = {
    ...base,
    requestHeaders: {
      "next-router-prefetch": "1",
      "next-router-segment-prefetch": "/_tree",
      rsc: "1",
    },
    url: "http://127.0.0.1:4641/catalog/items/retatrutide?_rsc=abc",
  };
  assert.equal(performanceHarness.classifyLocalNetworkFailure(canonicalPdp).classification, "hard-local-transport-failure");
  assert.equal(performanceHarness.classifyLocalNetworkFailure({
    ...canonicalPdp,
    approvedCanonicalPaths: ["/catalog/items/retatrutide"],
  }).classification, "unresolved-speculative-prefetch");
  assert.equal(performanceHarness.classifyLocalNetworkFailure({
    ...base,
    requestHeaders: {
      "next-router-prefetch": "1",
      "next-router-state-tree": encodeURIComponent(JSON.stringify(["", {}, null, "metadata-only"])),
      rsc: "1",
    },
  }).classification, "unresolved-speculative-prefetch");

  for (const override of [
    { requestHeaders: { rsc: "1" } },
    { requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" }, response: null },
    { requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" }, response: { contentType: "text/html", status: 200 } },
    { requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" }, resourceType: "document" },
    { requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" }, url: "http://127.0.0.1:4641/api/catalog?_rsc=abc" },
    { requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" }, url: "http://127.0.0.1:4641/account/private?_rsc=abc" },
    { errorText: "net::ERR_FAILED", requestHeaders: { "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree", rsc: "1" } },
  ]) {
    assert.equal(performanceHarness.classifyLocalNetworkFailure({ ...base, ...override }).classification, "hard-local-transport-failure");
  }

  const noJavaScriptScript = {
    ...base,
    errorText: "csp",
    javaScriptEnabled: false,
    requestHeaders: {},
    resourceType: "script",
    response: null,
    url: "http://127.0.0.1:4641/_next/static/chunks/app.js",
  };
  assert.equal(performanceHarness.classifyLocalNetworkFailure(noJavaScriptScript).classification, "intentional-no-js-script-block");
  assert.equal(performanceHarness.classifyLocalNetworkFailure({ ...noJavaScriptScript, javaScriptEnabled: true }).classification, "hard-local-transport-failure");
  assert.equal(performanceHarness.classifyLocalNetworkFailure({ ...noJavaScriptScript, resourceType: "fetch" }).classification, "hard-local-transport-failure");
});

test("porcelain normalization preserves the first status column and every changed path", () => {
  assert.equal(typeof performanceHarness.normalizeGitOutput, "function");
  assert.equal(typeof performanceHarness.parsePorcelainPaths, "function");
  const output = " M scripts/run-playwright-performance.mjs\nM  playwright.performance.config.ts\n?? tests/performance/public-storefront.performance.spec.ts\n";
  const normalized = performanceHarness.normalizeGitOutput(output, { preserveLeading: true });
  assert.equal(normalized.startsWith(" M "), true);
  assert.deepEqual(performanceHarness.parsePorcelainPaths(normalized), [
    "playwright.performance.config.ts",
    "scripts/run-playwright-performance.mjs",
    "tests/performance/public-storefront.performance.spec.ts",
  ]);
});

test("future performance paths are isolated from every Playwright and task-SDD cleanup root", () => {
  assert.equal(typeof performanceHarness.resolvePerformancePaths, "function");
  assert.equal(typeof performanceHarness.validatePerformancePathPolicy, "function");
  const paths = performanceHarness.resolvePerformancePaths("C:\\repo", "run-a");
  assert.match(paths.labRoot.replaceAll("\\", "/"), /\.superpowers\/artifacts\/storefront-performance$/u);
  assert.match(paths.labLock.replaceAll("\\", "/"), /\.superpowers\/artifacts\/storefront-performance\.lock$/u);
  assert.equal(paths.runDirectory, join(paths.labRoot, "run-a"));
  assert.doesNotThrow(() => performanceHarness.validatePerformancePathPolicy(paths));
  for (const forbidden of ["test-results", "playwright-report", "blob-report", ".superpowers/sdd/2026-09-04-propeptiq-storefront-completion"]) {
    assert.throws(() => performanceHarness.validatePerformancePathPolicy({
      ...paths,
      labRoot: join("C:\\repo", forbidden, "performance"),
      runDirectory: join("C:\\repo", forbidden, "performance", "run-a"),
    }), /forbidden cleanup root|exact isolated root/iu);
  }
});

test("no-JavaScript cases use only host polling around synchronous page snapshots", () => {
  const source = readFileSync(new URL("../tests/performance/public-storefront.performance.spec.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function noJavaScriptCase");
  const end = source.indexOf("async function reducedMotionCase", start);
  assert.ok(start >= 0 && end > start);
  const noJavaScriptCaseSource = source.slice(start, end);
  assert.doesNotMatch(noJavaScriptCaseSource, /waitForGeometryStable|prepareRenderedImages|waitForFooterReadiness|page\.evaluate\(async|\.evaluate\(async/gu);
  assert.match(noJavaScriptCaseSource, /waitForNoJavaScriptGeometryStable/u);
  assert.match(noJavaScriptCaseSource, /prepareNoJavaScriptImages/u);
  assert.match(noJavaScriptCaseSource, /waitForNoJavaScriptFooter/u);
  assert.match(noJavaScriptCaseSource, /lifecycle = result\.errors\.length > 0 \? "failed" : "completed"/u);
  assert.match(noJavaScriptCaseSource, /lifecycle = "interrupted"/u);
  const imageStart = source.indexOf("async function prepareNoJavaScriptImages");
  const imageEnd = source.indexOf("async function waitForNoJavaScriptFooter", imageStart);
  assert.ok(imageStart >= 0 && imageEnd > imageStart);
  const noJavaScriptImagesSource = source.slice(imageStart, imageEnd);
  assert.doesNotMatch(noJavaScriptImagesSource, /scrollIntoViewIfNeeded|\.evaluate\(async/gu);
});

test("frame longtasks are tagged against the exact observation interval and whole-context records remain separate", () => {
  const selected = selectWindowLongtasks([
    { duration: 20, startTime: 90 },
    { duration: 30, startTime: 190 },
    { duration: 5, startTime: 220 },
  ], { endTime: 220, startTime: 100 });
  assert.deepEqual(selected.windowLongtasks.map((entry) => entry.startTime), [90, 190]);
  assert.equal(selected.wholeContextLongtasks.length, 3);
  assert.deepEqual(selected.windowLongtasks.map((entry) => entry.windowOverlapMs), [10, 30]);
});

test("serialized aggregate evidence retains constituent errors and stage presentation is chronological", () => {
  const serialized = serializeError(new AggregateError([
    new Error("browser failed"),
    new AggregateError([new Error("binding changed"), new Error("cleanup failed")], "binding and cleanup"),
  ], "lab failed"));
  assert.deepEqual(serialized.errors.map((error) => error.message), ["browser failed", "binding and cleanup"]);
  assert.deepEqual(serialized.errors[1].errors.map((error) => error.message), ["binding changed", "cleanup failed"]);
  assert.deepEqual(sortStagesChronologically([
    { name: "05-playwright", startedAt: "2026-09-05T00:00:05.000Z" },
    { name: "03-next-start", startedAt: "2026-09-05T00:00:03.000Z" },
    { name: "04-readiness", startedAt: "2026-09-05T00:00:04.000Z" },
  ]).map((stage) => stage.name), ["03-next-start", "04-readiness", "05-playwright"]);
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

function labDouble({ aliveAfterStop = false, bindingError = false, failStage, stopServerError = null } = {}) {
  const events = [];
  const reportedErrors = [];
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
      compareCandidate: (before, after) => {
        events.push("candidate:compare");
        assert.equal(before.fingerprint, after.fingerprint);
        if (bindingError) throw new Error("binding changed");
      },
      createRun: async () => { events.push("run:create"); },
      preflight: async () => { events.push("preflight"); fail("preflight"); },
      ownedChildrenAlive: async () => { events.push("children:alive"); return serverAlive; },
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
      stopServer: async () => {
        events.push("server:stop");
        serverAlive = aliveAfterStop;
        if (stopServerError) throw stopServerError === true ? new Error("server cleanup failed") : stopServerError;
      },
      writeReport: async (error) => { events.push("report:write"); reportedErrors.push(serializeError(error)); },
    },
    reportedErrors,
  };
}

test("normal lab ordering keeps the owned server alive through browser completion and cleans up", async () => {
  const { dependencies, events } = labDouble();
  await orchestratePerformanceLab(dependencies);
  assert.deepEqual(events, [
    "preflight", "lock:acquire", "run:create", "candidate:capture", "build", "scan",
    "build-id:read", "server:start", "readiness", "server:alive", "browser",
    "server:alive", "candidate:capture", "candidate:compare", "server:stop",
    "children:alive", "lock:release", "report:write",
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
    assert.equal(events.at(-1), "report:write");
    assert.ok(events.includes("lock:release"));
    assert.equal(events.includes("report:write"), true);
    if (failure.stage === "browser") {
      assert.equal(events.filter((event) => event === "candidate:capture").length, 2);
      assert.equal(events.includes("candidate:compare"), true);
    }
  });
}

test("cleanup failure with a live owned child retains every error and preserves the ownership lock", async () => {
  const { dependencies, events, reportedErrors } = labDouble({
    aliveAfterStop: true,
    bindingError: true,
    failStage: "browser",
    stopServerError: true,
  });
  await assert.rejects(orchestratePerformanceLab(dependencies), AggregateError);
  assert.equal(events.includes("lock:release"), false);
  assert.equal(events.at(-1), "report:write");
  const messages = [];
  const visit = (error) => {
    if (!error) return;
    messages.push(error.message);
    for (const constituent of error.errors ?? []) visit(constituent);
  };
  visit(reportedErrors[0]);
  assert.ok(messages.includes("browser failed"));
  assert.ok(messages.includes("binding changed"));
  assert.ok(messages.includes("server cleanup failed"));
  assert.ok(messages.includes("Owned child remains alive; preserving the lab ownership lock"));
});
