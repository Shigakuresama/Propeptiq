# Task 4 — Points accounting across checkout and fulfillment

## Outcome

Implemented Task 4's server-authoritative rewards accounting without adding
referral attribution, affiliate behavior, routes/UI, external-provider calls,
production data, or schema changes.

Checkout accepts one additional browser field, `rewardRedemptionPoints`, and
rejects browser-supplied rates, balances, money values, earn amounts,
policy/ledger identifiers, and altered totals. The server reloads the current
active loyalty policy, exact current customer rewards/referrals terms and
acceptance/hash, account balance, checkout facts, prices, promotions,
inventory, destination, tax, and shipping authority. Missing, stale, or corrupt
terms make the rewards benefit unavailable while ordinary checkout remains
possible with zero growth writes.

Points use integer arithmetic: 100 points per dollar of credit, 500-point
minimum, and a 25% cap over post-promotion merchandise only. Tax and shipping
are excluded. Reservation is atomic with order snapshots and inventory;
verified payment consumes the reservation and appends base earn to pending;
verified delivery moves the exact remaining pending earn to available; and
cumulative verified refund/chargeback journals append only the incremental
proportional reversal. A delivered account may become negative and is then
ineligible for redemption while remaining owner-readable.

This report is committed separately under the existing SDD convention.

## Changed implementation files

- `src/commerce/checkout-ports.ts`
- `src/commerce/checkout-service.ts`
- `src/commerce/checkout-service.test.ts`
- `src/growth/rewards-service.ts`
- `src/growth/rewards-service.test.ts`
- `src/db/repositories/checkout-repository.ts`
- `tests/integration/checkout-repository.test.ts`
- `tests/integration/growth-commerce-transactions.test.ts`
- `src/commerce/provider-event-service.ts`
- `src/commerce/provider-event-service.test.ts`
- `src/commerce/server-runtime.ts`
- `src/commerce/staff-commerce-command-runtime.ts`
- `src/commerce/staff-commerce-command-runtime.test.ts`
- `src/commerce/refund-service.ts`
- `src/commerce/refund-service.test.ts`
- `src/commerce/fulfillment-service.ts`
- `src/commerce/fulfillment-service.test.ts`

No migration, schema, provider repository, fulfillment repository, route, UI,
referral, affiliate, or production-data file changed.

## RED evidence

The first bounded unit slice ran:

```text
npm test -- --run src/growth/rewards-service.test.ts src/commerce/checkout-service.test.ts
```

The rewards suite failed collection because `src/growth/rewards-service.ts` did
not exist. Checkout executed 19 tests with 2 expected failures because valid
`rewardRedemptionPoints` input was rejected; 17 existing tests passed.

The first transaction slice ran:

```text
npm run test:integration -- --run tests/integration/growth-commerce-transactions.test.ts
```

All 3 tests failed because `createPostgresRewardsCheckoutAtomicPort` did not
exist. Later bounded RED slices produced:

- provider reconciliation: 2 failed / 4 passed because processed and replayed
  verified events did not invoke reward reconciliation;
- payment/delivery/reversal PGlite: 3 failed / 3 passed because the lifecycle
  reconciler did not exist;
- fulfillment reconciliation: 2 failed / 4 passed because delivered and
  already-delivered results did not reconcile pending earn;
- payment-failure release: 1 failed / 6 passed because a processed
  `payment_failed` journal returned idempotent without releasing points;
- isolated competing balance: 1 failed / 6 skipped after restoring the second
  prequote's inventory facts. It exposed that an unavailable points reservation
  returned after writing order snapshots, allowing a second order to commit.

The isolated race failure was fixed by throwing a transaction-local sentinel,
rolling back order/promotion/address writes, and translating it to
`facts_changed_retry` only outside the transaction.

## GREEN evidence

Final focused unit results:

- rewards, checkout, provider events, refunds, and fulfillment: 5 files,
  43/43 passed;
- checkout success/read behavior: 1 file, 4/4 passed;
- fulfillment service alone after its RED: 6/6 passed;
- refund service boundary: 8/8 passed.

Final required PGlite command:

