/* eslint-disable @typescript-eslint/no-explicit-any -- Chromium performance entry extensions and retained JSON evidence are intentionally runtime-shaped. */
import { expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
// @ts-expect-error The owned Node ESM harness intentionally has no separate declaration file.
import { buildBrowserContextOptions, calculateCls, calculateLcpBreakdown, classifyBrowserRequest, classifyContinuingAnimations, classifyLocalNetworkFailure, evaluateClippingPolicy, evaluateControlPolicy, evaluateImagePolicy, finalizeOwnedBrowserCase, selectWindowLongtasks, serializeError, setupOwnedBrowserCase } from "../../scripts/run-playwright-performance.mjs";

test.describe.configure({ mode: "serial" });

const baseURL = "http://127.0.0.1:4641";
const observationWindowMs = 6_000;
const frameWindowMs = 30_000;
const allowedLocalReadLimit = 250;
const resourceTimingLimit = 1_000;
const performanceOutputDirectory = resolve(process.env.PERFORMANCE_OUTPUT_DIR ?? ".");
const contextArtifactDirectory = join(performanceOutputDirectory, "playwright-artifacts");
let contextSequence = 0;
let approvedCanonicalPdpPaths: string[] = [];
const viewports = [
  { width: 195, height: 520 },
  { width: 320, height: 812 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const coldViewports = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

type BoundaryRecord = {
  approvedCanonicalPaths: string[];
  allowedLocalReadOverflow: number;
  allowedLocalReads: Array<{ method: string; url: string }>;
  authRequests: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  externalRequests: string[];
  failedResponses: Array<{ status: number; url: string }>;
  intentionalBoundaryAborts: Array<{ classification: string; method: string; url: string }>;
  intentionalExternalAborts: string[];
  localRequestFailures: Array<{
    classification: string;
    errorText: string | null;
    family: string | null;
    isNavigationRequest: boolean;
    javaScriptEnabled: boolean;
    lifecyclePhase: string;
    method: string;
    reason: string;
    requestHeaders: Record<string, string>;
    resourceType: string;
    response: { contentType: string | null; status: number } | null;
    timing: Record<string, number>;
    url: string;
  }>;
  mutatingRequests: Array<{ method: string; url: string }>;
  syntheticOrProviderRequests: string[];
};

type LabContextShell = {
  artifactStem: string;
  cdp?: CDPSession;
  context: BrowserContext;
  finalization?: { artifacts: string[]; errors: string[] };
  finalized: boolean;
  javaScriptEnabled: boolean;
  page: Page;
  traceStarted: boolean;
};

type Shift = {
  hadRecentInput: boolean;
  sources: Array<{
    currentRect: Record<string, number> | null;
    node: string | null;
    previousRect: Record<string, number> | null;
  }>;
  startTime: number;
  value: number;
};

const evidence: Record<string, any> = {
  browserVersion: null,
  buildId: process.env.PERFORMANCE_BUILD_ID,
  coldMethod: {
    cache: "disabled in every fresh context through CDP",
    cpu: "CDP Emulation.setCPUThrottlingRate rate=4",
    network: "unthrottled localhost",
    observationWindowMs,
  },
  diagnosticWarnings: [],
  colourWarnings: [],
  frames: [],
  geometry: [],
  knownLcpHints: [],
  manualContextPolicy: {
    serviceWorkers: "block",
    tracing: {
      note: "Every manual context is traced with DOM snapshots and no trace screenshots or sources; traces are exported only for failed contexts. This instrumentation can affect local timing.",
      screenshots: false,
      snapshots: true,
      sources: false,
    },
  },
  mathSelfChecks: [],
  noJavaScriptGeometry: [],
  reducedMotionGeometry: [],
  runId: process.env.PERFORMANCE_RUN_ID,
  samples: [],
  startedAt: new Date().toISOString(),
};

function writeEvidence() {
  const path = process.env.PERFORMANCE_DATA_PATH;
  if (!path) throw new Error("PERFORMANCE_DATA_PATH is required.");
  evidence.endedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "w" });
}

test("CLS self-check: empty input is zero", () => {
  const result = calculateCls([]);
  expect(result).toEqual({ allShiftSum: 0, maximumSessionWindow: 0 });
  evidence.mathSelfChecks.push({ case: "empty", result });
});

test("CLS self-check: contiguous sub-1000ms gaps join through 4995ms", () => {
  const result = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.01 },
    { hadRecentInput: false, startTime: 999, value: 0.01 },
    { hadRecentInput: false, startTime: 1_998, value: 0.01 },
    { hadRecentInput: false, startTime: 2_997, value: 0.01 },
    { hadRecentInput: false, startTime: 3_996, value: 0.01 },
    { hadRecentInput: false, startTime: 4_995, value: 0.01 },
  ]);
  expect(result.maximumSessionWindow).toBeCloseTo(0.06, 12);
  evidence.mathSelfChecks.push({ case: "contiguous-through-4995ms", result });
});

test("CLS self-check: exact-1000ms and original 4000ms gaps form separate windows", () => {
  const result = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.02 },
    { hadRecentInput: false, startTime: 999, value: 0.03 },
    { hadRecentInput: false, startTime: 1_999, value: 0.5 },
  ]);
  const originalRegression = calculateCls([
    { hadRecentInput: false, startTime: 100, value: 0.01 },
    { hadRecentInput: false, startTime: 1_099, value: 0.02 },
    { hadRecentInput: false, startTime: 5_099, value: 0.03 },
  ]);
  expect(result.maximumSessionWindow).toBe(0.5);
  expect(originalRegression.maximumSessionWindow).toBe(0.03);
  evidence.mathSelfChecks.push({ case: "exact-1000ms-gap", result });
  evidence.mathSelfChecks.push({ case: "original-4000ms-gap-regression", result: originalRegression });
});

test("CLS self-check: exact-5000ms length starts a new window after a sub-1000ms gap", () => {
  const result = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.01 },
    { hadRecentInput: false, startTime: 999, value: 0.01 },
    { hadRecentInput: false, startTime: 1_998, value: 0.01 },
    { hadRecentInput: false, startTime: 2_997, value: 0.01 },
    { hadRecentInput: false, startTime: 3_996, value: 0.01 },
    { hadRecentInput: false, startTime: 4_995, value: 0.01 },
    { hadRecentInput: false, startTime: 5_000, value: 0.2 },
  ]);
  expect(result.maximumSessionWindow).toBe(0.2);
  evidence.mathSelfChecks.push({ case: "exact-5000ms-length", result });
});

test("CLS self-check: recent-input shifts are excluded from windows but retained in raw sum", () => {
  const result = calculateCls([
    { hadRecentInput: false, startTime: 0, value: 0.02 },
    { hadRecentInput: true, startTime: 100, value: 0.8 },
    { hadRecentInput: false, startTime: 500, value: 0.03 },
  ]);
  expect(result.allShiftSum).toBeCloseTo(0.85, 12);
  expect(result.maximumSessionWindow).toBeCloseTo(0.05, 12);
  evidence.mathSelfChecks.push({ case: "recent-input-exclusion", result });
});

function emptyBoundaryRecord(): BoundaryRecord {
  return {
    approvedCanonicalPaths: [...approvedCanonicalPdpPaths],
    allowedLocalReadOverflow: 0,
    allowedLocalReads: [],
    authRequests: [],
    consoleErrors: [],
    consoleWarnings: [],
    externalRequests: [],
    failedResponses: [],
    intentionalBoundaryAborts: [],
    intentionalExternalAborts: [],
    localRequestFailures: [],
    mutatingRequests: [],
    syntheticOrProviderRequests: [],
  };
}

function safeArtifactLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "context";
}

async function createLabContext(browser: Browser, label: string, options: Record<string, any>) {
  contextSequence += 1;
  const artifactStem = `${String(contextSequence).padStart(3, "0")}-${safeArtifactLabel(label)}`;
  const context = await browser.newContext(buildBrowserContextOptions(options));
  return {
    artifactStem,
    context,
    finalized: false,
    javaScriptEnabled: options.javaScriptEnabled !== false,
    page: null as unknown as Page,
    traceStarted: false,
  } satisfies LabContextShell;
}

