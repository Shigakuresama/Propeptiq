# Task 20D checkout/order copy report

## Outcome

Implemented the bounded customer-language continuation in all seven owned production files, their direct tests, and checkout-only E2E assertions. The change is limited to rendered copy and test coverage. Existing handlers, effects, request bodies, state keys, eligibility and identity guards, acknowledgements, quote/session behavior, pricing, payment, review, legal, inventory, and fulfillment mappings were preserved.

Binding rulings applied:

- Neutral `address` terminology is used in checkout headings, instructions, validation feedback, and the account checkpoint.
- `Continue to hosted payment` remains unchanged.
- Session progress says `Opening the payment page.` without a security/provider promise.
- Unknown rows retain the visible `Saved item: ${item.variantId}` reference and expose `Saved item unavailable, reference ${item.variantId}` as the accessible name.
- Checkout sidebar `checkout_unavailable` matches the shared cart wording: `Checkout is not available for this item yet.`
- Synthetic-local labels, disabled-preview checkout, raw state enums, policy text, and payment-versus-fulfillment distinctions remain intact.

## Test-first evidence

- RED: focused direct command exited 1 in 7.66s with 35 failed / 15 passed. Failures were the expected old-copy mismatches across cart, checkout form, checkout gate, and success-page assertions.
- GREEN: final focused direct command exited 0 in 5.75s with 7 files and 56 tests passed.

## Verification

| Command | Result | Timing / notes |
| --- | --- | --- |
| `npm test -- --run src/components/account/checkout-cart-status.test.tsx src/components/commerce/checkout-form.test.tsx src/app/checkout/page.test.tsx "src/app/checkout/success/[orderId]/page.test.tsx" src/components/account/account-facts-form.test.tsx src/app/account/orders/page.test.tsx "src/app/account/orders/[orderId]/page.test.tsx"` | PASS, 7 files / 56 tests | 5.75s |
| `npm test` | PASS, 237 files / 3,574 tests | 37.50s; jsdom printed four known `Not implemented: navigation to another Document` notices |
| `npm run lint` | PASS, exit 0 | 10.99s, zero warnings permitted |
| `npm run typecheck` | PASS, exit 0 | 3.60s |
| `npm run verify:workspace-boundary` | PASS, exit 0 | 0.78s; all seven boundary checks passed |
| `git diff --check` | PASS, exit 0 | 0.42s; Git emitted only LF-to-CRLF working-copy notices |
| `npm run test:e2e -- tests/e2e/task6-commerce.spec.ts` | PASS, 7/7 Chromium tests | 56.4s on managed port 4631; repeated benign `NO_COLOR`/`FORCE_COLOR` warnings |

The first E2E attempt exited 1 after 24.4s because the shared checkout helper still asserted the retired `current authoritative baseline` copy; six later tests did not run. Updating that assertion to `Your cart details are up to date.` produced the clean 7/7 rerun above.

## Added direct coverage

- Cart loading, empty, singular/plural counts, review link, all preview states, failure/incoherent response fallback, unknown saved ID visibility/accessibility, and stale-response identity protection.
- Checkout loading, retry, unchanged and changed carts, acknowledgement gating, display-only refusal, quote/session retry identity, price change, totals, and review-required behavior.
- Checkout gate/runtime language and browse-only refusal.
- Account form customer labels while preserving the exact research-use policy text.
- Order-history empty/owner language and order-detail owner/not-found behavior.
- Pending payment wording remains explicitly unpaid until the existing signed-event flow changes it; paid and failed branches remain distinct.

## Unrun / intentionally excluded

- No live provider, payment, environment, database, or production checkout command was run.
- No build was run because Task 20D requested direct/full unit, lint, typecheck, workspace-boundary, diff-check, and the bounded checkout E2E suite; release verification remains root-owned.

## Concerns

No implementation blocker. The full copy audit found no retired Task 20D customer strings in the seven owned production files. Internal exception/log strings were intentionally unchanged.

## Independent review round 1 follow-up — 2026-09-06

Closed both Important test-coverage findings without changing runtime code:

- Added exact `paid` assertions for `Payment verified` and `Payment has been confirmed for this order.`
- Added exact `failed` assertions for `Payment was not verified` and `This order is not paid. Review its status before trying again.`
- Both non-pending cases assert that the pending heading/detail are absent, preserving the three-way payment-state distinction.
- Added existing-account coverage for `Save account details` and a controlled pending-state assertion for the disabled `Saving account details…` action.

Exact verification command:

`npm test -- --run "src/app/checkout/success/[orderId]/page.test.tsx" src/components/account/account-facts-form.test.tsx`

Output: exit 0; 2 test files passed; 7 tests passed; Vitest duration 1.43s (command wall time 2.45s). No warnings were emitted.
