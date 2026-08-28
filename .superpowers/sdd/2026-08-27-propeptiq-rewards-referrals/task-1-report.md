# Task 1 — Rewards, referrals, affiliates, and shared-set domain policies

## Changed files

- `src/domain/rewards.ts`
- `src/domain/rewards.test.ts`
- `src/domain/referrals.ts`
- `src/domain/referrals.test.ts`
- `src/domain/affiliates.ts`
- `src/domain/affiliates.test.ts`
- `src/domain/shared-research-sets.ts`
- `src/domain/shared-research-sets.test.ts`
- `src/domain/authorization.ts`
- `src/domain/authorization.test.ts`
- `src/domain/promotions.ts`
- `src/domain/promotions.test.ts`

## RED evidence

Command:

```text
npm test -- --run src/domain/rewards.test.ts src/domain/referrals.test.ts src/domain/affiliates.test.ts src/domain/shared-research-sets.test.ts src/domain/authorization.test.ts src/domain/promotions.test.ts
```

Output summary: exit 1. The four new test suites failed to resolve their missing domain modules. The authorization tests returned `operation_policy_missing` for the new owner operations and `identity_incomplete` for the new staff capabilities. The promotion tests failed because `selectBestAcquisitionDiscount` did not exist.

## GREEN evidence

Command:

```text
npm test -- --run src/domain/rewards.test.ts src/domain/referrals.test.ts src/domain/affiliates.test.ts src/domain/shared-research-sets.test.ts src/domain/authorization.test.ts src/domain/promotions.test.ts
```

Output summary: exit 0; 6 test files passed and 96 tests passed.

## Verification

- `npm run typecheck` — exit 0.
- `git diff --check` — exit 0; no whitespace errors. Git emitted existing CRLF conversion notices for four tracked domain files, but no diff-check failure.

## Commit

Feature implementation commit SHA: `b8de5ec53b3d739b505417dd48f6227b8c9a9fbc`.

## Concerns

- The policies are pure validation/calculation contracts only. No policy records were created or activated.
- Policy cardinality and current-policy selection are deliberately deferred to Tasks 2 and 3, as required.
- No payout provider, external customer action, or production data was used.

## Fix round 1

### RED evidence

Command:

```text
npm test -- --run src/domain/rewards.test.ts src/domain/referrals.test.ts src/domain/affiliates.test.ts src/domain/shared-research-sets.test.ts src/domain/authorization.test.ts src/domain/promotions.test.ts
```

Output summary: exit 1; 23 failures across 4 files and 108 tests. The new cases exposed public shared-set projection accepting invalid canonical shapes, policy parsers returning empty objects from prototype-only policies, missing exclusive attribution decisions, and the 101-minor / 5% / 100-refunded under-reversal.

### GREEN evidence

Command:

```text
npm test -- --run src/domain/rewards.test.ts src/domain/referrals.test.ts src/domain/affiliates.test.ts src/domain/shared-research-sets.test.ts src/domain/authorization.test.ts src/domain/promotions.test.ts
```

Output summary: exit 0; 6 test files passed and 108 tests passed.

Additional verification:

- `npm run typecheck` — exit 0.
- `git diff --check` — exit 0; no whitespace errors.

Fix implementation commit SHA: `463e780ade31ec0f2cec0b5012fd248f486d5a43`.
