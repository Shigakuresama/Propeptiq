# Catalog metadata and price-label truth implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct variant/price associations and remove inferred catalog metadata without changing established prices or payment safety.

**Architecture:** Preserve the Next App Router server/public DTO boundary. Extend the existing code-backed catalog decision manifest with explicit numeric amounts; allow unknown merchandising metadata in the binding/public types. Keep `selectCardVariant` as the single pure selection authority used by catalog cards and discovery sorting. Reuse current React components and Vitest/Playwright harnesses.

**Tech Stack:** Existing Next 16.3.2, React 19, TypeScript, Zod, Tailwind, Vitest/Testing Library, Playwright. No additions.

**Spec:** [Approved Phase 1 contract](../specs/2026-09-03-catalog-price-truth.md).

**Baseline:** `3571d7eeebe7ed66d3121e98c14b77998c2be80e`; isolated worktree `propeptiq-main-integration`; implementation branch `fix/propeptiq-catalog-price-truth`. Fresh baseline `npm test`: 213 files / 2,969 tests, exit 0. Ordinary sibling has unrelated `.env.example` and `.codex-evidence/` changes and must remain untouched.

## Global constraints

- Read repository instructions and relevant installed Next documentation before code edits.
- Use `apply_patch`, test-first focused RED/GREEN, one implementation worker at a time, independent spec and quality review, then scoped fix/review loops.
- Preserve all IDs, SKUs, base prices, source timestamps/URLs, 56/103 coverage, 40 positive / 63 pending split, one-bottle package quantities, and the owner browse fingerprint.
- Do not read or print credential values, create provider objects, apply migrations, enable commerce/newsletter/calculator gates, or alter unrelated UI/content in these tasks.
- Implementer owns only its listed paths; stop and report a necessary extra path before editing it. No subagents inside implementers. Commit only owned changes after checks. Root owns this plan/spec and the SDD ledger.
- Review actual behavior, not only source-text assertions. Test fixtures stay in test code and are clearly synthetic.

### Task 1: Explicit amount metadata and unknown rank/release values

**Files:**

- Modify: `src/catalog/storefront-catalog-manifest.ts` and `.test.ts`
- Modify: `src/catalog/storefront-catalog-data.ts` and `.test.ts`
- Modify: `src/catalog/storefront-types.ts`
- Modify: `src/catalog/storefront-bindings.ts` and `.test.ts`
- Modify: `src/catalog/storefront-public.ts` and `.test.ts`
- Modify: `src/search/storefront-index.ts` and `.test.ts`
- Modify tests if needed: `src/search/catalog-discovery.test.ts`, `src/search/storefront-search.test.ts`
- Modify tests: `src/app/api/storefront-search/route.test.ts`, `src/components/commerce/catalog-explorer.test.tsx`

**Implementation contract:** Add a typed frozen explicit amount table to the existing decision manifest, keyed by exact slug/code. Project `amount` on each decision row, reject incomplete/duplicate/unknown coverage, and consume it directly from catalog-data. Preserve the owner browse source. Change canonical/binding/public rank and release types to nullable and narrowly update validators. Production-shaped records initialize both to null, without changing explicit default-variant results. Search core already has nullable sort fields; retain that algorithm.

- [ ] Add focused failing tests: exact known values (`TR30` -> `{ value: 30, unit: 'mg' }`, `NJ500` -> 500 mg, `G5K` -> 5000 iu), composite GLOW and mL-only values null; full identity/price/amount baseline preservation; explicit null merchandising metadata accepted through public/search projection; invalid non-null metadata rejected.
- [ ] Run the affected focused tests and record the specific RED assertions before implementation. Example behavioral expectations:

```ts
expect(tr30.amount).toEqual({ value: 30, unit: 'mg' });
expect(glow.amount).toBeNull();
expect(catalog.products.every(p => p.popularityRank === null && p.releasedAt === null)).toBe(true);
```

- [ ] Implement only the manifest/projection/type/validator changes. No parsing fallback, zero-to-active change, provider IDs, or reordered browse data.
- [ ] Run focused catalog/index/search tests; run `npm run lint`, `npm run typecheck`, `npm run verify:workspace-boundary`, `git diff --check`, then full `npm test` once before committing.
- [ ] Self-review the exact diff and unchanged identity/pricing evidence; commit `fix(catalog): make amount and merchandising metadata explicit`; write the task report with exact checks and residual concerns.

