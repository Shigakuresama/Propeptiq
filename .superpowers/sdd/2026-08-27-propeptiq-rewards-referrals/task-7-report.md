# Task 7 Report — Public and owner growth experience

## Scope and checkpoint

- Started from clean `1832ca5666c88096236a3ec5e8cd009adf905a89`.
- Implementation commits: `ae297d8` (`feat(ui): add editorial public growth experience`), review fix `701b18a` (`fix(ui): distinguish public growth read failures`), and source-count correction `bd09359` (`fix(catalog): preserve exact source-name groups`).
- Scope remained public-only: shell, homepage, browse catalog discovery, public database-product points, `/rewards`, `/partners`, and both public terms routes.
- No account, admin, Task 7B/8+, checkout/cart refinement, E2E, production policy activation, production data, or external operation was added.

## Delivered behavior

- Primary navigation is Catalog, Quality Records, Research Use, and Rewards; Cart and Sign in remain header actions; Partner Program is footer-only. All internal links use `next/link`.
- The homepage keeps the approved off-white/ink/moss and Newsreader/Geist system, reduces hero depth, places the Proof Rail before catalog highlights, and renders at most one injected active-loyalty strip.
- Catalog discovery has persistent labels plus exact source-name, source-code, and package-unit filters. The pinned publication contains 56 exact-source-Name cards and 103 source variants; duplicated `LPC`, `PN5`, and all other source ambiguities remain verbatim.
- The three BPC/TB page-2 rows and two CJC/IPA page-2 rows are five distinct one-variant slugs. Their exact source Name, code, normalized package form, source page, and 10-vial form are pinned; neutral existing illustration art is reused through distinct valid image paths and nonempty source-name alt text.
- Browse-only cards remain price-free and non-purchasable. `Earn N points` appears only for a production catalog projection with a positive USD price and one active server-projected loyalty policy.
- Public rewards, partner, and terms routes render active/current server projections only. A genuine absence shows the inactive state; database, schema, or malformed-record failures show a safe temporary-unavailable/retry state without exposing details or values.
- Public rewards copy says “Earn points”; active, inactive, and read-error route tests prohibit “purchase points” and “buy points.”
- The mobile Sheet remains in use below 1280px, the horizontal Proof Rail begins at 1280px, new practical targets are at least 44px, new explanatory copy is 16px, and new interactions use stable 200ms color transitions and visible focus styles.

## RED evidence

