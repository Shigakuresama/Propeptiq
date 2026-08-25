# Destination Policy

**Status:** Binding resolution contract; not a legal determination or a complete state survey.

## External input

Qualified counsel must supply an approved U.S. state allowlist for the real SKU manifest. No state is presumed allowed. U.S. territories are unavailable in V1. The repository does not claim that any current state/SKU combination is lawful.

## Rule model

An active destination rule targets either an exact product/state pair or a product-policy-group/state pair and resolves to `allowed`, `review`, or `blocked`. Rules carry an effective version and activation state. A product belongs to one active policy group.

## Deterministic resolution

For every product in the cart and the normalized U.S. destination state:

1. use the active exact product/state override when present;
2. otherwise use the active product-policy-group/state rule when present;
3. otherwise resolve `unavailable`.

Any territory resolves `unavailable`. A cart is destination-allowed only when every product resolves `allowed` or has a matching valid review decision for an explicit `review` result. Any `blocked` or `unavailable` result denies checkout.

Missing, inactive, malformed, or conflicting data fails closed and does not automatically create review work. An exact `blocked` override cannot fall through to a group allowance.

## Explicit review

Review is requested only when a product's resolved rule is exactly `review` or the buyer status is `review`. An approval is immutable and bound to the exact buyer/cart/destination snapshot hash. A cart, buyer-status, attestation, or destination change invalidates the approval. Review never changes the underlying destination rule.

## Operations

One MFA-authenticated administrator may import and publish counsel-supplied rules with an audit event. Legal analysis and expansion decisions remain outside the application. A missing counsel-approved allowlist keeps production checkout unavailable rather than initiating an internal legal workflow.
