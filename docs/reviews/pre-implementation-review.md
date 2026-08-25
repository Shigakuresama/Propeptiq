# Pre-Implementation Review

**Reviewed:** 2026-08-24

**Verdict:** **REQUEST CHANGES**

**Scope:** Preserved starter UI/API code and the current uncommitted `src/domain/` draft. This is a read-only acceptance review; it does not approve or advance formal implementation.

## Why this review exists

The repository contains useful partial work created around the planning and Superdesign approval gates. It is preserved to avoid losing work, but it cannot become an accidental production decision. The exact Superdesign v3 and `responsive-v1` handoff still require approval before public UI implementation, and the domain draft must pass the safety gates below before Task 2 can be accepted.

## Reproducible quality snapshot

Fresh checks against the current unstaged snapshot produced:

| Check | Result |
|---|---|
| `npm test` | Passed: 6 files, 241 tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with the zero-warning gate |
| `git diff --check` | Passed; line-ending conversion warnings only |
| `npm run test:integration` | Failed: no integration test files exist |
| `npm run test:e2e -- --list` | Failed: no Playwright tests exist |

The green pure-domain suite is meaningful progress, but it cannot prove database constraints, provider authenticity, browser behavior, or operational recovery. Coverage instrumentation is also not installed yet, so branch completeness is unproven.

## Improvements confirmed in this snapshot

The following findings from the first review have been addressed in the current draft and covered by unit tests:

1. `application.review` and `payment.reconcile` now require current strong-auth policy evidence, and reverification must belong to the active authenticated session.
2. Jurisdiction rules validate exact states, product and destination scope, current evidence, and exact manual-review outcomes.
3. Eligibility aggregation normalizes missing, duplicate, malformed, unexpected, and per-order-line jurisdiction results before applying precedence.
4. Explicit human-use, human-consumption, veterinary-use, animal-use, animal-consumption, and punctuation-fragmented prohibited copy is blocked by the current unit suite.
5. Payment disputes now transition both payment and order state, release issuance checks canonical current expiry, and order fulfillment binds a release snapshot to payment, clearance, and version evidence.
6. Money inputs are separated by server-authority markers and malformed values are rejected before arithmetic.

These are implementation observations, not production launch approvals. The draft remains uncommitted and unaccepted.

## Remaining pure-domain blockers

### P0 — prohibited-copy format-character bypass

`normalizeText()` and the compact-pattern pass do not remove Unicode format characters. Direct synthetic invocations show both `Human\u200buse.` and `Animal\u200buse.` pass publication when an approved negative disclaimer is present. Add normalization and regression cases for zero-width and other format-character obfuscation across every binding prohibited category. The scanner remains defense in depth and never substitutes for legal or scientific approval.

### P1 — caller-shaped checkout decision is trusted

`canCreateCheckout()` currently returns `true` for a fabricated `{ decision: "pass" }` value and throws for `null`. It must consume an opaque server-produced result or validate the complete aggregate, including every required gate, expected order-line scope, evidence bindings, and structural-denial rules.

### P1 — malformed runtime events throw

Direct calls with valid snapshots and `null` events throw before returning a typed denial in `transitionOrder()`, `transitionPayment()`, and `transitionFulfillmentRelease()`; `canFulfill(null)` also throws. Every exported boundary must validate unknown runtime input before reading discriminants or nested values and must fail closed without throwing.

### P1 — exported jurisdiction mapper has no invalid-runtime result

`jurisdictionStateToGateStatus("INVALID")` returns JavaScript `undefined` despite its declared `GateStatus` result. Accept `unknown` at this boundary and return the domain state `unknown` for every invalid runtime value.

## Required system-level evidence still absent

The pure layer cannot prove the binding commerce controls by itself. Later implementation tasks must add:

1. raw-body payment-webhook signature verification, same-event/same-hash idempotency, hash-conflict handling, out-of-order events, and an append-only payment journal;
2. server price reloads, browser-total tampering denial, hosted checkout only, redirect-only success denial, and reconciliation/refund/dispute behavior;
3. database-enforced tenant isolation, immutable decisions, lot/COA linkage, reservation races, and one-time fulfillment-release consumption;
4. an atomic server transaction that loads verified payment evidence, current eligibility/compliance evidence, release state, and inventory before fulfillment effects;
5. protected-route and account-eligibility integration tests, plus responsive, keyboard, focus, reduced-motion, and 200% zoom browser tests; and
6. operational tests for failed orders, compliance holds, refunds, incidents, backup restoration, and recovery.

Until these adapters and transactions exist, caller-provided booleans or evidence identifiers are not accepted proof of payment, compliance clearance, or fulfillment eligibility.

## Rejected starter behavior still present

- `src/app/api/health/route.ts` exposes internal launch-gate count and jurisdiction-state data. It remains unaccepted legacy scaffold code and must become a neutral shallow/liveness response during its scheduled implementation task.
- `src/app/layout.tsx` and `src/app/globals.css` still use the rejected Outfit/navy-gold starter direction. They are not evidence of design-system compliance and must remain untouched until Superdesign approval is recorded.

## Task 2 acceptance gate

Task 2 cannot be marked complete until:

1. every remaining P0/P1 pure-domain blocker above has a failing regression test followed by a verified fix;
2. `npm run lint`, `npm run typecheck`, and `npm test` all exit zero on the accepted snapshot;
3. prohibited-copy tests cover normalization and obfuscation for every binding prohibited category;
4. malformed runtime inputs deny or return `unknown` without throwing;
5. results and nested evidence arrays are immutable;
6. the planned database/provider/integration boundaries are implemented and tested in their owning tasks; and
7. a fresh adversarial review finds no remaining fail-open path.

Passing this gate still does not open any catalog, jurisdiction, payment-provider, tax, shipping, fulfillment, security, backup, or production launch gate.
