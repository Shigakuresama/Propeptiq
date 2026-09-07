# Stripe sandbox catalog and USPS checkout wiring

Verified 2026-09-07 against Stripe sandbox account `acct_1U9t8NR4u3cqLvC0` using a private Vercel Preview build job. No API credentials were downloaded, printed, or committed.

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

## Remaining dependencies

1. USPS credentials and an actual successful rate response. No live USPS rate has been tested. Confirm current USPS request ingredients and retail rate totals using real origin/destination cases before enabling live payments.
2. Isolated Preview PostgreSQL database with the commerce schema and truthful catalog records. `TEST_DATABASE_URL` is currently absent. Never use production data with sandbox payment IDs.
3. Run `npx tsx scripts/bind-stripe-sandbox-catalog.ts` only with the explicit isolated Preview/test guards documented in the script. It locks records, checks SKU/package/price identity, rejects mapping conflicts, and rolls back the entire transaction on a mismatch. It does not invent inventory, activate prices, or grant buyer eligibility. This binding step has NOT been executed.
4. A reachable application webhook endpoint, signing secret, and signed-delivery verification. The temporary catalog job has no payment webhook.
5. The existing production-only buyer gate still blocks a complete Preview purchase. Sandbox checkout enablement needs a separate isolated test capability; do not spoof production identity to bypass that boundary.

## Validation

Focused tests cover strict service selection, free-shipping boundary, package quantities, larger liquid packaging, missing credentials, checkout totals, existing promotion stacking, and legacy fixed-rate behavior. Provider rate validation and end-to-end sandbox payment remain unverified until the dependencies above exist.

Primary references:
- https://github.com/USPS/api-examples (OAuth and Domestic Prices v3)
- https://developers.usps.com/domesticpricesv3
- https://developers.usps.com/sites/default/files/apidoc_specs/domestic-prices_18.yaml (3.4.32, retrieved 2026-09-07; NONSTANDARD replaces deprecated NON_MACHINABLE)
- https://docs.stripe.com/api/products/create
- https://www.corning.com/worldwide/en/products/pharmaceutical-technologies/velocity.html
