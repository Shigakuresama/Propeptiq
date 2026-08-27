# Task 0 Consolidation and Workspace Boundary Record

**Recorded:** 2026-08-24
**Canonical repository:** `C:\Users\Sergio\Documents\Peptides\propeptiq-labs-app`
**Active implementation worktree:** `C:\Users\Sergio\Documents\Peptides\propeptiq-labs-app\.worktrees\propeptiq-lightweight-commerce`

## Operational facts

- Canonical branch `feat/propeptiq-platform` was clean at the accepted checkpoint `2fd7d474e3a173167b55001dd85a62401d1c0cb8`; it remains preserved and is not overwritten.
- Setup commit `acc5515` adds only `/.worktrees/` to `.gitignore`. The isolated implementation branch is `feat/propeptiq-lightweight-commerce`, created from that accepted canonical line; plan commit `5334a0c` is its current baseline.
- The duplicate task **Build PROPEPTIQ LABS website** (`01a03618-4ad5-7080-9cd7-65d242c2826b`) was stopped and archived after its useful research was absorbed. **PROPEPTIQ canonical baseline checkpoint** (`01a0362a-4358-7c12-ab77-fb2d4382b35c`) is the retained owner; no second implementation owner remains active.
- The quarantined scaffold is at `C:\Users\Sergio\Documents\Peptides\_agent-quarantine\propeptiq-labs-site`. It is non-authoritative, is not a Git repository, and is outside the canonical app root.

## Boundary evidence

The canonical app root contains the only `package.json`; it has no workspace aggregation. The focused validator `scripts/verify-workspace-boundary.mjs`, exposed as `npm run verify:workspace-boundary`, proves on every run that:

- the resolved quarantine path is a sibling outside the canonical app root, so repository search, package discovery, build, lint, and test roots cannot traverse into it;
- `package.json`, lockfile, workspace files, Vitest, ESLint, Next, and TypeScript configuration contain no quarantine marker; and
- the validator itself runs from the resolved Git worktree root and reports the exact paths/config files checked.

Run the focused boundary proof with:

```text
npm run verify:workspace-boundary
```

The command is also the first step of the normal `npm run verify` path because it is fast, deterministic, and read-only.