const contextFinalizationOptions = {
  artifactDirectory: contextArtifactDirectory,
  outputDirectory: performanceOutputDirectory,
};

async function initializeLabContext(shell: LabContextShell, boundary: BoundaryRecord, observed = false) {
  return setupOwnedBrowserCase(shell, async () => {
    await shell.context.tracing.start({ screenshots: false, snapshots: true, sources: false });
    shell.traceStarted = true;
    shell.page = await shell.context.newPage();
    await installBoundary(shell.context, shell.page, boundary, shell.javaScriptEnabled);
    if (observed) {
      await installPerformanceObservers(shell.page);
      shell.cdp = await shell.context.newCDPSession(shell.page);
      await shell.cdp.send("Network.enable");
      await shell.cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await shell.cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
  }, contextFinalizationOptions);
}

async function closeLabContext(
  shell: LabContextShell,
  failed: boolean,
) {
  return finalizeOwnedBrowserCase(shell, failed, contextFinalizationOptions);
}

async function installBoundary(context: BrowserContext, page: Page, record: BoundaryRecord, javaScriptEnabled: boolean) {
  const correlatedResponses = new WeakMap<object, { contentType: string | null; status: number }>();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const classification = classifyBrowserRequest({ baseURL, method: request.method(), url: request.url() });
    if (classification.classification.startsWith("blocked-external-")) {
      record.externalRequests.push(route.request().url());
      record.intentionalExternalAborts.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    if (["effectful-local-read", "mutating-local-request"].includes(classification.classification)) {
      record.intentionalBoundaryAborts.push({
        classification: classification.classification,
        method: request.method().toUpperCase(),
        url: request.url(),
      });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    const method = request.method().toUpperCase();
    const classification = classifyBrowserRequest({ baseURL, method, url: request.url() });
    if (classification.classification === "allowed-local-read") {
      if (record.allowedLocalReads.length < allowedLocalReadLimit) record.allowedLocalReads.push({ method, url: request.url() });
      else record.allowedLocalReadOverflow += 1;
    }
    if (classification.classification === "mutating-local-request" || classification.classification === "blocked-external-mutation") {
      record.mutatingRequests.push({ method, url: request.url() });
    }
    if (classification.classification === "unexpected-auth-read") record.authRequests.push(request.url());
    if (classification.classification === "effectful-local-read") record.syntheticOrProviderRequests.push(request.url());
  });
  page.on("requestfailed", (request) => {
    const classification = classifyBrowserRequest({ baseURL, method: request.method(), url: request.url() });
    if (!classification.local) return;
    if (["effectful-local-read", "mutating-local-request"].includes(classification.classification)) return;
    const errorText = request.failure()?.errorText ?? null;
    const response = correlatedResponses.get(request) ?? null;
    const disposition = classifyLocalNetworkFailure({
      approvedCanonicalPaths: record.approvedCanonicalPaths,
      baseURL,
      errorText,
      isNavigationRequest: request.isNavigationRequest(),
      javaScriptEnabled,
      method: request.method().toUpperCase(),
      requestHeaders: request.headers(),
      resourceType: request.resourceType(),
      response,
      url: request.url(),
    });
    record.localRequestFailures.push({
      ...disposition,
      errorText,
      isNavigationRequest: request.isNavigationRequest(),
      javaScriptEnabled,
      lifecyclePhase: response ? "requestfailed-after-response" : "requestfailed-without-response",
      method: request.method().toUpperCase(),
      resourceType: request.resourceType(),
      response,
      timing: request.timing(),
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    correlatedResponses.set(response.request(), {
      contentType: response.headers()["content-type"] ?? null,
      status: response.status(),
    });
    if (response.status() >= 400) record.failedResponses.push({ status: response.status(), url: response.url() });
  });
  page.on("pageerror", (error) => record.consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(message.text());
    if (message.type() === "warning") record.consoleWarnings.push(message.text());
  });
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript((limit) => {
    const state = {
      lcp: [] as any[],
      longtasks: [] as any[],
      observers: [] as Array<{
        destination: any[];
        map: (entry: any) => any;
        observer: PerformanceObserver;
      }>,
      resourceBufferFull: false,
      shifts: [] as any[],
      supported: PerformanceObserver.supportedEntryTypes ?? [],
    };
    performance.addEventListener("resourcetimingbufferfull", () => {
      state.resourceBufferFull = true;
    });
    performance.setResourceTimingBufferSize(limit);
    const descriptor = (node: Node | null) => {
      if (!(node instanceof Element)) return null;
      const bounds = node.getBoundingClientRect();
      return {
        classes: [...node.classList].slice(0, 4),
        id: node.id || null,
        rect: {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        },
        tag: node.tagName.toLowerCase(),
        text: (node.textContent ?? "").replace(/\s+/gu, " ").trim().slice(0, 120),
      };
    };
    const rectangle = (rect: DOMRectReadOnly | undefined) => rect ? ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    }) : null;
    const observe = (type: string, destination: any[], map: (entry: any) => any) => {
      if (!state.supported.includes(type)) return;
      const observer = new PerformanceObserver((list) => {
        destination.push(...list.getEntries().map(map));
      });
      observer.observe({ buffered: true, type });
      state.observers.push({ destination, map, observer });
    };
    observe("largest-contentful-paint", state.lcp, (entry) => ({
      element: descriptor(entry.element),
      loadTime: entry.loadTime,
      renderTime: entry.renderTime,
      size: entry.size,
      startTime: entry.startTime,
      url: entry.url ?? "",
    }));
    observe("layout-shift", state.shifts, (entry) => ({
      hadRecentInput: entry.hadRecentInput,
      sources: (entry.sources ?? []).slice(0, 8).map((source: any) => ({
        currentRect: rectangle(source.currentRect),
        node: descriptor(source.node),
        previousRect: rectangle(source.previousRect),
      })),
      startTime: entry.startTime,
      value: entry.value,
    }));
    observe("longtask", state.longtasks, (entry) => ({ duration: entry.duration, startTime: entry.startTime }));
    (window as any).__task18fPerformance = state;
  }, resourceTimingLimit);
}

async function collectPerformance(page: Page) {
  return page.evaluate((limit) => {
    const state = (window as any).__task18fPerformance;
    for (const binding of state.observers) {
      binding.destination.push(...binding.observer.takeRecords().map(binding.map));
    }
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const allResources = performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        duration: resource.duration,
        fetchStart: resource.fetchStart,
        initiatorType: resource.initiatorType,
        name: resource.name,
        requestStart: resource.requestStart,
        responseEnd: resource.responseEnd,
        responseStart: resource.responseStart,
        startTime: resource.startTime,
      };
    });
    // The full event is queued; capacity alone cannot prove completeness before delivery.
    const upstreamLossPossible = state.resourceBufferFull || allResources.length >= limit;
    return {
      lcp: state.lcp,
      longtasks: state.longtasks,
      navigation: navigation ? {
        domComplete: navigation.domComplete,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        duration: navigation.duration,
        loadEventEnd: navigation.loadEventEnd,
        requestStart: navigation.requestStart,
        responseEnd: navigation.responseEnd,
        responseStart: navigation.responseStart,
        startTime: navigation.startTime,
      } : null,
      resourceTimings: {
        entries: allResources.slice(0, limit),
        limit,
        resourceBufferFull: state.resourceBufferFull,
        retainedCount: allResources.length,
        // Only counts retained entries excluded from JSON, never upstream dropped requests.
        serializationOverflow: Math.max(0, allResources.length - limit),
        truncated: upstreamLossPossible,
        upstreamLossPossible,
      },
      shifts: state.shifts as Shift[],
      supported: state.supported as string[],
    };
  }, resourceTimingLimit);
}

async function initializeObservedContext(shell: LabContextShell, boundary: BoundaryRecord) {
  await initializeLabContext(shell, boundary, true);
  return shell;
}

