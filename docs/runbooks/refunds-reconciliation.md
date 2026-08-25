# Runbook: Refunds and Reconciliation

## Refund initiation

1. Confirm order, verified payment journal, refundable balance, fulfillment/shipment state, compliance state, and approved refund policy.
2. Require finance capability and recent strong authentication.
3. Enter reason, amount in integer minor units, currency, supporting case, and idempotency key.
4. Persist the refund request before calling the provider.
5. Call the provider through the server adapter; never enter card/payment secrets into PROPEPTIQ.
6. Append provider result/event. Treat redirect/dashboard appearance as secondary evidence; authoritative provider state is required.
7. Move to `Refunded` only after verified provider evidence.
8. Reconcile inventory/shipment and send the approved transactional notice.

If a refund call times out, retrieve state by idempotency/provider reference before retrying.

## Daily reconciliation

For the closed period, compare internal orders/payment journal/refunds with provider Checkout, payments, refunds, disputes, and balance records.

Exception classes:

- provider payment without internal order,
- internal paid state without provider payment,
- amount/currency/customer mismatch,
- duplicate or missing event/journal row,
- stale open/expired Checkout Session,
- provider refund not reflected internally or reverse,
- dispute/chargeback without internal case,
- fulfillment without valid release,
- paid-on-hold beyond approved review/refund window.

## Exception handling

1. Open a finance incident/case with correlation IDs and redacted evidence.
2. Disable affected fulfillment; if systemic, close the checkout launch gate.
3. Preserve provider payload hashes and internal snapshots.
4. Resolve through idempotent replay/retrieval/refund or state correction using a new journal event—not an edit.
5. Re-run reconciliation for the item and period.
6. Record root cause and preventive action.

## Period close

The period closes only when every exception is resolved or accepted by an authorized owner with documented residual risk. Record counts/totals by currency, provider settlement references, refund/dispute totals, unresolved cases, and reviewer sign-off.

Refund thresholds, approval separation, accounting export, and return/shipment rules require business approval before production.
