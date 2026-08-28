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

## 6C review fix round 1/5 — Authoritative policy snapshots and exclusive mutations

Independent review found four Important defects: superseded database policies
were not mapped to the retired domain state, payout thresholds other than the
immutable Task 6 V1 value could reach the transaction, and the generic growth
repository exposed unaudited reserve/paid mutation bypasses.

### Recoverable RED evidence

- Pure service RED: 2 failures and 66 passes; stored thresholds 4,999 and 5,001
  were accepted instead of requiring exactly 5,000 minor.
- Payout PGlite RED: 3 failures and 6 passes; a superseded earned-policy
  snapshot returned `persistence_conflict`, while drifted 4,999/5,100 threshold
  rows were not rejected as persistence conflicts.
- Repository-surface RED: 1 failure and 32 skipped; the public repository still
  exposed `reserveAffiliatePayout` and `markAffiliatePayoutPaid`.
- Schema RED: 1 failure and 14 skipped; a 5,100-minor affiliate policy row was
  accepted by migrated PGlite.

### Fix and invariant evidence

- The payout transaction explicitly maps database `superseded` policy history
  to domain `retired`, so already-earned approved commissions remain payable.
- Both the pure draft builder and locked server transaction require the stored
  immutable V1 policy threshold to equal exactly 5,000 minor. Additive migration
  `0017_glamorous_randall.sql` adds the matching database check; no prior SQL or
  numbered snapshot changed.
- The generic growth repository no longer exports or implements either direct
  payout reservation or direct paid-recording mutation. Payout writes remain
  exclusive to the Task 6C service/transaction authority with its server
  selection, MFA/authorization, CAS, idempotency, and atomic redacted audit.
- Existing payout PGlite coverage continues to prove exact create/paid replay,
  conflicting payload and stale-version rejection, one audit per applied
  transition, and rollback without partial payout, commission, or audit writes.
- No browser-supplied money authority, UI, provider call, webhook, HTTP call,
  policy activation, or production/external operation was added.

### Review-fix GREEN and validation evidence

- Focused service/actions/authorization/domain: 4 files, 166/166 tests.
- Payout, growth-repository, and schema PGlite: 3 files, 56/56 tests.
- Full unit suite: 86 files, 1,046/1,046 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `npm run db:generate`: additive `0017_glamorous_randall.sql`; second run
  reported no schema changes.
- `npm run db:check`: exit 0.
- Historical migration hash check: 34 prior SQL/numbered snapshot artifacts
  checked, zero mismatches.
- Direct-bypass source scan: only the two negative regression assertions remain.
- `git diff --check`: exit 0; only expected Windows LF/CRLF notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL or contention claim is made.

### Review-fix implementation commit

```text
65aa82a65607a42aa8613a296dfa01ae4334e1ad
fix(growth): enforce authoritative affiliate payouts
```

### Remaining boundary

Task 7+ UI, automatic payout/provider integration, policy activation, and all
production/external operations remain unstarted.

## 6C checkpoint — Reviewed payout batching and externally paid recording

### Outcome

Implemented Task 6C only from clean base
`35e7c21bdb51e2bc7f338e1b03009ddd56030d03`. One MFA-authenticated
administrator with `affiliate:payout` may create a payout obligation for one
active affiliate profile. The serializable transaction selects commission
server-side, groups it by its immutable affiliate-policy snapshot, includes
only approval-eligible pending or approved, unpaid, unconsumed USD commission,
approves eligible pending rows in the same transaction, totals exact net minor
units, and enforces the snapshot's 5,000-minor minimum.

Creation consumes every selected commission once, records one pending payout,
and appends exactly one concise redacted `admin_audit` event atomically. Exact
same-key/profile replay returns the stored immutable creation result without a
second audit; a changed profile conflicts. Row locks, serializable retry, strict
update predicates, a unique creation key, and payout links prevent stale or
concurrent attempts from consuming the same row twice.

