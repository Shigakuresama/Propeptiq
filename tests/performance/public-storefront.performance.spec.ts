/* eslint-disable @typescript-eslint/no-explicit-any -- Chromium performance entry extensions and retained JSON evidence are intentionally runtime-shaped. */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
// @ts-expect-error The owned Node ESM harness intentionally has no separate declaration file.
import { classifyContinuingAnimations, evaluateControlPolicy, evaluateImagePolicy } from "../../scripts/run-playwright-performance.mjs";

test.describe.configure({ mode: "serial" });

const baseURL = "http://127.0.0.1:4641";
const observationWindowMs = 6_000;
const frameWindowMs = 30_000;
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
  authRequests: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  externalRequests: string[];
  failedResponses: Array<{ status: number; url: string }>;
  mutatingRequests: Array<{ method: string; url: string }>;
  syntheticOrProviderRequests: string[];
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

function calculateCls(shifts: Array<{ hadRecentInput: boolean; startTime: number; value: number }>) {
  const allShiftSum = shifts.reduce((total, shift) => total + shift.value, 0);
  const eligible = shifts.filter((shift) => !shift.hadRecentInput).sort((left, right) => left.startTime - right.startTime);
  let maximumSessionWindow = 0;
  let windowFirstTime: number | null = null;
  let windowLastTime = 0;
  let windowValue = 0;
  for (const shift of eligible) {
    const joinsWindow = windowFirstTime !== null && shift.startTime - windowLastTime < 1_000 && shift.startTime - windowFirstTime < 5_000;
    if (!joinsWindow) {
      windowFirstTime = shift.startTime;
      windowValue = 0;
    }
    windowLastTime = shift.startTime;
    windowValue += shift.value;
    maximumSessionWindow = Math.max(maximumSessionWindow, windowValue);
  }
  return { allShiftSum, maximumSessionWindow };
}

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
    authRequests: [],
    consoleErrors: [],
    consoleWarnings: [],
    externalRequests: [],
    failedResponses: [],
    mutatingRequests: [],
    syntheticOrProviderRequests: [],
  };
}

async function installBoundary(context: BrowserContext, page: Page, record: BoundaryRecord) {
  await context.route("**/*", async (route) => {
    const requestURL = new URL(route.request().url());
    if (["http:", "https:"].includes(requestURL.protocol) && requestURL.origin !== baseURL) {
      record.externalRequests.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (!["GET", "HEAD"].includes(method)) record.mutatingRequests.push({ method, url: request.url() });
    if (/^\/api\/auth(?:\/|$)/iu.test(url.pathname)) record.authRequests.push(request.url());
    if (
      /(?:__local|%5f_local|synthetic_local_checkout|checkout\/session|session-creation|webhook|newsletter)/iu.test(url.pathname)
    ) record.syntheticOrProviderRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) record.failedResponses.push({ status: response.status(), url: response.url() });
  });
  page.on("pageerror", (error) => record.consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") record.consoleErrors.push(message.text());
    if (message.type() === "warning") record.consoleWarnings.push(message.text());
  });
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    const state = {
      lcp: [] as any[],
      longtasks: [] as any[],
      observers: [] as Array<{
        destination: any[];
        map: (entry: any) => any;
        observer: PerformanceObserver;
      }>,
      shifts: [] as any[],
      supported: PerformanceObserver.supportedEntryTypes ?? [],
    };
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
  });
}

async function collectPerformance(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__task18fPerformance;
    for (const binding of state.observers) {
      binding.destination.push(...binding.observer.takeRecords().map(binding.map));
    }
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType("resource").map((entry) => {
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
      resources,
      shifts: state.shifts as Shift[],
      supported: state.supported as string[],
    };
  });
}

async function newObservedContext(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport });
  const page = await context.newPage();
  const boundary = emptyBoundaryRecord();
  await installBoundary(context, page, boundary);
  await installPerformanceObservers(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { boundary, cdp, context, page };
}

