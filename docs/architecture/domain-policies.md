# Domain Policies

Pure domain functions own eligibility, destination resolution, publication, money, inventory, payment, review, and fulfillment decisions. Adapters load facts; policies return decisions without provider I/O.

## Exact interfaces

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

The six gates are exhaustive for buyer/order commerce eligibility. Tax and shipping availability are separate required checkout facts.

## Buyer activation

Return `active` when the email is Clerk-verified, age 21+ is confirmed, a valid `ResearchPurpose` is selected, and the current attestation version is accepted. Missing any fact denies activation. Staff action is not an ordinary input.

## Destination resolution

Normalize a U.S. state and reject territories. Resolve active exact product/state override, else active product-policy-group/state, else `unavailable`. `blocked` and `unavailable` deny. Do not turn missing policy into review.

## Checkout evaluation

- `account`: authenticated buyer exists and status is `active`; `review` marks review required, `blocked` denies.
- `attestation`: exact current version is accepted.
- `product`: each item is active and its required catalog facts are present.
- `destination`: every item is allowed or has a valid exact-snapshot review decision.
- `inventory`: requested units can be reserved.
- `payment_provider`: the configured provider is accepted and enabled for this environment/business.

Return stable reason codes in `reasons`. `permitted` is true only when all six gates pass and no review is required. Checkout creation separately requires valid tax configuration and an available shipping service.

## Review

Create review work only for buyer status `review` or destination result `review`. Hash canonical buyer, cart product/quantity/version facts, attestation version, and normalized destination. The decision is immutable and valid only for the identical hash. Any input change invalidates it.

## Publication and claims

One capable administrator with a current MFA session may publish a product, destination rule, promotion, or catalog copy and append an audit event. Product publication requires the activation facts in `catalog-policy.md`. An analytical claim requires matching active lot evidence; prohibited human/veterinary positioning always denies. Normal truthful promotions do not require analytical evidence.

## Money and lifecycle

Use integer minor units and one currency per order. Reprice products and promotions from server records. Provider events, payment changes, inventory consumption, refunds, fulfillment release, and shipment are idempotent. A success-page request is read-only. Fulfillment rechecks payment, hold, inventory, buyer, product, and destination facts.