- `npm test -- --run src/components/site/public-shell.test.tsx` — 1 expected failure: primary navigation did not expose `Research Use`/Rewards.
- `npm test -- --run 'src/app/(public)/rewards/page.test.tsx' 'src/app/(public)/partners/page.test.tsx'` — 2 expected missing-route suites.
- `npm test -- --run src/components/commerce/catalog-explorer.test.tsx` — expected missing-component suite.
- Rewards/partners active-projection run — 2 expected assertion failures because active values were not rendered.
- Terms route run — 2 expected missing-route suites.
- `npm test -- --run src/components/growth/program-strip.test.tsx src/components/growth/earn-points.test.tsx` — 2 expected missing-component suites.
- `npm test -- --run 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 1 expected assertion failure because product points were not wired.
- `npm test -- --run src/components/site/public-semantics.test.tsx` — 1 expected assertion failure because the active strip/Proof Rail ordering was absent.
- Review fix RED: `npm test -- --run 'src/app/(public)/partners/page.test.tsx' 'src/app/(public)/rewards/terms/page.test.tsx' 'src/app/(public)/partners/terms/page.test.tsx' 'src/app/(public)/catalog/[slug]/page.test.tsx' 'src/app/(public)/page.test.tsx'` — 5 files failed; 10 tests failed and 5 passed because these routes still consumed the former nullable projection and mislabeled read errors.
- Source-count RED: `npm test -- --run src/catalog/browse-catalog.test.ts` — 1 file failed; 3 tests failed and 3 passed, proving the old fixture had 53 products, mixed three exact BPC/TB Names in one group, mixed two exact CJC/IPA Names in one group, and lacked the three split slugs.
- Publication RED: `npm test -- --run src/catalog/browse-catalog-publication.test.ts src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-item-detail.test.tsx src/components/site/public-semantics.test.tsx` — the publication suite failed on the old 53-card completeness gate while the other 3 files and 13 tests passed.

## GREEN and final gates

- Required focused components: `npm test -- --run src/components/site src/components/commerce src/components/growth` — 12 files, 28 tests passed.
- Focused public routes: `npm test -- --run 'src/app/(public)/rewards' 'src/app/(public)/partners' 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 5 files, 10 tests passed.
- `npx next typegen` — route types generated successfully after the first typecheck identified stale generated route metadata.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `git diff --check` — passed.
- Review fix GREEN: `npm test -- --run 'src/growth/public-growth-server.test.ts' 'src/app/(public)/rewards/page.test.tsx' 'src/app/(public)/partners/page.test.tsx' 'src/app/(public)/rewards/terms/page.test.tsx' 'src/app/(public)/partners/terms/page.test.tsx' 'src/app/(public)/catalog/[slug]/page.test.tsx' 'src/app/(public)/page.test.tsx'` — 7 files and 21 tests passed.
- Final focused review-fix gate: `npm test -- --run src/components/site src/components/commerce src/components/growth src/growth/public-growth-server.test.ts 'src/app/(public)/page.test.tsx' 'src/app/(public)/rewards' 'src/app/(public)/partners' 'src/app/(public)/catalog/[slug]/page.test.tsx'` — 19 files and 49 tests passed.
- Full unit suite: `npm test -- --run` — 97 files and 1,080 tests passed.
- Source-count GREEN: `npm test -- --run src/catalog/browse-catalog.test.ts` — 1 file and 7 tests passed.
- Final catalog/publication/source-price component gate: `npm test -- --run src/catalog/browse-catalog.test.ts src/catalog/browse-catalog-publication.test.ts src/components/commerce/catalog-explorer.test.tsx src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/catalog-item-detail.test.tsx src/components/growth/earn-points.test.tsx src/components/site/public-semantics.test.tsx` — 7 files and 31 tests passed.
- Source-count full unit suite: `npm test -- --run` — 97 files and 1,087 tests passed; `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
- Artifact guards: `npm run test:artifact-scanner` — 9/9 passed; a production-disabled `npm run build` passed; `npm run verify:production-artifacts` scanned 875 deployable files / 53,796,624 bytes with 0 forbidden matches.
- E2E count and image-path assertions were updated from 53 to 56 but E2E was not run; no Task 10 browser work was started.
- Screenshots: not captured; no Task 10 screenshot/E2E work was started.

## Concerns and inactive truth

- Public growth values intentionally remain absent unless the runtime database exposes valid current active policy records. Zero current records are inactive; duplicate, malformed, schema-failing, or unavailable reads return one safe `read_error` result and discard partial projection values.
- The homepage count is owner-publication evidence, not popularity, membership, inventory, or sales evidence.
- No production rates, terms, policy activation, product prices, countdowns, urgency, savings, testimonials, or trust claims were introduced.
- No Task 7C shared-set/cart/checkout presentation, Task 8 admin UI, Task 9 security documentation, or Task 10 E2E work was started.

## Task 7B checkpoint — Owner growth dashboards

### Scope and implementation

- Started from clean `8d7907a5defaa080c61a0f87051fa2a8255b9c0c` and committed implementation/tests as `9ed2f3b` (`feat(ui): add owner growth dashboards`).
- Added only the authenticated account-shell navigation, owner growth read/access adapter, `/account/rewards`, `/account/referrals`, `/account/partner`, dashboard/action-form components, and focused tests.
- Preserved Account Overview, Orders, Checkout, and home access. The labeled Sheet remains through 1024px; the full account rail begins only at `xl`/1280px.
- No public catalog/home edits, shared-set UI/cart/checkout work, admin UI, security-doc work, formal E2E, production data, policy activation, provider call, or external payout operation was added.

### Delivered behavior and privacy boundaries

- Owner reads use the authenticated principal and owner relation before any database read. Results distinguish `data`, `empty`, `inactive`, denied, and safe `read_error`; access distinguishes active owner, read-only review/incomplete owner, and blocked-read-capable owner.
- Cross-owner requests deny before projection/snapshot reads. Blocked and review owners keep their own history readable; enrollment/application controls remain unavailable unless the buyer is active.
- Rewards renders server-projected available/pending balances, truthful active-policy USD equivalent, minimum-redemption progress semantics, negative balances, and immutable redacted ledger rows. Real ledger kinds map to text-plus-Lucide Pending, Available, Reversed, and Adjustment states.
- Referrals renders one owner code/link, aggregate counts, reward totals, and redacted conversion references only. Current-terms acceptance activates the existing stable-code service; repeat activation returns the same existing code. Copy success/failure is announced politely without moving focus.
- Partner application inherits the verified email from server identity, accepts one bounded URL/handle, one closed promotion method, and exact current terms. It has no essay, document upload, organization/identity/tax upload, or payout control.
- Pending, active, rejected, and suspended partner states use text plus icons. Suspended/rejected history, private commission totals, and recorded payout totals remain readable without a send-money claim or control.
- Browser forms contain only bounded public fields, acceptance, and terms identifiers. A server-only adapter loads the current terms hash and then invokes the existing same-origin, rate-limited authoritative referral/affiliate actions; no hash, role, owner ID, balance, rate, commission, or payout fact is emitted as a browser field.
- UI components receive immutable props/results and do not query the database or any provider. Rendered owner records exclude raw Clerk IDs, cross-customer identity, order lines, addresses, payment IDs, cookies/IP/device data, provider credentials, and private provider references.
- Mutation failures render an error summary, inline error guidance, and programmatic focus. Activation, application, and copy successes use polite status regions. Required controls have persistent labels plus `required`/`aria-required` semantics.

### Task 7B RED evidence

- Account navigation: 1/1 failed because Overview and the three owner growth destinations were absent.
- Rewards components: 2/2 behavioral assertions failed against inert shells because balances/progress and the immutable ledger were absent.
- Owner access: 2/3 failed against the deny-all shell for cross-owner reason and blocked-owner self-read; the later review-owner regression failed because review was incorrectly treated as active-owner access.
- Owner read adapter: 1/2 failed against the deny-only shell because inactive/empty/data/read-error states were absent.
- Rewards route: 4/4 failed against the route shell because blocked-readable, denied, inactive, and safe read-error states were absent.
- Referral dashboard: 2/2 failed against the component shell because the bounded terms form, redacted summary, focused error, stable-code result, and polite copy status were absent.
- Browser action adapters: 2/3 failed against inert adapters because authoritative server terms were not yet injected for referral/affiliate mutations.
- Referrals route: 5/5 failed against the route shell; the later review-owner route regression also failed while the form was still visible.
- Affiliate dashboard: 3/3 failed against the component shell because the bounded application, status/history summaries, and focused/polite action results were absent.
- Partner route: 5/5 failed against the route shell; the later review-owner route regression also failed while the application remained visible.
- Account rail: 1/1 failed because the desktop navigation still lived in the header instead of an `xl`/1280px rail.
- Real ledger-kind regression: 1/2 failed because a positive `admin_adjustment` was incorrectly labeled Available instead of Adjustment.

### Task 7B GREEN and final gates

- Exact requested account/growth route gate: `npm test -- --run src/components/account src/components/growth src/app/account` — 11 files and 33 tests passed.
- Focused auth/action gate: `npm test -- --run src/auth src/account src/growth/actions.test.ts src/growth/owner-action-forms.test.ts src/growth/owner-growth-access.test.ts src/growth/owner-growth-server.test.ts` — 10 files and 105 tests passed.
- Full unit suite: `npm test` — 107 files and 1,120 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `git diff --check` — passed; only the repository's existing Windows LF-to-CRLF advisory was printed.
- Screenshots and formal browser/multi-viewport E2E were not run because that remains Task 10; no screenshot claim is made.

## Task 7C1 checkpoint — Authoritative cart and checkout presentation

- Accepted range `7000703..454ae19` completed requested-points browser allowlisting, complete authoritative promotion/referral/redemption quote groups, distinct cart/checkout rows, and customer-safe rewards status copy.
- The accepted checkpoint recorded 1,160/1,160 full unit tests, 18/18 final checkout-form tests, typecheck, lint, and diff check passing after two Important review-fix rounds and one Low copy cleanup.
- Shared-set presentation remained explicitly deferred to Task 7C2; no Task 8+, migration, provider, production activation, or formal Task 10 browser work was included.

## Task 7C2 and whole Task 7 checkpoint — Shared research sets

### Scope and implementation

- Started from the actual clean worktree HEAD `3cc21cf`; the user-provided stale expectation was checked rather than used. No reset, clean, checkout, rewrite, migration, provider activation, or production operation was performed.
- Implementation/tests committed as `f30072a` with the exact required subject `feat(ui): add editorial rewards referrals and partner experience`.
- Added the shared `SharedSetCard` for public and private projections. Public items link to current catalog facts; owner cards show label, item count, text-plus-Lucide active/inactive state, active-only open/copy actions, and child slots for edit/deactivate controls.
- Copy success and failure use a polite status region without moving focus. The public card render test prohibits owner/email and commerce/policy authority strings; the private card accepts only code, label, item count, active state, and control children.
- `/sets/[code]` now renders the shared card while preserving the same non-enumerating unavailable view, omission notice, current-product omission behavior, and the existing product-ID/quantity-only `AddSetToCartButton` boundary.
- `/research-sets` now renders shared owner cards and no longer owns a nested main landmark. Its new layout uses the existing `getRequestIdentity` plus `AccountShell` pattern, preserving the skip link, one main landmark, mobile Sheet through the existing `xl` boundary, and desktop rail at 1280px.
- `/account/referrals` adds one internal `next/link` entry to `/research-sets`; referral reads, actions, privacy, and dashboard ownership were not changed.
- Shared-set create/update forms now expose persistent labels, required and `aria-required` label semantics, bounded quantity controls, an associated selection/count error summary, focused customer-safe server errors, and polite success status. Deactivation has the same focused error and polite success behavior.
- Browser mutation fields remain exactly label, current product IDs/quantities, code, expected version, and idempotency as applicable. No owner, email, price, money, rate, discount, inventory, policy, or hash field was added.

### Witnessed RED evidence

- Component slice: `npm test -- --run src/components/growth/shared-set-card.test.tsx src/components/growth/shared-set-builder.test.tsx` — 2 files failed. The card suite could not resolve the intentionally missing component; builder tests failed on missing `aria-required`, focused server-error handling, and explicit polite success semantics. Two pre-existing builder tests passed.
- Route/layout/form slice: `npm test -- --run src/components/growth/shared-set-builder.test.tsx src/app/research-sets/page.test.tsx src/app/research-sets/layout.test.tsx 'src/app/(public)/sets/[code]/page.test.tsx' src/app/account/referrals/page.test.tsx` — 5 files failed with 5 targeted failures and 11 tests passed. Failures proved the missing account-shell layout, absent owner copy/status affordance, nested page main, absent referrals entry link, missing public-card label relationship, incomplete selection summary, and unfocused deactivation error behavior.

### GREEN and final gates

- Initial component GREEN: 2 files and 6 tests passed.
- Integrated component/route GREEN: 6 files and 19 tests passed.
- Focused shared-set component/route/server/action gate: 10 files and 136 tests passed, including add-to-cart ID/quantity transfer, shared-set service, server composition, and action boundary tests.
- Required component gate: `npm test -- --run src/components/site src/components/commerce src/components/growth` — 17 files and 58 tests passed on the final implementation.
- Full unit gate: `npm test` — 110 files and 1,173 tests passed on the final implementation.
- `npm run typecheck` — passed after correcting one typed dynamic-route link found by the first run.
- Affected typed-route regression: 2 files and 4 tests passed after that correction.
- `npm run lint` — passed with zero warnings.
- `git diff --check` and staged diff check — passed; Git printed only the repository's existing Windows LF-to-CRLF advisory.
- E2E, build, preview, and formal screenshots were not run because Task 10 owns those gates and the Task 7C2 brief explicitly did not require them for a focused failure.

### Whole Task 7 status and remaining concern

- Task 7A public editorial growth, Task 7B private owner dashboards, Task 7C1 authoritative cart/checkout presentation, and Task 7C2 shared-set UX are complete at their recorded checkpoints and final unit/static gates. The earlier independent review outcomes for 7A–7C1 remain recorded above; no new independent-review claim is made for 7C2.
- No production growth policy, referral rate, affiliate payout, catalog price, provider capability, or external operation was activated or invented.
- Formal browser multi-viewport, 200% zoom, keyboard, reduced-motion, overflow, screenshot, Preview, and E2E evidence remains Task 10. No claim is made for those unrun gates.

## Whole-task independent review and closure

- The first whole-task code review approved the complete Task 7 range. The design review identified seven concrete Important findings across owner-history fallback, homepage discovery, account navigation, cart retry, ledger labels, 16px explanatory copy, and field-addressable affiliate errors.
- Fix round 1/5 landed as `0c3c57f`, `d6300f1`, `7beef07`, and `025f421`. Historical owner records now survive inactive/read-error policies, including a shared-set-only snapshot, without projecting current rates or terms. The homepage has an active-only three-part explainer, owner navigation includes Cart and Research sets, cart preview exposes a bounded retry, all real ledger event kinds have truthful labels, Task 7 explanatory/status/error copy is at least 16px, and affiliate validation identifies the affected field.
- The targeted fixes received separate fresh approvals. Presentation tests passed 24/24. Shared-set-only owner history reproduced two expected RED failures and then passed 6/6 focused tests; the full unit suite passed 1,182/1,182, with typecheck, lint, and diff checks clean.
- The second whole-task design review found three further Important acceptance gaps: a changed cart could retain an old authoritative preview after refresh failure, two desktop explanatory paragraphs remained 14px, and reduced-motion still allowed a positional catalog-card jump.
- Fix round 2/5 landed as `1635ec7`. Cart previews are keyed to the exact current cart snapshot, so a changed cart renders no old quote and checkout remains locked until fresh facts return; retry preserves the current product IDs and quantities. The cited home/footer paragraphs use 16px text, and the reduced-motion media query removes catalog-card hover translation.
- Final fix validation passed 7/7 focused unit tests, 1/1 focused Chromium test, 1,183/1,183 full unit tests, typecheck, lint, and diff check. A fresh independent designer approved the exact eight-file fix with no Critical or Important finding.
- Task 7 is closed at `1635ec7`. Complete Task 10 browser, multi-viewport, 200% zoom, overflow, screenshot, E2E, build, and Preview evidence remains intentionally unclaimed here.
