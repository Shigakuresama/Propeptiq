# Task 20B — Homepage, catalog and footer language report

## Outcome

Implemented the owner-supplied Task 20B customer-facing language on `feat/storefront-customer-language` from exact base `632ec89cd06b5e7303ac852fe4fee9cf19064a0c`. The change is copy-only: it does not enable checkout, pricing, inventory, payment/provider, or any other commerce capability.

## Before and after

- Homepage: replaced owner/publication/snapshot language with the exact shared storefront introduction, `Explore the collection` badge, canonical and browse-only supporting sentences, customer-facing highlights title/description, `Product configuration`, the exact Research-Use Policy selection sentence, and the amended closing CTA sentence.
- Catalog: replaced owner-supplied publication wording with `Research catalog`, `Explore the collection.`, exact count/configuration language for canonical and browse-only modes, exact illustration disclosure, customer-facing empty state, and neutral route metadata.
- Product detail: replaced canonical/browse-only eyebrow branching with `Product details`, renamed the configurations heading to `Product configurations`, changed distinct source-name labels to `Also listed as`, and retained browse-only no-ordering behavior with the exact sentence.
- Footer: replaced the owner-record/server-authority paragraph with the exact selection-oriented customer sentence while preserving research restrictions, links, social placeholders, and newsletter unavailable behavior.
- Cart: replaced route metadata and intro with `Shopping cart`, `Your cart`, and the exact order-summary description; replaced only the empty-cart explanation. Cart identity, preview, checkout-disabled, and legacy-cart behavior are unchanged.
- Listing card: replaced only the disabled reason with `This product is currently unavailable.` The disabled condition is unchanged.
- Generated product content: replaced only display templates for description, `Product details`, comparison body, and the PubMed opening sentence. Stable IDs, source URLs, approval metadata, and the remainder of the PubMed qualification are unchanged.
- FAQ: changed only the five neutral question/answer surfaces in the brief. Stable IDs, source references, approval metadata, quantity-discount answers, cart-combination answer, and research-use answer remain unchanged.

## Files changed

Production:

- `src/app/(public)/cart/page.tsx`
- `src/app/(public)/catalog/page.tsx`
- `src/components/commerce/cart-view.tsx`
- `src/components/commerce/catalog-item-detail.tsx`
- `src/components/commerce/catalog-listing-card.tsx`
- `src/components/site/public-home.tsx`
- `src/components/site/site-footer.tsx`
- `src/content/storefront-content.ts`
- `src/content/storefront-product-content.ts`

Direct tests:

- `src/app/(public)/cart/page.test.tsx` (new)
- `src/app/(public)/catalog/page.test.tsx`
- `src/components/commerce/cart-view.test.tsx`
- `src/components/commerce/catalog-item-detail.test.tsx`
- `src/components/commerce/catalog-listing-card.test.tsx`
- `src/components/site/public-home.test.tsx`
- `src/components/site/public-semantics.test.tsx`
- `src/components/site/public-shell.test.tsx`
- `src/components/site/site-footer.test.tsx`
- `src/content/storefront-content.test.ts`
- `src/content/storefront-product-content.test.ts`

Exact-copy E2E dependencies:

- `tests/e2e/public-storefront.spec.ts`
- `tests/e2e/narrow-product-layout.spec.ts`

## RED / GREEN evidence

Initial focused RED command:

`npm test -- --run src/components/site/public-home.test.tsx src/components/site/site-footer.test.tsx src/app/(public)/catalog/page.test.tsx src/components/commerce/catalog-item-detail.test.tsx src/content/storefront-content.test.ts src/components/commerce/cart-view.test.tsx src/components/commerce/catalog-listing-card.test.tsx src/content/storefront-product-content.test.ts src/app/(public)/cart/page.test.tsx`

Result: expected failure, 19 copy-contract failures and 108 passes across 127 tests. Failures showed the old owned wording; no setup error caused the RED state.

Direct-dependency RED command:

`npm test -- --run src/components/site/public-shell.test.tsx src/components/site/public-semantics.test.tsx`

Result: expected failure, 4 stale exact-copy assertions and 4 passes.

Amended closing-CTA RED command:

`npm test -- --run src/components/site/public-home.test.tsx`

Result: expected failure for the newly required exact CTA sentence; 3 unaffected tests passed.

Focused GREEN command:

`npm test -- --run src/components/site/public-home.test.tsx src/components/site/site-footer.test.tsx src/components/site/public-shell.test.tsx src/components/site/public-semantics.test.tsx src/app/(public)/catalog/page.test.tsx src/components/commerce/catalog-item-detail.test.tsx src/content/storefront-content.test.ts src/components/commerce/cart-view.test.tsx src/components/commerce/catalog-listing-card.test.tsx src/content/storefront-product-content.test.ts src/app/(public)/cart/page.test.tsx`

Result before the final single stale-fixture correction: 134 passed and one assertion mismatch. After correcting that expected branch, the same focused command passed 11 files and all 135 tests.

## Final checks

- Full unit suite, run once as required: `npm test` — PASS, 234 files and 3,544 tests, including the final closing CTA amendment and stale exact-copy test updates.
- Lint: `npm run lint` — PASS, exit 0.
- Typecheck: `npm run typecheck` — PASS, exit 0.
- Workspace boundary: `npm run verify:workspace-boundary` — PASS, exit 0 with the intended worktree and quarantine boundaries.
- Diff hygiene: `git diff --check` — PASS; only Git line-ending notices were emitted.
- No integration, build, browser, provider, environment, schema, dependency, media, or live-system command was run from this task.

The existing FAQ structured-data test remains part of the full unit pass and proves rendered FAQ content and JSON-LD derive from the same central projection. Existing search/content projection tests also remained green in the full unit pass.

## Browser coordination: exact affected E2E names

`tests/e2e/public-storefront.spec.ts`:

- `fixed mobile search stays compact and clear of product identity and purchase headings`
- `catalog product hierarchy keeps purchase first and cards content-sized`
- `anonymous canonical local/test cart survives reload and preserves only variant IDs and quantities`
- `navigation, homepage trust content, product research, and related records are visibly complete`
- `JavaScript disabled keeps essential public sections visible and navigable`

`tests/e2e/narrow-product-layout.spec.ts` (all use the shared exact configurations-heading helper):

- `narrow product layout contains real and long titles at 195px`
- `narrow product layout contains real and long titles at 240px`
- `narrow product layout contains real and long titles at 320px and keeps cart explicit`
- `narrow product layout preserves no-JavaScript content at 195px`
- `narrow product layout preserves no-JavaScript content at 320px`

## Remaining wording inventory and concerns

- `owner-supplied-records` remains only as a stable controlled-content ID and was intentionally not renamed.
- Snapshot terminology remains only in private implementation identifiers used to safely clone/freeze content; it is not customer-facing.
- `Catalog record unavailable.` remains on the separate not-found route outside Task 20B ownership and was not changed.
- One negative canonical-content test still asserts that the former browse-only eyebrow is absent; this is test-only and protects the no-browse-label canonical branch.
- The unchanged homepage `Research-use catalog` label, `Current catalog` data label, final CTA heading/link, content-record approval note, and FAQ IDs are intentionally preserved because the brief did not replace them.
- No additional directly related customer-facing wording outside the enumerated brief/amendment was changed.
- Concern for release verification: browser/build evidence is intentionally delegated to the root release lane; the exact E2E dependencies above must be included there.
