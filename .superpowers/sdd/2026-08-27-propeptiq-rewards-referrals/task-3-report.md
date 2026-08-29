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

## Fix round 1 — 2026-08-28

### Outcome

Resolved all three Important and one Minor review findings without adding
route, checkout, administration, lifecycle-service, or external-provider
orchestration.

- Terms acceptance now selects exactly one current row for the requested
  program at the injected acceptance time, verifies the exact version id,
  reads the stored terms text and lifecycle facts, computes SHA-256 over that
  text on the server, and requires both stored and caller hashes to equal the
  computed digest. Replay repeats the same verification before returning the
  prior immutable acceptance.
- Shared-set replace/deactivate now require a bounded opaque idempotency key and
  use an immutable durable receipt containing the exact set/owner, mutation
  kind, expected compare-and-swap timestamp, server-computed canonical payload
  hash, public result, applied timestamp, and created timestamp. New mutations
  perform CAS and receipt append atomically in one serializable transaction.
- A revoked referral code no longer blocks a distinct new active code for the
  same owner. Revoked id reuse, revoked global-code reuse, active-owner
  collision, and non-exact active replay still fail closed.
- Reward ledger, referral conversion, and shared-set owner reads now accept
  independent bounded pages (default 50, maximum 100), use deterministic
  `LIMIT`/`OFFSET` queries, and return deeply immutable page metadata and
  `hasMore`. Aggregate counts and totals remain separate and untruncated.

No production data, credential, external database, or provider was used.

### Files

- `src/db/schema/growth.ts`
- `src/db/repositories/growth-repository.ts`
- `src/db/repositories/growth-read-repository.ts`
- `src/growth/read-model.ts`
- `tests/integration/growth-repository.test.ts`
- `src/db/migrations/0012_bizarre_domino.sql`
- `src/db/migrations/0013_shared_research_set_mutation_receipts_immutable.sql`
- `src/db/migrations/meta/0012_snapshot.json`
- `src/db/migrations/meta/0013_snapshot.json`
- `src/db/migrations/meta/_journal.json`

### RED evidence

The first review-focused PGlite run executed 28 tests and exited 1 with 16
failures / 12 passes. The failures directly demonstrated:

- unbounded array-shaped owner histories and absent page validation/SQL limits;
- timestamp/payload heuristics accepting a replay with a different original
  `expectedUpdatedAt`;
- the missing durable mutation-receipt table;
- missing/future/superseded/malformed terms rows being accepted or surfacing a
  raw FK error instead of a persistence conflict;
- stored terms corruption being trusted on first acceptance and replay; and
- a revoked owner referral code blocking a distinct replacement.

The injected receipt-rollback test initially used one item and therefore hit
the existing two-item domain bound before the intended receipt append. The
fixture was corrected to two fixed product ids before production behavior was
implemented. A later supplemental overlap test initially collected zero tests
because its test-only hash helper was absent; it was corrected to the fixed,
precomputed SHA-256 value before the final run.

### GREEN, rollback, idempotency, and privacy evidence

Final focused PGlite result: 1 file, 32/32 tests passed.

The focused suite proves:

- zero writes for missing, future, superseded, malformed, overlapping,
  caller-hash-mismatched, and stored-text/hash-mismatched exact terms;
- exact replay re-verifies stored terms text and rejects post-acceptance
  corruption while preserving the one prior acceptance;
- same mutation key plus the exact immutable set/owner/kind/expected timestamp/
  payload returns the prior receipt result;
- same key with a different expected timestamp, payload, kind, set, or owner
  fails closed, and a new key cannot replay a stale CAS;
- receipt append failure rolls back label, timestamp, item replacement, and the
  receipt itself;
- receipt `UPDATE` and `DELETE` are rejected by the custom immutable-history
  trigger;
- revoked-owner replacement succeeds while revoked id/code reuse remains a
  collision;