### Task 2: One selected variant for card labels, prices, and sorting

**Files:**

- Modify: `src/catalog/storefront-price-presentation.ts` and `.test.ts`
- Modify: `src/components/commerce/catalog-listing-card.tsx` and `.test.tsx`
- Modify: `src/search/catalog-discovery.test.ts`
- Modify only if behavior requires it: `src/search/catalog-discovery.ts`, `src/components/commerce/catalog-explorer.test.tsx`

**Implementation contract:** Follow spec selection precedence exactly. Reuse `summarizePublicStorefrontVariants` with the selected variant only (or a narrowly equivalent shared helper). Show selected amount/label and actual package count. Existing discovery already calls `selectCardVariant`; avoid duplicate logic. Preserve ADD selection, availability, and price calculations.

- [ ] Add failing pure tests proving a valid explicit default wins even when another positive variant is cheaper. Add fallback/tie, unavailable default, pending/default-zero, missing default, scope-specific promotion, and no-mutation cases.
- [ ] Add component regressions for the three actual catalog mismatches using existing pure projection seams and controlled pricing context. Assert exact displayed amount, base/effective price, badge, and that multi-variant ADD opens a chooser without adding implicitly.
- [ ] Record RED. Expected real-price example: base 5999 and 30% produces effective unit 4199, not a 5 mg caption.
- [ ] Implement the minimal shared selector/card changes. Add sort tests proving a higher-priced explicit default determines the row price and query/sort state remains stable.
- [ ] Run focused price/card/discovery/explorer tests, lint, typecheck, workspace boundary, diff check, and full unit before commit.
- [ ] Commit `fix(storefront): align card labels with selected variant prices`; write report; await controller review before dependent work.

### Task 3: Browser proof and owner guidance

**Files:**

- Modify: `tests/e2e/public-storefront.spec.ts`
- Modify: `docs/runbooks/storefront-configuration.md`
- Modify: `docs/propeptiq-storefront-refactor-contract.md` (only the amount/nullable-metadata/card-selection contract)

**Implementation contract:** Use the existing local browser harness with no production/provider calls or extra fixture routes. Verify the actual configured reference-price catalog in its existing publication context. If the existing harness cannot expose this context, report the exact dependency rather than adding an unreviewed production seam. Preserve unique test source locations required by the repository's browser runner.

- [ ] Add focused browser assertions for Tirzepatide 30 mg / $59.99 / $41.99, Retatrutide 10 mg / $69.99 / $48.99, and NAD+ 500 mg / $69.99 / $48.99 on 375 and 1440 CSS pixel viewports. Include one-bottle text, no overflow, reserved image geometry, keyboard chooser/focus, and pending-price behavior.
- [ ] Update only relevant owner-guide statements: explicit amount edit point, nullable unknown rank/release fields, explicit-default-first card rule, 40/63 coverage, one-bottle reference-price versus live checkout distinction. Do not claim newsletter, content, stock, or Stripe readiness.
- [ ] Run focused Chromium checks with the existing Playwright configuration, full unit, lint/typecheck/workspace boundary and diff check. Record exact results; do not claim native/browser behavior from jsdom.
- [ ] Commit `test(storefront): verify catalog price labels and document metadata`; write report.

## Phase 1 release gate

- [ ] Independent final whole-diff review, including root-cause and client/server boundaries; resolve actionable findings with tests.
- [ ] Re-run fresh full unit, relevant PGlite catalog integration, full public-storefront browser suite, lint, generated types/typecheck, workspace boundary, production build and production-artifact scanner against the unchanged candidate. No external PostgreSQL lane without the exact isolated test guards.
- [ ] Open a narrowly scoped PR with exact evidence, review it, merge under the owner's standing authorization, and verify the deployed catalog after publishing through the existing release workflow.
- [ ] Handoff Phase 1 evidence and remaining wider-plan work. Do not mark the full storefront goal complete merely because this phase passes.
