import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const UNUSED_CONTROL_PORT = 4631;
const SERVER_PORT = 4641;
const BASE_URL = `http://${HOST}:${SERVER_PORT}`;
const LAB_ROOT = join(ROOT, "test-results", "performance");
const LAB_LOCK = join(ROOT, "test-results", "performance-lab.lock");
const OWNED_HARNESS_PATHS = Object.freeze([
  "playwright.performance.config.ts",
  "scripts/run-playwright-performance.mjs",
  "scripts/run-playwright-performance.test.mjs",
  "tests/performance/public-storefront.performance.spec.ts",
]);

const OS_ENVIRONMENT = Object.freeze([
  ["PATH", "PATH"],
  ["SystemRoot", "SystemRoot"],
  ["WINDIR", "WINDIR"],
  ["ComSpec", "ComSpec"],
  ["PATHEXT", "PATHEXT"],
  ["TEMP", "TEMP"],
  ["TMP", "TMP"],
  ["USERPROFILE", "USERPROFILE"],
  ["HOME", "HOME"],
  ["LOCALAPPDATA", "LOCALAPPDATA"],
  ["PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_BROWSERS_PATH"],
]);

const CLOSED_PRODUCTION_ENVIRONMENT = Object.freeze({
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
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "production",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
  PAYMENTS_MODE: "disabled",
  RECONSTITUTION_CALCULATOR_MODE: "disabled",
  SHIPPING_MODE: "disabled",
  STORAGE_MODE: "disabled",
  TAX_MODE: "disabled",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
});

