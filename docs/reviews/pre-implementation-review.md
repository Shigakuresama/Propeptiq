# Pre-Implementation Review

**Reviewed:** 2026-08-24

**Verdict:** **TASK 2 PURE-DOMAIN LAYER ACCEPTED; SYSTEM GATES REMAIN CLOSED**

**Scope:** The committed Task 2 policy layer through `51fcefd`. The focused acceptance applies only to `src/domain/` and its binding policy documentation. It does not approve the starter UI/API, prove later database/provider/browser boundaries, or open a production launch gate.

## Why this review exists

The repository contains useful partial work created around the planning and Superdesign approval gates. The user approved the exact Superdesign v3 and `responsive-v1` handoff, releasing implementation while leaving every commerce and production gate closed. The domain layer then passed a fresh commit-range review, a failing-test-first correction round, and a scoped re-review with no remaining finding.

## Reproducible quality snapshot

Fresh checks against the accepted Task 2 snapshot produced:

| Check | Result |
|---|---|
| `npm run verify` | Passed: zero-warning lint, strict typecheck, 6 test files / 299 tests, and the Next.js 16.3.2 production build |
| `npm audit --omit=dev` | Passed: 0 vulnerabilities |
| `npm audit` | Reports 4 moderate advisories in the development-only `drizzle-kit` → `@esbuild-kit` → `esbuild` path; the suggested change is a semver-major downgrade, so no forced remediation was applied |
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

These are implementation observations, not production launch approvals. Task 2 is committed and accepted only in this pure-domain scope.

## Closed pure-domain blockers

The independent review ran in multiple adversarial passes. The final scoped commit-range re-review returned `Spec compliance: PASS` and `Task quality: APPROVED`, with no remaining Critical, Important, or Minor finding in the pure scope. Current regressions demonstrate:

1. Unicode control/format characters and punctuation fragmentation cannot hide prohibited injection, human-use, animal-use, guarantee, or related language. Approved disclaimers and structured claim text must remain nonempty after normalization.
2. `evaluateCheckoutCreation()` accepts only the immutable aggregate instance emitted by the policy boundary and returns a structured decision with reason codes, evidence references, and required actions. Null, partial, cloned, and deserialized caller-shaped `pass` projections deny and must be re-aggregated from current server inputs.
3. Missing, duplicate, unexpected, malformed, sparse, or incomplete gate/evidence/order-line arrays resolve to `unknown` or another typed denial without throwing. Sparse capability, currency, publication-policy, and claim-evidence arrays also deny.
4. Null, scalar, array, and representative malformed-object authorization, order, payment, release, fulfillment, and publication inputs return typed denials rather than throwing.
5. Runtime jurisdiction values map exactly; every invalid value maps to `unknown`. Payment verification requires the exact boolean `true`, and malformed gate decisions or clearance-revocation booleans cannot transition state.
6. A verified dispute replay against `paid_on_hold` idempotently preserves the hold and cleared release binding; browser-supplied dispute evidence still denies.
7. Revoked and expired fulfillment releases retain immutable clearance-reference history and reject reuse of any prior reference, including after an intervening reissue.

The final order strictness, sparse-array, normalized-empty disclaimer/claim, and related hardening changes have witnessed failing-test-then-passing-test evidence from this review cycle. Some earlier shared-workspace repairs appeared concurrently before their automated regression was first run. Their pre-fix behavior was reproduced directly and their current regression behavior is verified, but no Git-verifiable automated RED phase exists for those earlier changes; this review does not claim otherwise.

This focused approval does not prove database transactionality, webhook authenticity, persistence, or browser behavior. The scanner remains defense in depth and never substitutes for legal or scientific approval.

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
- `src/app/layout.tsx` and `src/app/globals.css` still use the rejected Outfit/navy-gold starter direction. They are not evidence of design-system compliance and will be replaced only when the approved design-system task owns those files.

## Task 2 candidate gate

The current pure-policy candidate now demonstrates:

1. current regression coverage for every identified P0/P1 pure-domain blocker, with the test-history limitation above explicitly preserved;
2. passing lint, strict typecheck, 299 unit tests, production build, production dependency audit, and whitespace validation;
3. prohibited-copy normalization and adversarial obfuscation coverage;
4. fail-closed malformed and sparse runtime behavior;
5. immutable result and nested evidence snapshots; and
6. a final independent scoped re-review with no remaining Critical, Important, or Minor defect in the focused scope.

The Task 2 plan checkboxes are marked complete against commits `6200bfc` and `51fcefd`. Database/provider/integration proofs remain mandatory in Tasks 3, 8, and 9 and for final completion; they are not implied by the pure-policy acceptance.

Passing this gate still does not open any catalog, jurisdiction, payment-provider, tax, shipping, fulfillment, security, backup, or production launch gate.
