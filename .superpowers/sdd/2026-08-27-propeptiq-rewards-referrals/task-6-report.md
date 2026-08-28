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

## 6B checkpoint — Affiliate attribution and commission lifecycle

### Outcome

Implemented Task 6B only from clean base
`6608623f15ed8feff6201cbba4a32ed1c3ec9ede`. An active affiliate code with
exactly one active current affiliate policy may issue the existing signed,
environment-bound V1 attribution cookie for 30 days through `/a/[code]`. The
landing always redirects to the trusted configured application origin plus
`/catalog`; request host and query input cannot alter the destination. Invalid,
inactive, suspended, rejected, missing-policy, and overlapping-policy requests
set no cookie and remain non-enumerating.

Checkout verifies the signed cookie and reloads the active partner, current
policy, customer identity, and qualified-order history server-side. It binds one
private affiliate order snapshot inside the existing serializable checkout
transaction only when customer-referral attribution is absent. Self-attribution,
duplicate/incoherent attribution, and referral-versus-affiliate conflicts fail
closed. Browser quote totals contain no partner identity or commission facts.

Verified payment appends one pending USD commission using authoritative
post-promotion, post-referral, post-points merchandise only. The first qualified
order earns 10%; qualifying reorders earn 5% through day 180 inclusive and zero
afterward. Tax and shipping are validated but excluded. Verified delivery sets
approval eligibility to no earlier than delivery plus 30 days without approving,
paying, batching, or sending anything. Verified refunds and chargebacks append
cumulative proportional reversals; a full cumulative merchandise loss leaves
one coherent fully reversed commission. Existing provider-event, inventory,
Task 4 rewards, and Task 5 referral effects remain composed through the same
required durable lifecycle boundary.

No payout creation, approval consumption, mark-paid operation, payout provider
or reference, cash transmission, Task 7 UI, external call, production operation,
or policy activation was added. No click row is persisted because the existing
schema has no privacy-minimal affiliate-visit table; no IP, device fingerprint,
PII, or raw cookie is stored.

### Changed implementation files

- `src/app/a/[code]/route.ts`
- `src/app/a/[code]/route.test.ts`
- `src/growth/affiliate-landing-runtime.ts`
- `src/growth/affiliate-landing-runtime.test.ts`
- `src/growth/affiliate-service.ts`
- `src/growth/affiliate-service.test.ts`
- `src/growth/policies.ts`
- `src/commerce/checkout-service.ts`
- `src/commerce/checkout-service.test.ts`
- `src/db/repositories/checkout-repository.ts`
- `src/growth/rewards-service.ts`
- `tests/integration/growth-commerce-transactions.test.ts`
- `src/db/schema/growth.ts`
- `src/db/migrations/0015_rich_toro.sql`
- `src/db/migrations/meta/0015_snapshot.json`
- `src/db/migrations/meta/_journal.json`

### Schema and transaction boundary

Generated migration `0015_rich_toro.sql` adds only nullable
`affiliate_commissions.approval_eligible_at` plus a check requiring it to be
later than commission creation when present. A second `npm run db:generate`
reported `No schema changes, nothing to migrate`; `npm run db:check` passed.

Affiliate attribution and the exclusive order-growth snapshot are written in the
same serializable checkout transaction as the order and reward/referral facts.
Commission creation, delivery eligibility, and cumulative reversals execute in
the existing required rewards lifecycle transaction used by verified provider
events and fulfillment. Replays do not add rows or regress state; conflicting
facts fail closed instead of silently skipping accounting.

### Recoverable RED evidence

- Landing/candidate RED: 3 failed files. The candidate export, landing runtime,
  and route did not exist; the service file recorded 6 expected failures with 47
  existing passes.
- Commission calculation RED: 3 expected failures and 53 passes because
  `calculateAffiliateOrderCommission` did not exist.
- Checkout exclusivity RED: 2 expected failures and 21 passes because affiliate
  quote composition was not invoked and dual referral/affiliate eligibility was
  incorrectly returned as quoted instead of `internal_conflict`.
- Lifecycle PGlite RED: 1 expected failure and 13 passes with PostgreSQL error
  `column "approval_eligible_at" does not exist` before the generated migration.

### Transaction, idempotency, and privacy scenarios

- Active profile plus exactly one current active policy issues one signed
  30-day envelope; inactive/suspended/rejected profiles and missing/overlapping
  policies issue none.
- Hostile Host/origin/query input cannot change the fixed trusted `/catalog`
  redirect. Missing trusted-origin configuration returns no redirect location
  and no cookie.
- Signed-envelope verification, active partner/policy reload, 30-day last-click
  eligibility, self-attribution rejection, and customer-referral XOR affiliate
  selection occur server-side.
- Checkout preparation and exact replay retain exactly one affiliate attribution
  and one affiliate order snapshot.
- Verified payment and replay retain one pending commission. In the fixed PGlite
  scenario, authoritative merchandise of 9,250 minor units creates a 925-unit
  gross commission; tax and shipping do not enter the basis.
- Verified delivery and replay retain pending status while setting eligibility
  exactly to `2026-09-27T12:04:00.000Z`, 30 days after the fixed delivery time.