export function buildChildEnvironment(sourceEnvironment) {
  const sourceByLowercaseKey = new Map(
    Object.entries(sourceEnvironment).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const childEnvironment = {};
  for (const [sourceKey, canonicalKey] of OS_ENVIRONMENT) {
    const value = sourceByLowercaseKey.get(sourceKey.toLowerCase());
    if (typeof value === "string" && value.length > 0) childEnvironment[canonicalKey] = value;
  }
  return { ...childEnvironment, ...CLOSED_PRODUCTION_ENVIRONMENT };
}

export function validatePreflightSnapshot(snapshot) {
  const forbiddenDotenv = snapshot.dotenvFiles.filter((name) => name !== ".env.example");
  if (forbiddenDotenv.length > 0) {
    throw new Error(`Refusing production lab because root dotenv filename(s) exist: ${forbiddenDotenv.join(", ")}`);
  }
  if (snapshot.occupiedPorts.length > 0) {
    throw new Error(`Refusing production lab because reserved port(s) are occupied: ${snapshot.occupiedPorts.join(", ")}`);
  }
  if (snapshot.buildLocks.length > 0) {
    throw new Error(`Refusing production lab because build lock(s) exist: ${snapshot.buildLocks.join(", ")}`);
  }
  if (snapshot.labLockExists) {
    throw new Error(`Refusing production lab because the concurrent lab lock exists: ${relative(ROOT, LAB_LOCK)}`);
  }
}

export function resolveRunReportPath(runDirectory) {
  return join(runDirectory, "report.md");
}

export function computeCandidateFingerprint(candidate) {
  const normalized = {
    harnessHashes: Object.fromEntries(Object.entries(candidate.harnessHashes).sort(([left], [right]) => left.localeCompare(right))),
    head: candidate.head,
    statusPaths: [...candidate.statusPaths].sort((left, right) => left.localeCompare(right)),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function calculateCls(shifts) {
  const allShiftSum = shifts.reduce((total, shift) => total + shift.value, 0);
  const eligible = shifts
    .filter((shift) => !shift.hadRecentInput)
    .sort((left, right) => left.startTime - right.startTime);
  let maximumSessionWindow = 0;
  let windowFirstTime = null;
  let windowLastTime = null;
  let windowValue = 0;
  for (const shift of eligible) {
    const joinsWindow = windowFirstTime !== null &&
      shift.startTime - windowLastTime < 1_000 &&
      shift.startTime - windowFirstTime < 5_000;
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

export function calculateLcpBreakdown(raw) {
  const lcp = raw.lcp ?? null;
  const navigation = raw.navigation ?? null;
  const resource = lcp?.url
    ? [...(raw.resources ?? [])].findLast((candidate) => candidate.name === lcp.url) ?? null
    : null;
  const ttfb = navigation
    ? Math.max(0, navigation.responseStart - navigation.startTime)
    : null;
  if (!lcp || !navigation) {
    return { classification: "missing", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  }
  if (!lcp.url) {
    return { classification: "text-lcp-empty-url", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  }
  if (!resource) {
    return { classification: "unmatched-lcp-resource", elementRenderDelay: null, resource: null, resourceLoadDelay: null, resourceLoadDuration: null, ttfb };
  }
  const navigationStart = navigation.startTime;
  const lcpTime = Math.max(0, lcp.startTime - navigationStart);
  const requestStart = resource.requestStart || resource.startTime;
  const lcpRequestStart = Math.max(ttfb, requestStart - navigationStart);
  const lcpResponseEnd = Math.min(
    lcpTime,
    Math.max(lcpRequestStart, resource.responseEnd - navigationStart),
  );
  return {
    classification: "matched-lcp-resource",
    elementRenderDelay: lcpTime - lcpResponseEnd,
    resource,
    resourceLoadDelay: lcpRequestStart - ttfb,
    resourceLoadDuration: lcpResponseEnd - lcpRequestStart,
    ttfb,
  };
}

export function buildBrowserContextOptions(options) {
  return { ...options, serviceWorkers: "block" };
}

export function classifyBrowserRequest({ baseURL, method, url }) {
  const requestURL = new URL(url);
  const base = new URL(baseURL);
  const normalizedMethod = method.toUpperCase();
  const local = requestURL.origin === base.origin;
  const read = normalizedMethod === "GET" || normalizedMethod === "HEAD";
  if (!local) return { classification: read ? "blocked-external-read" : "blocked-external-mutation", local, read };
  if (!read) return { classification: "mutating-local-request", local, read };
  if (/^\/api\/auth(?:\/|$)/iu.test(requestURL.pathname)) {
    return { classification: "unexpected-auth-read", local, read };
  }
  if (
    /^\/(?:a|r)\/[^/]+\/?$/iu.test(requestURL.pathname) ||
    /(?:__local|%5f_local|synthetic_local_checkout|checkout\/session|session-creation|webhook|newsletter)/iu.test(requestURL.pathname)
  ) {
    return { classification: "effectful-local-read", local, read };
  }
  return { classification: "allowed-local-read", local, read };
}

export function selectWindowLongtasks(longtasks, window) {
  return {
    wholeContextLongtasks: longtasks.map((entry) => ({ ...entry })),
    windowLongtasks: longtasks
      .filter((entry) => entry.startTime < window.endTime && entry.startTime + entry.duration > window.startTime)
      .map((entry) => ({
        ...entry,
        windowOverlapMs: Math.max(0, Math.min(entry.startTime + entry.duration, window.endTime) - Math.max(entry.startTime, window.startTime)),
      })),
  };
}

export function serializeError(error) {
  if (!error) return null;
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    message: normalized.message,
    name: normalized.name,
    ...(normalized instanceof AggregateError
      ? { errors: normalized.errors.map((constituent) => serializeError(constituent)) }
      : {}),
  };
}

export function sortStagesChronologically(stages) {
  const sequence = (stage) => Number.parseInt(/^([0-9]+)/u.exec(stage.name)?.[1] ?? "999", 10);
  return [...stages].sort((left, right) => (
    sequence(left) - sequence(right) ||
    String(left.startedAt ?? "").localeCompare(String(right.startedAt ?? ""))
  ));
}

const KNOWN_CONTINUING_ANIMATION = Object.freeze({
  animationName: "header-brand-molecular-drift",
  targetSelector: "svg.header-brand-motion__field",
});

export function classifyContinuingAnimations(animations, options = {}) {
  const allowKnownHeaderLogo = options.allowKnownHeaderLogo !== false;
  const known = [];
  const errors = [];
  for (const animation of animations) {
    if (
      allowKnownHeaderLogo &&
      animation.animationName === KNOWN_CONTINUING_ANIMATION.animationName &&
      animation.targetSelector === KNOWN_CONTINUING_ANIMATION.targetSelector
    ) {
      known.push(animation);
    } else {
      errors.push(`unexpected continuing animation: ${animation.animationName} on ${animation.targetSelector}`);
    }
  }
  return { errors, known };
}

export function rectanglesIntersect(left, right) {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

export function evaluateImagePolicy(images, options) {
  const expectedHidden = new Set(options.expectedHiddenAltTexts);
  const beforeState = (image) => image.before ?? image;
  const afterState = (image) => image.after ?? image;
  const hidden = images.filter((image) => beforeState(image).layoutExclusion !== null);
  const visible = images.filter((image) => beforeState(image).layoutExclusion === null);
  const errors = [];
  for (const image of hidden) {
    const exclusion = beforeState(image).layoutExclusion;
    if (
      !["own-display-none", "ancestor-display-none"].includes(exclusion?.reason) ||
      typeof exclusion?.selector !== "string" ||
      exclusion.selector.length === 0 ||
      exclusion.selector.length > 120
    ) {
      errors.push(`invalid layout exclusion evidence: ${image.alt || image.src}`);
    }
    if (!expectedHidden.delete(image.alt)) {
      errors.push(`unexpected layout-excluded image: ${image.alt || image.src}`);
    }
  }
  for (const missing of expectedHidden) errors.push(`expected layout-excluded image was not recorded: ${missing}`);
  if (options.requireVisible && visible.length === 0) errors.push("rendered image coverage is empty");
  for (const image of visible) {
    const before = beforeState(image);
    const after = afterState(image);
    if (!before.rect || before.rect.width <= 0 || before.rect.height <= 0) {
      errors.push(`rendered image lacks reserved dimensions before activation: ${image.alt || image.src}`);
    }
    if (!after.complete || after.naturalWidth <= 0 || after.naturalHeight <= 0) {
      errors.push(`rendered image is broken or undecoded after activation: ${image.alt || image.src}`);
    }
    if (!after.rect || after.rect.width <= 0 || after.rect.height <= 0) {
      errors.push(`rendered image lacks positive dimensions after activation: ${image.alt || image.src}`);
    }
    if (after.layoutExclusion !== null && after.layoutExclusion !== undefined) {
      errors.push(`rendered image became layout-excluded after activation: ${image.alt || image.src}`);
    }
  }
  return { errors, hidden, visible };
}

export function evaluateClippingPolicy(records) {
  const errors = [];
  const intentionalScrollClips = [];
  const skippedOffscreen = [];
  for (const record of records) {
    if (!record.requiredInViewport && !record.viewportRelevant) {
      skippedOffscreen.push(record);
      continue;
    }
    if (record.viewportClipped) errors.push(`relevant target is viewport-clipped: ${record.label}`);
    for (const ancestor of record.ancestorClips) {
      if (ancestor.intentionalScroll === true && ancestor.axis === "x") {
        intentionalScrollClips.push({ ...ancestor, label: record.label });
        continue;
      }
      errors.push(`relevant target is ancestor-clipped: ${record.label} by ${ancestor.selector}`);
    }
  }
  return { errors, intentionalScrollClips, skippedOffscreen };
}

export function evaluateControlPolicy(input) {
  const errors = [];
  const collisions = [];
  if (input.searchControls.length === 0) errors.push("visible search control set is empty");
  if (input.footerControls.length === 0) errors.push("visible footer control set is empty");
  if (input.purchaseControls.length !== input.expectedPurchaseCount) {
    errors.push(`expected ${input.expectedPurchaseCount} visible purchase control(s), found ${input.purchaseControls.length}`);
  }
  for (const search of input.searchControls) {
    if (!search.fixedAncestor) errors.push(`search control has no recorded fixed ancestor: ${search.label}`);
  }
  for (const fixedControl of [...input.searchControls, ...input.purchaseControls]) {
    for (const footerControl of input.footerControls) {
      if (rectanglesIntersect(fixedControl.rect, footerControl.rect)) {
        collisions.push({ fixedControl: fixedControl.label, footerControl: footerControl.label });
        errors.push(`fixed control overlaps footer control: ${fixedControl.label} / ${footerControl.label}`);
      }
    }
  }
  return { collisions, errors };
}

function combineErrors(current, next, message = "Task 18F encountered multiple failures") {
  const normalized = next instanceof Error ? next : new Error(String(next));
  return current ? new AggregateError([current, normalized], message) : normalized;
}

export async function orchestratePerformanceLab(dependencies) {
  let lock;
  let server;
  let browserStarted = false;
  let browserAttempted = false;
  let before;
  let primaryError;
  try {
    await dependencies.preflight();
    lock = await dependencies.acquireLock();
    await dependencies.createRun();
    before = await dependencies.captureCandidate();
    await dependencies.build();
    await dependencies.scan();
    const buildId = await dependencies.readBuildId();
    server = await dependencies.startServer(buildId);
    await dependencies.readiness(server, buildId);
    await dependencies.checkServerAlive(server);
    browserStarted = true;
    browserAttempted = true;
    await dependencies.runBrowser(server, buildId);
    browserStarted = false;
    await dependencies.checkServerAlive(server);
  } catch (error) {
    primaryError = error;
    if (browserStarted) {
      try {
        await dependencies.stopBrowser();
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, "Browser run and browser cleanup both failed");
      }
    }
  } finally {
    if (browserAttempted && before) {
      try {
        const after = await dependencies.captureCandidate();
        dependencies.compareCandidate(before, after);
      } catch (bindingError) {
        primaryError = combineErrors(primaryError, bindingError, "Playwright run and candidate binding both failed");
      }
    }
    if (server) {
      try {
        await dependencies.stopServer(server);
      } catch (cleanupError) {
        primaryError = combineErrors(primaryError, cleanupError, "Lab work and server cleanup both failed");
      }
    }
    let ownedChildrenAlive = false;
    if (lock) {
      try {
        ownedChildrenAlive = await dependencies.ownedChildrenAlive();
      } catch (inspectionError) {
        ownedChildrenAlive = true;
        primaryError = combineErrors(primaryError, inspectionError, "Owned-child cleanup state could not be verified");
      }
      if (ownedChildrenAlive) {
        primaryError = combineErrors(
          primaryError,
          new Error("Owned child remains alive; preserving the lab ownership lock"),
          "Cleanup did not prove all owned children exited",
        );
      } else {
        try {
          await dependencies.releaseLock(lock);
        } catch (lockError) {
          primaryError = combineErrors(primaryError, lockError, "Lab work and lock release both failed");
        }
      }
    }
    try {
      await dependencies.writeReport(primaryError);
    } catch (reportError) {
      primaryError = combineErrors(primaryError, reportError, "Lab work and report writing both failed");
    }
  }
  if (primaryError) throw primaryError;
}

function assertPathInside(parent, candidate) {
  const relativePath = relative(parent, candidate);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || relativePath.startsWith(sep)) {
    throw new Error(`Unsafe evidence path: ${candidate}`);
  }
}

function isPortAvailable(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolvePromise(false));
    server.listen({ host: HOST, port, exclusive: true }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function capturePreflightSnapshot() {
  const rootNames = readdirSync(ROOT);
  const dotenvFiles = rootNames.filter((name) => name.toLowerCase().startsWith(".env"));
  const occupiedPorts = [];
  for (const port of [UNUSED_CONTROL_PORT, SERVER_PORT]) {
    if (!(await isPortAvailable(port))) occupiedPorts.push(port);
  }
  const buildLocks = [".next/lock", ".next/dev/lock"].filter((path) => existsSync(join(ROOT, path)));
  return {
    buildLocks,
    dotenvFiles,
    labLockExists: existsSync(LAB_LOCK),
    occupiedPorts,
  };
}

function spawnCaptured(executable, arguments_, options = {}) {
  const child = spawn(executable, arguments_, {
    cwd: ROOT,
    env: options.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  return {
    child,
    completed: new Promise((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolvePromise({ code, signal, stderr, stdout }));
    }),
  };
}

async function gitOutput(arguments_, childEnvironment) {
  const result = spawnCaptured("git", arguments_, { env: childEnvironment });
  const outcome = await result.completed;
  if (outcome.code !== 0) throw new Error(`Read-only git command failed (${arguments_[0]}), exit ${outcome.code}`);
  return outcome.stdout.trim();
}

function parsePorcelainPaths(output) {
  if (output.length === 0) return [];
  return output.split(/\r?\n/u).filter(Boolean).map((line) => {
    const rawPath = line.slice(3);
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
    return path.replace(/^"|"$/gu, "").replaceAll("\\", "/");
  }).sort((left, right) => left.localeCompare(right));
}

function hashHarnessFiles() {
  return Object.fromEntries(OWNED_HARNESS_PATHS.map((path) => {
    const absolutePath = join(ROOT, path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      throw new Error(`Owned harness file is missing: ${path}`);
    }
    return [path, createHash("sha256").update(readFileSync(absolutePath)).digest("hex")];
  }));
}

async function captureCandidate(childEnvironment) {
  const head = await gitOutput(["rev-parse", "HEAD"], childEnvironment);
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error(`Observed source HEAD has an unexpected format: ${head}`);
  const status = await gitOutput(["status", "--porcelain=v1", "--untracked-files=all"], childEnvironment);
  const statusPaths = parsePorcelainPaths(status);
  const forbiddenPaths = statusPaths.filter((path) => !OWNED_HARNESS_PATHS.includes(path));
  if (forbiddenPaths.length > 0) {
    throw new Error(`Candidate contains paths outside Task 18F ownership: ${forbiddenPaths.join(", ")}`);
  }
  const harnessHashes = hashHarnessFiles();
  const candidate = {
    harnessDirty: statusPaths.some((path) => OWNED_HARNESS_PATHS.includes(path)),
    harnessHashes,
    head,
    statusPaths,
  };
  return { ...candidate, fingerprint: computeCandidateFingerprint(candidate) };
}

function compareCandidate(before, after) {
  if (before.fingerprint !== after.fingerprint) {
    throw new Error(`Candidate binding changed during the run (${before.fingerprint} -> ${after.fingerprint})`);
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function awaitOwnedTerminationHelper(helper, options = {}) {
  const timeout = options.timeout ?? delay;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const settled = await Promise.race([
    helper.completed.then(
      (result) => ({ kind: "completed", result }),
      (error) => ({ error, kind: "failed" }),
    ),
    timeout(timeoutMs).then(() => ({ kind: "timeout" })),
  ]);
  if (settled.kind === "timeout") {
    throw new Error(`Owned taskkill helper PID ${helper.child.pid ?? "unknown"} did not complete within ${timeoutMs}ms`);
  }
  if (settled.kind === "failed") {
    throw new AggregateError(
      [settled.error instanceof Error ? settled.error : new Error(String(settled.error))],
      `Owned taskkill helper PID ${helper.child.pid ?? "unknown"} failed`,
    );
  }
  return settled.result;
}

export async function finalizeOwnedBrowserCase(shell, failed, options, operations = {}) {
  if (shell.finalized) return shell.finalization;
  const makeDirectory = operations.makeDirectory ?? mkdirSync;
  const artifacts = [];
  const errors = [];
  let artifactDirectoryReady = !failed;
  if (failed) {
    try {
      makeDirectory(options.artifactDirectory, { recursive: true });
      artifactDirectoryReady = true;
    } catch (error) {
      errors.push(`failure artifact directory creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (artifactDirectoryReady && shell.page) {
      const screenshotPath = join(options.artifactDirectory, `${shell.artifactStem}-failure.png`);
      try {
        await shell.page.screenshot({ animations: "allow", caret: "initial", fullPage: true, path: screenshotPath });
        artifacts.push(relative(options.outputDirectory, screenshotPath).replaceAll("\\", "/"));
      } catch (error) {
        errors.push(`failure screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (artifactDirectoryReady) {
      errors.push("failure screenshot unavailable before page creation");
    }
  }
  if (shell.traceStarted) {
    try {
      if (failed && artifactDirectoryReady) {
        const tracePath = join(options.artifactDirectory, `${shell.artifactStem}-failure-trace.zip`);
        await shell.context.tracing.stop({ path: tracePath });
        artifacts.push(relative(options.outputDirectory, tracePath).replaceAll("\\", "/"));
      } else {
        await shell.context.tracing.stop();
      }
    } catch (error) {
      errors.push(`context trace finalization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    await shell.context.close();
  } catch (error) {
    errors.push(`browser context close failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  shell.finalized = true;
  shell.finalization = { artifacts, errors };
  return shell.finalization;
}

export async function setupOwnedBrowserCase(shell, setup, finalizationOptions, operations = {}) {
  try {
    await setup(shell);
    return shell;
  } catch (setupError) {
    const closure = await finalizeOwnedBrowserCase(shell, true, finalizationOptions, operations);
    if (closure.errors.length > 0) {
      throw new AggregateError(
        [
          setupError instanceof Error ? setupError : new Error(String(setupError)),
          ...closure.errors.map((message) => new Error(message)),
        ],
        "Browser case setup and evidence finalization both failed",
      );
    }
    throw setupError;
  }
}

async function terminateOwnedProcessTree(handle, options = {}) {
  if (!handle || handle.child.exitCode !== null || handle.child.signalCode !== null) return;
  if (process.platform === "win32" && Number.isSafeInteger(handle.child.pid)) {
    const taskkill = spawnCaptured("taskkill.exe", ["/PID", String(handle.child.pid), "/T", "/F"], {
      env: buildChildEnvironment(process.env),
    });
    options.registerHelper?.(taskkill);
    const taskkillOutcome = await awaitOwnedTerminationHelper(taskkill);
    if (taskkillOutcome.code !== 0) {
      throw new Error(`Owned process tree termination failed for PID ${handle.child.pid}: taskkill exit ${taskkillOutcome.code}${taskkillOutcome.signal ? ` (${taskkillOutcome.signal})` : ""}`);
    }
  } else {
    if (!handle.child.kill("SIGTERM")) throw new Error(`Owned process ${handle.child.pid ?? "unknown"} rejected SIGTERM`);
    const graceful = await Promise.race([handle.completed.then(() => true), delay(5_000).then(() => false)]);
    if (!graceful && !handle.child.kill("SIGKILL")) throw new Error(`Owned process ${handle.child.pid ?? "unknown"} rejected SIGKILL`);
  }
  const exited = await Promise.race([
    handle.completed.then(() => true, () => handle.child.exitCode !== null || handle.child.signalCode !== null),
    delay(5_000).then(() => false),
  ]);
  if (!exited || (handle.child.exitCode === null && handle.child.signalCode === null)) {
    throw new Error(`Owned process ${handle.child.pid ?? "unknown"} did not confirm exit after bounded termination`);
  }
}

function createRuntimeDependencies() {
  const runId = `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${randomUUID()}`;
  const runDirectory = join(LAB_ROOT, runId);
  assertPathInside(LAB_ROOT, runDirectory);
  const runReportPath = resolveRunReportPath(runDirectory);
  const stageDirectory = join(runDirectory, "stages");
  const childEnvironment = buildChildEnvironment(process.env);
  const nextCli = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const scanner = join(ROOT, "scripts", "verify-production-artifacts.mjs");
  const playwrightCli = join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  const state = {
    buildId: null,
    candidateAfter: null,
    candidateBefore: null,
    endTime: null,
    error: null,
    interrupted: null,
    runId,
    server: null,
    browser: null,
    activeStage: null,
    serverStageRecorded: false,
    stages: [],
    startTime: new Date().toISOString(),
    terminationHelpers: [],
  };

  const terminateOwned = (handle) => terminateOwnedProcessTree(handle, {
    registerHelper(helper) {
      state.terminationHelpers.push(helper);
    },
  });

  function ensureNotInterrupted() {
    if (state.interrupted) throw new Error(`Task 18F was interrupted by ${state.interrupted}`);
  }

  async function runStage(name, executable, arguments_, environment = childEnvironment) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const stdoutPath = join(stageDirectory, `${name}.stdout.log`);
    const stderrPath = join(stageDirectory, `${name}.stderr.log`);
    const handle = spawnCaptured(executable, arguments_, { env: environment });
    state.activeStage = handle;
    const stdoutStream = createWriteStream(stdoutPath, { flags: "wx" });
    const stderrStream = createWriteStream(stderrPath, { flags: "wx" });
    handle.child.stdout.pipe(stdoutStream);
    handle.child.stderr.pipe(stderrStream);
    const outcome = await handle.completed;
    await Promise.all([finished(stdoutStream), finished(stderrStream)]);
    state.activeStage = null;
    const stage = {
      arguments: arguments_.map((argument) => basename(argument) === argument ? argument : relative(ROOT, argument)),
      durationMs: Math.round(performance.now() - started),
      executable: executable === process.execPath ? process.execPath : executable,
      exitCode: outcome.code,
      name,
      signal: outcome.signal,
      startedAt,
      stderrPath: relative(ROOT, stderrPath).replaceAll("\\", "/"),
      stdoutPath: relative(ROOT, stdoutPath).replaceAll("\\", "/"),
    };
    state.stages.push(stage);
    if (outcome.code !== 0) throw new Error(`${name} failed with exit code ${outcome.code}${outcome.signal ? ` (${outcome.signal})` : ""}`);
    return outcome;
  }

  return {
    async acquireLock() {
      ensureNotInterrupted();
      mkdirSync(dirname(LAB_LOCK), { recursive: true });
      const descriptor = openSync(LAB_LOCK, "wx");
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, runId, startedAt: state.startTime }));
      closeSync(descriptor);
      return { owned: true, path: LAB_LOCK, runId };
    },
    async build() {
      ensureNotInterrupted();
      await runStage("01-next-build", process.execPath, [nextCli, "build"]);
    },
    async captureCandidate() {
      ensureNotInterrupted();
      const candidate = await captureCandidate(childEnvironment);
      if (!state.candidateBefore) state.candidateBefore = candidate;
      else state.candidateAfter = candidate;
      return candidate;
    },
    async checkServerAlive(server) {
      ensureNotInterrupted();
      if (server.child.exitCode !== null || server.child.signalCode !== null) {
        throw new Error(`Owned Next server exited unexpectedly (code ${server.child.exitCode}, signal ${server.child.signalCode})`);
      }
      const currentBuildId = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
      if (currentBuildId !== state.buildId) throw new Error("BUILD_ID changed while the production server was running");
    },
    compareCandidate,
    async createRun() {
      ensureNotInterrupted();
      mkdirSync(stageDirectory, { recursive: true });
      console.log(`Task 18F run ID: ${runId}`);
      console.log(`Evidence directory: ${relative(ROOT, runDirectory)}`);
    },
    async preflight() {
      ensureNotInterrupted();
      const snapshot = await capturePreflightSnapshot();
      validatePreflightSnapshot(snapshot);
      console.log(`Preflight PASS: root dotenv names=${snapshot.dotenvFiles.join(",") || "none"}; ports ${UNUSED_CONTROL_PORT}/${SERVER_PORT}=free; build/lab locks=absent`);
    },
    async ownedChildrenAlive() {
      return [state.browser, state.activeStage, state.server, ...state.terminationHelpers].some((handle) => (
        handle && handle.child.exitCode === null && handle.child.signalCode === null
      ));
    },
    async readBuildId() {
      ensureNotInterrupted();
      const buildIdPath = join(ROOT, ".next", "BUILD_ID");
      if (!existsSync(buildIdPath)) throw new Error("next build produced no .next/BUILD_ID");
      const buildId = readFileSync(buildIdPath, "utf8").trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/u.test(buildId)) throw new Error("BUILD_ID has an unexpected format");
      state.buildId = buildId;
      return buildId;
    },
    async readiness(server, buildId) {
      ensureNotInterrupted();
      const deadline = Date.now() + 120_000;
      const started = performance.now();
      const startedAt = new Date().toISOString();
      let lastError = "server not ready";
      let readinessError = null;
      try {
        while (Date.now() < deadline) {
          if (server.child.exitCode !== null || server.child.signalCode !== null) {
            throw new Error(`Owned Next server exited during readiness (code ${server.child.exitCode}, signal ${server.child.signalCode})`);
          }
          try {
            const healthResponse = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5_000) });
            const healthText = await healthResponse.text();
            const health = JSON.parse(healthText);
            if (healthResponse.status !== 200 || JSON.stringify(health) !== JSON.stringify({ status: "ok" })) {
              throw new Error(`health response was ${healthResponse.status} ${healthText.slice(0, 120)}`);
            }
            const homeResponse = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10_000) });
            const homeText = await homeResponse.text();
            if (homeResponse.status !== 200 || !/<main[^>]+id=["']main-content["']/iu.test(homeText) || !/PROPEPTIQ LABS/iu.test(homeText)) {
              throw new Error(`homepage marker check failed with status ${homeResponse.status}`);
            }
            const currentBuildId = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
            if (currentBuildId !== buildId) throw new Error("BUILD_ID changed during readiness");
            return;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            await delay(250);
          }
        }
        throw new Error(`Production server readiness timed out: ${lastError}`);
      } catch (error) {
        readinessError = error;
        throw error;
      } finally {
        state.stages.push({
          arguments: [],
          durationMs: Math.round(performance.now() - started),
          error: serializeError(readinessError),
          executable: "runner readiness polling",
          exitCode: readinessError ? null : 0,
          name: "04-readiness",
          outcome: readinessError ? "failed" : "passed",
          signal: null,
          startedAt,
          stderrPath: relative(ROOT, server.stderrPath).replaceAll("\\", "/"),
          stdoutPath: relative(ROOT, server.stdoutPath).replaceAll("\\", "/"),
        });
      }
    },
    async releaseLock(lock) {
      if (!lock.owned || lock.path !== LAB_LOCK || lock.runId !== runId) throw new Error("Refusing to release an unowned lab lock");
      const lockRecord = JSON.parse(readFileSync(LAB_LOCK, "utf8"));
      if (lockRecord.pid !== process.pid || lockRecord.runId !== runId) throw new Error("Lab lock ownership changed; preserving it");
      rmSync(LAB_LOCK, { force: false, recursive: false });
    },
    async runBrowser(server, buildId) {
      ensureNotInterrupted();
      const performanceEnvironment = {
        ...childEnvironment,
        PERFORMANCE_BASE_URL: BASE_URL,
        PERFORMANCE_BUILD_ID: buildId,
        PERFORMANCE_DATA_PATH: join(runDirectory, "performance-data.json"),
        PERFORMANCE_OUTPUT_DIR: runDirectory,
        PERFORMANCE_RUN_ID: runId,
      };
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const stdoutPath = join(stageDirectory, "05-playwright.stdout.log");
      const stderrPath = join(stageDirectory, "05-playwright.stderr.log");
      const browser = spawnCaptured(process.execPath, [playwrightCli, "test", "--config=playwright.performance.config.ts"], {
        env: performanceEnvironment,
      });
      state.browser = browser;
      const stdoutStream = createWriteStream(stdoutPath, { flags: "wx" });
      const stderrStream = createWriteStream(stderrPath, { flags: "wx" });
      browser.child.stdout.pipe(process.stdout);
      browser.child.stderr.pipe(process.stderr);
      browser.child.stdout.pipe(stdoutStream);
      browser.child.stderr.pipe(stderrStream);
      let outcome = null;
      let browserError = null;
      try {
        outcome = await Promise.race([
          browser.completed.then((result) => ({ kind: "browser", result })),
          server.completed.then((result) => ({ kind: "server", result })),
        ]);
        if (outcome.kind === "server") {
          const serverError = new Error(`Owned Next server exited during Playwright (code ${outcome.result.code}, signal ${outcome.result.signal})`);
          try {
            await terminateOwned(browser);
          } catch (cleanupError) {
            browserError = combineErrors(serverError, cleanupError, "Server exit and browser cleanup both failed");
          }
          if (browser.child.exitCode !== null || browser.child.signalCode !== null) state.browser = null;
          if (!browserError) browserError = serverError;
        } else {
          state.browser = null;
          if (outcome.result.code !== 0) browserError = new Error(`Playwright measurement failed with exit code ${outcome.result.code}`);
        }
      } catch (error) {
        browserError = combineErrors(browserError, error, "Playwright execution and stage observation both failed");
      } finally {
        if (browser.child.exitCode !== null || browser.child.signalCode !== null) {
          try {
            await Promise.all([finished(stdoutStream), finished(stderrStream)]);
          } catch (streamError) {
            browserError = combineErrors(browserError, streamError, "Playwright execution and log finalization both failed");
          }
        }
        state.stages.push({
          arguments: ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.performance.config.ts"],
          durationMs: Math.round(performance.now() - started),
          error: serializeError(browserError),
          executable: process.execPath,
          exitCode: outcome?.kind === "browser" ? outcome.result.code : browser.child.exitCode,
          name: "05-playwright",
          outcome: browserError ? "failed" : "passed",
          signal: outcome?.kind === "browser" ? outcome.result.signal : browser.child.signalCode,
          startedAt,
          stderrPath: relative(ROOT, stderrPath).replaceAll("\\", "/"),
          stdoutPath: relative(ROOT, stdoutPath).replaceAll("\\", "/"),
        });
      }
      if (browserError) throw browserError;
    },
    async scan() {
      ensureNotInterrupted();
      await runStage("02-artifact-scan", process.execPath, [scanner, ".next"]);
    },
    async startServer() {
      const stdoutPath = join(stageDirectory, "03-next-start.stdout.log");
      const stderrPath = join(stageDirectory, "03-next-start.stderr.log");
      const server = spawnCaptured(process.execPath, [nextCli, "start", "--hostname", HOST, "--port", String(SERVER_PORT)], {
        env: childEnvironment,
      });
      const stdoutStream = createWriteStream(stdoutPath, { flags: "wx" });
      const stderrStream = createWriteStream(stderrPath, { flags: "wx" });
      server.child.stdout.pipe(stdoutStream);
      server.child.stderr.pipe(stderrStream);
      server.outputFinished = Promise.all([finished(stdoutStream), finished(stderrStream)]);
      server.startedAt = new Date().toISOString();
      server.startedPerformance = performance.now();
      server.stdoutPath = stdoutPath;
      server.stderrPath = stderrPath;
      state.server = server;
      return server;
    },
    async stopBrowser() {
      if (state.browser) await terminateOwned(state.browser);
      state.browser = null;
    },
    async stopServer(server) {
      const exitedBeforeCleanup = server.child.exitCode !== null || server.child.signalCode !== null;
      let stopError = null;
      let outcome = null;
      try {
        await terminateOwned(server);
        state.server = null;
      } catch (error) {
        stopError = combineErrors(stopError, error, "Owned server termination failed");
      } finally {
        if (!state.server && !state.serverStageRecorded) {
          try {
            outcome = await server.completed;
          } catch (completionError) {
            stopError = combineErrors(stopError, completionError, "Owned server completion failed");
            outcome = { code: null, signal: "spawn-error" };
          }
          try {
            await server.outputFinished;
          } catch (streamError) {
            stopError = combineErrors(stopError, streamError, "Owned server log finalization failed");
          }
          state.stages.push({
            arguments: ["node_modules/next/dist/bin/next", "start", "--hostname", HOST, "--port", String(SERVER_PORT)],
            durationMs: Math.round(performance.now() - server.startedPerformance),
            error: serializeError(stopError),
            executable: process.execPath,
            exitCode: outcome.code,
            name: "03-next-start",
            outcome: stopError ? "failed" : exitedBeforeCleanup ? "exited-before-cleanup" : "stopped-after-lab",
            signal: outcome.signal,
            startedAt: server.startedAt,
            stderrPath: relative(ROOT, server.stderrPath).replaceAll("\\", "/"),
            stdoutPath: relative(ROOT, server.stdoutPath).replaceAll("\\", "/"),
          });
          state.serverStageRecorded = true;
        } else if (stopError && !state.serverStageRecorded) {
          state.stages.push({
            arguments: ["node_modules/next/dist/bin/next", "start", "--hostname", HOST, "--port", String(SERVER_PORT)],
            durationMs: Math.round(performance.now() - server.startedPerformance),
            error: serializeError(stopError),
            executable: process.execPath,
            exitCode: server.child.exitCode,
            name: "03-next-start",
            outcome: "cleanup-failed-child-alive",
            signal: server.child.signalCode,
            startedAt: server.startedAt,
            stderrPath: relative(ROOT, server.stderrPath).replaceAll("\\", "/"),
            stdoutPath: relative(ROOT, server.stdoutPath).replaceAll("\\", "/"),
          });
          state.serverStageRecorded = true;
        }
      }
      if (stopError) throw stopError;
    },
    async writeReport(error) {
      state.endTime = new Date().toISOString();
      state.error = error instanceof Error ? error.message : error ? String(error) : null;
      const errorEvidence = serializeError(error);
      const orderedStages = sortStagesChronologically(state.stages);
      const manifest = {
        baseUrl: BASE_URL,
        buildId: state.buildId,
        candidateAfter: state.candidateAfter,
        candidateBefore: state.candidateBefore,
        endTime: state.endTime,
        environmentPolicy: {
          copiedKeys: OS_ENVIRONMENT.map(([, canonicalKey]) => canonicalKey),
          explicitKeys: Object.keys(CLOSED_PRODUCTION_ENVIRONMENT),
          valuesRecorded: false,
        },
        error: errorEvidence,
        errorSummary: state.error,
        networkMethod: "unthrottled localhost",
        nodeVersion: process.version,
        nextVersion: JSON.parse(readFileSync(join(ROOT, "node_modules", "next", "package.json"), "utf8")).version,
        playwrightVersion: JSON.parse(readFileSync(join(ROOT, "node_modules", "@playwright", "test", "package.json"), "utf8")).version,
        runId,
        observedSourceHead: state.candidateBefore?.head ?? null,
        stages: orderedStages,
        startTime: state.startTime,
        status: errorEvidence ? "FAIL" : "PASS",
      };
      writeFileSync(join(runDirectory, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
      let measurements = null;
      const measurementPath = join(runDirectory, "performance-data.json");
      if (existsSync(measurementPath)) measurements = JSON.parse(readFileSync(measurementPath, "utf8"));
      const sampleLines = measurements?.samples?.map((sample) => (
        `| ${sample.routeLabel} | ${sample.viewport.width}x${sample.viewport.height} | ${sample.iteration} | ${sample.lcp?.startTime ?? "missing"} | ${sample.cls?.maximumSessionWindow ?? "missing"} | ${sample.longtasks?.length ?? 0} | ${sample.integrityErrors?.length ?? 0} |`
      )) ?? [];
      const report = `# Task 18F production lab report\n\n` +
        `- Status: **${manifest.status}**\n` +
        `- Run ID: \`${runId}\`\n` +
        `- Observed source HEAD: \`${state.candidateBefore?.head ?? "not captured"}\` (recorded identity, not automatic approval)\n` +
        `- Build ID: \`${state.buildId ?? "not produced"}\`\n` +
        `- Started/ended: ${state.startTime} / ${state.endTime}\n` +
        `- Candidate harness dirty during measurement: ${state.candidateBefore?.harnessDirty ?? "unknown"}\n` +
        `- Candidate fingerprint stable: ${state.candidateAfter ? state.candidateAfter.fingerprint === state.candidateBefore?.fingerprint : "not reached"}\n` +
        `- CPU/network: CDP 4x CPU; unthrottled localhost (not field, CrUX, PageSpeed, mobile-network, or Vercel data).\n` +
        `- Error: ${state.error ?? "none"}\n` +
        `- Error evidence: \`${JSON.stringify(errorEvidence)}\`\n` +
        `- Evidence: \`${relative(ROOT, runDirectory).replaceAll("\\", "/")}\`\n` +
        `- Operator boundary: only run when no other worker owns ordinary \`.next\`, ports ${UNUSED_CONTROL_PORT}/${SERVER_PORT}, or the lab lock.\n\n` +
        `## Stage results and actual commands\n\n| Stage | Outcome | Command | Exit | Signal | Duration ms | Stdout | Stderr |\n|---|---|---|---:|---|---:|---|---|\n` +
        orderedStages.map((stage) => `| ${stage.name} | ${stage.outcome ?? (stage.exitCode === 0 ? "passed" : "failed")} | \`${[stage.executable, ...(stage.arguments ?? [])].filter(Boolean).join(" ")}\` | ${stage.exitCode ?? "n/a"} | ${stage.signal ?? "none"} | ${stage.durationMs ?? "n/a"} | \`${stage.stdoutPath ?? "n/a"}\` | \`${stage.stderrPath ?? "n/a"}\` |`).join("\n") +
        `\n\n## Cold samples\n\n| Route | Viewport | Iteration | LCP ms | CLS max window | Longtasks | Integrity errors |\n|---|---|---:|---:|---:|---:|---:|\n` +
        (sampleLines.length > 0 ? sampleLines.join("\n") : "| no sample evidence | n/a | n/a | n/a | n/a | n/a | n/a |") +
        `\n\n## Counts and limitations\n\n` +
        `- Cold samples: ${measurements?.samples?.length ?? 0}/18. Failed/integrity samples: ${measurements?.samples?.filter((sample) => sample.integrityErrors?.length > 0).length ?? 0}.\n` +
        `- Frame observations: ${measurements?.frames?.length ?? 0}/2; these are frame-interval observations, not proof of 60fps or scripting cost.\n` +
        `- Geometry checks: ${measurements?.geometry?.length ?? 0}/28 JavaScript contexts, ${measurements?.noJavaScriptGeometry?.length ?? 0}/14 no-JavaScript contexts, ${measurements?.reducedMotionGeometry?.length ?? 0}/4 reduced-motion route contexts.\n` +
        `- No accepted LCP budget exists. Every CLS sample must be strictly below 0.1; medians do not replace individual samples.\n` +
        `- Known LCP hints: ${measurements?.knownLcpHints?.length ?? 0}. Colour warnings: ${measurements?.colourWarnings?.length ?? 0}. Other diagnostic warnings: ${measurements?.diagnosticWarnings?.length ?? 0}. These are separate arrays in \`performance-data.json\` and are not silently treated as measurement success.\n` +
        `- Manual contexts block service workers and use snapshot tracing retained only on failure; this instrumentation can affect the local timing observations and is recorded in \`performance-data.json\`.\n` +
        `- This local closed production-build lane does not cover populated-cart loading, unsampled routes, a deployed production artifact, provider integrations, auth, payments, form submission, cart writes, or owner inputs.\n`;
      writeFileSync(runReportPath, report, { flag: "wx" });
    },
    async interrupt(signal) {
      state.interrupted = signal;
      let interruptError;
      for (const [label, handle] of [["browser", state.browser], ["active stage", state.activeStage], ["server", state.server]]) {
        if (!handle) continue;
        try {
          await terminateOwned(handle);
        } catch (error) {
          interruptError = combineErrors(interruptError, error, `Interrupt cleanup failed for owned ${label}`);
        }
      }
      if (interruptError) throw interruptError;
    },
  };
}

function printHelp() {
  console.log("Run one Task 18F closed production-build performance-lab invocation.");
  console.log("Precondition: no other worker owns ordinary .next, ports 4631/4641, or test-results/performance-lab.lock.");
  console.log("The operator must bind the reviewed candidate; the runner records the observed HEAD and requires unchanged HEAD/status/harness hashes.");
  console.log("The runner preserves build/evidence output and removes only its own processes and exact invocation lock.");
}

async function main() {
  if (process.argv.length > 2) {
    if (process.argv.length === 3 && ["--help", "-h"].includes(process.argv[2])) {
      printHelp();
      return;
    }
    throw new Error("This bounded runner accepts no arguments (except --help).");
  }
  const dependencies = createRuntimeDependencies();
  let interrupting = false;
  const interrupt = async (signal) => {
    if (interrupting) return;
    interrupting = true;
    console.error(`Received ${signal}; stopping only this invocation's owned children.`);
    try {
      await dependencies.interrupt(signal);
    } catch (error) {
      console.error(`Owned-child interrupt cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => { void interrupt("SIGINT"); });
  process.once("SIGTERM", () => { void interrupt("SIGTERM"); });
  await orchestratePerformanceLab(dependencies);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`Task 18F production lab failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
