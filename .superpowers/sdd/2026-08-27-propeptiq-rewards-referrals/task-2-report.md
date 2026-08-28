# Task 2 — Versioned growth database model

## Outcome

Implemented the Task 2 Drizzle/PGlite growth schema without production policy data or activation. The database now models versioned loyalty, referral, affiliate, and common terms records; reward balances and ledger history; redemptions; customer and affiliate attribution; commissions and externally recorded payouts; shared research sets; and one exclusive growth attribution per order.

The binding balance nuance is enforced: `reward_accounts.available_points` and ledger available balances/deltas may be negative within JavaScript safe-integer bounds, while pending balances remain nonnegative. Each ledger delta is signed and safe-integer bounded, and every ledger entry must change at least one balance.

## Changed implementation files

- `src/db/schema/growth.ts`
- `src/db/schema/enums.ts`
- `src/db/schema/index.ts`
- `tests/integration/growth-schema.test.ts`
- `src/db/migrations/0005_pink_fat_cobra.sql`
- `src/db/migrations/meta/0005_snapshot.json`
- `src/db/migrations/meta/_journal.json`

This report is committed separately under the existing SDD convention.

## RED evidence

Initial focused command:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 1: 1 test file failed and 8 of 8 tests failed. The table inventory was empty, and the remaining cases failed because `loyalty_policies`, `growth_terms_versions`, and `reward_accounts` did not exist. This was the expected missing-schema failure before any production schema file changed.

During generated-DDL validation, PostgreSQL rejected the first generated migration before test logic because the composite `referral_conversions` ownership FK lacked an exact unique target. The schema was corrected and the invalid uncommitted generated migration/snapshot/journal append were discarded before regenerating one clean `0005` history entry.

A second test-first hardening cycle added exact commission attribution-buyer-order ownership and paid-payout consumption:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 1: 7 tests passed and 1 failed because `affiliate_commissions.buyer_user_id` did not yet exist. The schema then added the exact composite ownership FK and required `payout_id` for a `paid` commission.

## GREEN evidence

Final focused command:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 0: 1 test file passed and 8 of 8 tests passed. Coverage includes:

- all 18 growth tables and zero seeded policy/terms rows;
- positive version checks, lifecycle coherence, and one current active non-superseded row for each policy program;
- common `growth_terms_versions` / `growth_terms_acceptances` for both `customer_rewards_referrals` and `affiliate`, with exact program/version/hash binding and repeat-acceptance idempotency;
- one reward account per buyer, signed safe-integer balances/deltas, nonnegative pending balances, nonzero ledger events, duplicate event/source rejection, and restricted history deletion;
- one active reward reservation per checkout attempt, exact buyer/order/attempt/policy ownership, safe point/money bounds, and restricted financial FKs;
- globally unique opaque customer referral codes, one active code per owner, self-referral rejection, one buyer/policy attribution, and one conversion per first order;
- affiliate terms/profile/attribution ownership, self-attribution rejection, one commission per order, idempotency, exact attributed buyer/order ownership, one payout slot per commission, safe money bounds, and external provider/reference evidence required only when a payout is marked paid;
- shared-set code/label/item uniqueness and quantity bounds, coherent soft deactivation, and cascade only for the set's ephemeral item rows;
- one order growth-attribution row with a database check and composite FKs requiring exactly one of customer referral or affiliate, never both.

## Generated migration review

- Migration SQL: `src/db/migrations/0005_pink_fat_cobra.sql`
- Snapshot: `src/db/migrations/meta/0005_snapshot.json`
- SQL SHA-256: `949654DEB62464B1AD6BDB8A559517CF4E63122A270E475190D8FA549D2A6050`
- Snapshot SHA-256: `D5E144CB8E024C9FF0E91800DB1D541F4C4D2959225EDD99ADCF9162E8E2C0BF`
- Final journal SHA-256: `A322928F9F300967F8EEB76C916B240992AB97AB98B27DEDA0461258884CDA9F`
- Generated DDL creates 18 tables and contains zero `INSERT`, `UPDATE`, or `DELETE` statements.
- Generated FKs contain 28 `ON DELETE restrict` clauses and one `ON DELETE cascade`, solely from `shared_research_set_items` to its compositional parent.
- `meta/_journal.json` has exactly one generated append: `idx: 5`, `version: "7"`, `tag: "0005_pink_fat_cobra"`, `breakpoints: true`.
- No generated snapshot metadata was hand-edited.

## Pre-existing migration hash comparison

The Task 2 baseline recorded 12 files. Excluding the expected journal append, all 11 immutable artifacts remain byte-identical to the recorded hashes:

