# Explicit Review and Paid-Order Holds

## When review exists

Create a review request only when `buyer.status === "review"` or a resolved destination rule is exactly `review`. Missing, blocked, unavailable, malformed, or territory policy denies checkout without opening a review request.

The review request contains an immutable hash of the exact buyer, cart product/quantity/version facts, attestation version, and normalized destination. It contains concise reason codes and no speculative applicant-document workflow.

## Review procedure

1. Authenticate with the required review capability and current MFA.
2. Load the immutable snapshot, current buyer status, current attestation version, and destination result.
3. Confirm the request still hashes to the checkout snapshot. If any input changed, close it as invalidated and require a new request only if the new facts still explicitly resolve `review`.
4. Record approve or deny with a concise reason and audit event. The decision never edits the destination rule.
5. Read back the immutable decision and exact hash. Approval authorizes only that snapshot.

A buyer block or any cart, buyer-status, attestation, or destination change invalidates an earlier approval.

## Paid-order hold

Before fulfillment, place a paid order on hold when verified payment, active order/buyer hold, inventory, buyer status, product status, or destination allowance no longer passes. Record the changed fact and correlation ID. Do not restart an unrelated enrollment or review process.

To clear the hold:

1. Verify the underlying fact from its authoritative source.
2. Confirm payment remains verified and the order is not refunded/disputed.
3. Re-run the current fulfillment checks to confirm the hold's reason is resolved.
4. Clear only the hold and append an audit event. Do not create or consume a fulfillment release while clearing the hold.

The current carrier/tracking/preparation/handoff/delivery/exception commands
create manual internal records only. They are not a carrier adapter, carrier
webhook, carrier-confirmed synchronization, or proof that a physical handoff
or delivery occurred. Fulfillment remains disabled. Any future authorized
operation must require an accountable operator to own the physical/carrier
evidence, re-run every release check, use the consume-once transaction and
idempotency key, and read back the internal record. Clearing a hold never
reserves or exhausts that consume-once authority.

If legality, catalog, tax/shipping, warehouse, or provider facts are unresolved, keep the order held and escalate to the accountable external owner. Software does not decide those inputs.
