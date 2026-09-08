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
- Imported 56 products, 103 variants and 40 approved prices; bound all 103 Stripe product IDs and 40 price IDs. After explicit owner authorization, `tests/sandbox/provision.ts` created 40 clearly synthetic lots (100 units each), one synthetic eligible buyer, a synthetic attestation and US destination policies. Only the 40 priced variants and their parents were activated in this isolated database. The 63 pending variants remain inactive and unpriced. No real supplier certification or COA is represented.
- Persisted and read back the canonical automatic `winter30` campaign (3000 basis points). Quantity tiers remain authoritative in `src/domain/storefront-pricing.ts`; mirrored Stripe coupons must not be applied a second time.
- Webhook `we_1UDBSaR4u3cqLvC03TfqTEQ2`, API version `2026-07-29.dahlia`, receives 15 supported checkout/refund/dispute/invoice/credit-note event types at the branch alias's `/api/webhooks/stripe` route. The URL includes a confidential Vercel automation bypass parameter; do not log or publish the full URL.
- Two real Stripe sandbox `product.updated` probes reached the deployed application and were persisted with `status=processed`, `livemode=false`: `evt_1UDBVxR4u3cqLvC06sjGZ9B9` and `evt_1UDBWtR4u3cqLvC05n6hd24J`. These validate signed ingress and database persistence, not order settlement. The temporary product event subscription was removed afterward.
- Preview health returned 200; an invalid webhook signature returned 400 `invalid_delivery`. Deployment `dpl_EMtWxLoNQFpXDdEM2a9foA6fycGK` was READY for commit `be6d7ba`.
- An unexpected Vercel CLI debug path printed the automation bypass token during a failed curl invocation. It was revoked and regenerated immediately; the webhook URL was updated and successful delivery reverified. Consumers holding a manually copied old bypass token need the replacement. Use direct HTTP with an in-memory header and sanitized output, not CLI debug mode.

Reproduce database readback with `npx tsx scripts/stripe-sandbox/verify-database.ts`, passing the branch's direct verified-TLS connection as `TEST_DATABASE_URL`. Bootstrap is intentionally empty-only and must not be rerun against populated databases. Binding and promotion configuration are idempotent and reject conflicting records.

## Remaining dependencies

1. USPS credentials and an actual successful rate response. No live USPS rate has been tested. Confirm current USPS request ingredients and retail rate totals using real origin/destination cases before enabling live payments.
2. Production still requires real inventory, buyer eligibility, provider and operational configuration. Synthetic sandbox records do not qualify production orders.

## Sandbox access and verified payment

The dedicated branch preview uses `SANDBOX_CHECKOUT_CAPABILITY=enabled`, `AUTH_MODE=test`, `FULFILLMENT_MODE=test`, and fresh Sensitive Better Auth/rate-limit secrets. Its guard pins the exact preview origin, database hostname/name and Stripe account, requires every commerce mode to be test, and rejects production identity or enabled live capabilities. Email is disabled; sign-up, OTP and password reset are blocked. Existing provisioned accounts can sign in with verified password credentials. Every page displays a synthetic sandbox banner.

Open https://propeptiq-git-feat-stripe-shipping-catalog-sergiosteam.vercel.app/sign-in and use the generated credentials in the ignored local `.codex-evidence/sandbox-buyer.json`. Vercel deployment protection still requires authorized access. Never commit that file or a protection bypass token. `tests/sandbox/provision.ts` refuses any other database target and refuses to replace a missing original credential file for an existing account.

On 2026-09-07, browser sign-in and catalog purchase controls worked. Real HTTP verification (`tests/sandbox/verify-checkout.ts`) returned 401 for anonymous quoting, 200 for the authenticated quote/session and 503 shipping-unavailable for Priority Mail without USPS credentials. The 11-vial quote was subtotal $769.89, discount $392.70, free ground, tax $29.23, total $406.42. Stripe's sandbox test card completed order `84589384-44be-4141-a312-06e898824fd4`. Signed event `evt_1UDCujR4u3cqLvC0ci95Verh` was persisted as processed with `livemode=false`; its checkout attempt completed and the order became `paid_pending_fulfillment`. The returned browser page displayed Payment verified and 11 items. No real charge, label or shipment was created.

Testing also fixed millisecond identity verification, sandbox storefront mappings, propagation of the selected shipping service, and HTTP validation of Stripe's legitimate hosted URL fragment. An earlier diagnostic session remains unpaid and expires normally. Stripe currently displays each discounted variant as an aggregate line (the application order record retains its physical quantity); review that hosted line presentation before production launch.

## Validation

Focused tests cover sandbox isolation, authentication, service selection, free-shipping boundary, packing, missing credentials, totals, promotion stacking, hosted URLs and legacy fixed-rate behavior. The final checkout HTTP/service suites passed 114 tests; full TypeScript, ESLint and production build passed, including authentication proxy registration. Actual sandbox payment and webhook settlement were verified as above. A real USPS paid-rate response remains unverified.

Primary references:
- https://github.com/USPS/api-examples (OAuth and Domestic Prices v3)
- https://developers.usps.com/domesticpricesv3
- https://developers.usps.com/sites/default/files/apidoc_specs/domestic-prices_18.yaml (3.4.32, retrieved 2026-09-07; NONSTANDARD replaces deprecated NON_MACHINABLE)
- https://docs.stripe.com/api/products/create
- https://www.corning.com/worldwide/en/products/pharmaceutical-technologies/velocity.html