- A cumulative 4,625-unit refund followed by a 9,250-unit chargeback leaves one
  925-unit fully reversed commission; event replays add nothing.
- Suspended and rejected partners cannot create new commissions. Day 180 is
  eligible at 5%; day 181 returns zero.
- Browser and owner-facing results omit referred-buyer identity, order lines,
  addresses, payment IDs, raw cookie, IP/device facts, credentials, and private
  partner identity. Existing owner commission reads remain aggregate/redacted.

### GREEN and validation evidence

- Controller-confirmed focused 6B unit lane: 3 files, 84/84 tests.
- Expanded affected unit lane: 9 files, 130/130 tests.
- Dedicated Task 6B PGlite transaction file: 1 file, 14/14 tests.
- Expanded affected PGlite lane: 8 files, 251/251 tests.
- Full unit suite: 86 files, 1021/1021 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- Second `npm run db:generate`: exit 0, no schema changes.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL or contention claim is made.
- All tests used fixed clocks/IDs and synthetic data. No external services,
  secrets, production credentials, or production data were used.

### Implementation commit

```text
7e9a5e540ad4eccc72dfc0c004e1ab3b9faac37f
feat(growth): add affiliate commission lifecycle
```

### Remaining Task 6 boundary

Task 6C payout batching, approval consumption, externally paid recording,
provider/reference storage, and cash transmission remain unstarted. Task 7 UI
and all production/external operations remain unstarted.

## 6B review fix round 1/5 — Required runtime accounting and merchandise-only reversals

Independent review rejected the initial 6B checkpoint with three Important
findings: checkout runtime omitted affiliate composition, authoritative lookup
errors were silently downgraded to ordinary ineligibility, and commission
reversal used total refund/dispute amounts including tax and shipping.

### Recoverable RED evidence

- Runtime composition RED: 1 expected failure and 5 passes. The real server
  runtime ignored its supplied authoritative affiliate service, leaving the
  private checkout plan's affiliate snapshot null. The same regression also
  requires a cookie-bearing checkout to return `internal_conflict` when the
  required composition is unavailable.
- Lookup-semantics RED: 2 expected failures and 81 passes. A thrown
  authoritative candidate lookup returned `unavailable/policy_unavailable`,
  and checkout silently emitted an ordinary unattributed quote instead of
  `internal_conflict`.
- Merchandise-loss unit RED: 2 expected failures and 4 passes because the
  authoritative merchandise-loss derivation did not exist.
- Migrated PGlite RED: 1 expected failure and 13 passes. A tax-only 325-unit
  refund incorrectly reversed 32 commission units.

### Fix and invariant evidence

- The typed commerce runtime now injects its affiliate checkout service into
  `createCheckoutService`. Any attribution-cookie checkout with unavailable
  required affiliate composition fails closed as `internal_conflict`; it cannot
  create an unattributed order by omission.
- Affiliate candidate lookup exceptions now produce a distinct private
  `internal_conflict`, which checkout propagates. Explicit invalid, wrong-program,
  inactive, self, referral-conflict, and otherwise ineligible results remain
  normal no-affiliate outcomes and expose no partner identity.
- Affiliate reversal now derives cumulative verified merchandise loss from
  locked authoritative order items, tax, shipping, and payment journals. Total
  verified loss first consumes the combined tax/shipping amount; only the
  bounded remainder reverses post-discount/post-points merchandise commission.
- The provider/refund envelope remains total-only. No browser or provider field
  may supply or invent line allocation, and no raw provider payload, buyer
  identity, order line, address, payment identifier, cookie, IP, or device fact
  enters an affiliate result.
- Unit cases prove tax-only and cumulative tax/shipping-only losses reverse zero,
  a 5,650-unit cumulative total loss reverses only 4,625 merchandise units, and
  oversized cumulative refund/chargeback loss is capped at 9,250 merchandise
  units.
- Migrated transaction coverage proves tax-only and shipping-only events retain
  zero reversal, partial merchandise produces a 462-unit reversal, a full
  10,275-unit chargeback produces one coherent 925-unit full reversal, and
  replay remains idempotent.
- No schema or migration was added. Existing payment/refund contracts, provider
  journal, inventory, Task 4 rewards, and Task 5 referral effects remain in the
  same serializable lifecycle transaction. No payout or UI behavior was added.

### Review-fix GREEN and validation evidence

- Controller-confirmed review-fix unit lane: 4 files, 95/95 tests.
- Expanded focused unit lane: 8 files, 136/136 tests.
- Controller-confirmed Task 6B PGlite: 1 file, 14/14 tests in 36.9 seconds.
- Full unit suite: 86 files, 1026/1026 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `npm run db:generate`: exit 0, `No schema changes, nothing to migrate`.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- A duplicate eight-file PGlite process and its replacement four-file process
  were explicitly stopped after controller confirmation; neither produced a
  failure result or changed files.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL or contention claim is made.

### Review-fix implementation commit

```text
e9436d5bb0494c25477245012f7e45109e425dd1
fix(growth): harden affiliate commission lifecycle
```

### Remaining Task 6 boundary

Task 6C payout batching, approval consumption, externally paid recording,
provider/reference storage, and cash transmission remain unstarted. Task 7 UI
and all production/external operations remain unstarted.