- each page query binds a SQL limit/offset, invalid negative/unsafe/excessive
  values are rejected before opening a transaction, and aggregate counts remain
  1 when the requested page is empty;
- owner reads remain deeply immutable and exclude email, Clerk id, address,
  product/order lines, payment/provider evidence, raw IP/cookie/envelope,
  referred identity, and receipt idempotency/payload/expected/applied internals.

### Status mapping

The persistence/domain mapping is unchanged and remains explicit:

- `draft` -> `draft`
- `active` -> `active`
- `superseded` -> domain `retired`

Unknown persistence statuses are rejected; no persistence value is cast to the
domain lifecycle type.

### Migrations

- Generated schema migration: `0012_bizarre_domino.sql`
- Sanctioned custom follow-up: `0013_shared_research_set_mutation_receipts_immutable.sql`

The generated migration adds the owner-bound receipt table and its constraints.
The custom follow-up rejects every receipt `UPDATE` or `DELETE` with SQLSTATE
`55000`. A second `npm run db:generate` reported `No schema changes, nothing to
migrate`; `npm run db:check` reported `Everything's fine`.

New migration artifact SHA-256:

```text
0012_bizarre_domino.sql                                  FF3806360520A8C3EADF100B5E6D40C82D0A797F5A901EC535C9065FFDC67D9D
0013_shared_research_set_mutation_receipts_immutable.sql 67B6F65FCAFCF4A74B7C8D20861A12D2FBF7A54F6521DE04CC6B4DB1C7DB887C
0012_snapshot.json                                       EAEAAF46A684754567FF6BC868528EBB299179CE56A9013E630D5F16992708EF
0013_snapshot.json                                       0C91F503021BC5ACFA0EF27BC31A444FBAC7DAA9DE8FA51DE143AD1F8EE995E2
```

### Validation gates

- Focused growth repository PGlite integration: 1 file, 32/32 passed.
- Growth schema PGlite integration: 1 file, 14/14 passed.
- Affected rewards/referrals/affiliate domain plus serializable retry: 4 files,
  43/43 passed.
- Full unit suite: 71 files, 786/786 passed.
- `npm run db:generate`: exit 0, no schema changes.
- `npm run db:check`: exit 0.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, zero warnings.
- `git diff --check`: exit 0; only expected Windows LF/CRLF notices appeared.
- Pre-0012 migration preservation audit: 25/25 exact SHA-256 matches.

### Implementation commit and current file SHA-256

```text
1ab1ee408cfadbe1ede9a8c5042326e4c2208326
fix(growth): verify terms and durable mutation replay
```

```text
src/db/repositories/growth-repository.ts      1F6AB02CB671A67E285338375991E350912E6C425A0832ED445DBBE1FAA180BC
src/db/repositories/growth-read-repository.ts 226B2558DAF0DAED99F9934EB7FE69AB122A9237560FB6431867FC24020F81CF
src/db/schema/growth.ts                       033A6CD0E8FFBBE0A8FBCE1E0A196EF8251043B12FD33B77EF9272668B67F3CE
src/growth/read-model.ts                      4A95740FB251B192B4077A08A8490EAB04C20B4DDB27D928D04FD5788548FAFD
tests/integration/growth-repository.test.ts   88AC4C2834256429B5518BE2C5B877B721E00321A37FD03366E937063D7F5F3C
src/db/migrations/meta/_journal.json          A21F8839EBA7C5B338AAA7D4473E2D4D6126B2C765B4C4D49C635C5777745627
```

### Pre-0012 byte-for-byte preservation hashes

Every pre-existing SQL migration, snapshot, and migration README through 0011
matched the baseline captured before generation:

