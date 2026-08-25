# Operational Runbooks

Runbooks are executed only by authorized roles against the intended environment. Every action uses a correlation/incident/case ID and appends evidence; no operator edits journal history directly.

- `failed-orders.md` — checkout/payment/fulfillment failures.
- `compliance-holds.md` — place, review, release, reject, suspend, and post-payment holds.
- `refunds-reconciliation.md` — refunds and provider/internal reconciliation.
- `incidents-and-recovery.md` — security, data, provider, and recovery response.

Actual on-call contacts, escalation thresholds, refund limits, carrier procedures, and legal contacts are unresolved launch gates. Before production, the operator configuration must name accountable people without committing personal contact details to the public repository.
