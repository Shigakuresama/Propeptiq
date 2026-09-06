# Task 4C image integration report

## Status

DONE

## Implemented

- Added the frozen six-slug front-image metadata map for `bpc-157`, `tirzepatide`, `retatrutide`, `nad-plus`, `semax`, and `selank` using the exact receipt paths, dimensions, and hashes.
- Added a pure slug resolver that returns frozen six-scene results for mapped products and the original shared frozen manifest for all unmapped and inherited object-property names.
- Preserved scene order and reused the unchanged shared scene objects at indexes 1-5.
- Routed the default `CatalogProductVisual` front and `CatalogProductGallery` scene collection through the same resolver.
- Preserved live variant labels, discounts, disclosure, captions, intrinsic dimensions, responsive sizes, Next Image optimization/preload/lazy behavior, gallery keyboard/focus/navigation, and existing CSS geometry.
- Updated unit and E2E expectations for the six mapped fronts, the other fifty shared fronts, exact delayed-image targets, BPC-157 PDP source, and Tirzepatide card-to-PDP agreement at 320/375/768/1440.
- Updated performance LCP recognition to identify either the shared front or a mapped `front-v1.webp` source behind a Next optimizer URL.

## TDD evidence

### RED

Command:

`npm test -- --run src/components/commerce/catalog-product-visual-manifest.test.ts src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/catalog-product-gallery.test.tsx`

Expected result before implementation: 3 failures, 18 passes. The manifest export/resolver was absent, and mapped BPC-157/Semax consumers still rendered `/catalog/visual-masters/front.webp`.

### GREEN

Command:

`npm test -- --run src/components/commerce/catalog-product-visual-manifest.test.ts src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/catalog-product-gallery.test.tsx src/components/commerce/catalog-item-detail.test.tsx`

Result: 4 files passed, 36 tests passed.

## Verification

- Exact asset tests: each mapped file has RIFF/WEBP signatures, the receipt output SHA-256, Sharp-reported WebP format, 1254 x 1254 dimensions, and a slug present in the canonical 56-product catalog.
- Full unit suite: 234 files passed, 3548 tests passed. Vitest emitted four pre-existing jsdom `Not implemented: navigation to another Document` notices; exit code 0.
- Lint: passed with zero warnings.
- Typecheck: passed.
- Workspace boundary: passed all root, quarantine, E2E-root, config-scope, and exclusion checks.
- `git diff --check`: passed; Git emitted only line-ending conversion notices.
- Browser, performance, and build gates were intentionally not run because the controller owns those checks.

## Files changed

- `src/components/commerce/catalog-product-visual-manifest.ts`
- `src/components/commerce/catalog-product-visual-manifest.test.ts`
- `src/components/commerce/catalog-product-visual.tsx`
- `src/components/commerce/catalog-product-gallery.tsx`
- `src/components/commerce/catalog-product-gallery.test.tsx`
- `src/components/commerce/catalog-listing-card.test.tsx`
- `tests/e2e/public-storefront.spec.ts`
- `tests/performance/public-storefront.performance.spec.ts`
- `.superpowers/sdd/2026-09-04-propeptiq-storefront-completion/task-4c-image-integration-report.md`

## Self-review and concerns

- The implementation adds no catalog/database fields, dependencies, package changes, CSS/layout changes, or runtime file fallback.
- The source does not claim photography or packaging approval; the existing AI-generated illustration disclosure remains exact.
- Root-owned assets, receipt, provenance, plan, and reference-document changes were not staged by this commit.
- Remaining evidence is the controller-owned browser/performance/build/release verification.
