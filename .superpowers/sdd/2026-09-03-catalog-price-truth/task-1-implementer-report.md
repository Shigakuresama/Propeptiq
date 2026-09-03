# Task 1 implementation report: explicit catalog amount and merchandising metadata

## Revision and scope

- Base verified before edits: `5bdc52f4afcbd151a1b7aa554263fadccbf0d90f` on `fix/propeptiq-catalog-price-truth`.
- Head: `HEAD`, the scoped Task 1 commit containing this report (`fix(catalog): make amount and merchandising metadata explicit`).
- Production ownership used: `src/catalog/storefront-types.ts`, `src/catalog/storefront-bindings.ts`, `src/catalog/storefront-catalog-manifest.ts`, `src/catalog/storefront-catalog-data.ts`, `src/catalog/storefront-public.ts`, and `src/search/storefront-index.ts`.
- Test ownership used: the named tests for those six modules, plus `src/app/api/storefront-search/route.test.ts` and `src/components/commerce/catalog-explorer.test.tsx`.
- No card selector/component, browse source/publication manifest, provider/payment/cart/checkout/auth/database, dependency/configuration, or owner-document edits were made.

## Delivered behavior

- The decision manifest now contains a deeply frozen, typed 103-row literal amount decision table, keyed by exact browse slug/code. It is complete, duplicate-free, rejects unknown keys, and accepts only positive `mg`, `mcg`, or `iu` values (or explicit `null`).
- Canonical data consumes `decision.amount` directly. The former label parser is removed. Known examples are TR30 = 30 mg, NJ500 = 500 mg, and G5K = 5000 iu; composite GLOW/KLOW/Tesmorelin+IPA and mL-only rows are null.
- Production-shaped products now set `popularityRank` and `releasedAt` to explicit null. Binding/public types preserve those values; binding validation still rejects zero/invalid rank and malformed non-null timestamp values. The search-index boundary accepts null while retaining its established scorer/sort fallback.
- The route factory returns 200 with the actual 56-product catalog and null ranks, and CatalogExplorer renders the same actual 56 products with null merchandising values.

## TDD evidence

RED was run before production edits:

```text
npm test -- src/catalog/storefront-catalog-manifest.test.ts src/catalog/storefront-catalog-data.test.ts src/catalog/storefront-bindings.test.ts src/search/storefront-index.test.ts
```

It produced five expected behavioral failures: missing `decision.amount`, ignored incomplete amount coverage, non-null production metadata, null binding metadata rejection, and null canonical index metadata rejection.

GREEN focused command:

```text
npm test -- src/catalog/storefront-catalog-manifest.test.ts src/catalog/storefront-catalog-data.test.ts src/catalog/storefront-bindings.test.ts src/catalog/storefront-public.test.ts src/search/storefront-index.test.ts src/search/catalog-discovery.test.ts src/search/storefront-search.test.ts src/app/api/storefront-search/route.test.ts src/components/commerce/catalog-explorer.test.tsx
```

Final result: 9 files, 212 tests passed.

## Preservation evidence and checks

- `storefront-catalog-manifest.test.ts` continues to prove exact browse order, 56 products/103 variants, stable UUIDv5 IDs and SKUs, original public labels, package quantity one, 40 reviewed positive price rows, 63 zero-dollar pending rows, and all original evidence URL/timestamp values.
- The focused result above also proves current default-variant behavior, full public projection, discovery/search fallback behavior, actual route 200, and the real CatalogExplorer load.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run verify:workspace-boundary`: passed.
- `git diff --check`: passed.
- Final `npm test`: exited successfully. The runner emitted `Not implemented: navigation to another Document` without a failing test summary; this pre-existing jsdom diagnostic should be investigated separately if a clean full-run transcript is required.

## Self-review and residual concerns

The reviewed diff is limited to the approved Task 1 modules/tests/report. No runtime parses display labels for amount, no pricing, default IDs, identity/SKU, evidence, package quantity, availability, Stripe mapping, or activation behavior changed. Provider, production, real PostgreSQL, integration, browser/e2e, and build/artifact lanes were intentionally not run because they are outside this task's requested verification scope.
