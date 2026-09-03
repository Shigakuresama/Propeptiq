# Cart identity and display-price truth — Phase 2

Status: approved for implementation under the owner's continuing storefront authorization on 2026-09-03.

## Outcome and evidence

Phase 1 made the 56-product / 103-variant public catalog and its 40 reviewed positive prices internally consistent. The next verified gap is the cart boundary: catalog and product pages add stable variant IDs, but `/api/catalog/preview` recognizes only one synthetic local-commerce fixture. Every real catalog variant therefore degrades in the cart to a raw UUID, null price, and a misleading unavailable message even though the server has already projected safe public names, labels, SKUs, price status, and active automatic promotions.

This phase connects those existing public display facts to the cart without making them inventory, checkout, or payment authority. It also makes priced preview-only variants addable for cart exploration in Production. Pending, unavailable, and unknown variants remain non-addable; every public-display-only line remains unable to continue to checkout.

## Binding authority contract

1. The browser continues to persist and submit only stable canonical `variantId` plus quantity. Repeated identical variant IDs merge; different variants remain separate; the existing limits of 25 units per line and 50 lines remain unchanged. Client names, labels, prices, discounts, promotion IDs, totals, availability, Stripe IDs, or provider facts are never authoritative.
2. Add one server-only adapter from the existing `PublicStorefrontView` to the cart preview source. It may project only already-public product name, exact variant label, SKU, package summary, price status, base unit amount, currency, current automatic promotion display metadata, and a non-transactional purchase state. It must never expose Stripe/provider mappings, customer data, tax, shipping, payment capability, or checkout permission. Public-source inventory quantity is represented as `null` (unknown), never fabricated as zero or a positive number.
3. Public-view rows are always presentation-only at this boundary, even if the view was enriched by database facts. The adapter forces them to a non-transactional state because the public DTO intentionally lacks exact inventory quantity. Only a separately authoritative source with a non-null quantity may produce `insufficient_quantity`. A future live-commerce cart source must supply separately reviewed server-authoritative inventory and mapping facts; this phase must not infer them.
4. Preserve the existing synthetic local-commerce source only behind its exact local/test capability guard. Compose it with the public display source without weakening the guard. Reject source collisions rather than letting one silently override another.
5. Reuse the existing storefront price-presentation calculation for cart lines. Do not duplicate quantity tiers, promotion scope, rounding, pending-price behavior, or discount precedence. For each exact variant line, the single effective discount remains the greater of its quantity tier and highest eligible automatic promotion; percentages never stack.
6. Positive `active` / `preview_only` variants are addable to browser cart storage in every presentation mode, including Production, but resolve to `checkout_unavailable` rather than `ready`. Pending zero-dollar variants remain addable only in local/test/explicit Preview modes and display the established `$0.00` layout preview there; Production suppresses fake price/savings/badges and uses `pricing_pending` / `Pricing coming soon`. Unavailable and unknown variants remain non-addable.
7. Cart preview items carry an explicit purchase state rather than overloading one availability boolean. Supported states are the existing `ready`, `checkout_unavailable`, `local_preview`, `pricing_pending`, and `unavailable`, plus `insufficient_quantity` and `unknown_variant` where those conditions are proven. The compatibility `available` field is true only for `ready` and cannot independently grant continuation.
8. Recognized priced lines include exact product name, variant label, SKU, package summary, base unit amount, effective unit amount, quantity, line subtotal, line savings, effective discount basis points, applied promotion IDs and public display labels, and currency. For canonical public rows, `variantLabel` is the exact `PublicStorefrontVariant.label`; `packageForm` is derived only as `${packageQuantity} bottle` or `${packageQuantity} bottles`. It must not join to `displayConfigurations`, parse labels, rely on array position, or import browse codes. Pending source amounts are nullable: Production skips arithmetic and returns null display money for every pending amount; local/test/Preview calculates a zero-dollar layout preview only when the reviewed pending amount is exactly zero. A null pending amount stays unpriced in every mode. Monetary values remain safe non-negative integer minor units.
9. The preview token commits to quantity and every customer-visible or continuation-relevant server fact: identity labels, status, availability, base/effective amounts, subtotal, savings, discount, applied promotions, and currency. A quantity or promotion change must change the token even when the effective unit price happens to remain equal. Builder and parser share one client-safe canonical SHA-256 helper with explicit field ordering; the parser recomputes it from validated items and rejects mismatch. Equivalent JSON key ordering must remain valid. This is display integrity/change detection, not authentication or checkout authority.
10. The cart uses honest copy per line: `Checkout unavailable` for reviewed positive display prices without transactional authority, `Pricing coming soon` for pending prices, `Insufficient quantity` only from an authoritative source with a known count, `Unavailable` for an explicitly unavailable record, and `Unknown product variant` for an unrecognized ID. Preview-only is never described as sold out or “no longer available.”
11. The cart shows standard and sale unit prices, savings, discount percentage, line subtotal, and applied promotion label when present. It states that merchandise discounts are already included in the displayed preview; it does not say the displayed promotion is still calculated at checkout. It clearly labels the cart as a non-payable preview when any display-only line exists.
12. `canContinueFromPreview` remains false for every display-only, pending, unavailable, insufficient, or unknown line. The expanded cart response is an exact `schemaVersion: 2` display DTO and its session-storage envelope also uses version 2; legacy or malformed snapshots are discarded. `SafeCartPreview` and the checkout `PRICE_CHANGED` DTO remain separate and unchanged. There is no projector from a display preview to a safe checkout preview. Checkout quote/session endpoints continue to accept only IDs/quantities, independently reload server-authoritative database facts, and reject missing/zero price, inventory, mapping, destination, capability, or stale totals. No Stripe, database schema, provider, tax, shipping, fulfillment, newsletter, content, or deployment capability is enabled in this phase.

