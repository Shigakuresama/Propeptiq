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
- The provider and fulfillment services expose narrow reward lifecycle
  injection seams. Existing route/runtime composition was outside Task 4's
  assigned files; it must inject `createPostgresRewardsLifecycleService` when
  that separately owned composition is wired. The service and transaction
  behavior is fully exercised without external calls.
- The current growth schema has no zero-delta reward ledger entry. Consuming a
  redemption therefore advances the authoritative redemption state once; the
  original reservation ledger already performed the balance subtraction.
- No production loyalty/terms rows were created. Policy activation and any
  consumed-redemption restoration policy remain explicit owner/legal actions.
