# Runbook: Compliance Holds

## Hold sources

- Researcher/application manual review, rejection, suspension, or expiry.
- Product/jurisdiction `Manual Review`, `Blocked`, `Unknown`, expired, or conflicting policy.
- Payment-provider, tax, shipping, lot/inventory, catalog, or launch-control gate not passing.
- Suspicious/nonresearch intended-use signal or prohibited human/veterinary-use request.
- Evidence integrity, COA, catalog, payment, or identity mismatch.

## Place a hold

1. Create/reuse a case scoped to actor/organization/product/destination/order.
2. Record reason code, factual description, triggering gate/policy version, evidence references, and correlation ID.
3. Move affected unpaid order to `ComplianceHold`; paid order to `PaidOnHold`.
4. Revoke/withhold fulfillment release. Do not cancel/refund automatically unless approved policy requires it.
5. Notify the buyer only with an approved neutral template; do not disclose detection rules or make legal conclusions.

## Review

1. Reviewer authenticates with required capability and recent strong authentication.
2. Confirm the exact identity, organization, product, destination, order/payment, attestation, and policy versions.
3. Validate evidence from the approved source of truth; do not rely on notes/screenshots alone.
4. Choose one outcome:
   - request permitted additional evidence,
   - approve this scoped case with effective/expiry time,
   - reject/block with reason,
   - suspend account and affected orders,
   - escalate to policy/legal/incident review.
5. Append the decision; never overwrite the triggering event or prior decision.

## Release

Release is allowed only when every independent gate re-evaluates `PASS`. A reviewer cannot override a `Blocked` or `Unknown` legal/provider/tax/shipping gate with a generic approval. A paid order receives a fulfillment release only after the post-payment re-evaluation references the new decision.

## Rejection/suspension

- Deny new checkout immediately.
- Preserve access to required order/refund/appeal information.
- Review existing unfulfilled paid orders for refund.
- Revoke staff/buyer sessions if security risk exists.
- Record scope, reason, effective time, evidence, reviewer, and review/appeal path.

## Human/veterinary-use signal

Stop the transaction, do not provide use guidance, retain only the minimum approved evidence, and escalate under the content/compliance incident policy. Review related public/support copy for a systemic intended-use issue.

## Closure evidence

Decision history is complete; policy versions/evidence are current; affected orders have a consistent state; required refund/communication tasks are completed; no fulfillment release exists unless all gates pass.
