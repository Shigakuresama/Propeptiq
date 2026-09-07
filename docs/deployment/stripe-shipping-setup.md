# Stripe sandbox catalog and USPS checkout wiring

Verified 2026-09-07 against Stripe sandbox account `acct_1U9t8NR4u3cqLvC0` using private Vercel Preview build jobs. The Stripe API key remained inside Vercel. Database and webhook secrets were saved as Sensitive branch-scoped Preview variables, never committed.

## Completed Stripe resources

- 103 variant products, all with publicly reachable existing catalog illustrations.
- 40 one-time USD prices from `approvedStorefrontCatalogPriceDecisions`.
- 63 unpriced variants remain inactive; no zero-dollar substitute prices.
- Coupon definitions: `ppq_winter30_v1` (30%), `ppq_bulk_2_v1` (3%), `ppq_bulk_4_v1` (6%), `ppq_bulk_11_v1` (30%).
- Full nonsecret mapping evidence: `stripe-sandbox-catalog.json`.

The application already calculates automatic campaign and quantity discounts sequentially, per variant/package bottle count. The campaign's 30% discount followed by the largest quantity tier's 30% discount yields 51% total savings before cent rounding. Stripe Checkout receives the server's net amounts; do not attach these mirrored coupons again or create a customer-entered promotion code. Coupons alone cannot enforce the application's quantity rules.

## Shipping

Origin 92647, United States (50 states and DC) only. Ground Advantage is free when net merchandise after discounts/rewards exceeds 20,000 cents. Exactly $200 remains paid. Priority Mail is always a paid upgrade. The selector is rendered only for the USPS adapter.

`SHIPPING_PROVIDER=usps` selects the carrier adapter. `USPS_CLIENT_ID` and `USPS_CLIENT_SECRET` supply independent USPS OAuth credentials. Preview uses the USPS test endpoint; production uses its production endpoint. Paid rates request published RETAIL postage, without an invented commercial account or negotiated discount. No postage or labels are purchased by the quote operation.

Packing is an owner-authorized estimate, not measured supplier data. Small vials use a 32 x 55 mm protected slot and 10 g gross vial allowance; 10 mL vials use 48 x 85 mm and 35 g. Add carton/bubble allowances of 100/150/200 g for 1-4/5-10/11-20 vials, plus outer cushioning and wall dimensions. No insulation. The app uses authoritative package quantities; current sale variants have one vial each despite ten-vial source descriptions. Unknown variants and shipments exceeding 20 physical vials fail closed. Validate packed samples before buying labels.

## Isolated database and webhook

- Neon project `holy-water-30479318`, existing task branch `br-patient-morning-au838cso`, new empty database `propeptiq_stripe_sandbox`. The branch's inherited `neondb` is not the sandbox target. No production/customer rows were copied to the new database.
- Applied all 33 migrations (0000-0032) atomically to the verified empty database and recorded the migration hashes in `drizzle.__drizzle_migrations`.
- Imported 56 draft products, 103 inactive variants and 40 approved prices; bound all 103 Stripe product IDs and 40 price IDs. The 63 pending variants have no price rows or Stripe price IDs. Inventory and orders remain empty; no supplier, stock, COA or eligibility evidence was invented.
- Persisted and read back the canonical automatic `winter30` campaign (3000 basis points). Quantity tiers remain authoritative in `src/domain/storefront-pricing.ts`; mirrored Stripe coupons must not be applied a second time.
- Webhook `we_1UDBSaR4u3cqLvC03TfqTEQ2`, API version `2026-07-29.dahlia`, receives 15 supported checkout/refund/dispute/invoice/credit-note event types at the branch alias's `/api/webhooks/stripe` route. The URL includes a confidential Vercel automation bypass parameter; do not log or publish the full URL.
- Two real Stripe sandbox `product.updated` probes reached the deployed application and were persisted with `status=processed`, `livemode=false`: `evt_1UDBVxR4u3cqLvC06sjGZ9B9` and `evt_1UDBWtR4u3cqLvC05n6hd24J`. These validate signed ingress and database persistence, not order settlement. The temporary product event subscription was removed afterward.
- Preview health returned 200; an invalid webhook signature returned 400 `invalid_delivery`. Deployment `dpl_EMtWxLoNQFpXDdEM2a9foA6fycGK` was READY for commit `be6d7ba`.
- An unexpected Vercel CLI debug path printed the automation bypass token during a failed curl invocation. It was revoked and regenerated immediately; the webhook URL was updated and successful delivery reverified. Consumers holding a manually copied old bypass token need the replacement. Use direct HTTP with an in-memory header and sanitized output, not CLI debug mode.

Reproduce database readback with `npx tsx scripts/stripe-sandbox/verify-database.ts`, passing the branch's direct verified-TLS connection as `TEST_DATABASE_URL`. Bootstrap is intentionally empty-only and must not be rerun against populated databases. Binding and promotion configuration are idempotent and reject conflicting records.

## Remaining dependencies

1. USPS credentials and an actual successful rate response. No live USPS rate has been tested. Confirm current USPS request ingredients and retail rate totals using real origin/destination cases before enabling live payments.
2. Inventory/lot and buyer eligibility data. Current sandbox products remain draft and variants inactive until those dependencies are deliberately supplied; catalog import alone does not make an order purchasable.
3. The existing production-only buyer gate still blocks a complete Preview purchase. Sandbox buyer authentication and a separate isolated test capability remain to implement; do not spoof production identity to bypass that boundary. Full card payment and order settlement have not been tested.

## Validation

Focused tests cover strict service selection, free-shipping boundary, package quantities, larger liquid packaging, missing credentials, checkout totals, existing promotion stacking, and legacy fixed-rate behavior. This setup added a real database migration/import/readback and signed webhook ingress verification. The four focused webhook/pricing suites passed 83 tests; TypeScript and focused ESLint passed. Provider rate validation and end-to-end sandbox payment remain unverified until the dependencies above exist.

Primary references:
- https://github.com/USPS/api-examples (OAuth and Domestic Prices v3)
- https://developers.usps.com/domesticpricesv3
- https://developers.usps.com/sites/default/files/apidoc_specs/domestic-prices_18.yaml (3.4.32, retrieved 2026-09-07; NONSTANDARD replaces deprecated NON_MACHINABLE)
- https://docs.stripe.com/api/products/create
- https://www.corning.com/worldwide/en/products/pharmaceutical-technologies/velocity.html
