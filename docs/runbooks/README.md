# Operations Runbooks

These runbooks operate the lightweight commerce model:

- `compliance-holds.md`: explicit buyer/destination review and changed-fact paid-order holds.
- `failed-orders.md`: checkout/payment/order failures and inventory release.
- `refunds-reconciliation.md`: idempotent refunds and provider reconciliation.
- `incidents-and-recovery.md`: containment, recovery, credential response, and immutable-journal preservation.

## Shared rules

- Use an authorized individual staff account with current MFA for staff, refund, and fulfillment mutations.
- Work from server records and authoritative provider evidence, never browser values, redirect state, or screenshots alone.
- Preserve correlation IDs and immutable payment, inventory, review, refund, fulfillment, shipment, and audit records.
- Apply the narrowest safe mutation and read it back. Never edit history to make systems agree.
- Redact secrets, addresses, attestation text, provider payloads, and unnecessary PII from tickets/logs.
- One capable administrator may perform catalog/destination/promotion publication. No additional actor is an operational prerequisite.
- Escalate legal SKU/destination questions, catalog truth, tax/shipping setup, warehouse operation, and provider acceptance to their external owners; do not create substitute application state.
- Carrier, tracking, preparation, handoff, delivery, and exception commands create manual internal records only. No carrier adapter, carrier webhook, or carrier-confirmed synchronization is implemented. Fulfillment remains disabled; any future use requires an accountable operator to own physical/carrier evidence and read back the internal record without treating it as carrier confirmation.

Every closure record states the affected IDs, facts inspected, mutation/idempotency key, read-back result, unresolved risk, owner, and timestamp.
