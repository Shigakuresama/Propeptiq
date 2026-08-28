# Task 6 — Reviewed cash-affiliate workflow

## 6A checkpoint — Lightweight application and audited admin review/suspension

### Outcome

Implemented Task 6A only from clean base `1c01658944160ed6995aaac93db6fc2c412a540c`.
An authenticated active buyer with the existing verified-primary-email contract
can submit exactly one lightweight affiliate application containing only a
bounded canonical HTTPS channel URL or bounded handle, one closed promotion
method, and explicit acceptance of the exact current affiliate terms ID/hash.
The server recomputes the SHA-256 hash from stored terms text inside the same
serializable transaction that records the acceptance and pending profile.

The owner action enforces exact same-origin/CSRF, exact form fields, owner scope,
and a database-backed fixed-window limit. Replays return the original immutable
profile when the semantic application is unchanged; changed content conflicts
without mutating the stored acceptance or profile. Results are frozen and expose
only the owner's opaque code, public channel, method, status, version, and times.

One MFA-authenticated administrator with `growth:manage` may perform only
`pending -> active | rejected` or `active -> suspended`. Every successful
transition uses an exact integer expected-version CAS, increments the version
once, and inserts exactly one concise redacted `admin_audit` row atomically.
Stale versions, replays, invalid transitions, authorization failures, and audit
write failures commit no status/version change and no partial audit.

No affiliate attribution, commission calculation/lifecycle, payout batching,
paid recording, Task 7 UI, policy activation, provider call, external operation,
production credential, production data, tax/identity document collection, or
organization/essay field was added.

### Changed implementation files

- `src/growth/affiliate-service.ts`
- `src/growth/affiliate-service.test.ts`
- `src/growth/actions.ts`
- `src/growth/actions.test.ts`
- `tests/integration/affiliate-application-review.test.ts`
- `src/db/schema/growth.ts`
- `src/db/migrations/0014_wild_wendigo.sql`
- `src/db/migrations/meta/0014_snapshot.json`
- `src/db/migrations/meta/_journal.json`

`src/domain/authorization.ts` required no implementation change: completed Task
1 already defines `growth:manage`, `affiliate:payout`, `growth.manage`, and
`affiliate.payout` with capability-only staff scope and MFA. Task 6A exercises
and tests only `growth.manage`; one capable MFA administrator is sufficient and
does not need `affiliate:payout`.

### Schema mismatch and resolution

The existing `affiliate_profiles` schema had `status`, `created_at`, and
`updated_at` but no stored CAS version. PGlite reproduced PostgreSQL error
`42703: column "version" does not exist`. Deriving a version from status or a
timestamp would not satisfy exact expected-version CAS, so generated migration
`0014_wild_wendigo.sql` adds only positive integer `version`, default/not-null
`1`, plus its positive check. A second `npm run db:generate` reported
`No schema changes, nothing to migrate`; `npm run db:check` passed.

### Recoverable RED evidence

- Initial application service RED: one failed suite, zero tests; import
  `./affiliate-service` could not resolve before production code existed.
- Application transaction RED: 9/9 PGlite cases failed because
  `createPostgresAffiliateApplicationTransaction` did not exist.
- Version/schema RED: after the transaction constructor existed, PGlite failed
  with PostgreSQL `42703 column "version" does not exist`.
- Admin service RED: 11 expected failures and 27 passes because
  `createAffiliateAdminService` did not exist.
- Admin transaction RED: 7 expected failures and 9 passes because
  `createPostgresAffiliateAdminMutationTransaction` did not exist.
- Owner action RED: 27 expected failures and 26 passes because
  `createAffiliateApplicationAction` did not exist.
- Fresh-candidate replay regression: 1 expected failure and 38 passes because
  service result validation incorrectly required replay candidates to equal the
  already-stored IDs/code.
- Missing-identity regression: 1 expected failure and 39 passes exposed a raw
  null-property `TypeError` before structured fail-closed mapping.

### Application, content, and security scenarios

- Active buyer and database-authoritative verified-email time are both required;
  review/blocked, missing verification, future verification, invalid/missing
  primary email, and malformed identity projections fail before profile writes.
- Exactly one current `affiliate` terms row is required at authoritative time.
  Missing, stale, overlapping, malformed, browser-hash-mismatched, or
  server-computed-hash-mismatched terms roll back acceptance/profile writes.
- Accepted time is server-clock supplied and persisted exactly; stored email
  verification and replay acceptance times must not be in the future relative
  to that authoritative time.
- Channel input is at most 200 characters and is either a canonical HTTPS URL
  without credentials/query/fragment or a bounded `@handle`. Promotion method is
  exactly `website | social | email | other`.
- Every channel string passes the existing prohibited-use and unsupported-claim
  scanner before the transaction. Treatment language and unsupported purity
  claims are rejected before storage. This slice introduces no admin-authored
  partner free text.
- Exact form parsing rejects organization documents, identity/tax uploads,
  essays, browser owner/status authority, duplicate/missing fields, invalid
  method, and malformed terms ID/hash.