Paid recording is a separate expected-version CAS transition. It requires a
bounded nonempty externally supplied provider name and reference after an
operator pays outside the application, stores a unique paid-operation
idempotency key, advances version 1 to 2, marks linked commission paid, and
appends exactly one redacted audit in the same transaction. Exact replay returns
the original paid time/evidence; stale, conflicting, and double-paid attempts
write nothing. No Stripe Connect, bank, payment-provider, webhook, HTTP,
automatic payout, provider approval, policy activation, production operation,
Task 7 UI, or Task 8 form was added.

### Changed implementation files

- `src/growth/affiliate-service.ts`
- `src/growth/affiliate-service.test.ts`
- `src/growth/actions.ts`
- `src/growth/actions.test.ts`
- `src/db/repositories/growth-repository.ts`
- `tests/integration/growth-repository.test.ts`
- `tests/integration/affiliate-payout.test.ts`
- `src/db/schema/growth.ts`
- `src/db/migrations/0016_parallel_madelyne_pryor.sql`
- `src/db/migrations/meta/0016_snapshot.json`
- `src/db/migrations/meta/_journal.json`

### Schema and repository boundary

Generated migration `0016_parallel_madelyne_pryor.sql` adds only positive
`affiliate_payouts.version`, nullable unique
`affiliate_payouts.paid_idempotency_key`, and bounded external-evidence
checks. Historical migrations and snapshots were not edited. The pre-existing
generic growth repository paid transition now also requires expected-version
CAS and a separate paid idempotency key; it can no longer bypass the Task 6C
paid-recording contract. A second `npm run db:generate` reported
`No schema changes, nothing to migrate`; `npm run db:check` passed.

### Recoverable RED evidence

- Pure payout-draft RED: 1 expected failure and 59 passes because
  `createAffiliatePayoutBatchDraft` did not exist.
- Payout-service RED: 5 expected failures and 60 passes because
  `createAffiliatePayoutService` did not exist.
- Migrated payout-transaction RED: after correcting one invalid test-fixture
  order enum, 4/4 expected failures were caused by missing PostgreSQL payout
  transaction constructors.
- Approval transition RED: 1 expected failure and 4 passes because an
  approval-eligible pending commission was not selected.
- Repository CAS RED: the focused repository test rejected the first paid
  transition because the old path treated the creation key as paid authority
  and had no expected-version contract.
- Immutable-policy RED: 1 expected failure and 65 passes because a retired
  policy snapshot was incorrectly rejected for an already-earned obligation.
- Action-boundary RED: 8 expected failures and 53 passes because the payout
  create/paid action factories did not exist.

### Idempotency, audit, authorization, and privacy proof

- The create action accepts only profile ID, idempotency key, and correlation
  ID. Exact-form parsing rejects browser totals, currency, commission IDs,
  policy version/rates, and payment outcome.
- The paid action accepts only payout ID, expected version, paid-operation key,
  bounded provider/reference evidence, and correlation ID. Service and action
  authorization both require `affiliate:payout` plus MFA.
- PGlite proves the exact 5,000-minor boundary, already-consumed exclusion,
  pending-to-approved consumption, exact replay, conflicting replay, stale
  version, exact paid replay, double-paid denial, and one audit per successful
  transition.
- Forced creation-audit and paid-audit constraint failures prove payout,
  commission, evidence, version, and audit rows roll back together.
- Audit metadata contains amount/currency/count/policy version for creation and
  state/version movement for paid recording. It contains no commission IDs,
  provider/reference, referred-customer identity, order lines, address,
  payment IDs, cookie/IP/device facts, or credentials.
- Existing owner reads remain aggregate and redacted; provider/reference is not
  projected in the owner affiliate read model. Suspended/rejected history
  remains readable while creation requires an active affiliate profile.

### GREEN and validation evidence

