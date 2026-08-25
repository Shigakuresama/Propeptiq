# Runbook: Failed Orders

## Trigger

Use for checkout-creation failure, provider failure/expiry, amount mismatch, webhook-processing failure, inventory reservation failure, or fulfillment-release failure.

## Safety rules

- Never infer payment from a success page, customer report, email, or screenshot.
- Never re-charge by manually creating a second session without resolving idempotency/provider state.
- Never release fulfillment while any gate is not `PASS`.
- Do not edit payment/inventory/audit journal rows.

## Triage

1. Open a case with environment, order ID, correlation ID, timestamp, and symptom; avoid raw PII/secrets.
2. Read the order, eligibility snapshot, checkout attempts, provider event inbox, payment journal, inventory reservation, compliance case, and fulfillment release.
3. Retrieve authoritative provider Checkout/payment state through the server-side finance tool/adapter.
4. Classify:
   - no provider session created,
   - open/expired/unpaid session,
   - paid but webhook missing/failed,
   - payment mismatch,
   - paid on compliance hold,
   - released but inventory/fulfillment failed,
   - unknown/contradictory evidence.

## Resolution

### No session / creation failed

Release stale inventory reservation idempotently, preserve failure evidence, correct the root cause, and let the buyer create a new attempt only after eligibility is re-evaluated.

### Open or expired/unpaid

Do not mark paid. Expire/reconcile the session through the provider if appropriate, release reservation after authoritative expiry, and record the outcome.

### Provider paid, internal webhook absent/failed

Disable fulfillment for the order, verify the exact provider event/session/payment/amount/currency, repair the handler, and replay through the normal signed/provider-supported path or reconciliation command. Confirm one journal effect and one clearance evaluation.

### Amount/currency/customer mismatch

Place finance/compliance hold, disable fulfillment, preserve payload hashes and provider references, escalate as an incident, and follow the refund decision process. Do not “correct” snapshots to match the payment.

### Paid on compliance hold

Follow `compliance-holds.md`. Payment does not change the hold decision. If unresolved within the approved window, initiate an authorized refund.

### Fulfillment failure after release

Do not create a second release. Inspect release consumption and inventory ledger atomically. If not consumed, retry the authorized operation idempotently; if partially consumed, open an incident and reconcile physical inventory before action.

## Closure evidence

- Provider and internal states agree.
- Reservation/inventory ledger is balanced.
- No duplicate charge, journal event, email, or release exists.
- Buyer communication, if required, uses an approved template and contains no sensitive/internal detail.
- Root cause, corrective action, and follow-up owner are recorded.