```text
npm run test:integration -- --run tests/integration/checkout-repository.test.ts tests/integration/growth-commerce-transactions.test.ts
```

Exit 0: 2 files and 27/27 tests passed (20 existing checkout repository tests
plus 7 growth-commerce transaction tests).

The final full unit suite passed 72 files and 803/803 tests.

## Transaction and replay boundaries

- Quote calculation reloads authoritative policy, terms/hash acceptance, and
  available balance. It uses the existing pure reward calculations and never
  accepts browser rates, money, balance, earn, or ledger authority.
- Checkout writes the order, item/promotion snapshots, reward reservation,
  `redemption_reserved` ledger delta, and inventory reservation inside one
  serializable transaction. Reward rejection aborts and rolls back the whole
  transaction.
- The reward ledger and redemption reservation use the Task 3 growth repository
  primitives in the checkout transaction. Same key/same payload is idempotent;
  conflicting payload or identity fails closed.
- The reward account row is locked before reservation. Two prequoted attempts
  with restored identical non-reward facts produce one order, one redemption,
  one balance subtraction, and no second inventory mutation.
- Failed provider creation, verified expiry/cancelled order, and processed
  payment failure release a reserved redemption once. Release and inventory
  compensation share the existing checkout transaction where that transaction
  owns the terminal event; processed payment-failure catch-up is independently
  idempotent.
- Verified payment reconciliation occurs only after the provider journal is
  `processed`. It consumes reservation state once and appends one
  `order_earned_pending` entry. A verified processed replay catches up missing
  reward work without reprocessing the provider journal.
- Success/read paths were not given a mutation dependency. Their focused tests
  remain green; URL refresh and read projection do not reserve, consume, earn,
  release, or reverse points.

## Delivery and reversal boundaries

- Delivery reconciliation requires an authoritative `delivered` shipment. It
  transfers the exact pending earn remaining after any pre-delivery reversal,
  using the shipment's delivered timestamp and one immutable ledger key.
- Refund/chargeback accounting reads only processed provider/payment journals.
  Provider SDK refund responses remain `awaiting_signed_event` authority and do
  not carry reward, points, or ledger fields.
- Cumulative loss is capped at eligible net merchandise. The deterministic
  target is integer floor of `base earned points * cumulative loss / eligible
  merchandise`; each event appends only target minus prior reversal.
- Before delivery, reversal subtracts pending points. After delivery, it
  subtracts available points and may make the available balance negative.
  Replay does not append another entry.
- A restrictive chargeback uses the greater of cumulative verified refunds and
  the authoritative dispute amount, preventing double reversal of the same
  financial exposure.
- Consumed redemption points are not restored on refund or chargeback. Task 4's
  binding compensation policy covers earned points only. Whether consumed
  redemption should ever be restored remains an owner/legal policy decision and
  requires a later explicit policy; no unstated behavior was invented.

## Validation gates

- Focused affected unit tests — exit 0; 43/43 plus success/read 4/4 passed.
- Required PGlite checkout/growth-commerce integration — exit 0; 27/27 passed.
- Full unit suite — exit 0; 72 files, 803/803 passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 with zero warnings.
- `git diff --check` and staged diff check — exit 0; only expected Windows
  LF/CRLF working-copy notices were emitted.
- `npm run db:generate` — exit 0; `No schema changes, nothing to migrate`.
- `npm run db:check` — exit 0; `Everything's fine`.
- Guarded PostgreSQL contention lane — **NOT RUN**. At gate time,
  `TEST_DATABASE_URL_PRESENT=False` and
  `TEST_DATABASE_CONFIRMATION_EXACT=False`. No real-PostgreSQL contention claim
  is made.
- No external Stripe, production database, tax, shipping, or fulfillment call
  was made.

## Implementation commit and file SHA-256

```text
439d291f14c5a5f49ccd17e31e9c7acde5338fb5
feat(growth): account for points across checkout and fulfillment
```