async function discoverCanonicalPdp(browser: Browser) {
  const boundary = emptyBoundaryRecord();
  let shell: LabContextShell | null = null;
  let failure: unknown = null;
  try {
    shell = await createLabContext(browser, "catalog-discovery", { viewport: { width: 1440, height: 900 } });
    await initializeLabContext(shell, boundary);
    const response = await shell.page.goto(`${baseURL}/catalog`, { waitUntil: "load" });
    if (response?.status() !== 200) throw new Error(`Catalog discovery returned ${response?.status() ?? "no response"}`);
    const hrefs = await shell.page.locator('main#main-content a[href^="/catalog/items/"]').evaluateAll((links: Element[]) => (
      links.map((link) => link.getAttribute("href")).filter(Boolean)
    ));
    approvedCanonicalPdpPaths = [...new Set(hrefs.filter((value): value is string => (
      typeof value === "string" && /^\/catalog\/items\/[a-z0-9-]+$/u.test(value)
    )))];
    boundary.approvedCanonicalPaths = [...approvedCanonicalPdpPaths];
    const href = hrefs.find((value) => /^\/catalog\/items\/[a-z0-9-]+$/u.test(value!));
    if (!href) throw new Error("Rendered catalog exposed no canonical PDP href.");
    const discoveryBoundaryErrors = boundaryErrors(boundary);
    if (discoveryBoundaryErrors.length > 0) {
      throw new Error(`Catalog discovery crossed the browser no-effects boundary: ${discoveryBoundaryErrors.join("; ")}`);
    }
    evidence.discovery = { boundary, href };
    return href;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const closure = shell ? await closeLabContext(shell, failure !== null) : { artifacts: [], errors: [] };
    const finalBoundaryErrors = boundaryErrors(boundary);
    if (failure !== null || closure.errors.length > 0) {
      evidence.discoveryFailure = { artifacts: closure.artifacts, boundary, closureErrors: closure.errors, error: serializeError(failure) };
    }
    if (failure === null && closure.errors.length > 0) throw new Error(closure.errors.join("; "));
    if (failure === null && finalBoundaryErrors.length > 0) {
      throw new Error(`Catalog discovery crossed the browser no-effects boundary during finalization: ${finalBoundaryErrors.join("; ")}`);
    }
  }
}

function boundaryErrors(boundary: BoundaryRecord) {
  for (const failure of boundary.localRequestFailures) {
    Object.assign(failure, classifyLocalNetworkFailure({
      ...failure,
      approvedCanonicalPaths: boundary.approvedCanonicalPaths,
      baseURL,
    }));
  }
  const errors: string[] = [];
  if (boundary.externalRequests.length > 0) errors.push(`external requests: ${boundary.externalRequests.length}`);
  if (boundary.mutatingRequests.length > 0) errors.push(`mutating requests: ${boundary.mutatingRequests.length}`);
  if (boundary.authRequests.length > 0) errors.push(`unexpected auth requests: ${boundary.authRequests.length}`);
  if (boundary.syntheticOrProviderRequests.length > 0) errors.push(`synthetic/provider-effect requests: ${boundary.syntheticOrProviderRequests.length}`);
  if (boundary.failedResponses.length > 0) errors.push(`failed responses: ${boundary.failedResponses.length}`);
  const hardLocalFailures = boundary.localRequestFailures.filter(({ classification }) => classification === "hard-local-transport-failure");
  if (hardLocalFailures.length > 0) errors.push(`hard local transport failures: ${hardLocalFailures.length}`);
  if (boundary.consoleErrors.length > 0) errors.push(`browser console/page errors: ${boundary.consoleErrors.length}`);
  return errors;
}

function refreshBoundaryErrors(errors: string[], boundary: BoundaryRecord) {
  const retained = errors.filter((error) => !error.startsWith("browser boundary: "));
  errors.length = 0;
  errors.push(...retained, ...boundaryErrors(boundary).map((error) => `browser boundary: ${error}`));
}