- SQL: `0000_groovy_outlaw_kid.sql` through `0004_soft_whiplash.sql` — 5 of 5 match.
- Numbered snapshots: `0000_snapshot.json` through `0004_snapshot.json` — 5 of 5 match.
- `src/db/migrations/README.md` — 1 of 1 matches.

The prior journal baseline hash was `4C45DD97EBD43593E651B3757113E266CC8DD2763220170B38B2BEC480C6D5D0`; its expected single append produced the final hash recorded above.

## Database generation and validation

First final generation:

```text
npm run db:generate
```

Exit 0; generated `src/db/migrations/0005_pink_fat_cobra.sql` and `meta/0005_snapshot.json`.

Mandatory second generation:

```text
npm run db:generate
```

Exit 0 with exact no-change evidence: `No schema changes, nothing to migrate 😴`.

Additional required gates:

- `npm run db:check` — exit 0; `Everything's fine 🐶🔥`.
- `npm run test:integration -- --run tests/integration/growth-schema.test.ts` — exit 0; 1 file and 8 tests passed.
- `npm run typecheck` — exit 0.
- `git diff --check` — exit 0; only line-ending conversion warnings were emitted for existing working-copy conventions.

## Commit

Implementation/migration commit:

```text
cc8a922d1367e8423a3d7a7a1317ec4b0c7dbb7c
feat(db): add versioned growth ledgers and attribution
```

## Concerns and boundaries

- No policy or terms row was seeded, activated, or written to an external database.
- PGlite proves generated migration application and the tested PostgreSQL schema constraints; it does not prove real PostgreSQL concurrency or deployment state.
- The binding persistence lifecycle uses `superseded`; Task 1's pure-domain terminal name is `retired`. Task 3 must make that mapping explicit when loading policies rather than treating the two labels as interchangeable.
- Reward ledger rows are modeled and consumed as append-only history. Task 3 must expose insert-only repository operations and transactional balance projection updates; no repository behavior is part of Task 2.

## Fix round 1 — growth history integrity

### Outcome

Resolved the validated Task 2 review defects without changing committed migration history. Exact selected-program settlement is now enforced in both directions: a referral conversion can exist only for a matching `customer_referral` order-growth row, and an affiliate commission can exist only for a matching `affiliate` row. The order, buyer, selected attribution, policy id, and policy version must all match. A settled order-growth row cannot then be changed or deleted so that those facts detach.

Affiliate payout consumption now uses a composite FK over payout id, affiliate profile, affiliate policy id, and affiliate policy version. Referral conversions persist their exact referral policy id/version and bind those facts to the selected attribution. Reward ledger entries reject every UPDATE and DELETE. All three policy tables and `growth_terms_versions` reject deletion and immutable fact changes while preserving the forward lifecycle transitions required by Task 8.

No production policy or terms row was seeded or activated. The `retired` domain to `superseded` persistence mapper remains explicitly deferred to Task 3; no cast was added.

### Fix-round RED evidence

Focused command before schema or migration changes:

```text
npm run test:integration -- tests/integration/growth-schema.test.ts
```

Exit 1: 1 test file failed; 6 tests failed and 6 passed. The six failures each showed a forbidden mutation resolving successfully:

- immutable policy/terms facts could be updated;
- a reward ledger entry could be updated;
- a commission under affiliate policy A could consume a payout under affiliate policy B for the same profile;
- an order selecting customer referral could receive an affiliate commission;
- an order selecting affiliate could receive a referral conversion;
- settlement rows could use attribution/policy facts different from the selected order-growth facts.

### Fix-round GREEN evidence

Final focused command:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 0: 1 test file passed and 12 of 12 tests passed. The focused suite now covers both cross-program directions; attribution, policy, and buyer mismatch; payout-policy mismatch; reward ledger UPDATE and DELETE; immutable policy/terms UPDATE and DELETE; permitted forward policy/terms lifecycle changes; forbidden lifecycle reversal/retiming; and prevention of deleting an order-growth row after settlement.

Full unit suite:

```text
npm test
```

Exit 0: 71 test files passed and 786 of 786 tests passed.

### Generated follow-up migrations

- `src/db/migrations/0006_growth_settlement_targets.sql`
  - Adds exact referral policy facts to referral conversions and their exact attribution FK.
  - Adds the payout/profile/policy/version composite unique target.
  - SQL SHA-256: `2291C10E9924754F21AA7E98A1A2440E7BB540DECD0E0B564E2B80389A67AD1E`.
