# ADR 0006: ACH Release Policy for Invoiced Orders

- **Date:** 2026-08-29
- **Status:** **Accepted — Option B, hold for settlement.** Decided by the owner on 2026-08-29. The event-side hold policy is implemented; production remains gated as described in Consequences.

## Context

Institutional buyers are invoiced on net terms and pay from the Stripe hosted invoice page. `src/commerce/stripe-invoice-provider.ts` creates those invoices; ACH bank transfer is the expected instrument, because lab and university procurement frequently prohibits cards.

ACH behaves differently from a card in one way that matters here. Funds land in the customer's Stripe cash balance and take one to five business days to settle. Stripe emits `invoice.paid` when it applies funds to the invoice, but an ACH transfer can subsequently be pulled back, surfacing as a `funding_reversed` entry on `customer_cash_balance_transaction.created`. `invoice.paid` therefore does not mean cash in hand.

The binding fulfillment invariant is that a release occurs only after verified payment **and** explicit compliance clearance, and is consumed exactly once. A card chargeback is already handled by the dispute path, which moves an order to `paid_on_hold`. ACH reversal is analogous in shape but arrives through different events and on a different timescale.

The repository now normalizes and processes the supported `invoice.paid`, `invoice.payment_failed`, and `credit_note.created` events. Processing is bound to a locked internal `order_invoices` row and locked order; it rejects mismatched identity, currency, amount due, amount paid, collection method, or restrictive status before creating payment evidence or changing order state. Unsupported customer cash-balance events remain signature-verified and journaled with no business effect.

## Decision

**Option B — hold for a settlement window.** An invoiced order does not become releasable on `invoice.paid` alone. Release requires that a defined settlement period has elapsed without reversal, in addition to the existing compliance clearance.

The owner accepted slower institutional fulfillment in exchange for eliminating reversal exposure on shipped material. That is the conservative choice and the appropriate one while there is no historical data on institutional ACH reversal rates for this catalogue; it can be revisited in favour of Option A once such data exists.

The window length is a separate parameter and is **not** fixed by this ADR. It must be configured, not hard-coded.

The two options as they were put, retained so the tradeoff stays legible:

### Option A — release on `invoice.paid` (not chosen)

Treat `invoice.paid` as verified payment, matching how `checkout.session.completed` is treated today. Compliance clearance still gates release separately.

- Institutional fulfillment matches card speed.
- Accepts reversal exposure: goods may ship and then the funds be pulled back. Recovery is then a commercial collections problem, and the goods are gone.
- Requires `funding_reversed` handling that moves the order to `paid_on_hold`, mirroring the dispute path, plus an operational process for shipped-and-reversed orders.
- Exposure is bounded by order value and by how many institutional orders ship inside the settlement window.

### Option B — hold for a settlement window (chosen)

Treat `invoice.paid` as provisional. Do not permit release until a defined settlement period has elapsed without reversal.

- No reversal exposure on shipped goods.
- Institutional orders ship days later than card orders. That is a customer-experience and competitiveness cost with buyers who expect net terms to be frictionless.
- Requires a durable timer or a scheduled sweep, which is additional machinery, and a defined window length — itself a decision.
- Still requires `funding_reversed` handling for reversals that occur before release.

## Consequences

The implemented event-side policy is fail closed:

- `invoice.paid` requires an exact positive amount match across the normalized provider event, the locked durable invoice, and the locked order total, plus exact currency, `send_invoice`, paid status, and provider/order binding. It records payment evidence and transitions to the distinct `paid_pending_settlement` state, never directly to a releasable state.
- `invoice.payment_failed` reverses only an order still awaiting settlement and only when the same locked invoice facts agree, status is `open`, and paid amount is zero. Unknown, restrictive, auto-charge, and mismatched events become durable conflicts.
- `INVOICE_SETTLEMENT_WINDOW_DAYS` is a configured parameter. When present it schedules a durable `settlement_window_elapsed` effect; when absent it schedules nothing and the order remains held.
- `credit_note.created` creates an idempotent bound ledger effect.

This does not open invoicing in production. The remaining launch gates are:

- a production institutional-order entry point and its authorization/operating policy;
- a production scheduler and sink that consume `settlement_window_elapsed` and re-evaluate every release prerequisite;
- customer cash-balance `funding_reversed` processing and an operational response for reversals or unapplied funds;
- an owner-selected settlement-window value, live provider approval, monitoring, reconciliation, and incident ownership.

Until those gates are satisfied, repository/runtime composition and integration tests demonstrate the policy contract only; they do not demonstrate a live production invoice flow.

## Notes

- Stripe Tax on an invoice calculates and locks at finalization, not at payment, and the Stripe Tax fee is charged at finalization whether or not the invoice is ever paid. A net-30 ACH invoice therefore fixes its tax rate weeks before the money arrives.
- ACH funds that do not match an invoice exactly — partial payments, a mistyped virtual account number, a missing reference — remain unapplied in the customer cash balance until someone applies them by hand. That is an operational process requirement, independent of which option is chosen.
- Related: `docs/architecture/payments.md` (Invoicing), `docs/superpowers/plans/2026-08-29-propeptiq-stripe-tax-invoicing.md` (open decisions).
