# Task 20A — Customer-facing cart language report

## Outcome

Implemented the bounded customer-language contract without changing cart authorization, persistence, merge behavior, acknowledgement tokens, checkout guards, schemas, endpoint paths, configuration, or provider behavior.

## TDD evidence

### RED

Command:

`npm test -- --run src/components/commerce/add-to-cart-button.test.tsx src/catalog/storefront-price-presentation.test.ts src/components/commerce/cart-drawer.test.tsx`

Result: expected failure, 8 failed and 95 passed across 103 tests. Failures were exactly the new add-button, central purchase-label, drawer summary/button/loading/error expectations against the old rendered wording.

### GREEN focused

Command:

`npm test -- --run src/components/commerce/add-to-cart-button.test.tsx src/catalog/storefront-price-presentation.test.ts src/components/commerce/cart-drawer.test.tsx src/components/commerce/cart-view.test.tsx src/components/account/checkout-cart-status.test.tsx src/app/checkout/page.test.tsx src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/quick-add-variant-sheet.test.tsx src/components/commerce/related-products-composition.test.tsx src/components/commerce/product-purchase-panel.test.tsx src/components/commerce/product-price.test.tsx src/components/commerce/catalog-explorer.test.tsx src/components/commerce/mobile-purchase-bar.test.tsx`

Result: 13 files passed, 281 tests passed.

## Full verification

- `npm test`: 233 files passed, 3541 tests passed.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run verify:workspace-boundary`: passed all root, quarantine, Playwright-root, configuration-scope, and exclusion checks.
- `git diff --check`: passed; Git emitted only existing line-ending conversion notices.
- Browser tests/build/provider/lab/deploy: intentionally not run, per task coordination.

## Files changed

Implementation:

- `src/components/commerce/cart-view.tsx`
- `src/components/commerce/cart-drawer.tsx`
- `src/components/commerce/add-to-cart-button.tsx`
- `src/catalog/storefront-price-presentation.ts`
- `src/components/account/checkout-cart-status.tsx`
- `src/app/checkout/page.tsx`

Exact-copy unit assertions:

- `src/components/commerce/add-to-cart-button.test.tsx`
- `src/components/commerce/cart-drawer.test.tsx`
- `src/components/commerce/cart-view.test.tsx`
- `src/catalog/storefront-price-presentation.test.ts`
- `src/components/account/checkout-cart-status.test.tsx`
- `src/app/checkout/page.test.tsx`
- Direct consumer tests under `src/components/commerce/` for listing cards, quick-add, related products, purchase panels, prices, explorer, and mobile purchase bar.

Exact accessible-label E2E dependencies (assertions only; not run):

- `tests/e2e/cart-drawer.spec.ts`
- `tests/e2e/legacy-cart-persistence.spec.ts`
- `tests/e2e/mobile-purchase-bar.spec.ts`
- `tests/e2e/narrow-product-layout.spec.ts`
- `tests/e2e/public-storefront.spec.ts`

## Customer copy before → after

- Add preview actions → visible `Add to cart`, accessible `Add ${productName} to cart`.
- `Cart preview` → `Order summary`.
- `Server preview` → `Your selection`.
- `Merchandise preview subtotal` → `Subtotal`.
- Display-price preview heading/body → `Checkout is currently unavailable` and `You can add items and adjust quantities. Orders and payments cannot be submitted yet.`
- Drawer chunk loading → `Loading cart…`, accessible `Loading cart`.
- In-cart refresh → `Updating cart`.
- Cart update error → `Your cart could not be updated. Please try again.`
- Drawer load error → `Your cart could not be loaded. Close this panel or open your cart to try again.`
- Changed facts → `Your cart has changed`; `Prices or availability have changed. Review your items before continuing.`; action `Confirm cart updates`.
- Disabled drawer action → `Checkout unavailable` while retaining disabled and aria-disabled state.
- Summary prose → `Merchandise discounts are included. Shipping and tax are not yet calculated. Checkout is currently unavailable.` on unavailable paths; the enabled continuation branch instead truthfully says shipping and tax are calculated during checkout.
- `cart_preview` label → `Checkout unavailable`.
- `local_preview` label → `Test mode — no payments`.
- Checkout Preview notice → `Checkout is currently unavailable`; `This environment cannot accept orders or payments. You can review the synthetic catalog and your saved cart.`

## Remaining wording inventory

No obsolete customer-facing preview phrases remain in the six owned implementation modules. Internal identifiers, type names, endpoint paths, parser errors, and state values containing `preview` remain intentionally unchanged. `checkout-form.tsx` still contains server-preview wording, but it is outside Task 20A ownership and was not changed. Homepage/catalog/footer language remains Task 20B scope.

## Self-review

- Confirmed every enabled add action shares the required visible and accessible text; unavailable reasons and guards remain unchanged.
- Confirmed checkout buttons remain disabled wherever they were previously disabled; no order-success or payment behavior was added.
- Confirmed the changed-facts acknowledgement still stores the same preview token and gates the existing handoff.
- Confirmed central state calculation is unchanged; only its customer label projection changed.
- Confirmed root-owned plan changes were not edited or included by this task.

## Browser copy fix round 1

### RED evidence

The release browser run on base `d566c691456cd02dd7e5cada08e452d03460ab38` recorded one stale copy assertion in `.superpowers/artifacts/release-gates/pr29-browser-d566c69/stdout.log`: `tests/e2e/cart-drawer.spec.ts:88` still searched for `final shipping, tax, and payment are not available`. Batch result: 1 failed, 2 passed. The preserved failure artifacts remain under `test-results/run-NfSSZx/batch-01`.

### Fix and inventory

Updated only that E2E assertion to require the exact current disabled-checkout disclosure: `Merchandise discounts are included. Shipping and tax are not yet calculated. Checkout is currently unavailable.` A repository-wide Task 20A E2E wording search found no other stale preview-cart, local-preview, display-preview, server-preview, coming-soon checkout, or old drawer-disclosure expectations.

### GREEN evidence

Command:

`npx playwright test tests/e2e/cart-drawer.spec.ts --output .superpowers/artifacts/release-gates/pr29-copy-fix/playwright-output --reporter=list`

Result: 3 passed in 17.7 seconds using one Chromium worker. The run covered configured cart merge/persistence and no-payment traffic, keyboard/dismissal/mobile/reduced-motion/no-JavaScript behavior, and failure retry/stale-response/short-phone/removal-focus behavior.
