# PROPEPTIQ Production Release Hotfix Plan

**Goal:** Publish the reviewed visible-storefront release without requiring an unauthorized production database migration.

**Verified incident:** Deployment `dpl_3hXporZg6UZZz6gzmJVWkoN7VfMH` for commit `989db37077867e8483484944617e0885412195dd` failed on the public homepage with PostgreSQL SQLSTATE `42P01` because the optional catalog table `product_variants` is absent. The production alias was restored to the prior healthy deployment before this hotfix.

## Global constraints

- Preserve the reviewed static catalog as presentation-only: positive prices remain `preview_only` and `checkoutReady: false`; pending rows remain unavailable for production checkout.
- Do not create, infer, or migrate database schema, inventory, Stripe mappings, or transactional prices.
- Detect the verified failure by safely reading exact SQLSTATE `42P01`; never inspect or match database error messages.
- Emit only a fixed safe diagnostic and never log the original database error.
- Re-throw every other database error and every publication, binding, catalog, or projection validation failure.
- Stage database-derived facts and commit them to the public view only after the complete database projection succeeds.
- Do not change checkout, payment, fulfillment, or database authority.
- Preserve unrelated user work and operate only in the existing integration worktree.

## Task 1: Fail safely when the optional production catalog schema is absent

**Files:**

- Modify `src/catalog/storefront-public-server.test.ts`
- Modify `src/catalog/storefront-public-server.ts`

### RED contract

Add focused tests proving:

1. A database loader rejection with own string `code: "42P01"` falls back to the reviewed configured display facts, including 56 products, 103 variants, WINTER30 display pricing, and no checkout-ready static variant.
2. The fallback reports exactly one fixed diagnostic token without exposing the original error, and reporter failure cannot take the public page down.
3. No partially projected database facts survive a `42P01` failure.
4. An unrelated SQLSTATE and a generic error still reject.

Run the focused test and retain the expected failing evidence before implementation.

### GREEN contract

Implement the smallest server-only fallback around optional database acquisition/projection. Read `error.code` without invoking getters or matching message text. On exact `42P01`, retain empty database-owned facts/promotions, report a fixed token through a guarded reporter, and continue into the existing configured display projection. Commit successfully projected database values only after the complete block succeeds. Re-run focused tests, related public route/search tests, checkout regressions, lint, typecheck, build, and workspace-boundary checks.

### Review and release

Obtain an independent task review of the exact diff. After approval, commit and push normally to `origin/main`, wait for the exact Vercel deployment, promote only that deployment, and verify the public homepage, catalog, Tirzepatide detail, site search, health endpoint, and mobile overflow. Roll back immediately if any production route fails.

## Task 2: Keep legacy public catalog readers available without the optional schema

**Files:**

- Create `src/catalog/catalog-schema-availability.ts`
- Create `src/catalog/server.test.ts`
- Modify `src/catalog/server.ts`
- Modify `src/catalog/storefront-public-server.ts`
- Modify focused existing tests only as required by the shared helper extraction

### RED contract

Add focused tests proving that `getPublicCatalog` returns the established immutable empty production catalog when its database loader rejects with exact SQLSTATE `42P01`. This keeps `/quality-records` available with its honest empty state and lets legacy catalog lookups resolve normally without inventing products, lots, COAs, prices, or promotions. Prove the reporter receives only a fixed diagnostic; async reporter rejection is contained; connection, environment, unrelated SQLSTATE, generic, inherited/accessor, Proxy, source-validation, and public-projection failures still reject unchanged.

### GREEN contract

Extract the already-reviewed safe own-data SQLSTATE recognition into one small shared catalog helper and reuse it from both public catalog loaders. Catch only the database-loader rejection inside `getPublicCatalog`; use `EMPTY_CATALOG_RECORD_SET` for the exact missing-table condition, then run the existing `buildPublicCatalog` projection. Keep connection/environment/demo/source/projection failures outside the fallback. Do not change checkout or provider behavior.

Run the new test first and retain expected RED evidence, then run both catalog server suites, quality-record and legacy-route tests, checkout regressions, lint, typecheck, build, workspace-boundary, and diff checks. Obtain an independent review before release.
