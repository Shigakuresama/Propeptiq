# PROPEPTIQ LABS Product Requirements

**Status:** Binding V1 lightweight specification.

## 1. Product outcome

Provide a low-friction research-use storefront. Anonymous visitors can browse active products, prices, and promotions and build a cart. Checkout requires a research-use account and checkout attestation, but an ordinary qualified buyer does not wait for staff action.

## 2. Exact domain interfaces

```ts
type BuyerStatus = "active" | "review" | "blocked";
type ResearchPurpose =
  | "in_vitro"
  | "analytical"
  | "educational"
  | "other_laboratory";

type CheckoutGate =
  | "account"
  | "attestation"
  | "product"
  | "destination"
  | "inventory"
  | "payment_provider";

type CheckoutDecision = {
  permitted: boolean;
  reviewRequired: boolean;
  reasons: readonly string[];
};
```

These six gates are the buyer/order commerce-eligibility decision. Tax configuration and shipping-service availability are separate server-authoritative checkout prerequisites. Payment-provider enablement is the `payment_provider` gate.

## 3. Buyer account

- Provider-verified email plus age 21+, one `ResearchPurpose`, and acceptance of the current versioned research-use attestation automatically creates an `active` buyer.
- Do not request organization documents, identity documents, a free-text application, or routine staff action.
- V1 buyers are individual application-owned Better Auth users persisted in Neon PostgreSQL. `organizationName` is optional profile text only; it creates no tenant, membership, role, or authorization boundary.
- `blocked` denies checkout. `review` is the only buyer status that triggers explicit review.
- Customer account/order routes require authentication. MFA is required for staff routes, refunds, and fulfillment actions, not ordinary customer operations.

## 4. Destination and review

Resolve destination in this order:

1. active exact product/state override;
2. active product-policy-group/state rule;
3. `unavailable`.

Territories are unavailable. Missing, blocked, or unavailable policy denies without automatically opening review. Review occurs only when `buyer.status === "review"` or the resolved destination rule is exactly `review`.

A review decision is immutable and bound to an exact buyer/cart/destination snapshot hash. Any cart, buyer-status, attestation, or destination change invalidates it. Review does not require recurring evidence-integrity checks or expiry workflows.

## 5. Catalog and merchandising

- Product activation requires a core product, versioned price, package/form, traceable lot/inventory, policy group, and at least one allowed destination.
- Production products, prices, lots, suppliers, and COAs come only from a real import manifest. Competitor or invented data is allowed only in clearly labeled test fixtures and never production.
- COA or analytical evidence is required only for the corresponding purity, sterility, testing, laboratory, accreditation, or similar objective claim.
- Human or veterinary outcomes, dosing, administration, reconstitution, treatment positioning, and surrounding human-use evidence are prohibited.
- Truthful discounts, bundles, subscription offers, loyalty, and cross-sells are allowed from active server records. The server recalculates all prices and discounts. Scarcity and countdowns require real inventory or a real promotion end time.
- One MFA-authenticated administrator may publish products, destination rules, promotions, and catalog copy and must create an audit event.

## 6. Checkout, payment, and fulfillment

- The browser sends exact canonical variant IDs and quantities, destination fields, optional reward-redemption points, and the current pricing revision required by the endpoint. It does not send authoritative prices, totals, discount percentages, promotion identifiers or codes, currency, or Stripe identifiers.
- The server reloads buyer, attestation, catalog, versioned prices, promotions, destination, inventory, tax, shipping, and payment-provider state.
- Hosted card collection is created only after all gates and prerequisites pass.
- Signed webhooks use the raw body, reject invalid signatures and payload-hash conflicts, deduplicate provider events, and append payment events idempotently.
- The return/success page is read-only and cannot mark an order paid.
- Inventory reservation/consumption, refunds, fulfillment release, and shipment consumption are idempotent and journaled.
- Before shipping, recheck verified payment, active holds, buyer/product/destination state, and inventory. A changed fact may hold a paid order; do not rerun an unrelated approval workflow.

## 7. Routes and design

- Public: `/`, `/catalog`, `/catalog/items/[slug]`, `/catalog/[slug]`, `/cart`, `/quality-records`, `/research-use-policy`.
- Account required at checkout and for customer order history; staff routes require staff capability plus MFA.
- `/research-use-policy` is canonical. A future `/research-use` route may only redirect to it.
- Preserve the approved desktop-v3 visual system. `responsive-v2` changes behavior by permitting public catalog, prices, promotions, and anonymous cart access and defines responsive/accessibility adaptation.

### 7.1 Rewards, referrals, and affiliate requirements

