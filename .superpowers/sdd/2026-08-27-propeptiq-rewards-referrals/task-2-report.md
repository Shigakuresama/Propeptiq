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
