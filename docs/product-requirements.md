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

- Clerk email verification plus age 21+, one `ResearchPurpose`, and acceptance of the current versioned research-use attestation automatically creates an `active` buyer.
- Do not request organization documents, identity documents, a free-text application, or routine staff action.
- V1 buyers are individual Clerk users. `organizationName` is optional profile text only; it creates no tenant, membership, role, or authorization boundary.
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

- The browser submits product IDs, quantities, destination, and promotion identifiers only.
- The server reloads buyer, attestation, catalog, versioned prices, promotions, destination, inventory, tax, shipping, and payment-provider state.
- Hosted card collection is created only after all gates and prerequisites pass.
- Signed webhooks use the raw body, reject invalid signatures and payload-hash conflicts, deduplicate provider events, and append payment events idempotently.
- The return/success page is read-only and cannot mark an order paid.
- Inventory reservation/consumption, refunds, fulfillment release, and shipment consumption are idempotent and journaled.
- Before shipping, recheck verified payment, active holds, buyer/product/destination state, and inventory. A changed fact may hold a paid order; do not rerun an unrelated approval workflow.

## 7. Routes and design

- Public: `/`, `/catalog`, `/catalog/[slug]`, `/cart`, `/quality-records`, `/research-use-policy`.
- Account required at checkout and for customer order history; staff routes require staff capability plus MFA.
- `/research-use-policy` is canonical. A future `/research-use` route may only redirect to it.
- Preserve the approved desktop-v3 visual system. `responsive-v2` changes behavior by permitting public catalog, prices, promotions, and anonymous cart access and defines responsive/accessibility adaptation.

## 8. Confirmed source boundaries

- The [FDA warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025) documents a case in which research-only statements did not overcome surrounding website evidence of intended human use.
- The [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance) requires truthful, non-misleading advertising and adequate prior substantiation for objective express or implied claims, assessed in the advertisement's overall impression.
- The [Stripe restricted-business FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) states that research peptides require preventive measures against access by purchasers seeking nonresearch use and that Stripe's activation review determines account support.

These statements do not establish the legality of a SKU or destination and do not promise provider acceptance.

## 9. External launch inputs

The following remain unresolved until supplied and verified by their accountable external owners: qualified legal review; real catalog manifest; counsel-approved state allowlist; tax configuration; shipping-service configuration; fulfillment process; and payment-provider acceptance. The application fails closed when an input is absent. It does not fabricate the input or model it as a multi-stage application workflow.

## 10. Acceptance scenarios

- Anonymous catalog, price, promotion, and cart use works; checkout preserves the cart through sign-in.
- A verified adult with a selected purpose and current attestation becomes `active` automatically.
- Missing/blocked destinations deny without creating review; only explicit `review` states create review work.
- Exact product rules override policy-group rules, and changed review snapshots no longer authorize checkout.
- Claims that require analytical support cannot publish without matching lot evidence; ordinary truthful merchandising does not require a COA.
- Server totals resist browser tampering; duplicate provider events cannot duplicate money, inventory, email, refund, or shipment effects.
- One MFA-authenticated administrator can publish allowed records; no second administrator action is required.
