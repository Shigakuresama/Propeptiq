# PROPEPTIQ Stripe Tax, Invoicing, and Shipping Adapter Record

> **Status: record, not an approved plan.** This workstream was user-directed in a single session and did not originate from a plan checkpoint. It is written down so its provenance is accurate and so it is not mis-filed under Task 10 of the lightweight-commerce or rewards-referrals plans, neither of which authorised it.

**Goal:** Extend the existing hardened Stripe Payments integration with the two products the owner asked for and did not have — Tax and Invoicing — plus the shipping adapter that live checkout composition depends on.

**Provenance:** Recommendations follow the Stripe implementation planner guide `iguide_61VJHbD6AVITZUesm41R4u3cqLvC0`, walked against the PropeptIQ sandbox account `acct_1U9t8NR4u3cqLvC0`. Live account is `acct_1U9t8DJIK2onoSOG`. The sandbox was read only; no Stripe object was created in either account.

## What was built

| Unit | File | Tests |
|---|---|---|
| Tax quote adapter | `src/commerce/stripe-tax-provider.ts` | 9 |
| Tax transaction recorder | `src/commerce/stripe-tax-transaction.ts` | 10 |
| Tax effect handler | `src/commerce/tax-recording-lifecycle.ts` | 11 |
| Effect sink adapter | `src/commerce/tax-effect-sink.ts` | 5 |
| Invoice adapter | `src/commerce/stripe-invoice-provider.ts` | 11 |
| Shipping adapter | `src/commerce/stripe-shipping-provider.ts` | 17 |
| PostgreSQL buyer runtime | `src/commerce/server-runtime.ts` | 9 |

Additive changes to tracked files: the `stripe_tax_transaction` effect enqueue in `provider-event-repository.ts`, the worker allowlist entry and payload validation in `downstream-effect-worker.ts`, two optional env vars in `env-schema.ts`, and an exhaustiveness fence replacing an unguarded dispatch fall-through. No migration; no schema change.

## Decisions that are binding on future work

- **`automatic_tax` is rejected, not unused.** Tax is server-computed and travels as a `Sales tax` line item, so `amount_total` stays the exact sum the server computed. Enabling `automatic_tax` would surrender pricing authority to the provider.
- **The shipping adapter reads exactly one configured `ShippingRate`.** It never lists rates and chooses, because a selection heuristic would make an order total depend on dashboard ordering.
- **`STRIPE_TAX_CODE` and `STRIPE_SHIPPING_RATE_ID` are optional in the schema on purpose** and are absent from `requireFields`. Enforcing them under `TAX_MODE`/`SHIPPING_MODE` would break the synthetic local harness. The gate is `isPostgresBuyerCheckoutReady`.
- **A permanently unrecordable tax calculation completes its effect rather than failing it,** because `claimEffect` re-claims anything not `processed`; failing would loop forever.
- **Invoice provider events stay journaled-but-ignored** pending the ACH decision below. Regression tests pin that.

## Verification

Green at the time of writing: workspace boundary, `lint` with zero warnings, `typecheck`, the full unit suite, `test:integration` on PGlite (30 files / 440 tests), and `test:artifact-scanner`.

**Not run, no claim made:** `test:e2e`, `npm run build`, and the guarded real-PostgreSQL lane. The guarded lane is NOT RUN because `TEST_DATABASE_URL` is absent and `TEST_DATABASE_CONFIRMATION` is not exact; no connection was attempted and no locking or concurrency claim is made. PGlite proves schema and constraint behaviour only.

Unit-suite counts captured while a second session was editing `src/components/` in the same worktree are unreliable and were discarded rather than reported. A different test failed on each of two consecutive full runs while passing in isolation, which is file-changed-under-the-runner, not a regression.

## Honest limitations

- **No independent review.** Every unit here was written and self-verified in one session by the same agent. During that session the agent three times declared work blocked that was not, and twice shipped defects that passed a fully green suite: a type error `vitest` cannot see because it does not typecheck, and raw control bytes written into a source file that made it register as binary to `grep`. A green suite is not evidence the judgement behind it was sound. A review gate before merge is the honest recommendation.
- **The PostgreSQL buyer runtime has never executed against a real database.** Composition performs no I/O by design, which is exactly why its unit test can assemble it against an unreachable database URL. That test proves the wiring typechecks and the fail-closed gate holds. It proves nothing about SQL correctness, serializable retry behaviour, or concurrency. It must not be described as verified live checkout.
- **Nothing drives the downstream effect queue.** No composition root instantiates `createDownstreamEffectWorkerV1`. This predates this workstream and affects `payment_verified` equally.

## Next workstream: Option B invoice release (decided, not started)

The owner chose **Option B, hold for a settlement window** on 2026-08-29 (`docs/adr/0006`). This is the ordered plan for implementing it. Nothing below is built.

Order matters here because the middle steps are not independently safe: normalizing a new event kind without its repository branch is a compile error by design, and a release path without reversal handling would be the exact exposure Option B exists to prevent.

1. **Invoiced-order lifecycle.** Nothing creates an institutional order today, so every later step has nothing to act on. This is a product decision before it is an implementation: how an institutional buyer requests an invoice, whether it is self-service or staff-created, and what state the order occupies before payment. It is the true prerequisite and is larger than the Stripe work that follows it.
2. **A distinct `paid_pending_settlement` order state**, separable from `checkout_pending` and from released. The fulfillment gate must be able to refuse release without implying the order is unpaid, and reporting must be able to tell "money not yet received" from "money received, window still open".
3. **Event normalization plus repository branches, together in one change.** `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `credit_note.created`, `cash_balance.funds_available`, and `customer_cash_balance_transaction.created` in `provider-events.ts`, each with a matching branch in `provider-event-repository.ts`. The exhaustiveness fence makes the split impossible, which is intended.
4. **`funding_reversed` as the primary path.** Under Option B a reversal arriving before the window closes must cancel a pending release, not record a reversal after the fact. This is the case the policy exists to catch and should be built and tested before the release path that depends on it.
5. **Durable settlement re-evaluation.** A `downstream_effects` row scheduled for the window's end, not an in-process timer, so a restart cannot lose a pending release. The window length is configuration; unset must mean no release, never a default.
6. **`credit_note.created` handling**, or Stripe and the internal ledger silently diverge whenever a credit note is issued.

Do not describe Option B as live until step 6. A decided policy with no implementation is a decision, not a behaviour.

## Open decisions — owner input required

1. **Stripe Tax registration.** `GET /v1/tax/settings` returns `status: "pending"` with `missing_fields: ["head_office"]` and the registrations list is empty. Until a head office and per-state registrations exist, `automatic_tax` and the Calculations API return zero tax silently. Which states carry nexus is a legal determination.
2. ~~**ACH release policy.**~~ **DECIDED 2026-08-29: Option B, hold for a settlement window.** See `docs/adr/0006` and the workstream plan above. The remaining sub-decision is the window length itself, which must be configured rather than compiled.
3. **Invoiced-order lifecycle.** Nothing currently creates an institutional order, so invoice event processing has no order to act on even once (2) is decided.
4. **Effect queue trigger.** Cron, queue, or route is a deployment-architecture decision.