```text
src/commerce/checkout-ports.ts                     B24C169B962AEA430710FA37DC9722EC7F0C6A87BC7DED31D837A150F54F3250
src/commerce/checkout-service.test.ts              E2AC3B65E6C1648979D8BAD46D2B075FCAC583C3B264B6915907BAB60F9175FB
src/commerce/checkout-service.ts                   5AA6D82AD5F1AF5C80728943A0452117EE51C1577F6A10D2A47455F6ED306494
src/commerce/fulfillment-service.test.ts           6ED1B1882AE781E236CAA5F46E9D582BC8CB83C51D53A7E8B4099B1909D17B10
src/commerce/fulfillment-service.ts                14280F999AF9E24AE8D20C700C97E4522D573AAEA6706410E1B59451690792F5
src/commerce/provider-event-service.test.ts        5E5F732E8A14C3F6A261D9209C1CC476CEDCC7BEC2F84EC21595C51BA5F2DC7F
src/commerce/provider-event-service.ts             3FB1BF83EB84B58DCBCF81A00129BFFD11BA94CA99A2419E0FB1FD6640CEC20A
src/commerce/refund-service.test.ts                 5994B4D70A278325AF5E5B6406CB6C44E53E949C188FC31E28952FDAEE8CB53C
src/commerce/refund-service.ts                      B2E58DA3CB98F1C476140F60A95099CAC150574915C689D707AB480275ED4606
src/db/repositories/checkout-repository.ts         05A702D55AC073A0C1AA73F24A24E02FA658485CA8775561DBDB2E6CCCD4C5CF
src/growth/rewards-service.test.ts                 E024B89A052A8DD00A0E811D5A721B19A12932B7C951288C048863736C4571C4
src/growth/rewards-service.ts                      761DA627F91A2C39C93AF506C9FD0F00BC7A5E69B20A0741CE881E792984175E
tests/integration/checkout-repository.test.ts      3EA9CD3C715262A0D927F39EEC13548F5BD2604C7992B27FB8D606E20DEB1F1B
tests/integration/growth-commerce-transactions.test.ts 69DA87D747ADEAD5C677009102D31F05E61015DFC5FC3953AD400201A2D59ACF
```

## Concerns and boundaries

- PGlite proves the tested transaction rollback, replay, ledger projection, and
  lifecycle behavior. Because the exact isolation guards were absent, this
  report makes no real-PostgreSQL contention claim.
- Provider and fulfillment composition now reaches a required reward lifecycle
  boundary. PostgreSQL/Stripe runtime composition injects
  `createPostgresRewardsLifecycleService`; the synthetic local checkout lane,
  where rewards are disabled and cannot create a reward-bearing checkout,
  injects an explicit idempotent disabled boundary.
- The current growth schema has no zero-delta reward ledger entry. Consuming a
  redemption therefore advances the authoritative redemption state once; the
  original reservation ledger already performed the balance subtraction.
- No production loyalty/terms rows were created. Policy activation and any
  consumed-redemption restoration policy remain explicit owner/legal actions.

## Review fix round 1/5

### Outcome

Two independent-review findings were addressed without changing schema,
referral/affiliate behavior, routes/UI, external providers, or the intentionally
undefined consumed-redemption restoration policy.

- Both current-terms acceptance reads now require
  `accepted_at <= input.now`, using only the authoritative instant supplied to
  quote/payment reconciliation. Neither database wall-clock time nor
  `Date.now()` participates in acceptance eligibility.
- Provider event processing requires a reward lifecycle dependency. A runtime
  omission cannot report a verified payment/provider journal as successful;
  it returns `retryable_failure`, while the already-processed provider journal
  remains the durable signed-event replay obligation.
- Delivery requires reward reconciliation for both `delivered` and
  `already_delivered`. Omission or reconciliation failure returns `conflict`;
  replay through the already-delivered path performs the idempotent catch-up.
- `createStripeWebhookServerRuntime` injects the real PostgreSQL rewards
  lifecycle. `createStaffCommerceCommandRuntimeV1` requires and forwards the
  lifecycle, and `createStaffCommerceServerRuntime` supplies either the real
  PostgreSQL lifecycle or the explicit rewards-disabled local boundary.

### Changed files