- Public routes add `/rewards`, `/partners`, `/sets/[code]`, `/rewards/terms`, and `/partners/terms`; authenticated routes add `/account/rewards`, `/account/referrals`, `/account/partner`, and `/research-sets` with the access boundaries in the binding design contract.
- Homepage order is research-use restriction bar; optional real active-promotion strip; editorial hero; Proof Rail; admin-curated catalog highlights; `Earn points / Refer a lab / Share a research set`; and quality-record callout. Inactive policies omit their modules.
- Browse-only PDF products retain 56 exact-name cards and all 103 owner-supplied variants without prices or growth actions. Active production database products may show server-authoritative price, package form, promotion, evidence state, and earned points only after a real price and active policy are projected.
- V1 policy records begin as `draft` and stay invisible in production until the owner validates margin impact and activates them. The proposed points policy is `100 points = $1.00`, `2 points per $1.00` eligible net merchandise spend, `500 points` (`$5.00`) minimum redemption, `25%` post-promotion merchandise-subtotal maximum, and no expiration. Points cannot be purchased, transferred, redeemed for cash, or used for tax or shipping.
- Eligible points spend excludes tax, shipping, refunded amounts, ordinary discounts, referral discounts, and redeemed points. Earned points are pending after verified payment and available after delivery; verified refunds, chargebacks, and reversals append compensating ledger entries.
- Customer referral policy uses `30 days` last eligible referral click, `10%` off the referred customer's first eligible order capped at `$25.00`, and `5 points per $1.00` eligible net merchandise capped at `2,500 points`, available after delivery. One stable, revocable code is automatic for every active buyer, with one referral reward per new buyer; self-referrals, duplicate buyer accounts, refunds, and chargebacks are ineligible.
- Cash affiliate policy uses `30 days` last eligible affiliate click, `10%` first eligible order commission, `5%` reorder commission for `180 days`, approval eligibility `30 days` after delivery, reversibility for verified refunds or chargebacks, `$50.00` minimum payout, and monthly batches outside the app. Customer referrals are automatic; cash affiliates require verified identity and one administrator approval. Payout execution is external and no provider is assumed approved.
- Exclude buy points, paid tiers, lifetime commission, automatic payouts, medical category positioning, fake popularity, unsupported trust claims, and instant affiliate approval. Growth offers cannot be enabled against the owner-supplied browse-only PDF catalog.

Pattern research cites the official [AminoClub homepage](https://www.aminoclub.com/), [partner program](https://www.aminoclub.com/us/affiliate), [research bundles](https://www.aminoclub.com/us/bundles), [points page](https://www.aminoclub.com/us/buy-points), and [membership page](https://www.aminoclub.com/us/membership). These pages are not PROPEPTIQ production data or legal precedent.

## 8. Confirmed source boundaries

- The [FDA warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025) documents a case in which research-only statements did not overcome surrounding website evidence of intended human use.
- The [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance) requires truthful, non-misleading advertising and adequate prior substantiation for objective express or implied claims, assessed in the advertisement's overall impression.
- The [Stripe restricted-business FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) states that research peptides require preventive measures against access by purchasers seeking nonresearch use and that Stripe's activation review determines account support.

These statements do not establish the legality of a SKU or destination and do not promise provider acceptance.

## 9. External launch inputs

The following remain unresolved until supplied and verified by their accountable external owners: qualified legal review; real catalog manifest; counsel-approved state allowlist; tax configuration; shipping-service configuration; fulfillment process; and payment-provider acceptance. The application fails closed when an input is absent. It does not fabricate the input or model it as a multi-stage application workflow.

Production Better Auth activation is a separate launch gate. It requires
independent stable Better Auth and application rate-limit secrets, the exact Neon
database target, the dedicated Auth rate-limit support schema, verified Resend
delivery, required email verification, exact Preview and Production origins,
and a branch-isolated Preview lifecycle test
covering signup, verification, sign-in, protected-route return, and sign-out.
Password recovery has an additional gate: code-enforced revocation of every
pre-existing session after reset plus a two-session branch test proving
single-use recovery and rejection of both pre-reset sessions. None of these
requirements may be inferred from a syntactically valid environment variable,
external Auth resource, or operator assertion alone.

## 10. Acceptance scenarios

- Anonymous catalog, price, promotion, and cart use works; checkout preserves the cart through sign-in.
- A verified adult with a selected purpose and current attestation becomes `active` automatically.
- Missing/blocked destinations deny without creating review; only explicit `review` states create review work.
- Exact product rules override policy-group rules, and changed review snapshots no longer authorize checkout.
- Claims that require analytical support cannot publish without matching lot evidence; ordinary truthful merchandising does not require a COA.
- Server totals resist browser tampering; duplicate provider events cannot duplicate money, inventory, email, refund, or shipment effects.
- One MFA-authenticated administrator can publish allowed records; no second administrator action is required.