async function coldSample(browser: Browser, routeLabel: string, path: string, viewport: { width: number; height: number }, iteration: number) {
  const boundary = emptyBoundaryRecord();
  const sample: Record<string, any> = { boundary, integrityErrors: [], iteration, routeLabel, path, viewport };
  let shell: LabContextShell | null = null;
  try {
    shell = await createLabContext(browser, `cold-${routeLabel}-${viewport.width}-iteration-${iteration}`, {
      reducedMotion: "no-preference",
      viewport,
    });
    await initializeObservedContext(shell, boundary);
    const response = await shell.page.goto(`${baseURL}${path}`, { waitUntil: "load", timeout: 60_000 });
    sample.status = response?.status() ?? null;
    await shell.page.waitForTimeout(observationWindowMs);
    const raw = await collectPerformance(shell.page);
    sample.lcpEntries = raw.lcp;
    sample.lcp = raw.lcp.at(-1) ?? null;
    sample.layoutShifts = raw.shifts;
    sample.cls = calculateCls(raw.shifts);
    sample.longtasks = raw.longtasks;
    sample.navigation = raw.navigation;
    sample.resourceTimings = raw.resourceTimings;
    sample.breakdown = calculateLcpBreakdown({
      lcp: sample.lcp,
      navigation: raw.navigation,
      resources: raw.resourceTimings.entries,
      resourcesTruncated: raw.resourceTimings.truncated,
    });
    refreshBoundaryErrors(sample.integrityErrors, boundary);
    if (sample.status !== 200) sample.integrityErrors.push(`document status ${sample.status}`);
    if (!raw.supported.includes("largest-contentful-paint") || !sample.lcp) sample.integrityErrors.push("missing LCP observer/result");
    if (!raw.supported.includes("layout-shift")) sample.integrityErrors.push("missing layout-shift observer");
    if (!raw.supported.includes("longtask")) sample.integrityErrors.push("missing longtask observer");
    if (raw.shifts.some((shift) => shift.hadRecentInput)) sample.integrityErrors.push("unexpected hadRecentInput layout shift in no-input sample");
    if (!(sample.cls.maximumSessionWindow < 0.1)) sample.integrityErrors.push(`CLS max session window ${sample.cls.maximumSessionWindow} is not strictly below 0.1`);
    const lcpSource = sample.lcp?.url
      ? new URL(sample.lcp.url).searchParams.get("url") ?? new URL(sample.lcp.url).pathname
      : null;
    if (lcpSource && /^\/catalog\/(?:visual-masters\/front|individual\/[^/]+\/front-v1)\.webp$/u.test(lcpSource)) {
      evidence.knownLcpHints.push({ iteration, routeLabel, url: sample.lcp.url, viewport });
    }
    for (const warning of boundary.consoleWarnings) {
      evidence.diagnosticWarnings.push({ iteration, routeLabel, viewport, warning });
      if (/colou?r|oklch|\blab\(/iu.test(warning)) {
        evidence.colourWarnings.push({ iteration, routeLabel, viewport, warning });
      }
    }
  } catch (error) {
    sample.caseError = serializeError(error);
    sample.integrityErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBoundaryErrors(sample.integrityErrors, boundary);
    if (shell?.cdp) {
      try {
        await shell.cdp.detach();
      } catch (error) {
        sample.integrityErrors.push(`CDP detach failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (shell) {
      const closure = await closeLabContext(shell, sample.integrityErrors.length > 0);
      sample.failureArtifacts = closure.artifacts;
      sample.integrityErrors.push(...closure.errors);
    }
    refreshBoundaryErrors(sample.integrityErrors, boundary);
    evidence.samples.push(sample);
  }
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
}

async function frameObservation(browser: Browser, viewport: { width: number; height: number }) {
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, integrityErrors: [], viewport, windowMs: frameWindowMs };
  let shell: LabContextShell | null = null;
  try {
    shell = await createLabContext(browser, `frames-${viewport.width}`, {
      reducedMotion: "no-preference",
      viewport,
    });
    await initializeObservedContext(shell, boundary);
    const response = await shell.page.goto(`${baseURL}/`, { waitUntil: "load" });
    if (response?.status() !== 200) result.integrityErrors.push(`document status ${response?.status() ?? "missing"}`);
    result.initialStability = await waitForGeometryStable(shell.page, { allowKnownHeaderLogo: true });
    const animationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = animationPolicy.known;
    result.integrityErrors.push(...animationPolicy.errors);
    if (!result.initialStability.settled) throw new Error("frame-observation homepage geometry did not settle within 5 seconds");
    if (animationPolicy.errors.length > 0) throw new Error("unexpected continuing animation before frame observation");
    const observation = await shell.page.evaluate(async (windowMs) => {
      const intervals: number[] = [];
      const visibility: string[] = [document.visibilityState];
      let previous: number | null = null;
      const started = performance.now();
      const exactEnd = started + windowMs;
      const captureEndedAt = await new Promise<number>((resolvePromise) => {
        const capture = (now: number) => {
          if (now >= exactEnd) {
            resolvePromise(now);
            return;
          }
          if (previous !== null) intervals.push(now - previous);
          previous = now;
          visibility.push(document.visibilityState);
          requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      });
      const activeAnimations = document.getAnimations().filter((animation) => animation.playState === "running").map((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        const selector = target instanceof Element ? `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 3).join(".")}` : "unknown";
        return {
          animationName: animation instanceof CSSAnimation
            ? animation.animationName
            : target instanceof Element ? getComputedStyle(target).animationName : "unknown",
          targetSelector: selector,
        };
      }).slice(0, 20);
      visibility.push(document.visibilityState);
      return { activeAnimations, captureEndedAt, endTime: exactEnd, intervals, startTime: started, visibility };
    }, frameWindowMs);
    const raw = await collectPerformance(shell.page);
    const longtaskWindow = selectWindowLongtasks(raw.longtasks, {
      endTime: observation.endTime,
      startTime: observation.startTime,
    });
    result.actualWindowMs = observation.endTime - observation.startTime;
    result.captureOverrunMs = observation.captureEndedAt - observation.endTime;
    result.endTime = observation.endTime;
    result.intervalCount = observation.intervals.length;
    result.intervals = observation.intervals;
    result.p50 = percentile(observation.intervals, 0.5);
    result.p95 = percentile(observation.intervals, 0.95);
    result.p99 = percentile(observation.intervals, 0.99);
    result.max = observation.intervals.length > 0 ? Math.max(...observation.intervals) : null;
    result.above20ms = observation.intervals.filter((value) => value > 20).length;
    result.above33_4ms = observation.intervals.filter((value) => value > 33.4).length;
    result.above50ms = observation.intervals.filter((value) => value > 50).length;
    result.longtasks = longtaskWindow.windowLongtasks;
    result.wholeContextLongtasks = longtaskWindow.wholeContextLongtasks;
    result.startTime = observation.startTime;
    result.visibility = [...new Set(observation.visibility)];
    result.activeAnimations = observation.activeAnimations;
    if (result.actualWindowMs < frameWindowMs) result.integrityErrors.push(`frame observation was shorter than ${frameWindowMs}ms: ${result.actualWindowMs}`);
    refreshBoundaryErrors(result.integrityErrors, boundary);
    if (result.visibility.length !== 1 || result.visibility[0] !== "visible") result.integrityErrors.push(`visibility changed: ${result.visibility.join(",")}`);
  } catch (error) {
    result.caseError = serializeError(error);
    result.integrityErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBoundaryErrors(result.integrityErrors, boundary);
    if (shell?.cdp) {
      try {
        await shell.cdp.detach();
      } catch (error) {
        result.integrityErrors.push(`CDP detach failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (shell) {
      const closure = await closeLabContext(shell, result.integrityErrors.length > 0);
      result.failureArtifacts = closure.artifacts;
      result.integrityErrors.push(...closure.errors);
    }
    refreshBoundaryErrors(result.integrityErrors, boundary);
    evidence.frames.push(result);
  }
}

async function waitForGeometryStable(page: Page, options = { allowKnownHeaderLogo: true }) {
  return page.evaluate(async ({ allowKnownHeaderLogo }) => {
    await document.fonts.ready;
    let prior: number[] | undefined;
    let stable = 0;
    const deadline = performance.now() + 5_000;
    const describeTarget = (target: Element) => {
      if (target.matches("svg.header-brand-motion__field")) return "svg.header-brand-motion__field";
      const classes = [...target.classList].slice(0, 3).join(".");
      return `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
    };
    let lastContinuing: Array<{ animationName: string; targetSelector: string }> = [];
    while (performance.now() < deadline) {
      await new Promise<void>((resolvePromise) => requestAnimationFrame(() => resolvePromise()));
      const targets = [
        document.querySelector("main#main-content"),
        document.querySelector("footer"),
        document.querySelector('button[aria-label="Search PropeptIQ"]'),
        document.querySelector('[role="status"][aria-label="Purchase summary"]'),
        document.querySelector('[role="region"][aria-label="Mobile purchase controls"]'),
      ].filter((target): target is Element => target instanceof Element);
      const geometry = [
        window.scrollY,
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
        ...targets.flatMap((target) => {
          const bounds = target.getBoundingClientRect();
          return [bounds.top, bounds.bottom, bounds.left, bounds.right];
        }),
      ];
      lastContinuing = document.getAnimations().flatMap((animation) => {
        if (animation.playState !== "running") return [];
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        if (!(target instanceof Element)) return [];
        const bounds = target.getBoundingClientRect();
        if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return [];
        const cssAnimation = animation as CSSAnimation;
        return [{
          animationName: cssAnimation.animationName || getComputedStyle(target).animationName,
          targetSelector: describeTarget(target),
        }];
      });
      const blocking = lastContinuing.filter(({ animationName, targetSelector }) => !(
        allowKnownHeaderLogo &&
        animationName === "header-brand-molecular-drift" &&
        targetSelector === "svg.header-brand-motion__field"
      ));
      if (
        blocking.length === 0 && prior &&
        geometry.length === prior.length &&
        geometry.every((value, index) => Math.abs(value - prior![index]!) < 0.01)
      ) stable += 1;
      else stable = 0;
      if (stable >= 6) return { continuingAnimations: lastContinuing, settled: true };
      prior = geometry;
    }
    return { continuingAnimations: lastContinuing, settled: false };
  }, options);
}

async function prepareRenderedImages(page: Page) {
  const images = page.locator("main img");
  const errors: string[] = [];
  const records: Array<Record<string, any>> = [];
  const visited: string[] = [];
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    const before = await image.evaluate((element) => {
      const imageElement = element as HTMLImageElement;
      const bounds = imageElement.getBoundingClientRect();
      const describe = (node: Element) => {
        const classes = [...node.classList].slice(0, 3).join(".");
        return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
      };
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).display === "none") {
          return {
            alt: imageElement.alt,
            complete: imageElement.complete,
            layoutExclusion: {
              reason: node === element ? "own-display-none" : "ancestor-display-none",
              selector: describe(node),
            },
            naturalHeight: imageElement.naturalHeight,
            naturalWidth: imageElement.naturalWidth,
            rect: { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width },
            src: imageElement.currentSrc || imageElement.src,
          };
        }
        node = node.parentElement;
      }
      return {
        alt: imageElement.alt,
        complete: imageElement.complete,
        layoutExclusion: null,
        naturalHeight: imageElement.naturalHeight,
        naturalWidth: imageElement.naturalWidth,
        rect: { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width },
        src: imageElement.currentSrc || imageElement.src,
      };
    });
    const record: Record<string, any> = { alt: before.alt, after: null, before, src: before.src };
    records.push(record);
    if (before.layoutExclusion) {
      record.after = before;
      continue;
    }
    try {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => {
        const imageElement = element as HTMLImageElement;
        return imageElement.complete && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0;
      }
      ), { message: `load rendered image ${before.alt}` }).toBe(true);
      await image.evaluate(async (element) => { await (element as HTMLImageElement).decode(); });
      visited.push(before.alt);
    } catch (error) {
      errors.push(`rendered image readiness failed: ${before.alt}: ${error instanceof Error ? error.message : String(error)}`);
    }
    record.after = await image.evaluate((element) => {
      const imageElement = element as HTMLImageElement;
      const bounds = imageElement.getBoundingClientRect();
      const describe = (node: Element) => {
        const classes = [...node.classList].slice(0, 3).join(".");
        return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
      };
      let layoutExclusion = null;
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).display === "none") {
          layoutExclusion = {
            reason: node === element ? "own-display-none" : "ancestor-display-none",
            selector: describe(node),
          };
          break;
        }
        node = node.parentElement;
      }
      return {
        complete: imageElement.complete,
        layoutExclusion,
        naturalHeight: imageElement.naturalHeight,
        naturalWidth: imageElement.naturalWidth,
        rect: { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width },
        src: imageElement.currentSrc || imageElement.src,
      };
    });
  }
  return { errors, images: records, visited };
}

async function inspectGeometry(page: Page, width: number, requireFooterControlsInViewport = true) {
  return page.evaluate(({ requireFooterControlsInViewport, viewportWidth }) => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
    };
    const visible = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const describe = (node: Element) => {
      const classes = [...node.classList].slice(0, 3).join(".");
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
    };
    const layoutExclusion = (element: Element) => {
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).display === "none") {
          return {
            reason: node === element ? "own-display-none" : "ancestor-display-none",
            selector: describe(node),
          };
        }
        node = node.parentElement;
      }
      return null;
    };
    const fixedAncestor = (element: Element) => {
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).position === "fixed") return describe(node);
        node = node.parentElement;
      }
      return null;
    };
    const clippingRecord = (element: Element, label: string, requiredInViewport: boolean) => {
      const bounds = element.getBoundingClientRect();
      const viewportRelevant = bounds.right > 0 && bounds.left < innerWidth && bounds.bottom > 0 && bounds.top < innerHeight;
      const ancestorClips: Array<{ axis: "x" | "xy" | "y"; intentionalScroll: boolean; selector: string }> = [];
      if (requiredInViewport || viewportRelevant) {
        let ancestor = element.parentElement;
        while (ancestor) {
          const ancestorBounds = ancestor.getBoundingClientRect();
          const style = getComputedStyle(ancestor);
          const clipsX = ["auto", "clip", "hidden", "scroll"].includes(style.overflowX) &&
            (bounds.left < ancestorBounds.left - 1 || bounds.right > ancestorBounds.right + 1);
          const clipsY = ["auto", "clip", "hidden", "scroll"].includes(style.overflowY) &&
            (bounds.top < ancestorBounds.top - 1 || bounds.bottom > ancestorBounds.bottom + 1);
          if (clipsX || clipsY) {
            ancestorClips.push({
              axis: clipsX && clipsY ? "xy" : clipsX ? "x" : "y",
              intentionalScroll: clipsX && !clipsY && ancestor.matches('ul[role="list"][aria-label^="Related products,"]'),
              selector: describe(ancestor),
            });
          }
          ancestor = ancestor.parentElement;
        }
      }
      return {
        ancestorClips: [...new Set(ancestorClips)].slice(0, 8),
        label,
        rect: rect(element),
        requiredInViewport,
        viewportClipped: requiredInViewport && (
          bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.top < -1 || bounds.bottom > innerHeight + 1
        ),
        viewportRelevant,
      };
    };
    const touchTargetElements = [...document.querySelectorAll<HTMLElement>(
      'header a, header button, button[aria-label="Search PropeptIQ"], [aria-label="Purchase summary"] button, [aria-label="Purchase summary"] input',
    )].filter(visible);
    const touchTargets = touchTargetElements.map((element) => ({
      label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
      rect: rect(element),
    }));
    const images = [...document.querySelectorAll<HTMLImageElement>("main img")].map((image) => ({
      alt: image.alt,
      complete: image.complete,
      layoutExclusion: layoutExclusion(image),
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth,
      rect: rect(image),
      src: image.currentSrc || image.src,
    }));
    const footer = document.querySelector("footer");
    const footerControlElements = footer ? [...footer.querySelectorAll<HTMLElement>("a, button, input, summary")].filter(visible) : [];
    const footerBottomRow = footer?.querySelector<HTMLElement>(".footer-bottom-row") ?? null;
    const footerCopyright = footerBottomRow ? [...footerBottomRow.querySelectorAll<HTMLElement>("p")].at(-1) ?? null : null;
    const footerControls = footerBottomRow && visible(footerBottomRow) ? [{
      label: "Footer notice row",
      rect: rect(footerBottomRow),
    }] : [];
    const searchControlElements = [...document.querySelectorAll<HTMLElement>('button[aria-label="Search PropeptIQ"]')].filter(visible);
    const searchControls = searchControlElements.map((element) => ({
      fixedAncestor: fixedAncestor(element),
      label: element.getAttribute("aria-label") ?? "Search PropeptIQ",
      rect: rect(element),
    }));
    const purchaseControlElements = [...document.querySelectorAll<HTMLElement>('[role="region"][aria-label="Mobile purchase controls"]')].filter(visible);
    const purchaseControls = purchaseControlElements.map((element) => ({
      fixedAncestor: fixedAncestor(element),
      label: element.getAttribute("aria-label") ?? "Mobile purchase controls",
      rect: rect(element),
    }));
    const clippingRecords = [
      ...footerControlElements.map((element) => clippingRecord(element, element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? "footer control", false)),
      ...(footerBottomRow ? [clippingRecord(footerBottomRow, "Footer notice row", false)] : []),
      ...(footerCopyright ? [clippingRecord(footerCopyright, "Footer copyright", requireFooterControlsInViewport)] : []),
      ...searchControlElements.map((element) => clippingRecord(element, element.getAttribute("aria-label") ?? "Search PropeptIQ", true)),
      ...purchaseControlElements.map((element) => clippingRecord(element, element.getAttribute("aria-label") ?? "Mobile purchase controls", true)),
      ...touchTargetElements.map((element) => {
        const bounds = element.getBoundingClientRect();
        const intersectsViewport = bounds.right > 0 && bounds.left < innerWidth && bounds.bottom > 0 && bounds.top < innerHeight;
        return clippingRecord(element, element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName, intersectsViewport);
      }),
      ...[...document.querySelectorAll<HTMLElement>("main#main-content h1, main#main-content h2, main#main-content img")]
        .filter(visible)
        .slice(0, 40)
        .map((element) => clippingRecord(element, element.getAttribute("alt") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName, false)),
    ];
    const search = rect(document.querySelector('button[aria-label="Search PropeptIQ"]'));
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippingRecords,
      footer: rect(footer),
      footerControls,
      images,
      main: rect(document.querySelector("main#main-content")),
      meaningfulHeadingCount: document.querySelectorAll("main#main-content h1, main#main-content h2").length,
      purchaseControls,
      search,
      searchControls,
      searchCenterDelta: search ? Math.abs(search.left + search.width / 2 - viewportWidth / 2) : null,
      touchTargets,
    };
  }, { requireFooterControlsInViewport, viewportWidth: width });
}

function geometryErrors(snapshot: any) {
  const errors: string[] = [];
  if (!snapshot.main || snapshot.main.height <= 0) errors.push("main is missing or empty");
  if (!snapshot.footer || snapshot.footer.height <= 0) errors.push("footer is missing or empty");
  if (snapshot.meaningfulHeadingCount < 1) errors.push("meaningful heading missing");
  if (snapshot.documentOverflow > 1) errors.push(`document overflow ${snapshot.documentOverflow}px`);
  if (!snapshot.search || snapshot.searchCenterDelta > 1) errors.push(`search center delta ${snapshot.searchCenterDelta}`);
  for (const target of snapshot.touchTargets) {
    if (!target.rect || target.rect.width < 44 || target.rect.height < 44) errors.push(`touch target below 44px: ${target.label} ${JSON.stringify(target.rect)}`);
  }
  errors.push(...evaluateClippingPolicy(snapshot.clippingRecords).errors);
  return errors;
}

async function positionPurchaseSummaryPastViewport(page: Page) {
  const summary = page.getByRole("status", { name: "Purchase summary" });
  if (await summary.count() !== 1) throw new Error("PDP purchase summary is missing.");
  await waitForGeometryStable(page);
  await summary.evaluate((element, targetBottom) => {
    window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().bottom - targetBottom, behavior: "instant" });
  }, -12);
  await expect.poll(() => summary.evaluate((element) => Math.abs(element.getBoundingClientRect().bottom + 12)), {
    message: "exact purchase summary boundary",
  }).toBeLessThanOrEqual(1);
  const stability = await waitForGeometryStable(page);
  if (!stability.settled) throw new Error(`purchase boundary did not settle: ${JSON.stringify(stability.continuingAnimations)}`);
}

async function waitForFooterReadiness(page: Page, expectReservedPurchase: boolean) {
  let reservation = null;
  if (expectReservedPurchase) {
    await expect.poll(() => page.evaluate(() => {
      const layout = document.querySelector<HTMLElement>(".public-layout");
      const footer = document.querySelector<HTMLElement>(".public-layout > footer");
      const purchase = document.querySelector<HTMLElement>('[role="region"][aria-label="Mobile purchase controls"]');
      const search = document.querySelector<HTMLElement>('button[aria-label="Search PropeptIQ"]');
      if (!layout || !footer || !purchase || !search) return null;
      const purchaseBounds = purchase.getBoundingClientRect();
      const searchBounds = search.getBoundingClientRect();
      const reservedHeight = Number.parseFloat(layout.style.getPropertyValue("--public-action-dock-reserved-height"));
      const footerPadding = Number.parseFloat(getComputedStyle(footer).paddingBottom);
      const occupiedHeight = Math.ceil(purchaseBounds.height + 8 + searchBounds.height + innerHeight - searchBounds.bottom);
      return {
        footerPaddingCommitted: footerPadding >= reservedHeight + 16,
        occupiedHeight,
        reservationCommitted: reservedHeight >= occupiedHeight,
        reservedHeight,
      };
    }), { message: "mobile purchase reservation and footer padding" }).toMatchObject({
      footerPaddingCommitted: true,
      reservationCommitted: true,
    });
    reservation = await page.evaluate(() => {
      const layout = document.querySelector<HTMLElement>(".public-layout")!;
      const footer = document.querySelector<HTMLElement>(".public-layout > footer")!;
      return {
        footerPadding: Number.parseFloat(getComputedStyle(footer).paddingBottom),
        reservedHeight: Number.parseFloat(layout.style.getPropertyValue("--public-action-dock-reserved-height")),
      };
    });
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => Math.abs(
    document.documentElement.scrollHeight - innerHeight - window.scrollY,
  )), { message: "actual document bottom" }).toBeLessThanOrEqual(1);
  const stability = await waitForGeometryStable(page);
  if (!stability.settled) throw new Error(`footer geometry did not settle: ${JSON.stringify(stability.continuingAnimations)}`);
  await expect.poll(() => page.evaluate(() => Math.abs(
    document.querySelector("footer")!.getBoundingClientRect().bottom - innerHeight,
  )), { message: "footer alignment at document bottom" }).toBeLessThanOrEqual(1);
  return { reservation, stability };
}

function expectedHiddenImages(routeLabel: string, width: number) {
  return routeLabel === "home" && width < 640
    ? [
      "Front AI-generated catalog illustration for Retatrutide",
      "Front AI-generated catalog illustration for NAD+",
    ]
    : [];
}

async function geometryCase(browser: Browser, path: string, routeLabel: string, viewport: { width: number; height: number }) {
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], path, routeLabel, viewport };
  let shell: LabContextShell | null = null;
  try {
    shell = await createLabContext(browser, `geometry-${routeLabel}-${viewport.width}`, { reducedMotion: "no-preference", viewport });
    await initializeLabContext(shell, boundary);
    const page = shell.page;
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    result.initialStability = await waitForGeometryStable(page);
    const initialAnimationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = initialAnimationPolicy.known;
    result.errors.push(...initialAnimationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("relevant initial geometry did not settle within 5 seconds");
    result.initialClipping = await inspectGeometry(page, viewport.width, false);
    result.errors.push(...evaluateClippingPolicy(result.initialClipping.clippingRecords).errors);
    result.imageReadiness = await prepareRenderedImages(page);
    result.errors.push(...result.imageReadiness.errors);
    let expectedDockVisible = false;
    if (routeLabel === "pdp") {
      await positionPurchaseSummaryPastViewport(page);
      const dock = page.getByRole("region", { name: "Mobile purchase controls", includeHidden: true });
      result.mobileDock = {
        count: await dock.count(),
        visible: await dock.count() > 0 ? await dock.isVisible() : false,
      };
      expectedDockVisible = viewport.width === 320 || viewport.width === 375;
      await expect.poll(async () => await dock.count() > 0 && await dock.isVisible(), {
        message: "actual mobile dock visibility",
      }).toBe(expectedDockVisible);
      result.mobileDock = {
        count: await dock.count(),
        visible: await dock.count() > 0 ? await dock.isVisible() : false,
      };
      if (result.mobileDock.visible !== expectedDockVisible) result.errors.push(`mobile dock visibility ${result.mobileDock.visible}, expected ${expectedDockVisible}`);
    }
    result.footerReadiness = await waitForFooterReadiness(page, expectedDockVisible);
    result.snapshot = await inspectGeometry(page, viewport.width);
    result.imagePolicy = evaluateImagePolicy(result.imageReadiness.images, {
      expectedHiddenAltTexts: expectedHiddenImages(routeLabel, viewport.width),
      requireVisible: routeLabel !== "empty-cart",
    });
    for (const hiddenImage of result.imagePolicy.hidden) {
      if (hiddenImage.before.layoutExclusion.reason !== "ancestor-display-none") {
        result.errors.push(`expected narrow-home exclusion is not ancestor display:none: ${hiddenImage.alt}`);
      }
    }
    result.controlPolicy = evaluateControlPolicy({
      expectedPurchaseCount: expectedDockVisible ? 1 : 0,
      footerControls: result.snapshot.footerControls,
      purchaseControls: result.snapshot.purchaseControls,
      searchControls: result.snapshot.searchControls,
    });
    result.errors.push(
      ...geometryErrors(result.snapshot),
      ...result.imagePolicy.errors,
      ...result.controlPolicy.errors,
    );
    refreshBoundaryErrors(result.errors, boundary);
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
  } catch (error) {
    result.caseError = serializeError(error);
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBoundaryErrors(result.errors, boundary);
    if (shell) {
      const closure = await closeLabContext(shell, result.errors.length > 0);
      result.failureArtifacts = closure.artifacts;
      result.errors.push(...closure.errors);
    }
    refreshBoundaryErrors(result.errors, boundary);
    evidence.geometry.push(result);
  }
}

function delayHost(milliseconds: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function readNoJavaScriptStabilitySnapshot(page: Page) {
  return page.evaluate(() => {
    const describeTarget = (target: Element) => {
      if (target.matches("svg.header-brand-motion__field")) return "svg.header-brand-motion__field";
      const classes = [...target.classList].slice(0, 3).join(".");
      return `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
    };
    const targets = [
      document.querySelector("main#main-content"),
      document.querySelector("footer"),
      document.querySelector('button[aria-label="Search PropeptIQ"]'),
      document.querySelector('[role="status"][aria-label="Purchase summary"]'),
    ].filter((target): target is Element => target instanceof Element);
    const geometry = [
      window.scrollY,
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
      ...targets.flatMap((target) => {
        const bounds = target.getBoundingClientRect();
        return [bounds.top, bounds.bottom, bounds.left, bounds.right];
      }),
    ];
    const continuingAnimations = document.getAnimations().flatMap((animation) => {
      if (animation.playState !== "running") return [];
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      if (!(target instanceof Element)) return [];
      const bounds = target.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return [];
      const cssAnimation = animation as CSSAnimation;
      return [{
        animationName: cssAnimation.animationName || getComputedStyle(target).animationName,
        targetSelector: describeTarget(target),
      }];
    });
    return { continuingAnimations, fontStatus: document.fonts.status, geometry };
  });
}

async function waitForNoJavaScriptGeometryStable(page: Page) {
  const deadline = Date.now() + 5_000;
  let prior: number[] | undefined;
  let stable = 0;
  let last = await readNoJavaScriptStabilitySnapshot(page);
  while (Date.now() < deadline) {
    const animationPolicy = classifyContinuingAnimations(last.continuingAnimations);
    if (
      last.fontStatus === "loaded" && animationPolicy.errors.length === 0 && prior &&
      last.geometry.length === prior.length &&
      last.geometry.every((value: number, index: number) => Math.abs(value - prior![index]!) < 0.01)
    ) stable += 1;
    else stable = 0;
    if (stable >= 6) return { continuingAnimations: last.continuingAnimations, fontStatus: last.fontStatus, settled: true };
    prior = last.geometry;
    await delayHost(50);
    last = await readNoJavaScriptStabilitySnapshot(page);
  }
  return { continuingAnimations: last.continuingAnimations, fontStatus: last.fontStatus, settled: false };
}

async function readNoJavaScriptImage(image: ReturnType<Page["locator"]>) {
  return image.evaluate((element) => {
    const imageElement = element as HTMLImageElement;
    const bounds = imageElement.getBoundingClientRect();
    const describe = (node: Element) => {
      const classes = [...node.classList].slice(0, 3).join(".");
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
    };
    let layoutExclusion = null;
    let node: Element | null = element;
    while (node) {
      if (getComputedStyle(node).display === "none") {
        layoutExclusion = {
          reason: node === element ? "own-display-none" : "ancestor-display-none",
          selector: describe(node),
        };
        break;
      }
      node = node.parentElement;
    }
    return {
      alt: imageElement.alt,
      complete: imageElement.complete,
      layoutExclusion,
      naturalHeight: imageElement.naturalHeight,
      naturalWidth: imageElement.naturalWidth,
      rect: { bottom: bounds.bottom, height: bounds.height, left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width },
      src: imageElement.currentSrc || imageElement.src,
    };
  });
}

async function prepareNoJavaScriptImages(page: Page) {
  const images = page.locator("main img");
  const errors: string[] = [];
  const records: Array<Record<string, any>> = [];
  const visited: string[] = [];
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    const before = await readNoJavaScriptImage(image);
    const record: Record<string, any> = { alt: before.alt, after: null, before, src: before.src };
    records.push(record);
    if (before.layoutExclusion) {
      record.after = before;
      continue;
    }
    await image.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    const deadline = Date.now() + 15_000;
    let after = await readNoJavaScriptImage(image);
    while (Date.now() < deadline && !(after.complete && after.naturalWidth > 0 && after.naturalHeight > 0)) {
      await delayHost(50);
      after = await readNoJavaScriptImage(image);
    }
    if (!(after.complete && after.naturalWidth > 0 && after.naturalHeight > 0)) {
      errors.push(`rendered no-JavaScript image readiness failed: ${before.alt}`);
    } else {
      visited.push(before.alt);
    }
    record.after = after;
  }
  return { errors, images: records, visited };
}

async function waitForNoJavaScriptFooter(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  const deadline = Date.now() + 5_000;
  let prior: number[] | undefined;
  let stable = 0;
  let last = await page.evaluate(() => {
    const footerBottom = document.querySelector("footer")?.getBoundingClientRect().bottom ?? Number.NaN;
    return {
      atEnd: document.documentElement.scrollHeight - innerHeight - window.scrollY,
      footerBottomDelta: footerBottom - innerHeight,
      fontStatus: document.fonts.status,
      geometry: [window.scrollY, document.documentElement.scrollHeight, footerBottom],
    };
  });
  while (Date.now() < deadline) {
    if (
      last.fontStatus === "loaded" && Math.abs(last.atEnd) <= 1 && Math.abs(last.footerBottomDelta) <= 1 && prior &&
      last.geometry.every((value: number, index: number) => Math.abs(value - prior![index]!) < 0.01)
    ) stable += 1;
    else stable = 0;
    if (stable >= 6) return { ...last, settled: true };
    prior = last.geometry;
    await delayHost(50);
    last = await page.evaluate(() => {
      const footerBottom = document.querySelector("footer")?.getBoundingClientRect().bottom ?? Number.NaN;
      return {
        atEnd: document.documentElement.scrollHeight - innerHeight - window.scrollY,
        footerBottomDelta: footerBottom - innerHeight,
        fontStatus: document.fonts.status,
        geometry: [window.scrollY, document.documentElement.scrollHeight, footerBottom],
      };
    });
  }
  return { ...last, settled: false };
}

async function noJavaScriptCase(browser: Browser, path: string, routeLabel: string, viewport: { width: number; height: number }) {
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], lifecycle: "attempted", path, routeLabel, viewport };
  let shell: LabContextShell | null = null;
  try {
    shell = await createLabContext(browser, `no-js-${routeLabel}-${viewport.width}`, {
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
      viewport,
    });
    await initializeLabContext(shell, boundary);
    const page = shell.page;
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    const details = page.getByRole("contentinfo").locator("details");
    result.nativeDisclosureCount = await details.count();
    if (result.nativeDisclosureCount < 1) result.errors.push("native footer disclosures missing");
    if (result.nativeDisclosureCount > 0) {
      const first = details.first();
      const initiallyOpen = await first.getAttribute("open") !== null;
      await first.locator("summary").click();
      const afterClickOpen = await first.getAttribute("open") !== null;
      result.nativeDisclosureToggled = initiallyOpen !== afterClickOpen;
      if (!result.nativeDisclosureToggled) result.errors.push("native footer disclosure did not toggle");
    }
    result.mobileDockCount = await page.getByRole("region", { name: "Mobile purchase controls", includeHidden: true }).count();
    if (result.mobileDockCount !== 0) result.errors.push("client-only mobile dock rendered without JavaScript");
    result.searchRenderedOnly = await page.getByRole("button", { name: "Search PropeptIQ" }).count() === 1;
    if (!result.searchRenderedOnly) result.errors.push("search launcher missing without JavaScript");
    result.initialStability = await waitForNoJavaScriptGeometryStable(page);
    const animationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = animationPolicy.known;
    result.errors.push(...animationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("no-JavaScript relevant geometry did not settle within 5 seconds");
    result.initialClipping = await inspectGeometry(page, viewport.width, false);
    result.errors.push(...evaluateClippingPolicy(result.initialClipping.clippingRecords).errors);
    result.imageReadiness = await prepareNoJavaScriptImages(page);
    result.errors.push(...result.imageReadiness.errors);
    result.essentials = await page.evaluate((label) => {
      const main = document.querySelector<HTMLElement>("main#main-content");
      const heading = main?.querySelector<HTMLElement>("h1");
      const purchaseSummary = document.querySelector<HTMLElement>('[role="status"][aria-label="Purchase summary"]');
      const positive = (element: HTMLElement | null | undefined) => {
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      };
      return {
        headingCount: main?.querySelectorAll("h1").length ?? 0,
        headingText: heading?.textContent?.replace(/\s+/gu, " ").trim().slice(0, 120) ?? "",
        homeHeroPresent: label === "home" ? positive(document.querySelector<HTMLElement>("#home-hero-heading")) : null,
        mainPresent: positive(main),
        purchaseSummaryPresent: label === "pdp" ? positive(purchaseSummary) : null,
      };
    }, routeLabel);
    if (!result.essentials.mainPresent) result.errors.push("server-rendered main content is missing without JavaScript");
    if (result.essentials.headingCount !== 1 || result.essentials.headingText.length === 0) result.errors.push("server-rendered primary heading is missing without JavaScript");
    if (routeLabel === "home" && !result.essentials.homeHeroPresent) result.errors.push("server-rendered home hero is missing without JavaScript");
    if (routeLabel === "pdp" && !result.essentials.purchaseSummaryPresent) result.errors.push("server-rendered PDP purchase summary is missing without JavaScript");
    result.footerReadiness = await waitForNoJavaScriptFooter(page);
    if (!result.footerReadiness.settled) {
      result.errors.push(`no-JavaScript footer did not settle at document end: ${JSON.stringify(result.footerReadiness)}`);
    }
    result.snapshot = await inspectGeometry(page, viewport.width);
    result.imagePolicy = evaluateImagePolicy(result.imageReadiness.images, {
      expectedHiddenAltTexts: expectedHiddenImages(routeLabel, viewport.width),
      requireVisible: true,
    });
    for (const hiddenImage of result.imagePolicy.hidden) {
      if (hiddenImage.before.layoutExclusion.reason !== "ancestor-display-none") {
        result.errors.push(`expected narrow-home exclusion is not ancestor display:none: ${hiddenImage.alt}`);
      }
    }
    result.controlPolicy = evaluateControlPolicy({
      expectedPurchaseCount: 0,
      footerControls: result.snapshot.footerControls,
      purchaseControls: result.snapshot.purchaseControls,
      searchControls: result.snapshot.searchControls,
    });
    result.errors.push(
      ...geometryErrors(result.snapshot),
      ...result.imagePolicy.errors,
      ...result.controlPolicy.errors,
    );
    refreshBoundaryErrors(result.errors, boundary);
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
    result.lifecycle = result.errors.length > 0 ? "failed" : "completed";
  } catch (error) {
    result.lifecycle = "interrupted";
    result.caseError = serializeError(error);
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBoundaryErrors(result.errors, boundary);
    if (shell) {
      const closure = await closeLabContext(shell, result.errors.length > 0);
      result.failureArtifacts = closure.artifacts;
      result.errors.push(...closure.errors);
    }
    refreshBoundaryErrors(result.errors, boundary);
    if (result.lifecycle === "completed" && result.errors.length > 0) result.lifecycle = "failed";
    evidence.noJavaScriptGeometry.push(result);
  }
}

