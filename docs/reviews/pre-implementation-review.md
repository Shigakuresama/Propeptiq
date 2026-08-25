# Pre-Implementation Review

**Reviewed:** 2026-08-24

**Verdict:** **REQUEST CHANGES**

**Scope:** Preserved starter UI/API code and uncommitted `src/domain/` draft. This is a read-only acceptance review; it does not approve or advance implementation.

## Why this review exists

The repository contains useful partial work created before the Superdesign approval gate closed. It is preserved to avoid losing work, but it cannot become an accidental implementation decision. Every issue below must be resolved test-first after the exact visual draft is approved and before Task 2 can be accepted.

## Reproducible quality snapshot

Fresh checks against the reviewed workspace produced:

| Check | Result |
|---|---|
| `npm test -- --run src/domain` | 5 files, 133 tests passed |
| `npm run typecheck` | Failed: 3 TypeScript errors |
| `npm run lint` | Failed: 2 warnings with a zero-warning gate |
| `git diff --check` | Passed; line-ending conversion warnings only |

The type failures are currently in the invalid-principal test cast, the eligibility structural-reason union, and an unreachable order-decision comparison. The lint failures are unused authorization test imports. A green isolated runtime suite is not sufficient while strict TypeScript/lint fail and integration/E2E/database/provider controls do not yet exist.

## Acceptance blockers in the domain draft

### P0 — fail-open or fulfillment/payment safety

1. **Explicit human-use copy bypass:** the publication scanner permits `For human use.` when the approved negative disclaimer is also present. A direct synthetic invocation returned `{"publishable":true,"status":"pass"}`. Add explicit human-use/human-consumption and veterinary/animal-use adversarial patterns plus regression tests. Scanner success remains defense in depth, never legal/scientific approval.
2. **Malformed jurisdiction projections:** an invalid runtime `rule.state` can fall through without an `unknown` result, and any matching manual-review outcome other than exact `rejected` falls into approval. Parse/validate persisted projections at the boundary and explicitly accept only approved enum members; every malformed value must resolve `unknown` and hold checkout.
3. **Strong-auth policy mismatch:** `application.review` and `payment.reconcile` currently set `requiresStrongAuth: false`, contrary to the documented approval and payment-control requirements. Human staff approval/reconciliation paths require current MFA plus server-owned reverification policy.
4. **Caller-trusted fulfillment:** `begin_fulfillment` checks only a numeric release version, while `carrier_handoff` trusts a caller-supplied `fulfillmentReleaseConsumed` boolean. Bind transitions to a server-created, current release/consumption record and perform payment, clearance, expiry, and one-time consumption atomically.
5. **Disputes are declared but not handled:** `dispute_recorded` exists in the event union, but the payment transition has no verified dispute branch. A signed dispute must journal evidence, move the payment to `disputed`, place/recheck the order hold, and revoke any unconsumed fulfillment release transactionally.

### P1 — structural denial and boundary hardening

1. Reject unexpected eligibility gate keys as structural `unknown`; do not drop them when all required gates happen to pass. Normalize malformed/duplicate/missing results before applying precedence.
2. Validate rule/decision IDs, dates, evidence references, product/SKU, destination, order, order-line, and evaluation-fingerprint bindings before a manual decision can affect eligibility.
3. Require a trusted issuance time and `expiresAt > now` before creating a fulfillment release. Prove at-expiry, reissue, revoke, race, and one-time-consume behavior.
4. Separate authoritative server price/tax/shipping projections from browser request types. Defensive parsers must turn malformed runtime values into typed denials instead of allowing `.trim()`/property-access exceptions.
5. Add the platform security ceiling for strong-auth policy age and bind reverification to the active authenticated session/action context.

### P1 — missing system-level evidence

The pure layer cannot prove the binding commerce controls by itself. Later tasks must add raw-body webhook signature verification, same-event/same-hash idempotency, hash-conflict handling, append-only payment journals, out-of-order events, server price reloads, browser-total tampering, guest/unapproved-account denial, independent-gate evaluation, lot reservation races, redirect-only success denial, refund/dispute release blocking, and database-enforced one-time fulfillment release consumption.

## Rejected starter behavior still present

- `src/app/api/health/route.ts` exposes internal launch-gate count and jurisdiction-state data. It remains unaccepted legacy scaffold code and must become a neutral shallow/liveness response during its scheduled implementation task.
- `src/app/layout.tsx` and `src/app/globals.css` still use the rejected Outfit/navy-gold starter direction. They are not evidence of design-system compliance and must remain untouched until Superdesign approval is recorded.

## Task 2 acceptance gate

After visual approval, Task 2 may be resumed but cannot be marked complete until:

1. every P0/P1 domain blocker above has a failing regression test followed by a verified fix;
2. `npm run lint`, `npm run typecheck`, and `npm test -- --run src/domain` all exit zero;
3. prohibited-copy tests cover normalization/obfuscation and every binding prohibited category;
4. malformed runtime inputs deny or return `unknown` without throwing;
5. results and nested evidence arrays are immutable; and
6. a fresh adversarial review finds no remaining fail-open path.

Passing this gate still does not open any catalog, jurisdiction, payment-provider, tax, shipping, fulfillment, security, backup, or production launch gate.