```text
0000_groovy_outlaw_kid.sql               6BE7E54EFC0DC3242E8DA0482D5BD8F8ED05D89AE9A5BAA899CA853E749D367F
0001_thankful_khan.sql                   ECFA43084B2291093547CA1A85459CD5E81C37BF23B90CDF25E3CCE7A2FC104E
0002_lumpy_jigsaw.sql                    50BA5A68437C8AD267DF2AB20F6BD1C8FE4D991602B7923F24A5A22E9345EF56
0003_talented_centennial.sql             67CC296E81127B56E5484A3A617E18DAFAF967710A787DE063127EB4A5124A30
0004_soft_whiplash.sql                   619DC32B5A588856AB8A9369867327F7AC46E80DF37C18F00950C10828EAEB6F
0005_pink_fat_cobra.sql                  949654DEB62464B1AD6BDB8A559517CF4E63122A270E475190D8FA549D2A6050
0006_growth_settlement_targets.sql       2291C10E9924754F21AA7E98A1A2440E7BB540DECD0E0B564E2B80389A67AD1E
0007_affiliate_payout_policy_fk.sql      18853558D8E0963473EA0288F14B251A4818D89F6F6D3F65811E0292EC3864B7
0008_growth_history_integrity.sql        2DDDE0877DEA40DAB134982EB44AEE7F06540D4BA09AFADEB1B96F028AF1A300
0009_growth_settlement_fk_targets.sql    D3444065C0B79765870093EDBDB9DB98B1BF3B876142058CFE3D2AE6C829AC47
0010_growth_settlement_composite_fks.sql 4AA72850E085CF236A5C9EF446FF247536851595800365474A2A32232598E1CD
0011_growth_trigger_search_path.sql      4A061FB087D588843A9F87D8AC7D3D8AB9947EAC4E2BD12C5D09F77CA81EE06A
0000_snapshot.json                       5EBDD727DB2B02234616819A4FAD6F8442035A28118846D83AF0AEC4E16369B8
0001_snapshot.json                       69F8D0C84D96C10F80A94E61C03E243215CD4A12177A320641BBF8A02894D47A
0002_snapshot.json                       D35F66C848EA939C1237AE2077552A88EB01EE419AE7D0DE609852C5F16AEEA7
0003_snapshot.json                       E296CF5DF505590B633D7E102947C916762425EA24F5F5788E5707B3077E79DC
0004_snapshot.json                       97FF38A5CCEABA80E554E0AE63E60B519647F1CE90A60013C3149BD35709CC2B
0005_snapshot.json                       D5E144CB8E024C9FF0E91800DB1D541F4C4D2959225EDD99ADCF9162E8E2C0BF
0006_snapshot.json                       24B91DB65EDA658760814C577C7E571BDBBF5743399254B1904776F391B39169
0007_snapshot.json                       F570732679EF731A5AD2774763DB1AA5513292A86BE43BFE5A2D3C4C74081A5E
0008_snapshot.json                       847D67DD3FD7CC5B23449647B31E6156B192916B7A1B309E4B8655D3531D17C1
0009_snapshot.json                       B96103F47DA11F0DE07E1B60FCBB026FD89472B68FBC816AFEDDFDC1BF7624A4
0010_snapshot.json                       D8FB34F82EF4FE6A66348BA0D5E753E9858924B24009AC0E32120BC36DB70F6B
0011_snapshot.json                       E25BCC40C7E01C0B17299609BE4D62304F9F31FA65C1CAF9A7BE2169BAD99487
README.md                                 399459397723943CA3D8E1BDC9782652AF12816696B6AE1AE441629415A05F28
```

### Concerns and boundaries after Fix round 1

- PGlite proves the migrations, constraints, rollback, immutable receipt
  trigger, and repository behavior exercised here; it is not evidence of a
  real-PostgreSQL contention run.
- Offset paging is deliberately bounded for V1 and deterministic within the
  serializable read snapshot. A future cursor API may be preferable for very
  large histories, but no unbounded read remains.
- The prior report's concern about lacking a durable arbitrary shared-set
  mutation key is resolved by migrations 0012/0013 and the receipt-backed
  repository implementation.
- The migrations remain source-only. Applying or reconciling an external
  database was not authorized or attempted.