async function discoverCanonicalPdp(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const boundary = emptyBoundaryRecord();
  await installBoundary(context, page, boundary);
  try {
    const response = await page.goto(`${baseURL}/catalog`, { waitUntil: "load" });
    if (response?.status() !== 200) throw new Error(`Catalog discovery returned ${response?.status() ?? "no response"}`);
    const hrefs = await page.locator('main#main-content a[href^="/catalog/items/"]').evaluateAll((links) => (
      links.map((link) => link.getAttribute("href")).filter(Boolean)
    ));
    const href = hrefs.find((value) => /^\/catalog\/items\/[a-z0-9-]+$/u.test(value!));
    if (!href) throw new Error("Rendered catalog exposed no canonical PDP href.");
    if (
      boundary.externalRequests.length > 0 || boundary.mutatingRequests.length > 0 ||
      boundary.authRequests.length > 0 || boundary.syntheticOrProviderRequests.length > 0
    ) throw new Error(`Catalog discovery crossed the browser no-effects boundary: ${JSON.stringify(boundary)}`);
    evidence.discovery = { boundary, href };
    return href;
  } finally {
    await context.close();
  }
}

function performanceBreakdown(raw: any) {
  const lcp = raw.lcp.at(-1) ?? null;
  const navigation = raw.navigation;
  const resource = lcp?.url ? raw.resources.find((candidate: any) => candidate.name === lcp.url) ?? null : null;
  const ttfb = navigation ? navigation.responseStart - navigation.startTime : null;
  if (!lcp || !navigation) return { classification: "missing", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  if (!lcp.url) return { classification: "text-lcp-empty-url", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  if (!resource) return { classification: "unmatched-lcp-resource", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  return {
    classification: "matched-lcp-resource",
    elementRenderDelay: lcp.startTime - resource.responseEnd,
    resource,
    resourceLoadDelay: resource.startTime - navigation.responseStart,
    resourceLoadDuration: resource.responseEnd - resource.startTime,
    ttfb,
  };
}

function boundaryErrors(boundary: BoundaryRecord) {
  const errors: string[] = [];
  if (boundary.externalRequests.length > 0) errors.push(`external requests: ${boundary.externalRequests.length}`);
  if (boundary.mutatingRequests.length > 0) errors.push(`mutating requests: ${boundary.mutatingRequests.length}`);
  if (boundary.authRequests.length > 0) errors.push(`unexpected auth requests: ${boundary.authRequests.length}`);
  if (boundary.syntheticOrProviderRequests.length > 0) errors.push(`synthetic/provider-effect requests: ${boundary.syntheticOrProviderRequests.length}`);
  if (boundary.failedResponses.length > 0) errors.push(`failed responses: ${boundary.failedResponses.length}`);
  if (boundary.consoleErrors.length > 0) errors.push(`browser console/page errors: ${boundary.consoleErrors.length}`);
  return errors;
}

async function coldSample(browser: Browser, routeLabel: string, path: string, viewport: { width: number; height: number }, iteration: number) {
  const shell = await newObservedContext(browser, viewport);
  const sample: Record<string, any> = { boundary: shell.boundary, integrityErrors: [], iteration, routeLabel, path, viewport };
  try {
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
    sample.breakdown = performanceBreakdown(raw);
    sample.integrityErrors.push(...boundaryErrors(shell.boundary));
    if (sample.status !== 200) sample.integrityErrors.push(`document status ${sample.status}`);
    if (!raw.supported.includes("largest-contentful-paint") || !sample.lcp) sample.integrityErrors.push("missing LCP observer/result");
    if (!raw.supported.includes("layout-shift")) sample.integrityErrors.push("missing layout-shift observer");
    if (!raw.supported.includes("longtask")) sample.integrityErrors.push("missing longtask observer");
    if (raw.shifts.some((shift) => shift.hadRecentInput)) sample.integrityErrors.push("unexpected hadRecentInput layout shift in no-input sample");
    if (!(sample.cls.maximumSessionWindow < 0.1)) sample.integrityErrors.push(`CLS max session window ${sample.cls.maximumSessionWindow} is not strictly below 0.1`);
    if (sample.lcp?.url?.toLowerCase().endsWith("front.webp")) {
      evidence.knownLcpHints.push({ iteration, routeLabel, url: sample.lcp.url, viewport });
    }
    for (const warning of shell.boundary.consoleWarnings) {
      evidence.diagnosticWarnings.push({ iteration, routeLabel, viewport, warning });
      if (/colou?r|oklch|\blab\(/iu.test(warning)) {
        evidence.colourWarnings.push({ iteration, routeLabel, viewport, warning });
      }
    }
  } catch (error) {
    sample.integrityErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.samples.push(sample);
    await shell.cdp.detach().catch(() => {});
    await shell.context.close();
  }
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
}

async function frameObservation(browser: Browser, viewport: { width: number; height: number }) {
  const shell = await newObservedContext(browser, viewport);
  const result: Record<string, any> = { boundary: shell.boundary, integrityErrors: [], viewport, windowMs: frameWindowMs };
  try {
    const response = await shell.page.goto(`${baseURL}/`, { waitUntil: "load" });
    if (response?.status() !== 200) result.integrityErrors.push(`document status ${response?.status() ?? "missing"}`);
    await shell.page.evaluate(async () => { await document.fonts.ready; });
    await shell.page.waitForTimeout(1_000);
    const observation = await shell.page.evaluate(async (windowMs) => {
      const intervals: number[] = [];
      const visibility: string[] = [];
      let previous: number | null = null;
      const started = performance.now();
      await new Promise<void>((resolvePromise) => {
        const capture = (now: number) => {
          if (previous !== null) intervals.push(now - previous);
          previous = now;
          visibility.push(document.visibilityState);
          if (now - started >= windowMs) resolvePromise();
          else requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      });
      const activeAnimations = document.getAnimations().filter((animation) => animation.playState === "running").map((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return target instanceof Element ? `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 3).join(".")}` : "unknown";
      }).slice(0, 20);
      return { activeAnimations, intervals, visibility };
    }, frameWindowMs);
    const raw = await collectPerformance(shell.page);
    result.intervalCount = observation.intervals.length;
    result.intervals = observation.intervals;
    result.p50 = percentile(observation.intervals, 0.5);
    result.p95 = percentile(observation.intervals, 0.95);
    result.p99 = percentile(observation.intervals, 0.99);
    result.max = observation.intervals.length > 0 ? Math.max(...observation.intervals) : null;
    result.above20ms = observation.intervals.filter((value) => value > 20).length;
    result.above33_4ms = observation.intervals.filter((value) => value > 33.4).length;
    result.above50ms = observation.intervals.filter((value) => value > 50).length;
    result.longtasks = raw.longtasks;
    result.visibility = [...new Set(observation.visibility)];
    result.activeAnimations = observation.activeAnimations;
    result.integrityErrors.push(...boundaryErrors(shell.boundary));
    if (result.visibility.length !== 1 || result.visibility[0] !== "visible") result.integrityErrors.push(`visibility changed: ${result.visibility.join(",")}`);
  } catch (error) {
    result.integrityErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.frames.push(result);
    await shell.cdp.detach().catch(() => {});
    await shell.context.close();
  }
}

async function waitForGeometryStable(page: Page) {
  return page.evaluate(async () => {
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
  });
}

async function prepareRenderedImages(page: Page) {
  const images = page.locator("main img");
  const errors: string[] = [];
  const visited: string[] = [];
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    const state = await image.evaluate((element) => {
      const imageElement = element as HTMLImageElement;
      const describe = (node: Element) => {
        const classes = [...node.classList].slice(0, 3).join(".");
        return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`.slice(0, 120);
      };
      let node: Element | null = element;
      while (node) {
        if (getComputedStyle(node).display === "none") {
          return {
            alt: imageElement.alt,
            layoutExclusion: {
              reason: node === element ? "own-display-none" : "ancestor-display-none",
              selector: describe(node),
            },
          };
        }
        node = node.parentElement;
      }
      return { alt: imageElement.alt, layoutExclusion: null };
    });
    if (state.layoutExclusion) continue;
    try {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => {
        const imageElement = element as HTMLImageElement;
        return imageElement.complete && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0;
      }
      ), { message: `load rendered image ${state.alt}` }).toBe(true);
      await image.evaluate(async (element) => { await (element as HTMLImageElement).decode(); });
      visited.push(state.alt);
    } catch (error) {
      errors.push(`rendered image readiness failed: ${state.alt}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { errors, visited };
}

async function inspectGeometry(page: Page, width: number) {
  return page.evaluate((viewportWidth) => {
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
    const touchTargets = [...document.querySelectorAll<HTMLElement>(
      'header a, header button, button[aria-label="Search PropeptIQ"], [aria-label="Purchase summary"] button, [aria-label="Purchase summary"] input',
    )].filter(visible).map((element) => ({
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
    const footerControls = footer ? [...footer.querySelectorAll<HTMLElement>("a, button, input, summary")].filter(visible).map((element) => ({
      label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
      rect: rect(element),
    })) : [];
    const searchControls = [...document.querySelectorAll<HTMLElement>('button[aria-label="Search PropeptIQ"]')].filter(visible).map((element) => ({
      fixedAncestor: fixedAncestor(element),
      label: element.getAttribute("aria-label") ?? "Search PropeptIQ",
      rect: rect(element),
    }));
    const purchaseControls = [...document.querySelectorAll<HTMLElement>('[role="region"][aria-label="Mobile purchase controls"]')].filter(visible).map((element) => ({
      fixedAncestor: fixedAncestor(element),
      label: element.getAttribute("aria-label") ?? "Mobile purchase controls",
      rect: rect(element),
    }));
    const search = rect(document.querySelector('button[aria-label="Search PropeptIQ"]'));
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
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
  }, width);
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
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport });
  const page = await context.newPage();
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], path, routeLabel, viewport };
  await installBoundary(context, page, boundary);
  try {
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    result.imageReadiness = await prepareRenderedImages(page);
    result.errors.push(...result.imageReadiness.errors);
    result.initialStability = await waitForGeometryStable(page);
    const initialAnimationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = initialAnimationPolicy.known;
    result.errors.push(...initialAnimationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("relevant initial geometry did not settle within 5 seconds");
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
    result.imagePolicy = evaluateImagePolicy(result.snapshot.images, {
      expectedHiddenAltTexts: expectedHiddenImages(routeLabel, viewport.width),
      requireVisible: routeLabel !== "empty-cart",
    });
    for (const hiddenImage of result.imagePolicy.hidden) {
      if (hiddenImage.layoutExclusion.reason !== "ancestor-display-none") {
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
      ...boundaryErrors(boundary),
    );
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.geometry.push(result);
    await context.close();
  }
}

async function noJavaScriptCase(browser: Browser, path: string, routeLabel: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce", viewport });
  const page = await context.newPage();
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], path, routeLabel, viewport };
  await installBoundary(context, page, boundary);
  try {
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
    result.imageReadiness = await prepareRenderedImages(page);
    result.errors.push(...result.imageReadiness.errors);
    result.initialStability = await waitForGeometryStable(page);
    const animationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = animationPolicy.known;
    result.errors.push(...animationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("no-JavaScript relevant geometry did not settle within 5 seconds");
    result.footerReadiness = await waitForFooterReadiness(page, false);
    result.snapshot = await inspectGeometry(page, viewport.width);
    result.imagePolicy = evaluateImagePolicy(result.snapshot.images, {
      expectedHiddenAltTexts: expectedHiddenImages(routeLabel, viewport.width),
      requireVisible: true,
    });
    for (const hiddenImage of result.imagePolicy.hidden) {
      if (hiddenImage.layoutExclusion.reason !== "ancestor-display-none") {
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
      ...boundaryErrors(boundary),
    );
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.noJavaScriptGeometry.push(result);
    await context.close();
  }
}

async function reducedMotionCase(browser: Browser, path: string, routeLabel: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport });
  const page = await context.newPage();
  const boundary = emptyBoundaryRecord();
  const result: Record<string, any> = { boundary, errors: [], path, routeLabel, viewport };
  await installBoundary(context, page, boundary);
  try {
    const response = await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    result.initialStability = await waitForGeometryStable(page);
    const animationPolicy = classifyContinuingAnimations(result.initialStability.continuingAnimations);
    result.knownContinuingAnimations = animationPolicy.known;
    result.errors.push(...animationPolicy.errors);
    if (!result.initialStability.settled) result.errors.push("reduced-motion relevant geometry did not settle within 5 seconds");
    result.styles = await page.evaluate(() => ({
      decorative: [...document.querySelectorAll<HTMLElement>('[data-motion-surface], [data-motion-step], [data-science-field] .science-field__signal')].slice(0, 30).map((element) => {
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
    const search = await inspectGeometry(page, viewport.width);
    result.search = search.search;
    result.searchCenterDelta = search.searchCenterDelta;
    if (!search.search || search.searchCenterDelta === null || search.searchCenterDelta > 1) result.errors.push(`fixed search centering changed: ${search.searchCenterDelta}`);
    result.errors.push(...boundaryErrors(boundary));
    if (result.status !== 200) result.errors.push(`document status ${result.status}`);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    evidence.reducedMotionGeometry.push(result);
    await context.close();
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