- Controller-confirmed affiliate service/actions: 2 files, 127/127 tests.
- Controller-confirmed dedicated payout PGlite: 1 file, 6/6 tests.
- Focused affiliate/action/authorization/domain lane: 4 files, 164/164 at the
  recorded checkpoint; the final additional immutable-policy case is included
  in the controller-confirmed 127/127 service/action result.
- Focused five-file PGlite regression checkpoint: 5 files, 89/89 tests; final
  payout additions were revalidated at 6/6 and the changed generic repository
  CAS case at 1/1.
- Full unit suite: 86 files, 1,044/1,044 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- Production artifact scanner: 9/9 tests.
- `npm run verify:workspace-boundary`: exit 0.
- Second `npm run db:generate`: exit 0, no schema changes.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows
  LF/CRLF working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent
  and `TEST_DATABASE_CONFIRMATION` was not exactly
  `isolated-test-database`; no real-PostgreSQL contention claim is made.
- One redundant final two-file PGlite run was stopped after controller
  confirmation; it produced no failure result and changed no files.

### Implementation commit

```text
c49b133
feat(growth): add reviewed affiliate commissions and payout ledger
```

### Remaining boundary and concerns

Task 6C records obligations and externally completed payment evidence only.
Real PostgreSQL contention remains unverified because the exact isolated-test
guards were absent. Task 7+ UI, admin forms, E2E, policy activation,
production/external operations, tax-document upload, dual approval,
per-action reauthentication, automatic payout, and payout-provider approval
remain outside this checkpoint.

## 6B review fix round 3/5 — Customer-referral runtime composition

Round-3 review found that the real checkout runtime constructed only the
affiliate attribution service. A valid signed customer-referral cookie could
therefore reach checkout without an authoritative referral service and silently
produce an ordinary undiscounted, unbound order.

### Recoverable RED evidence

- Untouched-driver runtime RED: 1 expected failure and 6 passes. A real signed
  V1 customer-referral cookie passed through `getLocalTestDriver()` and
  `createCheckoutServerRuntime`, but checkout returned zero referral discount
  instead of the policy-derived 480 units.
- Failure-semantics RED: 2 expected failures and 41 passes. Missing referral
  composition emitted an ordinary quote, while a thrown authoritative referral
  candidate lookup was downgraded to `unavailable/policy_unavailable`.

### Fix and invariant evidence

- The guarded deterministic driver now exposes one bounded authoritative
  referral candidate and the current 10%-capped-at-2,500 policy fixture. The
  server runtime constructs `createReferralCheckoutService` with the same real
  V1 environment-bound verifier and server secret used by affiliate attribution,
  then injects both services into checkout.
- The real runtime regression proves the signed referral cookie applies a
  480-unit discount, preserves the private referral code/referrer/policy binding,
  creates the checkout session/order, and produces no affiliate snapshot.
- The reciprocal affiliate regression proves its private plan has no referral
  snapshot. Browser quote serialization contains no referral code, referral-code
  ID, referrer identity, affiliate identity, commission, or reward authority.
- Missing referral composition and thrown authoritative lookup now return
  `internal_conflict` without preparation, shipping, or tax calls. Explicit
  invalid/inactive/ineligible/no-attribution outcomes and ordinary no-cookie
  checkout retain their existing behavior.
- Local-driver and production-artifact guards remain intact. No schema,
  migration, payout, UI, external provider call, production operation, or
  browser-supplied identity/money authority was added.

### Review-fix GREEN and validation evidence

- Focused referral/runtime/checkout lane: 3 files, 50/50 tests.
- Focused runtime/referral/checkout/local-driver/harness lane: 8 files, 76/76 tests.
- Affected Task 6B PGlite transactions: 1 file, 14/14 tests.
- Full unit suite: 86 files, 1029/1029 tests.
- Production artifact scanner: 9/9 tests; production artifact scan: 736 files,
  50,405,441 bytes, zero forbidden matches.
- `npm run typecheck`, `npm run lint`, and
  `npm run verify:workspace-boundary`: exit 0.
