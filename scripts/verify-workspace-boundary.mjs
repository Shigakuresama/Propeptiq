import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const worktreeRoot = resolve(
  execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(),
);
const commonGitDir = resolve(
  execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).trim(),
);
const canonicalRoot = basename(commonGitDir) === ".git"
  ? dirname(commonGitDir)
  : dirname(dirname(dirname(commonGitDir)));
const quarantineRoot = resolve(canonicalRoot, "..", "_agent-quarantine");
const quarantinePath = resolve(quarantineRoot, "propeptiq-labs-site");
const markerPattern = /_agent-quarantine|propeptiq-labs-site/iu;

function basename(path) {
  return path.split(/[\\/]/u).filter(Boolean).at(-1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

assert(existsSync(resolve(worktreeRoot, "package.json")), "package.json is missing from the worktree root");
assert(canonicalRoot === resolve(worktreeRoot, "..", "..") || canonicalRoot === worktreeRoot,
  `unexpected canonical root relationship: ${canonicalRoot}`);
assert(!isInside(canonicalRoot, quarantinePath), "quarantine path is inside the canonical application root");
assert(relative(canonicalRoot, quarantinePath) === "..\\_agent-quarantine\\propeptiq-labs-site"
  || relative(canonicalRoot, quarantinePath) === "../_agent-quarantine/propeptiq-labs-site",
`quarantine is not the expected sibling boundary: ${quarantinePath}`);
if (existsSync(quarantinePath)) {
  assert(!isInside(realpathSync(canonicalRoot), realpathSync(quarantinePath)),
    "resolved quarantine path is inside the canonical application root");
}

const packageJson = JSON.parse(readFileSync(resolve(worktreeRoot, "package.json"), "utf8"));
const configNames = [
  "package.json",
  "package-lock.json",
  "pnpm-workspace.yaml",
  "pnpm-workspace.yml",
  "turbo.json",
  "nx.json",
  "vitest.config.ts",
  "vitest.integration.config.ts",
  "playwright.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
  "tsconfig.json",
];
const configFiles = configNames.filter((name) => existsSync(resolve(worktreeRoot, name)));
const configText = configFiles.map((name) => readFileSync(resolve(worktreeRoot, name), "utf8")).join("\n");
assert(!markerPattern.test(configText), "package/workspace/tool configuration references the quarantined scaffold");
assert(Object.keys(packageJson).includes("scripts"), "package.json scripts are missing");
const playwrightText = readFileSync(resolve(worktreeRoot, "playwright.config.ts"), "utf8");
const testDirMatch = playwrightText.match(/testDir:\s*["']([^"']+)["']/u);
assert(testDirMatch?.[1], "Playwright testDir is missing");
const e2eRoot = resolve(worktreeRoot, testDirMatch[1]);
assert(isInside(worktreeRoot, e2eRoot), `Playwright testDir escapes the worktree root: ${e2eRoot}`);
assert(!isInside(quarantineRoot, e2eRoot) && !isInside(e2eRoot, quarantineRoot),
  "Playwright testDir overlaps the quarantined sibling");

console.log(`PASS workspace root: ${worktreeRoot}`);
console.log(`PASS canonical root: ${canonicalRoot}`);
console.log(`PASS quarantine sibling: ${quarantinePath}`);
console.log(`PASS Playwright e2e root: ${e2eRoot}`);
console.log(`PASS config scope: ${configFiles.join(", ")}`);
console.log("PASS quarantine excluded from package, workspace, search, build, lint, and test roots");