async function reducedMotionCase(browser: Browser, path: string, routeLabel: string, viewport: { width: number; height: number }) {
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], path, routeLabel, viewport };
  let shell: LabContextShell | null = null;
  try {
    shell = await createLabContext(browser, `reduced-${routeLabel}-${viewport.width}`, { reducedMotion: "reduce", viewport });
    await initializeLabContext(shell, boundary);
    const page = shell.page;
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    result.initialStability = await waitForGeometryStable(page, { allowKnownHeaderLogo: false });
    const animationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations, { allowKnownHeaderLogo: false });
    result.knownContinuingAnimations = animationPolicy.known;
    result.errors.push(...animationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("reduced-motion relevant geometry did not settle within 5 seconds");
    result.styles = await page.evaluate(() => ({
      decorative: [...document.querySelectorAll<HTMLElement>('[data-motion-surface], [data-motion-step], [data-science-field] .science-field__signal, svg.header-brand-motion__field')].slice(0, 30).map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          rotate: style.rotate,
          scale: style.scale,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
          translate: style.translate,
        };
      }),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    }));
    if (result.styles.decorative.length < 1) result.errors.push("no decorative motion targets found");
    for (const style of result.styles.decorative) {
      if (!/^0(?:s|ms)(?:, 0(?:s|ms))*$/u.test(style.animationDuration)) result.errors.push(`active decorative animation duration ${style.animationDuration}`);
      if (!/^0(?:s|ms)(?:, 0(?:s|ms))*$/u.test(style.transitionDuration)) result.errors.push(`active decorative transition duration ${style.transitionDuration}`);
      if (!["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(style.transform)) result.errors.push(`decorative transform ${style.transform}`);
      if (!["none", "0px"].includes(style.translate)) result.errors.push(`decorative translate ${style.translate}`);
      if (!["none", "0deg"].includes(style.rotate)) result.errors.push(`decorative rotate ${style.rotate}`);
      if (style.scale !== "none") result.errors.push(`decorative scale ${style.scale}`);
    }
    if (result.styles.scrollBehavior === "smooth") result.errors.push("smooth scroll remains enabled under reduced motion");
    const search = await inspectGeometry(page, viewport.width, false);
    result.search = search.search;
    result.searchCenterDelta = search.searchCenterDelta;
    if (!search.search || search.searchCenterDelta === null || search.searchCenterDelta > 1) result.errors.push(`fixed search centering changed: ${search.searchCenterDelta}`);
    refreshBoundaryErrors(result.errors, boundary);
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
  } catch (error) {
    result.caseError = serializeError(error);
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBoundaryErrors(result.errors, boundary);
    if (shell) {
      const closure = await closeLabContext(shell, result.errors.length > 0);
      result.failureArtifacts = closure.artifacts;
      result.errors.push(...closure.errors);
    }
    refreshBoundaryErrors(result.errors, boundary);
    evidence.reducedMotionGeometry.push(result);
  }
}