- `src/db/migrations/0007_affiliate_payout_policy_fk.sql`
  - Replaces the payout/profile FK with the exact payout/profile/policy/version FK.
  - SQL SHA-256: `18853558D8E0963473EA0288F14B251A4818D89F6F6D3F65811E0292EC3864B7`.
- `src/db/migrations/0008_growth_history_integrity.sql`
  - Generated with `drizzle-kit generate --custom`, then populated with the sanctioned PostgreSQL trigger/function SQL for exact selected-program settlement, reverse settlement integrity, append-only reward ledger history, and immutable versioned policy/terms facts.
  - SQL SHA-256: `2DDDE0877DEA40DAB134982EB44AEE7F06540D4BA09AFADEB1B96F028AF1A300`.

Generated snapshot SHA-256 values:

- `0006_snapshot.json`: `24B91DB65EDA658760814C577C7E571BDBBF5743399254B1904776F391B39169`.
- `0007_snapshot.json`: `F570732679EF731A5AD2774763DB1AA5513292A86BE43BFE5A2D3C4C74081A5E`.
- `0008_snapshot.json`: `847D67DD3FD7CC5B23449647B31E6156B192916B7A1B309E4B8655D3531D17C1`.
- Final generated journal: `AA0CDC71CEA07481C3D09BDF694D1892B4CD5EAB3E8EBC36477A557782A7C5A9`.

The journal contains the expected generated appends for indices 6, 7, and 8. No generated snapshot was hand-edited.

### Immutable history comparison

All 13 artifacts that predated fix round 1 remain byte-identical to the captured baseline:

- SQL `0000` through committed `0005`: 6 of 6 SHA-256 hashes match.
- Numbered snapshots `0000` through committed `0005`: 6 of 6 SHA-256 hashes match.
- `src/db/migrations/README.md`: 1 of 1 SHA-256 hash matches.

In particular, committed `0005_pink_fat_cobra.sql` remains `949654DEB62464B1AD6BDB8A559517CF4E63122A270E475190D8FA549D2A6050`, and `0005_snapshot.json` remains `D5E144CB8E024C9FF0E91800DB1D541F4C4D2959225EDD99ADCF9162E8E2C0BF`.

### Fix-round validation

- `npm run db:generate` — exit 0 with exact no-change evidence: `No schema changes, nothing to migrate 😴`.
- `npm run db:check` — exit 0; `Everything's fine 🐶🔥`.
- `npm run typecheck` — exit 0.
- `git diff --check` — exit 0; only the repository's working-copy line-ending warnings were emitted.
- Focused PGlite integration — exit 0; 12 of 12 tests passed.
- Full unit suite — exit 0; 786 of 786 tests passed.

### Fix-round implementation commit

```text
9c550163cf6c2e00fdff4b5b6028751824e10dc2
fix(db): enforce growth history integrity
```

### Remaining boundary

PGlite proves migration application and the tested PostgreSQL constraints/triggers. This round did not use an external PostgreSQL database and makes no real-concurrency or deployment claim.

## Fix round 2 — relational settlement and trigger search path

### Outcome

Resolved the two verified High findings without changing migrations `0005` through `0008` or any earlier numbered history. Settlement integrity no longer depends on trigger existence checks for concurrency safety:

- `referral_conversions.program` is non-null, defaults to `customer_referral`, and is constrained to that value.
- `affiliate_commissions.program` is non-null, defaults to `affiliate`, and is constrained to that value.
- `order_growth_attributions` exposes separate program-specific six-column unique targets.
- Each settlement table has a six-column composite FK matching order, buyer, fixed program, selected attribution, exact policy id, and exact policy version with `ON DELETE restrict` and normal PostgreSQL referenced-key update protection.

The existing defensive triggers remain in place. All six public functions introduced by `0008` are redefined with `SET search_path = pg_catalog, public, pg_temp`; the three settlement functions use `public.`-qualified application tables. No function is `SECURITY DEFINER`, and privilege revocation remains outside this checkpoint.

### Fix-round RED evidence

Focused command before schema or migration changes:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 1: 1 test file failed; 4 tests failed and 10 passed. The failures proved:

- both program-specific composite FK definitions were absent;
- all six trigger functions had null `proconfig` rather than a controlled search path;
- a temporary `referral_conversions` table could shadow the public child lookup and permit deleting a settled public parent;
- a temporary `order_growth_attributions` table could shadow the public parent lookup and permit a cross-program public referral conversion.

### Fix-round GREEN evidence

Final focused command:

```text
npm run test:integration -- --run tests/integration/growth-schema.test.ts
```

