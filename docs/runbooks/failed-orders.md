# Failed Orders

## Classify the failure

- **Before hosted checkout:** account/attestation/product/destination/inventory/provider gate denied, explicit review required, or tax/shipping prerequisite unavailable.
- **Hosted checkout creation:** provider request failed or timed out with an unknown outcome.
- **After provider interaction:** cancelled, expired, payment failed, webhook delayed/invalid/conflicting, or internal/provider state disagrees.
- **After payment:** inventory, buyer, product, destination, refund/dispute, or fulfillment readiness changed.

## Procedure

1. Locate the order/attempt with its internal ID, correlation ID, idempotency key, and provider IDs. Do not use customer identity alone.
2. Inspect authoritative order, gate reasons, tax/shipping prerequisite result, provider event/hash, payment journal, and inventory events.
3. For an unknown provider-create outcome, query by the existing idempotency/reference before retrying. Never create a second session speculatively.
4. For invalid signatures, preserve redacted delivery metadata and do not apply business effects.
5. Interpret all six durable provider-event states before responding: `processed` is the only terminal same-hash replay success; `pending`, `failed`, and `deferred` are reclaimable; an expired `processing` lease is reclaimable; unexpired `processing` is still busy and is not terminal success; and `conflict` is a terminal incident. A changed hash for the same provider event ID becomes `conflict`. Never reapply an already processed effect.
6. Release a stale inventory reservation once with its idempotency key when no payable session/order needs it.
7. If payment is verified but current fulfillment checks fail, place the order on the narrow paid-order hold and follow `compliance-holds.md`.
8. Read back order, payment, inventory, refund, and hold state before communicating the outcome.

Missing or blocked destination policy denies and does not create review. An explicit review state follows the exact-snapshot review procedure. Do not modify eligibility or payment history merely to let a retry pass.

## Closure

Record the root cause, affected IDs, provider evidence used, idempotent mutations, inventory outcome, customer communication status, remaining risk, and follow-up owner. A redirect, dashboard screenshot, or absent error is not proof of payment.