test("measures the closed production storefront once without browser side effects", async ({ browser }) => {
  const failures: string[] = [];
  try {
    evidence.browserVersion = browser.version();
    const pdpPath = await discoverCanonicalPdp(browser);
    const routes = [
      { label: "home", path: "/" },
      { label: "pdp", path: pdpPath },
      { label: "empty-cart", path: "/cart" },
    ];
    for (const viewport of coldViewports) {
      for (const route of routes) {
        for (let iteration = 1; iteration <= 3; iteration += 1) {
          await coldSample(browser, route.label, route.path, viewport, iteration);
        }
      }
    }
    evidence.sampleSummaries = coldViewports.flatMap((viewport) => routes.map((route) => {
      const samples = evidence.samples.filter((sample: any) => sample.viewport.width === viewport.width && sample.routeLabel === route.label);
      return {
        clsMedian: percentile(samples.map((sample: any) => sample.cls?.maximumSessionWindow).filter((value: unknown): value is number => typeof value === "number"), 0.5),
        lcpMedian: percentile(samples.map((sample: any) => sample.lcp?.startTime).filter((value: unknown): value is number => typeof value === "number"), 0.5),
        routeLabel: route.label,
        sampleCount: samples.length,
        ttfbMedian: percentile(samples.map((sample: any) => sample.breakdown?.ttfb).filter((value: unknown): value is number => typeof value === "number"), 0.5),
        viewport,
      };
    }));
    for (const viewport of coldViewports) await frameObservation(browser, viewport);
    for (const viewport of viewports) {
      for (const route of [
        { label: "home", path: "/" },
        { label: "catalog", path: "/catalog" },
        { label: "pdp", path: pdpPath },
        { label: "empty-cart", path: "/cart" },
      ]) await geometryCase(browser, route.path, route.label, viewport);
    }
    for (const viewport of viewports) {
      for (const route of [{ label: "home", path: "/" }, { label: "pdp", path: pdpPath }]) {
        await noJavaScriptCase(browser, route.path, route.label, viewport);
      }
    }
    evidence.noJavaScriptSummary = {
      attempted: evidence.noJavaScriptGeometry.length,
      completed: evidence.noJavaScriptGeometry.filter((result: any) => result.lifecycle === "completed").length,
      failed: evidence.noJavaScriptGeometry.filter((result: any) => result.lifecycle === "failed").length,
      interrupted: evidence.noJavaScriptGeometry.filter((result: any) => result.lifecycle === "interrupted").length,
    };
    for (const viewport of coldViewports) {
      for (const route of [{ label: "home", path: "/" }, { label: "pdp", path: pdpPath }]) {
        await reducedMotionCase(browser, route.path, route.label, viewport);
      }
    }

    for (const sample of evidence.samples) for (const error of sample.integrityErrors) failures.push(`cold ${sample.routeLabel} ${sample.viewport.width}px #${sample.iteration}: ${error}`);
    for (const frame of evidence.frames) for (const error of frame.integrityErrors) failures.push(`frame ${frame.viewport.width}px: ${error}`);
    for (const geometry of evidence.geometry) for (const error of geometry.errors) failures.push(`geometry ${geometry.routeLabel} ${geometry.viewport.width}px: ${error}`);
    for (const geometry of evidence.noJavaScriptGeometry) for (const error of geometry.errors) failures.push(`no-JS ${geometry.routeLabel} ${geometry.viewport.width}px: ${error}`);
    for (const geometry of evidence.reducedMotionGeometry) for (const error of geometry.errors) failures.push(`reduced-motion ${geometry.routeLabel} ${geometry.viewport.width}px: ${error}`);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.failures = failures;
    writeEvidence();
  }
  expect(failures, "Every failed sample/case is retained in performance-data.json").toEqual([]);
});