Exit 0: 1 test file passed and 14 of 14 tests passed. In addition to the prior Task 2 coverage, the suite now proves exact FK metadata, fixed/defaulted child programs, rejection of arbitrary child programs, parent UPDATE/DELETE rejection even after the defensive parent trigger is removed inside an isolated PGlite test, exact child mismatch rejection, pinned function configuration, schema-qualified function DDL, and temporary-table/search-path bypass resistance.

### Guarded real-PostgreSQL lane

Added `tests/postgres/growth-settlement-contention.postgres.test.ts` with two guarded races:

- parent DELETE starts first, concurrent settlement INSERT blocks, then fails with `23503` after the parent commits;
- settlement INSERT starts first, concurrent parent-key UPDATE blocks, then fails with `23503` after the child commits.

Each transaction uses a 4-second `lock_timeout` and 8-second `statement_timeout`, and the blocking probe is bounded. The file uses the existing `resolveTestDatabase` guard and requires both `TEST_DATABASE_URL` and exact `TEST_DATABASE_CONFIRMATION=isolated-test-database` before Pool construction.

Current environment probe:

```text
TEST_DATABASE_URL_PRESENT=False
TEST_DATABASE_CONFIRMATION_EXACT=False
```

Result: **NOT RUN**. No database connection was attempted, and this checkpoint makes no real-PostgreSQL concurrency claim.

### Generated follow-up migrations

Drizzle emitted consuming FKs before their required target uniqueness when attempted as one migration. The uncommitted attempt was discarded in full, without editing snapshot metadata, and the normal schema change was generated in dependency order:

- `src/db/migrations/0009_growth_settlement_fk_targets.sql`
  - Adds fixed/defaulted child program columns and checks plus both parent unique targets.
  - SQL SHA-256: `D3444065C0B79765870093EDBDB9DB98B1BF3B876142058CFE3D2AE6C829AC47`.
- `src/db/migrations/0010_growth_settlement_composite_fks.sql`
  - Adds the referral and affiliate six-column composite FKs.
  - SQL SHA-256: `4AA72850E085CF236A5C9EF446FF247536851595800365474A2A32232598E1CD`.
- `src/db/migrations/0011_growth_trigger_search_path.sql`
  - Generated with `drizzle-kit generate --custom`, then populated with sanctioned `CREATE OR REPLACE FUNCTION` SQL.
  - SQL SHA-256: `4A061FB087D588843A9F87D8AC7D3D8AB9947EAC4E2BD12C5D09F77CA81EE06A`.

Generated snapshot SHA-256 values:

- `0009_snapshot.json`: `B96103F47DA11F0DE07E1B60FCBB026FD89472B68FBC816AFEDDFDC1BF7624A4`.
- `0010_snapshot.json`: `D8FB34F82EF4FE6A66348BA0D5E753E9858924B24009AC0E32120BC36DB70F6B`.
- `0011_snapshot.json`: `E25BCC40C7E01C0B17299609BE4D62304F9F31FA65C1CAF9A7BE2169BAD99487`.
- Final generated journal: `E2D6702B74C69063FCB5D2F6F1018F8BEA196EE9DDFE3A994CFCF064B5A7F5F4`.

The journal contains the expected generated appends for indices 9, 10, and 11. No generated snapshot was hand-edited.

### Immutable history comparison

All 19 pre-existing immutable artifacts remain byte-identical to the captured fix-round baseline:

- SQL `0000` through committed `0008`: 9 of 9 SHA-256 hashes match.
- Numbered snapshots `0000` through committed `0008`: 9 of 9 SHA-256 hashes match.
- `src/db/migrations/README.md`: 1 of 1 SHA-256 hash matches.

This explicitly includes committed migrations and snapshots `0005` through `0008`.

### Fix-round validation

- Focused PGlite integration — exit 0; 14 of 14 tests passed.
- Guarded real PostgreSQL — **NOT RUN** because both required guards were absent; no connection and no real-concurrency claim.
- `npm test` — exit 0; 71 test files and 786 of 786 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 with zero warnings.
- `npm run db:check` — exit 0; `Everything's fine 🐶🔥`.
- `npm run db:generate` — exit 0 with exact no-change evidence: `No schema changes, nothing to migrate 😴`.
- `git diff --check` — exit 0; only working-copy line-ending warnings were emitted.

### Fix-round implementation commit

```text
8b5eeb0c926417b150304a06deccab3ac7d52767
fix(db): bind settlements with relational integrity
```

### Remaining boundary

The guarded contention test is checked in but was not authorized by the current environment. Its real locking behavior must be executed later against an explicitly isolated, migrated PostgreSQL target before making a real-concurrency claim.
