# Task 3 — Transactional growth repositories and owner-safe read models

## Outcome

Implemented the Task 3 persistence boundary without wiring routes, checkout,
administration, or external providers. The repository now provides fail-closed
current policy/terms loading, explicit persistence/domain lifecycle mapping,
serializable reward ledger projection, idempotent growth persistence facts,
schema-compatible shared-set compare-and-swap mutations, and one compact,
deeply immutable owner-only growth snapshot.

No production policy row, credential, external database, provider API, or
production data was used.

## Changed implementation files

- `src/db/repositories/growth-repository.ts`
- `src/db/repositories/growth-read-repository.ts`
- `src/growth/policies.ts`
- `src/growth/read-model.ts`
- `tests/integration/growth-repository.test.ts`

This report is committed separately under the existing SDD convention.

## RED evidence

Initial focused command, before any production implementation:

```text
npm run test:integration -- --run tests/integration/growth-repository.test.ts
```

Exit 1: one suite failed before collection, with zero tests executed, because
`@/db/repositories/growth-repository` did not exist. This was the expected
missing-feature failure.

After the first bounded implementation, the same command executed 8 tests and
reported 2 failures / 6 passes. One failure exposed a real owner-read projection
bug; the other proved the corruption fixture was being stopped by Task 2's
immutable-history trigger before reaching the loader. The projection was fixed,
and the isolated corruption case explicitly removed only its in-memory policy
and terms history triggers.

The privacy case then failed 1 of 8 because suffix-based reference redaction
preserved semantic provider text. The read model was changed to a one-way,
truncated SHA-256 token.

The remaining test-first slices produced these expected missing-method REDs:

- 12 tests: 4 failed / 8 passed for redemption reservation, referral lifecycle,
  shared-set CAS, and affiliate payout persistence primitives.
- 13 tests: 1 failed / 12 passed for affiliate commission recording/reversal.
- 14 tests: 1 failed / 13 passed for exact terms acceptance, referral code,
  shared-set creation, and affiliate profile facts.

## GREEN evidence

Final focused command:

```text
npm run test:integration -- --run tests/integration/growth-repository.test.ts
```

Exit 0: 1 file and 14 of 14 tests passed.

The focused suite proves:

- exactly one current loyalty, customer-referral, and affiliate policy at the
  injected clock;
- exactly one current terms row for each terms program, with server-computed
  SHA-256 verification;
- fail-closed zero, future, superseded, malformed/domain-mismatched, overlapping,
  and hash-mismatched policy/terms states;
- reward-account creation, ledger insertion, and balance projection in one
  serializable retry boundary;
- rollback of account and ledger writes for injected ledger-insert failure and
  injected projection-update failure;
- exact replay returning the prior immutable result and conflicting replay
  throwing `GrowthPersistenceConflict`;
- idempotent/conflict-detecting redemption reservation, referral qualification
  and reversal, shared-set replace/deactivate, affiliate commission/reversal,
  payout reservation/paid marking, terms acceptance, referral code creation,
  shared-set creation, and affiliate profile creation;
- payout reservation atomically binds the exact approved commission set, and
  paid marking atomically advances the linked commissions;
- owner filtering across reward account/ledger, referral code/conversions,
  shared sets, affiliate profile, commissions, and payouts;
- a blocked buyer can read their own growth history because owner reads do not
  infer mutation authority from buyer status;
- deep immutability of every nested read-model object and array;
- privacy exclusion for email-like identity, Clerk identity, referred identity,
  shipping address, product lines/IDs, order IDs, payment/provider evidence,
  raw IP, and raw cookie/envelope sentinels.

## Status mapping

Persistence status is mapped explicitly:

- `draft` → `draft`
- `active` → `active`
- `superseded` → domain `retired`

Unknown persistence values, including a persistence-side `retired`, are rejected.
No persistence enum is cast to the domain type.

## Serializable and idempotency boundary

Every mutation method enters `runSerializableWithRetry`, which retains the
shared fixed policy of three total attempts for SQLSTATE `40001`/`40P01` and
rethrows non-retryable or exhausted failures. No repository method adds an
unbounded loop or swallows a payload conflict.

The reward ledger uses exact immutable payload comparison over entry/account/
buyer identity, kind, source, key, deltas, and occurrence time. The same pattern
is applied to the other durable keyed facts. Lifecycle transitions compare the
stored key plus exact fixed transition time/evidence before returning an
idempotent result.

## Owner read and privacy shape

The owner snapshot exposes only:

- pending/available points, USD-equivalent minor units, minimum-redemption
  progress, immutable ledger deltas/balances, and hashed references;
- the owner's opaque referral code, conversion state counts, reward-point total,
  and redacted conversion references;
- owner shared-set code/label/state/item count, never item/product lines;
- affiliate public profile facts, attribution count, commission totals by state,
  and payout totals by state.

Queries select only approved columns and predicate every owner-specific table by
the supplied owner or its owner-bound profile/account relationship. Staff reads
remain a separate contract.

## Validation gates

- Focused PGlite integration — exit 0; 1 file, 14/14 tests passed.
- Affected domain and retry tests — exit 0; 5 files, 60/60 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 with zero warnings.
- `git diff --check` — exit 0; only expected working-copy LF/CRLF notices were
  emitted while staging.

## Implementation commit and file SHA-256

Implementation commit:

```text
b6e17046c25172623d81945960e842f3ca3f7117
feat(growth): add transactional ledgers and private read models
```

- `src/db/repositories/growth-repository.ts` — `4D6A04D04839414033B8CE0ECC80D369AD2D3435C06DCDDF7799725BCBF07C04`
- `src/db/repositories/growth-read-repository.ts` — `7B569B84CEB2DAEDAFECDE3700B757C73D1562916ABF7F079B778F23B0E84FAB`
- `src/growth/policies.ts` — `C0E72FC9FD9A748BA20FE2D2714BD652C4824721DCA02EDA87EC6AC2E7B281E0`
- `src/growth/read-model.ts` — `3EE767472E55F5BA7B821F2F7F49432AAB86A5AFA5BE2FC4F801D9B21C6F93DD`
- `tests/integration/growth-repository.test.ts` — `F14E81008F449DC5E5DF2DD46E4D4C295E4BD84EAD67F7B001F0B788E80DA199`

## Concerns and boundaries

- PGlite proves the tested transaction rollback, constraints, and repository
  behavior, but this checkpoint makes no real-PostgreSQL contention claim.
- `shared_research_sets` has no arbitrary durable mutation-key column. Update and
  deactivation therefore use fixed-clock optimistic compare-and-swap identity
  (`expectedUpdatedAt` to exact `updatedAt`/`deactivatedAt`). Exact replay returns
  the stored result; stale or conflicting payloads fail closed. Adding an
  arbitrary shared-set mutation key would require a separately owned schema
  change.
- Provider and shipment lifecycle facts enter the generic append-only reward
  ledger through caller-supplied source type/ID and exact idempotency payloads;
  Task 3 does not decide when those facts occur.
- Referral, reward, and affiliate calculations remain in the approved pure
  domain modules. Checkout/payment/refund/fulfillment and admin authorization
  orchestration remain deferred to their assigned tasks.
