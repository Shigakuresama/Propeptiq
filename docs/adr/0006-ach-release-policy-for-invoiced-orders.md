# ADR 0006: ACH Release Policy for Invoiced Orders

- **Date:** 2026-08-29
- **Status:** **Accepted — Option B, hold for settlement.** Decided by the owner on 2026-08-29. Not yet implemented; see Consequences for what implementation requires.

## Context

Institutional buyers are invoiced on net terms and pay from the Stripe hosted invoice page. `src/commerce/stripe-invoice-provider.ts` creates those invoices; ACH bank transfer is the expected instrument, because lab and university procurement frequently prohibits cards.

ACH behaves differently from a card in one way that matters here. Funds land in the customer's Stripe cash balance and take one to five business days to settle. Stripe emits `invoice.paid` when it applies funds to the invoice, but an ACH transfer can subsequently be pulled back, surfacing as a `funding_reversed` entry on `customer_cash_balance_transaction.created`. `invoice.paid` therefore does not mean cash in hand.

The binding fulfillment invariant is that a release occurs only after verified payment **and** explicit compliance clearance, and is consumed exactly once. A card chargeback is already handled by the dispute path, which moves an order to `paid_on_hold`. ACH reversal is analogous in shape but arrives through different events and on a different timescale.

Today `invoice.*`, `credit_note.*`, and `cash_balance.*` provider events normalize to `ignored` — signature-verified, journaled, no business effect — and regression tests pin that. No invoice event can move an order, so no policy is currently in force. That is the safe default, not an oversight.

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

Whichever is chosen, both require work that does not exist yet and is not blocked by this ADR alone:

- An invoiced-order lifecycle. Nothing currently creates an institutional order, so there is no order for an invoice event to act on.
- Making `invoice.*`, `credit_note.*`, and `cash_balance.*` processable in `src/commerce/provider-events.ts`, together with matching branches in `provider-event-repository.ts`. These are not separable: the kind dispatch now carries an exhaustiveness fence, so a new normalized kind without a branch is a compile error rather than a silent fall-through into the dispute processor.
- `credit_note.created` handling, or Stripe and the internal ledger will silently diverge whenever a credit note is issued.

The implementation expresses this as a fail-closed mode variable in the established pattern rather than a hard-coded branch, so the policy stays visible in configuration and reviewable in one place. Absent or unset configuration must mean *no release*, never a default window.

Specifically, Option B requires all of the following, none of which exist yet:

- A settlement-window parameter, configured rather than compiled in, with an unset value meaning no release rather than an implicit default.
- A durable mechanism to re-evaluate an order once its window elapses. A timer that lives only in process is not sufficient; this belongs in the existing `downstream_effects` queue or an equivalent durable record, so a restart cannot lose a pending release.
- `funding_reversed` handling that arrives *before* the window closes, cancelling the pending release rather than merely recording a reversal after the fact. Under Option B this is the case the policy exists to catch, so it is the primary path, not an edge case.
- A representation of "paid but not yet releasable" that is distinct from both `checkout_pending` and a fully released state, so the fulfillment gate can refuse without implying the order is unpaid.

## Notes

- Stripe Tax on an invoice calculates and locks at finalization, not at payment, and the Stripe Tax fee is charged at finalization whether or not the invoice is ever paid. A net-30 ACH invoice therefore fixes its tax rate weeks before the money arrives.
- ACH funds that do not match an invoice exactly — partial payments, a mistyped virtual account number, a missing reference — remain unapplied in the customer cash balance until someone applies them by hand. That is an operational process requirement, independent of which option is chosen.
- Related: `docs/architecture/payments.md` (Invoicing), `docs/superpowers/plans/2026-08-29-propeptiq-stripe-tax-invoicing.md` (open decisions).