- `src/growth/rewards-service.ts`
- `tests/integration/growth-commerce-transactions.test.ts`
- `src/commerce/provider-event-service.ts`
- `src/commerce/provider-event-service.test.ts`
- `src/commerce/fulfillment-service.ts`
- `src/commerce/fulfillment-service.test.ts`
- `src/commerce/staff-commerce-command-runtime.ts`
- `src/commerce/staff-commerce-command-runtime.test.ts`
- `src/commerce/server-runtime.ts`

### RED evidence

```text
npm test -- --run src/commerce/provider-event-service.test.ts src/commerce/fulfillment-service.test.ts src/commerce/staff-commerce-command-runtime.test.ts
```

Exit 1: 3 files, 3 expected failures and 14 passes. The named failures proved
that an omitted lifecycle returned `processed`, delivery returned `delivered`,
and staff composition never invoked `reconcileDeliveredOrder`.

```text
npm run test:integration -- --run tests/integration/growth-commerce-transactions.test.ts
```

Exit 1: 1 file, 2 expected failures and 7 passes. A future-dated acceptance
still granted a 750-point quote/185-point earn, and the negative-balance
payment catch-up returned `applied` instead of leaving the account and ledger
unchanged.

### GREEN and gate evidence

- Focused rewards/provider/fulfillment/staff/server-runtime unit lane: 5 files,
  26/26 passed.
- Final affected PGlite lane (`checkout-repository`, `growth-commerce-transactions`,
  `fulfillment-repository`): 3 files, 85/85 passed. The focused growth-commerce
  file passed 9/9 after the final lint-only test cleanup.
- Full unit suite: 72 files, 805/805 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: final exit 0 with zero warnings. The first gate run found one
  test-only unused binding; it was removed and the gate rerun successfully.
- `git diff --check` and staged diff check: exit 0. Only expected Windows
  LF/CRLF notices were emitted.
- Database generation/check: **NOT RUN** because no schema or migration file
  changed in this fix round.
- Guarded PostgreSQL concurrency lane: **NOT RUN** because
  `TEST_DATABASE_URL_PRESENT=False` and
  `TEST_DATABASE_CONFIRMATION_EXACT=False`. No real-PostgreSQL concurrency
  claim is made.
- No external Stripe, production database, tax, shipping, or fulfillment call
  was made.

### Implementation commit and file SHA-256

```text
5866468cebaf0acf2d53b6fca227759856521547
fix(growth): require valid terms and reward lifecycle
```

```text
src/commerce/fulfillment-service.test.ts                 A6F7833FF1497357435A089EF6CBDFDCE45329CF9636BFBF3D815AB27FA7B644
src/commerce/fulfillment-service.ts                      08F3477695FB28B7FBC5FD8BC1BDBDD9986A44688F43270832EBC13F279A94A6
src/commerce/provider-event-service.test.ts              A0E5AC23AE79B0BA68B90262F8B6C3D1407FCF45AF7F534990DDB5FFDB47A052
src/commerce/provider-event-service.ts                   3E65925999B3E30AEDE0CC1637C1AA8851084D0F63B058E318E934461D77A88B
src/commerce/server-runtime.ts                           2E7CB3D3EBC2A9EA4FD7EEC7F5A14538AD0C95D06969DAA75C7F9292C7D16AFC
src/commerce/staff-commerce-command-runtime.test.ts      67119DE142CDAB8914CE759BCF5CA3BE685B1FB13C7780FDBCD8CB0C410DCCE2
src/commerce/staff-commerce-command-runtime.ts           D9941B17782068B018EEC7E1F099FA113C19EF7F03CC87912C53A00AF2A2E10A
src/growth/rewards-service.ts                            A55BB23FFDF6951F6C79D8F71335AE8449A6157B90532900B5C036B312FA8AA0
tests/integration/growth-commerce-transactions.test.ts   44527E737E91DAA9569774D4C1A9977B0F468F60E546BE632010FFCB8A2E3D67
```

### Remaining boundaries

- The provider journal and delivered shipment are committed before lifecycle
  catch-up. Failure is surfaced as retryable/conflict and replay is the durable
  completion mechanism; success is never reported while required reward work
  is omitted.
- Consumed redemption restoration on refund/chargeback remains intentionally
  undefined and unchanged, pending a later owner/legal policy decision.
