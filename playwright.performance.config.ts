import { defineConfig } from "@playwright/test";
import { basename, dirname, relative, resolve, sep } from "node:path";

const exactBaseURL = "http://127.0.0.1:4641";
const runId = process.env.PERFORMANCE_RUN_ID ?? "";
const buildId = process.env.PERFORMANCE_BUILD_ID ?? "";
const outputDir = resolve(process.env.PERFORMANCE_OUTPUT_DIR ?? ".");
const dataPath = resolve(process.env.PERFORMANCE_DATA_PATH ?? ".");
const labRoot = resolve("test-results/performance");
const relativeOutput = relative(labRoot, outputDir);

if (process.env.PERFORMANCE_BASE_URL !== exactBaseURL) {
  throw new Error("Performance runner base URL binding is missing or invalid.");
}
if (!/^[A-Za-z0-9-]{20,100}$/u.test(runId)) {
  throw new Error("Performance runner run ID binding is missing or invalid.");
}
if (!/^[A-Za-z0-9_-]{1,128}$/u.test(buildId)) {
  throw new Error("Performance runner BUILD_ID binding is missing or invalid.");
}
if (
  relativeOutput === "" ||
  relativeOutput === ".." ||
  relativeOutput.startsWith(`..${sep}`) ||
  relativeOutput.startsWith(sep) ||
  outputDir !== resolve(labRoot, runId) ||
  dirname(dataPath) !== outputDir ||
  basename(dataPath) !== "performance-data.json"
) {
  throw new Error("Performance runner output binding is outside its exact run directory.");
}

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: resolve(outputDir, "playwright-artifacts"),
  preserveOutput: "always",
  projects: [
    {
      name: "chromium-production-performance",
      use: { browserName: "chromium" },
    },
  ],
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(outputDir, "playwright-results.json") }],
  ],
  retries: 0,
  testDir: "./tests/performance",
  testMatch: "public-storefront.performance.spec.ts",
  timeout: 900_000,
  use: {
    baseURL: exactBaseURL,
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "off",
  },
  workers: 1,
});