- `npm run db:generate`: exit 0, `No schema changes, nothing to migrate`;
  `npm run db:check`: exit 0.
- Working `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no real
  PostgreSQL or contention claim is made.

### Review-fix implementation commit

```text
bcef20949e9872bd7ae429580a9c69c70f3c01ba
fix(commerce): compose referral attribution runtime
```

### Remaining Task 6 boundary

Task 6C payout batching, approval consumption, externally paid recording,
provider/reference storage, and cash transmission remain unstarted. Task 7 UI
and all production/external operations remain unstarted.

## 6B review fix round 2/5 — Real deterministic affiliate runtime composition

Round-2 re-review found that the round-1 runtime test manually replaced the
driver's null affiliate service. The actual deterministic driver therefore still
returned `internal_conflict` for a valid signed affiliate cookie and did not
prove real construction.

### Recoverable RED evidence

- Unmodified-driver runtime RED: 1 expected failure and 5 passes. A real V1
  environment-bound cookie signed at the fixed clock passed through the actual
  `getLocalTestDriver()` and `createCheckoutServerRuntime` path but returned
  `internal_conflict` instead of a quoted checkout.
- First construction attempt remained RED at 1 failure and 5 passes: checkout
  became quoted, proving service construction was active, but the selected
  synthetic partner actor had no active buyer profile and the private affiliate
  snapshot correctly remained null. The candidate authority was corrected to a
  dedicated deterministic active local partner identity rather than weakening
  active-buyer validation.

### Fix and invariant evidence

- The deterministic commerce driver now exposes a bounded affiliate candidate
  authority instead of `affiliateService: null`. The server runtime constructs
  `createAffiliateCheckoutService` itself using the real V1 verifier, exact
  request environment, request `RATE_LIMIT_SECRET`, fixed candidate authority,
  and the existing exact local-commerce readiness matrix.
- The regression uses the unmodified shared driver, fixed clock, real signing
  function, and real checkout runtime. It proves the server-only plan contains
  the eligible profile/user/policy snapshot while the browser quote contains no
  affiliate/profile/user identity and no commission property.
- Ordinary checkout without attribution remains quoted through the pre-existing
  runtime test. Invalid/ineligible cookies remain ordinary no-affiliate outcomes.
  Missing/non-local/PostgreSQL runtime composition remains unavailable through
  the existing exact readiness matrix, while the checkout service still fails
  closed if a cookie reaches it without required affiliate composition.
- The deterministic candidate exists only behind `LOCAL_TEST_DRIVER=enabled`,
  disabled database/payment modes, local origin/environment, synthetic adapters,
  and all pre-existing capability guards. No production database adapter,
  provider call, secret, partner identity, payout, or UI was added.
- No persistence, schema, migration, provider journal, reward/referral lifecycle,
  or commission calculation code changed; no affected PGlite rerun was required.

### Review-fix GREEN and validation evidence

- Signed-cookie server runtime: 1 file, 6/6 tests.
- Focused runtime/checkout/local-driver lane: 4 files, 37/37 tests.
- Production artifact scanner tests: 9/9 tests.
- Full unit suite: 86 files, 1026/1026 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with zero warnings.
- `npm run verify:workspace-boundary`: exit 0; canonical root, worktree,
  quarantine exclusion, Playwright root, and config scope all passed.
- `npm run db:generate`: exit 0, `No schema changes, nothing to migrate`.
- `npm run db:check`: exit 0.
- Working and staged `git diff --check`: exit 0; only expected Windows LF/CRLF
  working-copy notices appeared.
- Guarded real PostgreSQL lane: **NOT RUN**. `TEST_DATABASE_URL` was absent and
  `TEST_DATABASE_CONFIRMATION` was not exactly `isolated-test-database`; no
  real-PostgreSQL or contention claim is made.

### Review-fix implementation commit

```text
988f61583dab88397cfb971492d205597eca42b8
fix(growth): compose deterministic affiliate checkout
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