- Cross-origin and missing-origin requests fail before actor lookup, rate limit,
  or service mutation. Owner mismatch and inactive status fail before mutation.
  The fixed-window limit uses the existing database-backed store and a dedicated
  `affiliate.application.submit` actor scope.
- Exact semantic replay returns one acceptance/profile and the original opaque
  code even when fresh candidate IDs/code differ. Changed channel/method or an
  ownership/code collision is a deterministic conflict with no partial writes.
- Returned application and admin results are frozen and omit email, Clerk ID,
  referred-customer identity, order lines, shipping, payment IDs, raw cookies,
  IP, provider credentials, and private financial/provider facts.

### Admin CAS and audit scenarios

- `growth:manage` plus configured/satisfied MFA is required through the existing
  authorization policy. Non-admin, wrong-capability, and missing-MFA principals
  never reach the mutation transaction. No dual approval or per-action freshness
  model was added.
- `pending -> active`, `pending -> rejected`, and `active -> suspended` each
  increment exactly once and commit exactly one audit.
- Stale expected version, replay, pending suspension, and attempts to decide an
  active/rejected/suspended profile fail deterministically with no second audit.
- Audit metadata contains only from/to status and from/to version. Action,
  resource type/ID, correlation ID, actor user ID, and authoritative occurrence
  time use existing `admin_audit` conventions; channel, email, Clerk ID, notes,
  payout facts, and referred-customer facts are absent.
- A forced audit constraint failure proves status/version and audit roll back
  together.

### GREEN and validation evidence

- Focused affiliate service/actions/authorization: 3 files, 122/122 tests.
- Dedicated 6A PGlite: 1 file, 16/16 tests.
- Affected schema/repository PGlite lane: 3 files, 62/62 tests.
- Full unit suite: 84 files, 994/994 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- Second `npm run db:generate`: exit 0, no schema changes.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL concurrency claim is made.
- External services, production credentials, production data, and non-fixed
  test clocks/IDs: not used.

### Implementation commit

```text
96cd1b0baf3b71af49eb493538bb3e242e76aa6e
feat(growth): add reviewed affiliate applications
```

## 6A review fix round 1/5 — Reviewed immutable application replay

Independent review found that an otherwise exact application replay was
restricted to `pending` version 1. After a valid administrator decision or
suspension, the owner therefore received `idempotency_conflict` even though the
stored application identity and acceptance remained immutable.

### Recoverable RED evidence

- Service RED: 3 expected failures and 40 passes. Exact replays returning
  `active` version 2, `rejected` version 2, or `suspended` version 3 all failed
  at `validateTransactionResult` with `persistence_conflict`.
- Migrated PGlite RED: 4 expected failures and 16 passes. Replays after
  `pending -> active`, `pending -> rejected`, and `active -> suspended` failed
  with `idempotency_conflict`; replay after a later current-terms change failed
  early with `terms_mismatch`.

### Fix and invariant evidence

- An existing owner profile is now evaluated before the new-application
  current-terms lookup. Replay accepts only coherent Task 6A states:
  `pending`/1, `active`/2, `rejected`/2, or `suspended`/3, and returns that
  current stored status/version without an update.
- Replay locks and joins the stored acceptance to its exact affiliate terms
  row, recomputes SHA-256 from the stored terms text, and requires the stored
  version/hash plus the browser-supplied version/hash to agree. A later current
  terms version does not invalidate that immutable acceptance.
- The one-current-terms lookup and server-computed hash remain mandatory when
  no existing application is found. The PGlite drift case proves the old terms
  replay succeeds for its existing owner while a genuinely new buyer using the
  same stale terms is rejected with no new acceptance/profile.
- Stored profile ID, acceptance ID, and public code remain authoritative on
  replay. Fresh unused generated candidates are discarded; candidate ID/code
  collisions, owner mismatch, accepted-terms mismatch, changed channel/method,
  and incoherent status/version all conflict without changing rows.
- PGlite snapshots taken immediately before and after replay prove acceptance
  count/content, profile count/identity/content/status/version, and audit count
  are unchanged. Active/rejected retain their one decision audit; suspended
  retains exactly its decision and suspension audits. Application replay never
  invokes or repeats an administrator mutation and never rolls status/version
  backward.

### Review-fix GREEN and validation evidence

- Focused application/admin/action/authorization: 3 files, 129/129 tests.
- Affiliate service alone: 47/47 tests.
- Dedicated 6A migrated PGlite: 23/23 tests.
- Affected migrated PGlite: 3 files, 69/69 tests.
- Full unit suite: 84 files, 1001/1001 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `npm run db:generate`: exit 0, `No schema changes, nothing to migrate`.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL or contention claim is made.

### Review-fix implementation commit

```text
cfdb3301fd7d9d2b1cf447f8b57fddb118ac0524
fix(growth): preserve reviewed affiliate application replay
```

### Remaining Task 6 boundary

Task 6B attribution/commission lifecycle and Task 6C payout batching/externally
paid recording remain unstarted. Task 7 UI and all production/external
operations remain unstarted. No affiliate policy was activated.