## Failure contract

- Invalid JSON or a non-object request (including arrays) returns status 400 with the existing fixed `invalid_request` response and `Cache-Control: no-store`.
- A PostgreSQL missing-table condition already recognized by `getPublicStorefrontView` resolves through that accessor's reviewed static fallback and produces a normal version-2 preview; the route does not duplicate SQLSTATE handling.
- A typed public-source projection failure, including duplicate/colliding variant IDs or malformed trusted-view invariants, returns status 503 with exactly `{ "error": "cart_preview_unavailable", "message": "The cart preview is temporarily unavailable." }` and `Cache-Control: no-store`.
- An unexpected public-view loader failure returns the same fixed 503 response. It must not fall back to an identity-empty 200 response, echo exception text/SQL/provider details, or call checkout/provider code.
- Successful previews return status 200 and `Cache-Control: no-store`.

## Accessibility and interaction contract

- Quantity controls retain their existing keyboard and touch behavior and announce updated cart totals through the current live status pattern.
- Product, variant, status, price, savings, promotion, and subtotal relationships remain readable without relying on color.
- Each line has one clear exact-variant label; screen-reader text does not fall back to a UUID after a successful server preview.
- Loading, retry, empty, changed-facts, and unavailable states remain visible and understandable.
- No new animation or dependency is added; existing reduced-motion and mobile layout rules remain authoritative.

## Acceptance

- All 103 canonical variants project exactly once from the public view with no collisions, provider mappings, or inventory authority; coverage is tested in batches of at most 50 cart lines.
- The 40 reviewed positive variants show card/PDP-equal standard and effective prices; the 63 pending variants show local/test/Preview `$0.00` layout previews but Production `Pricing coming soon` with no fake savings or promotion badge.
- Tirzepatide 30 mg added twice merges to one quantity-2 line; Tirzepatide 60 mg remains a separate quantity-1 line. Under WINTER30 those lines show the same 30% non-stacking prices and subtotals as the product controls.
- Quantities 1, 2, 3, 4, 9, 10, and 11 prove 0%, 8%, 10%, and 30% tiers with and without WINTER30. Overlapping promotions select only the single highest eligible percentage.
- Quantity-only changes and promotion changes alter the preview token; malformed presentation storage and tampered client facts fail closed.
- Preview, Production, local synthetic, unknown-ID, pending-zero, pending-null, unavailable, authoritative insufficient-quantity, inventory-unknown, source-collision, missing-schema fallback, typed projection failure, and unexpected-loader-failure paths have focused tests with the exact status/body/cache contract above.
- Display DTO version 2 and unchanged checkout-safe DTO boundaries are covered directly; no display-only state can be converted into a quote/session or satisfy checkout continuation.
- Browser coverage verifies name/variant/SKU, same-variant merge, different-variant separation, prices/savings/subtotals/promotion, disabled continuation, no provider/checkout request, keyboard controls, 320/375/768/1440 layouts, and no horizontal overflow.
- Focused checkout regressions prove a cart display preview cannot create a quote/session or bypass provider capability checks.

## Scope after this phase

Header/product-page visual refinement, complete approved homepage/product content, related-product population, newsletter provider activation, legal routes/copy, production catalog migrations, inventory, Stripe mappings, tax/shipping/fulfillment readiness, and live payments remain later reviewed phases. This phase does not claim those items complete.
