# PropeptIQ Storefront Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete customer-visible PropeptIQ storefront discussed with the owner, with every customer-visible feature proved in production and every private/audit task proved at its real authority boundary before it is marked complete.

**Architecture:** Preserve the existing Next.js App Router storefront and its server-authoritative catalog, pricing, promotion, cart, checkout, content, and search boundaries. Customer-facing copy and imagery are data-driven; payment and promotion facts are revalidated on the server; controlled research/legal content fails closed. Work is divided into independently reviewable releases. Customer-visible tasks require production and live-browser proof; private integrations, audits, and architecture tasks require evidence at their actual source-of-truth boundary and must not be given meaningless browser checkmarks.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4.3.3 plus shared CSS tokens, Radix UI, Stripe 22.5.0, Resend 6.22.1, Vitest 4.1.11, Testing Library, Playwright 1.62.1, Axe, Drizzle ORM, PostgreSQL/Neon, and Vercel.

**Spec:** Owner requirements in the September 4, 2026 task thread, plus [`docs/runbooks/storefront-configuration.md`](../../runbooks/storefront-configuration.md), [`docs/superpowers/plans/2026-08-30-propeptiq-commerce-foundation.md`](./2026-08-30-propeptiq-commerce-foundation.md), [`docs/superpowers/plans/2026-08-30-propeptiq-public-content.md`](./2026-08-30-propeptiq-public-content.md), and [`docs/superpowers/plans/2026-08-30-propeptiq-search-discovery.md`](./2026-08-30-propeptiq-search-discovery.md).

## Remaining customer-visible work

The storefront is **not finished**. This is the working checklist; the detailed tasks and evidence follow below.

- [x] **Visible content release — merged, deployed, and inspected live.** PR #17 merged as `365b2acc673063643607b4aae1695e22bad49bab`; production deployment `dpl_gSy5LMPTunhaifMUuJ4d3BgfA6fw` is READY and serves `propeptiq.com`. Live phone/tablet/desktop checks confirm the new six-scene gallery, 17-compound bibliography, related-product cards, six Why Choose cards, eight FAQs, and transparent logo. The six shared scenes are disclosed illustrations, not actual product photographs. This checkmark covers that delivered release, not the missing information or integrations below.
- [ ] **Prices — 40 of 103 exact matches, 63 still pending.** Keep the 40 reviewed ordinary Amino-equivalent reference prices and resolve the other rows from exact equivalents or owner amounts. Show WINTER30 consistently without stacking; do not label all pricing complete.
- [ ] **Product pages — information still incomplete.** The 17-compound/27-study neutral bibliography is now live. Complete justified coverage and product-specific technical/storage information. Do not fill the remaining 39 products with unrelated papers or generic protocols.
- [x] **Mobile purchase dock — delivered.** PR #21 deploys the mobile purchase controls, preserving the selected variant/quantity/pricing above permanent search. Live add/merge/full-navigation persistence, focus restoration, footer clearance and 375/768/1440px behavior are verified. This checkmark does not include the cart drawer.
- [x] **Desktop product gallery/search clearance — delivered.** PR #22 corrects the measured BPC-157 arrow/thumbnail overlap while keeping search bottom-centered. The original 1440×1000 failure and narrow-desktop long-title cases are verified live; phone/tablet behavior remains intact. This is not a claim that every possible floating-control collision across the site is solved.
- [x] **One-time cart drawer — delivered.** PR #24 adds the accessible header drawer, reusing the canonical cart and current server prices. Its READY production deployment and live phone/tablet/desktop checks confirm exact-variant merging, quantity/subtotal changes, reload persistence, focus restoration, usable short-phone controls and full-cart parity. Checkout stays disabled. This checkmark does not include subscriptions or TEST Stripe catalog creation.
- [ ] **Footer and newsletter — unfinished.** The shared footer FAQ entry reaches the existing approved `/#faq` section. PR #20 also fixes repeated keyboard activation when that fragment is already in the address; this is verified live on phone/tablet/desktop. Finish the remaining layout/links and privacy content, confirm the existing Resend setup, and activate signup only when it can genuinely subscribe with consent and a working provider. Social `/` placeholders are already authorized.
- [ ] **Subscriptions and Stripe TEST catalog — unfinished.** Confirm the requested recurring discounts and 1/3/6 pack behavior alongside the existing quantity tiers, then build and verify only TEST-mode mappings. No live charge, subscription, or checkout activation is part of this test preparation.
- [ ] **Placeholder cleanup — inventory prepared; removal not approved.** The exact candidate list and retained 56-file image set are recorded in [`docs/reference/storefront-placeholder-inventory.md`](../../reference/storefront-placeholder-inventory.md). Older images remain referenced in catalog metadata; current illustrations and social placeholders are intentional. No files were deleted. Obtain the requested itemized approval before any cleanup.
- [ ] **Final acceptance — not done.** The visible-content release passed its full 109-case browser run and is deployed. The live-discovered legacy-cart bug was corrected in PR #18 and its deployed canonical add/merge/reload flow is verified. Continue the remaining tasks and record their exact releases instead of calling the whole plan complete.

**Limited price follow-up, September 5:** exact-name first-party searches for SS-31, standalone CJC-1295/DAC forms, Survodutide and PE-22-28, plus a fresh extraction of the [official U.S. store](https://www.aminoclub.com/us/store), established no additional exact product/variant price matches. Search absence is not proof that a product does not exist; this does not replace the complete dated 103-row audit or reclassify its unresolved rows. Prices and the 40/63 completion counts remain unchanged.

## Completion rule

Every top-level task needs these three facts before `- [ ]` may become `- [x]`:

1. the exact commit SHA that contains the accepted result;
2. the focused and regression checks that passed on that SHA; and
3. an adversarial review with no unresolved high- or medium-severity finding.

Customer-visible and hybrid tasks `3–7`, `9–15`, and `18` additionally require a successful merge, the exact `READY` production deployment URL, and live browser evidence at `375px`, `768px`, and `1440px`, including no material overflow, console error, hydration error, or keyboard failure. For hybrid Task 15, the cart UI requires this production proof while recurring-commerce design separately requires owner approval. Task 17 is inventory-only until approval; if its approved cleanup changes any production-reachable file, it becomes hybrid and requires the same merge/deployment/live-browser proof, including no broken asset or link.

Authority-bound/private work also uses task-specific proof: Task 1 requires the hashed source register; Task 2 requires the reproducible 103-row primary-source audit; Task 3 requires server pricing/checkout tests in addition to live WINTER30 proof; Task 8 requires DOI/PMID resolution and controlled-content projection tests; the private half of Task 15 requires an owner-approved recurring architecture contract in addition to live cart proof; Task 16 requires TEST-mode provider read-back plus an idempotent second run; Task 17 requires the approved inventory and post-cleanup rescan. Task 19 is complete only after the whole accepted release is merged, production is `READY`, and the final live matrix passes.

“Implemented,” “merged,” “deployed,” and “verified live” are different states. A component that exists only in code, a fixture, a test, a preview flag, or a local screenshot is not a completed customer-facing feature.

## Current evidence snapshot — September 5, 2026

### Production checkpoint after PR #17

Commit `365b2acc673063643607b4aae1695e22bad49bab` is the merged equivalent of the locally tested source candidate `f91ea55` (documentation-only head `6b3b5df`). READY deployment: <https://propeptiq-nt9s80pg6-sergiosteam.vercel.app>, aliased to <https://propeptiq.com/>. The source, public assets, tests, package, and configuration tree was compared after merging and is unchanged from the tested candidate.

Live checks on this release confirmed:

- WINTER30 and consistent reviewed prices, including Tirzepatide 30mg `$59.99` → `$41.99` and BPC-157 10mg `$39.99` → `$27.99`.
- Six Why Choose cards in one/two/three columns at 375/768/1440px; eight native single-open FAQs, keyboard Enter/Space behavior, matching eight-entry JSON-LD, and no measured horizontal overflow on the inspected home/catalog/PDP layouts.
- All six BPC-157 gallery scenes load; keyboard Home returns to the front scene. Neutral references link to the verified PMIDs. Related products scroll, open the multi-variant selector, add the selected exact variant, and restore focus.
- Site-search navigation to the Why Choose anchor; catalog typo `tirzepatde` resolves to Tirzepatide while changing the sort preserves the query and result.

Live cart testing exposed a preexisting migration defect: a valid empty v1 cart was treated as requiring reselection, so additions changed the header without persisting. Acknowledging the empty cart through the existing UI proved normal v2 persistence works. PR #18 then corrected the migration and added visible cart-review guidance, while preserving nonempty legacy carts until explicit acknowledgement.

### Corrective cart release — PR #18

PR #18 merged as `53372558e79c53e027fa217fec94b59daeee9d11`. READY production deployment `dpl_91pveTQACNnH6WsmCD72m4eiiaSR` at <https://propeptiq-bb1y9yd74-sergiosteam.vercel.app> serves the production aliases. Its compared application tree equals tested code `4707bc5`; the final branch head `11e7717` changed historical documentation wording only. Independent supplied-source review was CLEAN; qlty and CodeRabbit succeeded, with the one documentation finding corrected. The branch preview still failed before compilation due to resource provisioning; no environment or protection setting was changed.

- Full unit: 229 files / 3,457 tests passed, 33.41 seconds. Lint, typecheck, workspace boundary and production build passed. Artifact scan: 1,260 files / 70,760,665 bytes / zero forbidden matches.
- Exact committed focused browser run: 4/4 passed in 15.2 seconds, covering empty-v1 persistence, nonempty-v1 denial and visible acknowledgement link, keyboard cart quantities, and canonical price/variant/tier identity. The test fixtures are browser-local old-format storage only; the catalog and price selection use real configured records with payments disabled. Full integration and full browser suites were not rerun for this client-only correction.
- Live on the corrective deployment: Tirzepatide 30mg added twice, full document navigation to cart, one preserved line with quantity 2, standard `$59.99`, effective `$41.99`, savings `$36.00`, subtotal `$83.98`, and disabled checkout. No document overflow at 375/768/1440px. The test items were removed through the UI afterward. Exact old-v1 conditions were proved by the local browser regressions, not injected into production browser storage.

The historical component checkpoints below are retained as an audit trail; their “not deployed” wording describes their earlier checkpoint, not the production state above. Missing prices, business content, newsletter activation, footer completion, sticky purchase controls, and recurring-commerce decisions remain open.

### Footer fragment correction — PR #20

PR #19 supplied the footer FAQ destination. A subsequent live repeated-keyboard test exposed an unchanged-fragment navigation defect that its earlier cross-page tests did not cover. PR #20 replaces only configured footer fragment links with native anchors; ordinary links retain Next Link. It merged as `19d3f2d8850847df8ae0b243192059393f9d27a9`, with READY production deployment `dpl_FBcNjALuGGm8Wx8jrMat1rQ9F8my` at <https://propeptiq-pf71y623m-sergiosteam.vercel.app>, aliased to <https://propeptiq.com/>. Its merged tree equals tested source `98ba3b4eef0336fe2c60cd8996a1639833fd0fca`.

- RED before implementation: the repeated keyboard case left the FAQ heading outside the viewport. GREEN: 12 focused component tests and 5 browser tests, including repeated activation twice at 375/768/1440px, cross-page navigation, native FAQ/schema parity and JavaScript disabled.
- Final unit: 229 files / 3,458 tests passed in 33.61s. Lint, typecheck, workspace boundary, production build and artifact scan passed; scan 1,260 files / 70,761,169 bytes / zero forbidden matches. No full integration or full browser rerun is claimed for this markup-only repair.
- Independent supplied-source review CLEAN; qlty succeeded. Hosted reviewers were quota-limited and did not supply reviews. The branch preview failed before compilation with resource provisioning failure, not a passing preview; no deployment or protection setting changed.
- A freshly loaded production page passed visible Order tracking → Tab → FAQ → Enter twice at each of 375×900, 768×1024 and 1440×900 while already at `/#faq`. Settled heading tops were 217.53/225.59/257.22px, below header bottoms 141.33/117.33/117.33px; measured document overflow zero and inspected warning/error logs empty. An older tab retained its predeployment document and is not corrected-release evidence. The premature earlier PR #19 repeated-keyboard claim was explicitly corrected in that PR before this repair.

### Mobile purchase release — PR #21, deployed and verified

PR #21 merged as `906150714b65228cd8ccca11cfc644bd50c927dc`; READY deployment `dpl_34FVm7DkMUgW78KmbUbfouVkYpoY` at <https://propeptiq-mcf489xk0-sergiosteam.vercel.app> serves <https://propeptiq.com/>. Its tree equals final source `d50cdc8b7f61baad406013f567814eb8dddd4b3c`.

The mobile-only duplicate appears after the inline purchase summary passes above the viewport, sharing the panel's canonical selection, validated quantity, price presentation and existing cart action. Its outside-main dock keeps search centered below it. Missing JavaScript/Intersection Observer or insufficient usable space retains the inline experience. Focus handoff, pending/invalid/unavailable/preview states and old-cart guidance remain explicit. This changes neither the 1/2/3/10+ contract nor checkout/subscription activation.

- Final full unit: 231 files / 3,486 tests passed in 33.16s. Focused unit/cart/component: 205 passed; focused browser: 16/16 passed. Lint, route type generation, typecheck and workspace boundary passed.
- Full browser: 130/130 passed, zero skipped/unexpected/flaky, exit 0, 606.051s; `blob-report/run-x4apte/merged-results.json`. Turbopack build and artifact scan passed: 1,261 files / 70,795,274 bytes / zero forbidden matches. Those browser/build checks ran on `6badc7a`; final `d50cdc8` changes only a unit test and unpublished research note, with an exactly compared unchanged production/E2E tree. No full integration rerun is claimed for the client-only release.
- Independent supplied-source review CLEAN after fixing stale batched observer entry handling. CodeRabbit reviewed the runtime candidate; correction-record documentation and test-timing suggestions were addressed. The conditional full-width preference was not required by the compact design. The follow-up hosted reviews were rate-limited, not additional passes; qlty passed. Branch previews failed before compilation with resource provisioning errors. No provider setting or protection bypass was used.
- Fresh live 375×900 verification: 30mg / two bottles shows $83.98 above centered 44px search with an 8px gap; Change selection restores Purchase focus below the header and retains quantity. Two additions persist as one four-unit line at $167.96 after full cart navigation. Checkout stays disabled. Search Tab trapping/Escape restoration and footer FAQ clearance passed. Tablet 768×1024 and desktop 1440×900 hide the mobile row while preserving search, with no measured overflow. Inspected production warning/error logs were empty; verification items were cleared through the UI.

### Desktop gallery correction — PR #22, deployed and verified

PR #22 merged as `f13fd1586209ea16a18d2ac7c567bb4c2d2c1571`; READY deployment `dpl_BuPzGEZWjtGgJworLujf7tV3bD3R` at <https://propeptiq-73u8nijvr-sergiosteam.vercel.app> serves <https://propeptiq.com/>. The merged tree equals tested source `5e7a3335bd22077fe4576cf0ffddf444d33fd70a`. One PDP grid-class change replaces the desktop 7:5 split and 4rem gap with equal columns and a 9rem gap. This makes the gallery smaller and purchase column wider; mobile classes, search positioning, gallery contents and commerce state are unchanged.

- Fresh live and local RED both reproduced the original untouched-page BPC-157 overlap at 1440×1000 before focus/scroll could mask it. Focused GREEN: 4/4 browser tests passed in 26.4s, including 15 combinations of three real product names and 1024/1025/1280/1440/1920 widths. Full target rectangles, explicit horizontal gutter, near-breakpoint long-label/control containment, aspect ratio, mobile/keyboard/Axe/reduced-motion/no-JavaScript behavior are covered. Existing component/boundary suite: 75 passed.
- Final full unit on the committed candidate: 231 files / 3,486 tests passed in 33.44s. Additional committed mobile-purchase browser regression: 16/16 passed in 55.0s. Lint, typecheck and workspace boundary passed. Final post-browser Turbopack build and artifact scan passed: 1,261 files / 70,795,065 bytes / zero forbidden matches. No new full-suite browser or database/provider integration run is claimed for this class-only runtime correction; PR #21's full 130-test result is a separate earlier checkpoint.
- Independent supplied-source review CLEAN; qlty passed. Hosted reviews were rate-limited, not additional approvals. The branch preview failed before compilation with resource provisioning failure; no provider/environment/protection settings changed.
- Fresh production BPC-157 at scrollY 0 and 1440×1000: no gallery arrow/tab/panel overlap. Search retained its original bounds (left 647.72 / right 776.94 / top 924 / bottom 968px), now between gallery right 639.67px and purchase left 784.33px. Screenshot inspected. Next scene loaded; search open/Escape restored focus. The real long CJC/IPA name at 1024/1025px stayed contained and clear. At 375px the gallery and mobile dock remained usable with an 8px search gap; at 768px the mobile row was hidden and search remained available. No measured overflow; inspected warning/error logs empty. Cart stayed empty and viewport override was reset.

At the PR #22 checkpoint the drawer was still open work; PR #24 below supplies its later release evidence. The other unchecked tasks above remain open. The gallery correction itself is deliberately limited to the measured desktop collision.

### One-time cart drawer — PR #24, deployed and verified

PR #24 merged as `ba69fea6b9232e4b647e0be26cc8fb3d9c4ee5d5`; READY production deployment `dpl_BWr82NLRJMrHnhZNZHDn42w4rykE` at <https://propeptiq-5rtmacq5t-sergiosteam.vercel.app> serves <https://propeptiq.com/> and its www alias. The full merged tree equals final tested source `f50eaace1944fabd411c40ec4407b93a28f0bdd2`.

- The public header Cart anchor progressively opens a controlled Radix drawer; native/modified/no-JavaScript navigation and the full `/cart` page remain. The existing cart/preview logic, exact-variant identity, prices and disabled checkout are preserved. The drawer adds disclosed illustrative thumbnails, instance-scoped IDs, useful removal/clear focus, bounded scrolling and reduced-motion-safe transitions. It is not a subscription or payment activation.
- Final candidate: 232 unit files / 3,501 tests passed in 33.90s; lint, route type generation, typecheck, Turbopack build and artifact scan passed. Scan: 1,263 files / 70,884,311 bytes / zero forbidden matches. Workspace boundary and scanner self-tests 11/11 passed on their unchanged configuration. Local native-navigation, development screenshot/LCP and unconfigured-build promotion diagnostics were recorded; these are not described as pristine output.
- Full browser on initial runtime `5411888`: 135/135 passed, zero skipped/unexpected/flaky, exit 0, 633.768s; `blob-report/run-KT45eq/merged-results.json`. An additional real-Next import-failure regression then exposed a loading fallback defect. The final bounded fix passed 11 focused component tests and 3 focused browser cases (16.5s), including guaranteed delayed-response delivery and the current $83.97 subtotal. No full 135-case rerun after that loader-only fix, or new database/provider integration/alternative-bundler run, is claimed.
- Independent supplied-source review and scoped repair re-review approved with no remaining Critical/Important finding. qlty passed. The hosted reviewer completed after merging and identified one minor test-only endpoint-guard gap; hardening that assertion is queued in the next change. Branch previews failed before compilation with resource provisioning errors, not source-build failures; no environment/protection setting was changed. Production READY is independently confirmed above.
- Fresh live BPC-157 10mg: two additions merge into one quantity-two line at $55.98; editing to three produces $83.97 with $39.99 standard / $27.99 effective unit price and WINTER30. Eight successive Tab steps remain inside; settled Escape restores the Cart link. At 375px the drawer fills the phone; at 768/1440 it is 512px wide with one content column and zero measured document overflow. At 375×520, Close remains at 12–56px and View cart at 456–504px. Full `/cart` navigation and reload retain quantity three and $83.97, with one cart list and no duplicate drawer. Removing the item focuses the empty-cart heading. Search/mobile navigation isolation passed; inspected production warning/error logs were empty. The verification cart was cleared through the UI, its empty state was read back after full navigation, and the viewport override was reset.

The footer layout and additional verified bibliography work follow separately. Missing prices, product facts, policy/privacy content, newsletter activation and recurring-commerce decisions remain unchecked.

### Historical candidate snapshot before PR #17

The following table preserves the pre-release assessment. The production checkpoint above supersedes its release-status cells; its missing-business-input findings remain open.

| Area | Confirmed state at that checkpoint | Completion state at that checkpoint |
| --- | --- | --- |
| Initial visible refresh | Commit `638beac59254e9459e5b017727b93aede5eec37d` is on `origin/main`. | Merged; production result must be rechecked. |
| Corrective visible-storefront work | Commit `f91ea55937df4a524fbceccb8cec4edd91412fc5` contains the six-scene gallery/data plate, product bibliography projection, related-card corrections, Why Choose presentation, native grouped FAQ/JSON-LD, and regression tests. The prior illustrative composite and earlier fixes have their historical commit evidence below. | Final local gate passed; candidate not yet merged or deployed. |
| Product prices | The exhaustive current official-source audit covers all 103 local variants: 40 `matched`, 41 `no_exact_equivalent`, and 22 `unresolved`. The 40 matched rows reproduce the existing manifest list prices, so the audit changes no price; the other 63 rows remain pending at zero. The older 34/40/29 snapshot was historical and is superseded by the deterministic row register in `docs/reference/2026-09-04-amino-equivalent-price-audit.md`. | Open. No “all prices complete” claim is permitted, and unresolved/no-equivalent rows remain pending at zero. |
| Product imagery | Six shared original 1,254 × 1,254 WebP scenes, live per-product name/variant data plates, and a manually controlled PDP gallery replace the earlier composite in the current candidate. The visible disclosure identifies them as AI-generated illustrations, not actual product photography; the scenes are not 56 separate photo sets. | Gallery/search collision corrected; focused browser 4/4 and Turbopack build reported passing. Full browser rerun, review, and deployed proof remain pending. |
| Product information | Neutral per-product overview, catalog information, and exact-name PubMed discovery links exist. The current candidate joins 17 compounds/27 verified study PMIDs to their exact PDPs and renders only neutral bibliographic metadata; the other 39 products omit that bibliography. | Partial; not deployed. Product-specific technical facts, storage copy, study summaries, missing mappings, and claim approval remain open. |
| Related products | All 56 configured products have one to four surviving same-category peers sorted by immutable slug/ID. Candidate cards use the current visual/pricing components, preview-only states, exact-variant quick add, and honest scroll controls. There is no evidence for “Frequently Researched Together.” | Local data/component/real-composition checks pass; browser/build checks pending, not deployed. Curated relationships remain open. |
| Why Choose and FAQ | Six truthful operational cards now have icons and responsive 1/2/3-column presentation. Eight native single-open FAQs and matching safely escaped JSON-LD use the same source array. Requested testing, cGMP, sourcing, clinical-dose, shipping, return, and subscription claims still lack approved evidence/copy. | Local content browser checkpoint reported 15/15 passed; current final browser/build and deployed proof remain pending. Requested business claims/policies remain open. |
| Attachments | No study attachment or footer reference asset is present in the repository/workspace evidence reviewed for this plan. | Blocked on re-upload. |
| Newsletter/Resend | Code boundary exists. Vercel metadata confirms a sensitive Production variable named `NEWSLETTER_RESEND_API_KEY` is already installed, separate from transactional `RESEND_API_KEY`; its value/provider ownership was not inspected. Public collection remains closed because privacy/content/attempt-gate activation is incomplete and Preview newsletter configuration is absent. | Open; do not create a duplicate key. |
| Stripe catalog/subscriptions | Existing checkout is server-authoritative and uses canonical variants. The proposed six saved Prices per SKU and subscriptions are not implemented. | Open; architecture decision required. |

### Final local release gate — source commit `f91ea55937df4a524fbceccb8cec4edd91412fc5`

This final local gate supersedes the intermediate browser/build-pending checkpoints in the component ledger below. It does not mark the full storefront plan complete or claim production verification.

- Full browser: `npm run test:e2e`, 109/109 passed, zero skipped/unexpected/flaky, exit 0; 504.217 seconds, report `blob-report/run-DDM4Ci/merged-results.json`.
- Independent final pricing/tier/cart browser rerun: 1/1 passed, 7.5 seconds. One stale test-only locator was narrowed during an earlier batch before that case ran; all production source stayed fixed throughout the full run.
- Full unit: 229 files / 3,446 tests passed, 33.44 seconds; lint, typecheck, workspace boundary and artifact-scanner self-tests 11/11 passed.
- Integration: 33 files / 551 tests passed, 946.90 seconds; one guarded PostgreSQL-auth file / 3 tests skipped. No real PostgreSQL or provider verification is inferred.
- Final Turbopack production build and artifact scan passed: 1,260 files / 70,755,659 bytes / zero forbidden matches.
- Reviewed fixes preserve disclosure readability, 195px no-JavaScript wrapping, legacy-route restriction/Axe coverage, exact pricing/cart assertions, and source boundaries. No unresolved runtime defect remains from the component reviews.
- At this local checkpoint, push/merge and production proof were pending. PR #17 and the production checkpoint above now supply that release evidence. Dev screenshot caret-style hydration warnings and LCP hints remain distinct from the empty production warning/error log observed during the live checks.

### Historical component checkpoint ledger, before the final PR #17 gate

This ledger preserves the intermediate component-stage evidence and what was still needed at that time. The final local gate and production checkpoint above supersede its pending browser/build/merge/deployment statuses. Missing business content and actual product photography remain open. The owner has already authorized implementation, merge, and deployment; no new blanket permission request is needed.

| Candidate work | Exact edit locations | Evidence recorded so far | Still needed |
| --- | --- | --- | --- |
| Six-scene illustrative gallery (Tasks 4/6) | `src/components/commerce/catalog-product-visual-manifest.ts`, `catalog-product-visual.tsx`, `catalog-product-gallery.tsx`; `public/catalog/visual-masters/`; `src/app/globals.css` | Source includes hashed dimensions, scene/caption/disclosure metadata, manual tabs/arrows, explicit image dimensions and `sizes`, current variant label/badge, and no autoplay. Focused tests are present beside the visual/manifest/gallery. | Current-candidate browser/build results, accepted asset scope, exact commit/review, deployment/live verification; actual product photography is not delivered by these illustrations. |
| Related cards (Task 7) | `src/catalog/storefront-merchandising.ts`; `src/components/commerce/related-products-carousel.tsx`; `related-products-composition.test.tsx`; `related-products-carousel-flow.test.tsx` | Standard runner: merchandising/catalog/carousel/composition 4 files / 26 tests pass; subsequent composition/flow 2 files / 6 tests pass. Focused ESLint, repository typecheck, scoped diff checks pass. All 56 real configured products have surviving peers; actual canonical single/multi-variant quick add is covered. | Browser/build and final release proof; owner-curated relationship/reason table. |
| Verified bibliography/PDP join (Tasks 8/9) | `content/compounds.json`, `content/studies.json`, `content/claims-audit.json`; `src/content/compound-research.ts`, `compound-research-public.ts`; `src/components/commerce/compound-research-section.tsx`; `src/app/(public)/catalog/items/[slug]/page.tsx` | Source register contains 17 mappings and 27 unique verified primary-source PMIDs with canonical PubMed URLs and September 4 review dates. Server projection limits public fields, checks exact identity/design/context, and omits unmapped products. This documentation task verified local counts/joins, not a fresh external DOI/PMID resolution run. | Preserve the source-verification report in final Task 8 evidence; current browser/build and deployment proof; remaining 39-product bibliography gaps, technical/storage copy, and claims review. |
| Why Choose and FAQ (Tasks 11/12) | `src/content/storefront-content.ts`; `src/components/site/why-choose-propeptiq.tsx`, `faq-section.tsx`, `faq-json-ld.tsx`, `public-home.tsx`; `tests/e2e/storefront-content.spec.ts`, `storefront-faq.spec.ts` | Source has six operational cards, eight same-source visible/schema questions, native `details` grouping, escaped JSON-LD, and focused component/browser tests. Test-file existence is not a claim that the current browser run passed. | Current-candidate native keyboard/JS-disabled, responsive/Axe/console, build and deployed-live evidence; approved replacement business/policy copy where requested. |

The two related composition suites were previously named `related-products-composition.integration.test.tsx` and `related-products-carousel.integration.test.tsx`. Those names were excluded by both existing Vitest configurations. They are now `related-products-composition.test.tsx` and `related-products-carousel-flow.test.tsx`, respectively, and both ran through the normal command. The flow suite preserves real UI/cart assertions with explicitly labelled synthetic input fixtures, not provider or production records. Do not count historical commands that silently excluded the old paths as coverage.

**Historical release-coordinator checkpoint, September 5, before the full browser run finished:** full unit 229 files / 3,446 tests, content browser 15/15, lint, typecheck, workspace boundary, and artifact-scanner 11/11 passed. The gallery/search collision was fixed by moving the disclosure into the gallery header inside the unchanged 4:3 panel. Focused browser 4/4 passes included ten mobile/desktop/scrolled-ADD positions, all six scenes, JavaScript-disabled, reduced motion, and long-label coverage. Turbopack production build passed, followed by an artifact scan of 1,260 files / 70,755,590 bytes with zero forbidden artifacts. Integration passed 33 files / 551 tests in 946.90 seconds; one guarded `better-auth-postgres.integration.test.ts` file / 3 tests was skipped. At that checkpoint the full 109-case E2E rerun was still running. It subsequently passed 109/109, and PR #17 was merged and deployed as recorded above. This paragraph is retained only as intermediate history, not a current pending-test status.

## Binding business decisions

These are not arbitrary engineering limits; they prevent the site from publishing false claims, unsafe payment facts, or contradictory customer behavior.

- The current repository is a research-use-only peptide catalog, not a verified dietary-supplement catalog. Do not publish “how to take,” human dosing, stacking, expected-result, therapeutic, DSHEA structure/function, “clinically dosed,” or supplement-serving copy unless the owner explicitly changes the product classification and supplies approved legal/scientific copy.
- Keep the already approved volume tiers `1 / 2 / 3 / 10+` with `0% / 8% / 10% / 30%` until the owner explicitly replaces them. The newer `1 / 3 / 6` proposal conflicts with that contract and cannot silently overwrite it.
- “Subscribe & Save” is a new recurring-commerce product, not a visual toggle. It requires recurring prices, renewal/cancellation/refund terms, customer-portal behavior, tax/shipping treatment, cart rules, webhook events, fulfillment cadence, and approved discount amounts before it can be default-selected or sold.
- Existing server-calculated inline Stripe `price_data` remains the authority for line-specific volume and automatic-promotion prices. A client-readable `stripe-catalog.json` must not become price authority, and cart storage must not trust browser-supplied Stripe IDs.
- “Frequently Researched Together” is a behavioral claim. Use `Related Products` for transparent category placeholders until explicit owner-approved relationships or evidence support the stronger title.
- The standard dietary-supplement FDA statement is not automatically appropriate for this research-use storefront. Publish only the exact legal/FDA wording supplied and approved for this business and product category.
- The later Phase 4 direction deliberately authorizes one contained, decorative `8–14s` logo loop as the sole exception to the earlier general “no autoplay” motion rule. It must become static under reduced motion, pause when hidden or offscreen, and no other carousel, media, or decorative surface may autoplay.

---

## Phase A — Truth, catalog, and pricing

### Task 1: Recover owner inputs and freeze the acceptance inventory

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-propeptiq-storefront-completion.md`
- Create after re-upload: `docs/reference/storefront-study-source-register.md`
- Create after re-upload: `docs/reference/storefront-footer-reference.md`
- Test: repository artifact inventory command recorded in the task evidence

**Interfaces:**
- Consumes: owner-provided study files, screenshots, product imagery references, footer reference, and any previously approved claim/legal copy.
- Produces: a SHA-256-indexed source register with original filenames, source provenance, approval status, and the exact feature that may use each item.

- [ ] Re-scan the workspace and task attachments for studies, screenshots, footer references, logo files, and product image examples; record paths and hashes without modifying the sources.
- [ ] If the source register is still empty, ask for one re-upload containing the missing study set and footer reference; do not substitute web guesses.
- [ ] Record every requested feature in this ledger and map it to one top-level task, one owner, and one live acceptance check.
- [ ] Run `rg -n "\[(ATTACHED_STUDIES|FOOTER_REFERENCE|ALLOWED_PATHS|PRODUCTS_DATA_FILE|REFERENCE_PAGE)\]" src public docs/runbooks docs/architecture` and require exit `1` (no matches); treat exit `2` as a scan error, not success.
- [ ] Commit only the reviewed source register and ledger update, then record the commit and production-independent evidence here.

#### Task 1 acceptance inventory — September 4, 2026

The source recovery result is recorded in [`docs/reference/storefront-study-source-register.md`](../../reference/storefront-study-source-register.md). No owner-provided study set, approved claim/legal copy, product-image approval set, or footer reference was found. Repository visual files are catalogued as repository provenance only; they are not approval evidence. The missing attachments are still needed to match the owner's specific study/image/footer references. Independently verified neutral bibliography and truthful operational content can be implemented while that source recovery remains open, but cannot be represented as the recovered attachments or as approved product claims/legal copy.

| Requested feature | Top-level task | Accountable owner | Required acceptance evidence |
| --- | ---: | --- | --- |
| Source provenance and acceptance inventory | 1 | PropeptIQ owner | SHA-256 source register; no missing-source substitution |
| 103-variant prices and explicit defaults | 2 | PropeptIQ owner | Primary-source audit and owner-approved defaults |
| Canonical pricing, promotions, and checkout | 3 | Engineering | Server/cart/checkout checks and live WINTER30 proof |
| Individual product visual system | 4 | PropeptIQ owner | Approved asset manifest and 375/768/1440 production checks |
| Transparent logo and contained identity motion | 5 | PropeptIQ owner | Approved alpha source and 375/768/1440 production checks |
| Catalog and PDP purchase UX | 6 | Engineering | 375/768/1440 production purchase-flow checks |
| Honest related products | 7 | PropeptIQ owner | Approved relationship table or transparent placeholder proof |
| Verified compound/study pipeline | 8 | Scientific/legal owner | DOI/PMID resolution and controlled-publication checks |
| Product information pages | 9 | Scientific/legal owner | Approved controlled records and 375/768/1440 production checks |
| Laboratory concentration calculator | 10 | Scientific/legal owner | Owner-approved configuration and live gate/disabled-state proof |
| Evidence-backed Why Choose content | 11 | PropeptIQ owner | Claim evidence register and 375/768/1440 production checks |
| FAQ and structured data | 12 | Legal/content owner | Approved FAQ parity, accessibility, and schema checks |
| Footer, legal routes, and newsletter preparation | 13 | PropeptIQ owner | Re-uploaded footer source; approved legal/content/provider gate; production checks |
| Final catalog and site search | 14 | Engineering | Final-index and 375/768/1440 production checks |
| Cart and recurring-commerce design | 15 | PropeptIQ owner | Live cart proof plus owner-approved recurring architecture |
| Stripe TEST catalog | 16 | PropeptIQ owner | TEST-mode read-back and idempotent second run |
| Placeholder inventory/approved cleanup | 17 | PropeptIQ owner | Approved inventory and post-cleanup rescan |
| Shared motion and responsive polish | 18 | Engineering | 195–1920px, reduced-motion, CLS, and production checks |
| Candidate gate, merge, and production verification | 19 | Release owner | Accepted merge, READY deployment, and full live matrix |

### Task 2: Complete the 103-variant price-equivalence audit and explicit product defaults

**Files:**
- Modify: `src/catalog/storefront-catalog-manifest.ts`
- Modify: `src/catalog/storefront-catalog-manifest.test.ts`
- Modify: `src/catalog/storefront-catalog-data.ts`
- Modify: `src/catalog/storefront-catalog-data.test.ts`
- Modify: `src/catalog/storefront-price-presentation.ts`
- Modify: `src/catalog/storefront-price-presentation.test.ts`
- Modify: `docs/runbooks/storefront-configuration.md`
- Create: `docs/reference/2026-09-04-amino-equivalent-price-audit.md`

**Interfaces:**
- Consumes: exact local `(browseSlug, browseCode, numeric amount, unit)` identities and current official Amino Club standard/list prices.
- Produces: `approvedStorefrontCatalogPriceDecisions` entries only for exact compound/blend and exact amount matches; unmatched or unprovable rows remain `pending` at zero. Also produces one explicit owner-approved `defaultVariantId` for each product.

- [x] Write an exhaustive table for all 103 local variants with local name, code, amount/unit, official product URL, official selected variant, standard price in cents, observation time, and `matched | no_exact_equivalent | unresolved` result.
- [x] Verify every official URL and variant interaction on the current Amino Club domain; never infer a higher-tier amount from “From” pricing and never use a temporary sale amount as the base price.
- [x] Add or change a manifest decision only when the exact variant and ordinary one-vial standard price are directly observable; preserve zero-dollar pending state otherwise.
- [x] Inventory all 56 products and record an explicit owner-approved `defaultVariantId`; never derive the default from array order, price approval, availability ordering, or a Stripe mapping. Leave this decision blocked rather than introducing a new implicit selection behavior when the owner has not chosen a default.
- [x] Add tests that require unique `(browseSlug,browseCode)` keys, positive integer minor units for approved rows, exact currency, absolute official URL, observation timestamp, and zero/no evidence for pending rows.
- [x] Add tests proving reorderings and later price approvals cannot silently change the selected default; regardless of a PDP default, multi-variant card `ADD` must open the variant chooser instead of adding an arbitrary variant.
- [x] Run `npm test -- src/catalog/storefront-catalog-manifest.test.ts src/catalog/storefront-catalog-data.test.ts src/catalog/storefront-price-presentation.test.ts src/domain/storefront-pricing.test.ts`.
- [x] Have a reviewer reproduce a representative single-variant, multi-variant, blend, and unmatched row from the official source before committing.

**Accepted evidence:** Task 2A commits `5a1e5d9..e2b2afb` established the 103-row primary-source audit (`40 matched`, `41 no_exact_equivalent`, `22 unresolved`) with 137 focused tests and independent source reproduction. Task 2B commit `f96fa53338c05c233f976c1ee98c44e868d32c4b` made all 56 defaults explicit; 152 focused tests, lint, typecheck, workspace-boundary, and diff checks passed. Fresh adversarial review reported zero findings and approved the exact Task 2B range. Two branch-wide visible-UI expectation failures were recorded at that historical boundary; this is not a claim that they persist in the current candidate or that a current full-suite gate is complete. The final candidate report must supply its own exact count/result.

### Task 3: Preserve canonical product, variant, promotion, and checkout authority

**Files:**
- Modify only if tests expose a defect: `src/catalog/storefront-catalog-data.ts`, `src/catalog/storefront-public-server.ts`, `src/domain/storefront-pricing.ts`, `src/cart/cart-storage.ts`, `src/commerce/checkout-service.ts`
- Test: corresponding unit/integration tests beside each file

**Interfaces:**
- Consumes: stable product IDs, stable variant IDs, exact numeric amounts, integer minor-unit prices, approved automatic promotions, inventory, and server-side provider mappings.
- Produces: one authoritative priced cart snapshot; repeated exact variants merge, distinct variants remain separate, and Stripe receives only a server-revalidated amount.

- [ ] Retain the original quantity discount contract: quantity 1 → 0%, 2 → 8%, 3–9 → 10%, and 10+ → 30%.
- [ ] Prove active `WINTER30` resolves to exactly 30% and never stacks with volume or overlapping promotions.
- [ ] Prove the WINTER30 bar renders directly below navigation with the approved copy, snowflake, accessible copy confirmation, configured timezone/date visibility, and automatic disappearance when inactive.
- [ ] Prove production zero/pending/unavailable/missing-mapping rows cannot start checkout and return only typed safe errors.
- [ ] Prove the browser cannot alter price, discount, promotion, variant identity, currency, or Stripe mapping.
- [ ] Run the full pricing/cart/checkout focused suite listed in `docs/runbooks/storefront-configuration.md`, then integration tests.

## Phase B — Customer-visible design and navigation

### Task 4: Finish the individual product image system

**Files:**
- Modify: `src/components/commerce/catalog-product-visual.tsx`
- Create: `src/components/commerce/catalog-product-visual-manifest.ts`
- Create: `src/components/commerce/catalog-product-visual-manifest.test.ts`
- Create: `src/components/commerce/catalog-product-gallery.tsx`
- Create: `src/components/commerce/catalog-product-gallery.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/catalog/storefront-catalog-data.ts` only for reviewed asset mappings
- Modify: `src/components/commerce/catalog-listing-card.test.tsx`
- Modify: `src/components/commerce/catalog-item-detail.test.tsx`
- Modify: `tests/e2e/public-storefront.spec.ts`
- Add reviewed assets under: `public/catalog/`

**Interfaces:**
- Consumes: a reviewed per-product asset manifest and live product/variant labels.
- Produces: reserved-dimension, optimized, accessible product visuals on cards, PDPs, related cards, and homepage cards.

- [ ] Ship the corrective composite now: each product's mapped still-life backdrop, the new original blank-vial foreground, and live HTML product/variant/RUO label; verify no old generic card remains in the canonical flow.
- [ ] Measure the longest real blend label at 320px, 375px, 768px, and 1440px; constrain wrapping and disclosure placement so the label, RUO notice, sale badge, and disclosure never overlap or clip.
- [ ] Build a reviewed asset manifest for the six-shot system per product: hero, three-quarter detail, bundle, ingredient-context only when truthful, scale reference, and lifestyle-neutral.
- [ ] Generate original images from the locked PropeptIQ design system without copying competitor trade dress; reject warped labels, third-party branding, unsupported ingredient props, or human-use imagery.
- [ ] Replace the composite placeholder product-by-product only after the owner approves that product's images; keep image dimensions and `sizes` explicit and lazy-load below the fold.
- [ ] Add Playwright checks for distinct product mappings, image load success, long-label geometry, no material layout shift, and no horizontal overflow.
- [ ] Do not check this task complete until every published product either has approved individual imagery or is intentionally hidden from the public catalog.

**Accepted Task 4A evidence:** Commit `c5430e3f169e045f702f3d5a6668aea56843d5f7` ships the truthfully disclosed illustrative composite for all 56 canonical products. A new browser geometry test passes the longest real blend and a representative single-name product at 320px, 375px, 768px, and 1440px, including reserved 4:3 dimensions, label/RUO/badge/disclosure separation, hover containment, and no catalog-visual overflow. Component tests passed 26/26; lint, typecheck, workspace-boundary, and diff checks passed. Fresh adversarial review found no Task 4A defect and approved the exact commit. The broader held-image case still identifies only the pre-existing negative-position header-logo crop assigned to Task 5. Task 4 remains open for the original multi-shot asset system and final deployed proof.

**September 5 Task 4B candidate:** The current `illustration_with_catalog_data_plate` visual replaces that historical composite with six original shared square WebP scenes: Front, Three-quarter, Multi-vial study, Copy-space detail, Overhead, and Ambient studio. `catalog-product-visual-manifest.ts` owns the order, captions, hashes, 1,254 × 1,254 dimensions, and exact `AI-generated catalog illustration — not actual product photography.` disclosure. Multi-vial count is explicitly not package quantity; Overhead explicitly is not a scale reference. No capsule/ingredient/human-use props were invented. `catalog-product-gallery.tsx` owns manual scene tabs/previous/next and Arrow/Home/End keyboard behavior without autoplay; `catalog-product-visual.tsx` owns the live name/variant/research-use/badge plate and decorative product accent/signature. This is a shared illustration system, not a claim that 336 product-specific photographs or the originally requested per-product approval set were delivered. The gallery disclosure now sits in the header of the unchanged 4:3 panel after a measured search-launcher collision was corrected. The focused browser/build checkpoint is above; full E2E, final review, and deployment proof remain pending.

### Task 5: Complete the transparent nav logo and contained scientific identity motion

**Files:**
- Modify: `src/components/site/brand-mark.tsx`
- Modify: `src/components/site/site-header.tsx`
- Modify: `src/components/site/site-footer.tsx`
- Modify: `src/app/globals.css`
- Modify: corresponding component tests and `tests/e2e/public-storefront.spec.ts`
- Add reviewed alpha asset under: `public/brand/`

**Interfaces:**
- Consumes: the approved PropeptIQ symbol/wordmark asset.
- Produces: `BrandMark` and `BrandLogo` with light/dark tones and an optional contained decorative molecular backdrop.

- [ ] Finish and prove the current transparent logo crop/wordmark at 195px, 320px, 375px, and desktop; the symbol must remain a 44px target when the wordmark collapses.
- [ ] Replace the crop with a genuine transparent SVG or alpha PNG when the approved source asset is available; test it on light and dark surfaces.
- [ ] Add the owner-authorized contained pointer-inert SVG molecular/peptide lattice behind only the logo bounding box, opacity `0.10–0.25`, transform/opacity animation, seamless `8–14s` loop, and a static reduced-motion frame; do not generalize this autoplay exception.
- [ ] Pause the decorative loop when hidden or outside the viewport without changing layout or navigation semantics.
- [ ] Measure contrast across representative frames and record a 30-second 4x-CPU browser trace; reject the animation if wordmark contrast falls below 4.5:1 or the 95th-percentile animation-frame scripting cost exceeds `1ms`.

### Task 6: Finish catalog and product-page purchase UX

**Files:**
- Modify: `src/components/commerce/catalog-explorer.tsx`
- Modify: `src/components/commerce/catalog-listing-card.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`
- Modify: `src/components/commerce/product-purchase-panel.tsx`
- Modify: `src/components/commerce/variant-selector.tsx`
- Modify: `src/components/commerce/quantity-tier-selector.tsx`
- Test: co-located tests plus `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: `PublicStorefrontProduct`, `PublicStorefrontPricingContext`, and the exact selected variant ID/quantity.
- Produces: synchronized image label, price, discount, savings, subtotal, availability, and add-to-cart state.

- [ ] Retain accessible presets for 1, 2, 3, and 10+; choosing 10+ must expose exact quantity with minimum 10, while normal increment/decrement can return to lower tiers.
- [ ] Prove changing variant or quantity updates the hero label, discount badge, price, savings, subtotal, availability, and add state without reload.
- [ ] Suppress the image badge and price when quantity is invalid or the selected variant is pending/unavailable; never retain the previous variant's badge.
- [ ] Keep multi-variant `ADD` behind an explicit variant chooser and merge repeated exact-variant additions in cart state.
- [ ] Add mobile sticky add-to-cart only after its interaction with the permanent bottom search, cookie/consent surface, and checkout controls has a non-overlap design and browser tests.

**Current candidate:** The gallery is composed into `catalog-item-detail.tsx` using the existing selected variant, quantity, and pricing context; listing/related cards continue using the shared visual and canonical quick-add interface. This source integration does not complete the separate mobile sticky purchase-bar work or authorize a change to the volume/subscription contract.

### Task 7: Deliver honest related-product recommendations

**Files:**
- Modify: `src/catalog/storefront-merchandising.ts`
- Modify: `src/catalog/storefront-merchandising.test.ts`
- Modify: `src/catalog/storefront-catalog-data.test.ts`
- Modify: `src/components/commerce/related-products-carousel.tsx`
- Modify: `src/components/commerce/related-products-carousel.test.tsx`
- Rename/update: `src/components/commerce/related-products-composition.test.tsx`
- Rename/update: `src/components/commerce/related-products-carousel-flow.test.tsx`
- Modify: `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: explicit owner-approved related product IDs when supplied; until then, deterministic same-category placeholder IDs.
- Produces: a non-autoplay accessible carousel with product image, variant summary, pricing, availability, and safe quick add.

- [ ] Ship the honest `Related Products` carousel with one to four same-category placeholders, duplicate/current/unavailable filtering, and no no-op controls for a one-item list.
- [ ] Create an owner review table for every product's ordered related IDs and one-line merchandising reason; reasons may not imply medical effect, protocol, stacking, or customer behavior.
- [ ] Replace category placeholders with the approved relationships and render a reason only when that exact reason is approved content.
- [ ] Rename to `Frequently Researched Together` only if evidence or explicit approved merchandising language supports that claim.
- [ ] Verify keyboard/touch scroll, focus, reduced motion, quick-add variant selection, announcement, dimensions, and no layout shift.

**September 5 candidate evidence:** The merchandising input is snapshotted/validated and sorted by immutable slug then ID before same-category peers are selected. Exact supported categories, duplicate/self exclusion, reorder stability, caller immutability, and malformed/hostile-array rejection are tested. All 56 actual configured products project one to four surviving peers. Preview-only cards are intentionally visible with reference prices and `Cart preview only`; pending/unavailable states retain their existing safeguards. The introduction is `Explore more products in this category.` One item has no arrows; larger rows measure scroll extent and disable arrows with nowhere to go, updating on scroll/resize. Keyboard/touch, reduced motion, real single-variant add, explicit multi-variant chooser, focus/announcement, repeat merge, and full-cart rejection have local coverage. Focused results and both corrected test filenames are recorded in the candidate table above. Owner-curated relationships/reasons and current browser/build/deployment proof remain open.

## Phase C — Product information, research, and homepage content

### Task 8: Build the verified compound/study data pipeline

**Files:**
- Modify: `content/compounds.json`
- Modify: `content/studies.json`
- Modify: `content/claims-audit.json`
- Modify: `src/content/compound-research.ts`
- Modify: `src/content/compound-research.test.ts`
- Create: `src/content/compound-research-public.ts`
- Modify: `src/content/storefront-content.ts`
- Modify: `src/catalog/storefront-public.ts`

**Interfaces:**
- Consumes: owner-selected studies plus newly sourced primary/peer-reviewed records whose DOI or PMID resolves.
- Produces: a server-validated public DTO containing only approved neutral research metadata and verified PubMed/publisher links.

- [ ] Define a strict versioned JSON schema with stable compound/study IDs, product IDs, alternate names, study design, sample size when reported, population/model, studied amount/form/route, duration, neutral outcome summary, DOI, PMID, URL, private evidence classification, approval status, reviewer note, and reviewed time.
- [ ] Use `amount_in_catalog` rather than `dose_in_product` unless the business is explicitly reclassified and an actual serving/dose exists.
- [ ] Resolve every DOI through the publisher/DOI registry and every PMID through PubMed; preserve unresolved owner inputs as `draft/unresolved`, exclude them from every public DTO/index, and report them instead of reconstructing or deleting them.
- [ ] Keep outcome summaries original and under 30 words; store no copied abstract sentences and no claim broader than the exact compound/form/model/population studied.
- [ ] Mark thin evidence honestly and never pad a product to reach a citation count.
- [ ] Derive the private evidence classification deterministically from verified study design: `human_meta` only for a qualifying human systematic review/meta-analysis, otherwise `human_rct` when a qualifying randomized human trial exists, otherwise `human_observational`, `animal_only`, or `in_vitro_only` according to the strongest verified included record. Document conflicts and require owner/scientific approval before exposing any public label; do not imply quality or efficacy from the class.
- [ ] For every proposed `benefit_claim`, create a private claims-audit row that maps the exact wording to its supporting DOI/PMID records, studied amount/form/route/population, catalog relevance, and `PASS | REVIEW`. Under the current RUO classification, proposed structure/function claims remain draft and excluded from public DTOs unless exact wording receives owner, scientific, and legal approval.
- [ ] Carry `disclaimer_text` as controlled content with approval metadata. Do not auto-fill the dietary-supplement FDA statement; keep it unpublished until the exact disclaimer appropriate to this business/product classification is supplied and approved.
- [ ] Require a business-review status before records enter the public DTO or search index; draft data remains server-private.
- [ ] Add hostile-shape, duplicate-ID, invalid-link, draft-leak, copied-private-field, and deterministic-order tests.

**Current data/projection status:** The existing files contain 17 exact compound-to-catalog-slug mappings and 27 unique study PMIDs flagged `verified_primary_source`/`public_neutral_metadata` with September 4 review dates. The server validates strict identities, design/context compatibility, canonical links, and approved-record correspondence before projecting a frozen public bibliography. Public types and neutral wording are isolated in `compound-research-public.ts`. Mechanisms/benefit claims are null and `claims-audit.json` has no claims; studied amounts/routes/outcomes and private approval metadata are not included in the public DTO. This implements a neutral bibliography subset, not all compound research fields, product substantiation, or the missing owner attachments. Thirty-nine products remain unmapped; no citation count is padded. Exact primary-source resolver evidence must accompany final Task 8 acceptance.

### Task 9: Complete every product information page

**Files:**
- Modify: `src/content/storefront-product-content.ts`
- Modify: `src/components/commerce/product-information-sections.tsx`
- Create: `src/content/public-literature.ts`
- Create: `src/components/commerce/compound-research-section.tsx`
- Create: `src/components/commerce/compound-research-section.test.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`
- Modify: `src/app/(public)/catalog/items/[slug]/page.tsx` and its route test
- Test: co-located tests plus `tests/e2e/public-storefront.spec.ts` and `tests/e2e/storefront-content.spec.ts`

**Interfaces:**
- Consumes: approved product overview, technical information, storage information, and Task 8 research DTO.
- Produces: ordered PDP sections with overview, catalog facts, technical/storage records, expandable research rows, citations, and one approved legal/RUO notice.

- [ ] Ship the current neutral product-specific overview, catalog record, and exact-name PubMed discovery link without exposing approval notes, timestamps, or raw source references.
- [ ] Ingest owner-approved product-specific technical and storage facts as separate controlled records; omit missing fields rather than filling them with generic advice.
- [ ] Render approved compound research as native disclosure rows with verified citation links opened with `target="_blank" rel="noopener noreferrer"`; render a neutral evidence-class label only after Task 8's deterministic rubric and exact public wording are owner/scientific-approved.
- [ ] Render the exact approved legal/FDA/RUO notice once at the bottom; do not call generated wording regulator- or attorney-approved.
- [ ] Prove every published product has the required section set or is intentionally unpublished; a PubMed search alone does not complete technical, storage, or curated research requirements.

**September 5 candidate:** The canonical product route loads the bibliography on the server and passes only the entry whose `productSlug` matches the resolved canonical product. `CompoundResearchSection` adds `#research-references` with native disclosure, exact study title/author/year/journal, neutral design/context, available sample/population/duration metadata, PMID/DOI, and verified PubMed links. Missing fields are omitted. Unmapped products omit the section instead of receiving inferred compound matches. Existing exact-name PubMed discovery links remain separately allowlisted by `public-literature.ts`; they are explicitly discovery, not a curated study or product claim. Product-specific technical/storage facts and the complete approved notice/content set are still unfinished. Current browser/build and deployed route proof remain pending.

### Task 10: Complete the gated laboratory concentration calculator

**Files:**
- Modify: `src/config/concentration-calculator.ts`
- Modify: `src/config/concentration-calculator-server.ts`
- Modify: `src/components/commerce/laboratory-concentration-calculator.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`
- Modify: `.env.example`
- Test: co-located unit/component tests and `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: owner-approved numeric limits, neutral copy, placement, source references, reviewer note/time, and server launch mode.
- Produces: a server-gated math-only calculator for mg/mL, mcg/mL, and material in a neutral sample volume.

- [ ] Preserve the existing fail-closed production default while limits, wording, placement, and legal approval are missing.
- [ ] Verify missing, zero, negative, nonnumeric, and unreasonable inputs; units must be explicit and arithmetic explained in plain language.
- [ ] Keep all output mathematical: no human dose, draw recommendation, syringe units, schedule, administration, treatment, protocol, or expected-effect text.
- [ ] Add the approved configuration/content records and enable public rendering only after the owner records the approval and accountable reviewer.
- [ ] Verify keyboard/mobile use, live result announcements, reduced motion, and absence when the server gate is disabled.

### Task 11: Complete “Why choose PropeptIQ” with evidence-backed claims

**Files:**
- Modify: `src/content/storefront-content.ts`
- Modify: `src/components/site/why-choose-propeptiq.tsx`
- Modify: co-located tests and `tests/e2e/public-storefront.spec.ts`
- Create: `tests/e2e/storefront-content.spec.ts`

**Interfaces:**
- Consumes: approved claim records and their business evidence.
- Produces: six responsive benefit cards with an icon, short headline, and sentence under 18 words.

- [ ] Keep the six existing neutral operational cards visible while claim evidence is incomplete.
- [ ] Create an evidence register for third-party testing, formulation amounts, proprietary-blend status, sourcing, cGMP facility status, and the sixth owner differentiator.
- [ ] Replace a neutral card only after its exact headline/body is supported and approved; otherwise leave the neutral card rather than inventing a claim.
- [ ] Verify 3-column desktop, 2-column tablet, 1-column phone layout; headings, icons, focus/contrast, and no horizontal overflow.

**September 5 candidate:** The six current headlines are `Catalog clarity`, `Clear availability`, `Exact variant selection`, `Transparent quantity pricing`, `Search from anywhere`, and `Research-use focus`. Their body copy in `homepageContentRecords` describes verifiable storefront operations; the existing owner-authorized neutral-placeholder note remains and no reviewer timestamp was invented. The component maps their stable IDs to icons and uses one column on phone, two from `md`, and three from `xl`. This does not fulfill the separate requested third-party-testing, clinical-dose, sourcing, cGMP, or guarantee claim themes without evidence. Current browser/build and production results remain pending.

### Task 12: Complete FAQ and structured data without human-use advice

**Files:**
- Modify: `src/content/storefront-content.ts`
- Modify: `src/components/site/faq-section.tsx`
- Create: `src/components/site/faq-json-ld.tsx`
- Create: `src/components/site/faq-json-ld.test.tsx`
- Modify: `src/components/site/public-home.tsx`
- Create: `tests/e2e/storefront-faq.spec.ts`
- Test: co-located tests and Playwright browser semantics

**Interfaces:**
- Consumes: approved visible FAQ records.
- Produces: accessible disclosures and matching `FAQPage` JSON-LD generated from the same projection.

- [ ] Retain the eight current operational questions until shipping, returns, subscription, or testing answers are approved.
- [ ] Do not add “how to take,” stacking, result-time, administration, or human-dose answers under the current RUO product model.
- [ ] Add approved shipping, returns, testing, and subscription-management questions only after their policies/features exist.
- [ ] Preserve progressive disclosure while enforcing the requested single-open behavior with a native browser-supported disclosure group; add a Playwright test proving opening one FAQ closes the previously open item and Enter/Space remain functional.
- [ ] Generate FAQ JSON-LD from the exact same approved question/answer strings, escape it safely, and prove visible/schema parity.
- [ ] Verify native Enter/Space behavior, focus, expanded state, JavaScript-delayed readability, Axe, and schema validation.

**September 5 candidate:** `FaqSection` uses native `details/summary` with `name="propeptiq-home-faq"`, leaving single-open and keyboard behavior to the browser without custom accordion JavaScript. `PublicHome` supplies the same eight projected FAQ entries to both the visible section and `FaqJsonLd`; JSON serialization escapes `<` and omits empty content. The new browser tests explicitly cover Enter/Space, single-open focus, visible/schema parity, and JavaScript-disabled disclosure. They remain pending current-candidate browser evidence in this ledger, not checked off merely because the test code exists. Additional shipping/returns/testing/subscription answers require the corresponding approved policies and feature behavior.

### Task 13: Finish the footer, legal routes, newsletter, and Resend preparation

**Files:**
- Modify: `src/lib/site-content.ts`
- Modify: `src/components/site/site-footer.tsx`
- Modify: `src/components/site/newsletter-form.tsx`
- Modify: `src/newsletter/runtime.ts`, `src/newsletter/resend-gateway.ts`, and `src/app/api/newsletter/route.ts` only after activation inputs are complete
- Create approved public routes under: `src/app/(public)/`
- Test: co-located tests and public-storefront E2E

**Interfaces:**
- Consumes: re-uploaded footer reference, approved mission/legal/privacy/consent copy, real support/social URLs, Resend team/domain/Topic, dedicated key, and rate-limit policy.
- Produces: grouped responsive footer and a fail-closed newsletter subscription flow.

- [ ] Rebuild the footer from the actual supplied reference after it is re-uploaded; preserve the requested brand, Shop, Support, Legal, newsletter, payment/trust, copyright, and disclaimer hierarchy.
- [ ] Verify four columns on desktop, two on tablet, and stacked keyboard-accessible disclosures on mobile without hiding links when JavaScript is delayed.
- [ ] Never render a legal/support/payment/trust link or badge until its real route/URL and approved content exist.
- [ ] Add an explicit asset/content assertion that sample payment logos, placeholder trust badges, fabricated certifications, and unsupported statistics never render in the public footer.
- [ ] Replace owner-authorized `/` social placeholders when real approved URLs are supplied.
- [ ] Do not create or overwrite another Production key: first identify the owner/team and Topic associated with the already-installed sensitive `NEWSLETTER_RESEND_API_KEY`; if rotation is required, create one dedicated full-access replacement without exposing it and install it in Preview first.
- [ ] Configure the approved Topic ID, privacy route, exact consent text, retention/deletion process, incident owner, attempt limit/window, and public rate-limit storage before enabling collection.
- [ ] Prove disabled mode reads no request body and transmits/stores no address; configured provider failure must not show false success.
- [ ] Perform a consented Preview canary and provider read-back, then separately approve Production environment installation and activation.

## Phase D — Search, cart expansion, Stripe test catalog, and cleanup

### Task 14: Re-verify catalog search and permanent bottom search against final content

**Files:**
- Modify only for defects: `src/search/storefront-search.ts`, `src/search/storefront-index.ts`, `src/search/catalog-discovery.ts`, `src/components/search/site-search-launcher.tsx`, `src/components/search/site-search-sheet.tsx`, `src/components/commerce/catalog-explorer.tsx`
- Test: co-located tests and public-storefront E2E

**Interfaces:**
- Consumes: final approved product and information DTOs.
- Produces: one deterministic shared index for catalog and grouped full-site navigation results.

- [ ] Prove fuzzy matching, result counts, clear action, no-results/loading/error states, sort/query coexistence, price sorting, stable ties, and draft-content exclusion after final data changes.
- [ ] Prove launcher focus trap/restore, arrows, Enter, Escape, exact href navigation, one successful index fetch per page lifetime, mobile safe area, and no collision with footer/cart/consent controls.
- [ ] Confirm no medical, dosage, treatment, administration, or generated recommendation text enters search results.

### Task 15: Finish the cart experience and design recurring commerce before creating Stripe subscription prices

**Files:**
- Create: `docs/architecture/subscription-commerce.md`
- Modify: existing cart page/provider/storage components and tests
- Modify after recurring approval: `src/catalog/storefront-types.ts`, `src/domain/storefront-pricing.ts`, `src/cart/cart-storage.ts`, checkout/provider contracts, webhook/order/fulfillment code, and corresponding tests

**Interfaces:**
- Consumes: owner-approved subscription discount, cadence, eligible variants, cancellation/refund terms, shipping/tax behavior, and fulfillment policy.
- Produces: a complete one-time cart experience plus an approved recurring-commerce contract that can safely create and consume recurring Stripe Prices.

- [ ] Audit the existing persistent cart end to end and finish the requested drawer: exact line identity, image/name/variant, per-unit and line totals, quantity stepper, remove, subtotal, empty state, focus return, and mobile layout.
- [ ] Persist the safe canonical cart equivalent across reloads as `{ variantId, quantity, purchaseType }` (plus non-authoritative display snapshot fields only where already required). Resolve `lookup_key` and Stripe `price_id` on the server from the canonical variant/purchase type; never store or trust them as browser authority.
- [ ] Keep checkout visibly unavailable for lines that fail canonical production readiness; never simulate a successful session, intent, subscription, or order.
- [ ] Decide whether Subscribe & Save is in scope in addition to the original one-time quantity tiers; do not replace the original tiers by implication.
- [ ] Specify eligibility, monthly cadence, per-variant recurring unit amount, 1/3/6 bundle semantics, renewal notifications, customer portal, cancellation, failed renewal, refunds, inventory reservations, shipping, tax, fulfillment, and mixed-cart policy.
- [ ] Keep browser cart identity authoritative by internal variant ID plus purchase type; Stripe IDs remain server-only mappings.
- [ ] Test reload persistence, one-time/recurring line separation, and the approved mixed-cart rejection message without trusting a client amount, lookup key, or provider ID.
- [ ] Add RED tests for one-time/subscription separation, mixed-cart rejection, recurring webhook idempotency, price changes, cancellation, and fulfillment cadence before implementation.
- [ ] Obtain owner approval of the architecture document before creating provider objects.

### Task 16: Create the approved Stripe TEST-mode catalog idempotently

**Files:**
- Create: `src/config/stripe-test-catalog-manifest.ts` or use the existing server-only provider mapping pattern selected by Task 15
- Create: `scripts/sync-stripe-test-catalog.ts`
- Create: focused script tests with a fake Stripe client
- Never create a client-importable price-ID authority file

**Interfaces:**
- Consumes: completed positive price audit and an authenticated `sk_test_` credential for one-time mappings; consumes the owner-approved Task 15 contract only for the optional recurring subset.
- Produces: reconciled TEST-mode one-time Product/Price mappings independently, plus recurring mappings only if subscriptions are approved, and a sanitized journal of exists/created/conflict outcomes.

- [ ] Validate the credential mode without printing the key; abort unless the account and every returned object are test mode.
- [ ] Look up each exact stable key before creation, compare amount/currency/product/recurrence/tax behavior/metadata, and skip exact matches.
- [ ] Never mutate an immutable amount in place; report conflicts and require an approved versioned key before deactivating or replacing anything.
- [ ] Use integer cents, USD, `tax_behavior=exclusive`, and approved metadata; do not create one-time or recurring rows for pending zero-dollar variants.
- [ ] Reconcile approved one-time TEST-mode mappings even when Subscribe & Save is declined or deferred; never make the safe one-time path depend on optional recurring approval.
- [ ] Create monthly recurring Prices only after Task 15 is owner-approved and all recurring amounts, lifecycle behavior, and terms are complete.
- [ ] Write only non-secret provider object IDs to the established server-only mapping source, never JSX, public JSON, localStorage, or client DTOs.
- [ ] Re-run the sync as an idempotency test and require zero duplicate Products/Prices and an all-`exists` second pass.
- [ ] Keep production checkout disabled until live prices, inventory, tax/shipping, account approval, webhook, fulfillment, and cutover gates pass.

### Task 17: Inventory and remove obsolete illustrative content only after owner approval

**Files:**
- Create: `docs/reference/storefront-placeholder-inventory.md`
- Modify/delete only the exact owner-approved rows after the inventory review

**Interfaces:**
- Consumes: the complete repository scan and replacement availability.
- Produces: an owner-approved delete/replace/empty-state change set with no collateral cleanup.

- [ ] Scan production paths for lorem ipsum, placeholder/demo images, invented reviews/testimonials, fabricated statistics, sample badges, dummy posts, mock product arrays, dead visual assets, and temporary copy.
- [ ] Record file, line, artifact, whether it is reachable in production, proposed action, replacement source, and rollback path.
- [ ] Stop at the inventory and obtain owner approval before deleting or replacing anything.
- [ ] After approval, execute only accepted rows; where no real content exists, use an honest empty/unavailable state.
- [ ] Run a second scan and prove no approved real asset or copy was removed.

## Phase E — Motion, verification, merge, and production proof

### Task 18: Complete the shared motion and responsive polish pass

**Files:**
- Modify: `src/components/site/site-motion.tsx` or the existing shared motion module
- Modify: `src/app/globals.css`
- Modify: only affected components and tests
- Test: `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: final page/component structure.
- Produces: restrained transform/opacity motion with a complete reduced-motion fallback.

- [ ] Audit existing motion instead of rebuilding it: 150–250ms interactions, 300ms drawers, standard easing, reveal threshold 0.15, 12px rise, 70ms stagger, and no layout-affecting animation.
- [ ] Keep essential content visible with JavaScript disabled and disable transforms, smooth scroll, carousel motion, and nonessential transitions for reduced motion.
- [ ] Add skeletons only for genuinely asynchronous surfaces and reserve their final dimensions; do not add spinners that shift layout.
- [ ] Verify 195px, 320px, 375px, 768px, 1024px, 1440px, and 1920px; long labels, touch targets, focus, safe-area spacing, footer links, sticky/fixed controls, and no clipped content.
- [ ] Measure CLS below 0.1 and inspect animation behavior under 4x CPU throttle; record methodology and results instead of estimating “60fps.”

### Task 19: Final exact-candidate gate, adversarial review, merge, deploy, and live verification

**Files:**
- Modify: this ledger with final evidence
- Modify: `docs/runbooks/storefront-configuration.md` and release notes when behavior changes
- No source changes after the final gate without rebinding and rerunning affected checks

**Interfaces:**
- Consumes: all accepted task commits.
- Produces: one reviewed main-branch release and verified production storefront.

- [ ] Freeze the exact candidate SHA; confirm intended diff, no unmerged paths, no unrelated/user changes lost, no forbidden secrets/artifacts, and no stale processes.
- [ ] Run `npm run verify:workspace-boundary`, `npm run test:artifact-scanner`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, focused PostgreSQL tests only when guarded credentials are present, `npm run test:e2e`, `npm run build`, `npm run verify:production-artifacts`, and `npm run db:check`.
- [ ] Run an independent adversarial diff review and fix every high/medium finding with regression coverage; rebind the candidate SHA afterward.
- [ ] Push the branch, review the exact pull-request diff, merge only the accepted candidate to `main`, and record the merge SHA.
- [ ] Wait for the Vercel production deployment to reach `READY`; do not confuse a preview URL with production.
- [ ] Verify `https://propeptiq.com` live at phone/tablet/desktop: WINTER30 banner, transparent logo, new product visuals, all catalog rows/prices, PDP information/research/variant/quantity/cart, related carousel, Why Choose, FAQ, search, footer, newsletter state, keyboard flow, reduced motion, no material overflow, no console/hydration errors, and no broken images/links. For the calculator, prove either approved live behavior or the explicit disabled/absent production gate; never leave its state unreported.
- [ ] Record every still-blocked business input in the final handoff. Leave the relevant top-level task unchecked rather than declaring the whole plan complete.

## Required final evidence table

The final handoff must include one row per top-level task. Use `not applicable` only where the completion rule assigns authority-bound proof instead of a production/browser check:

| Task | Commit | Checks | Review | Production deployment | Live browser evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | `not applicable` | Hashed source-register evidence | Complete/Partial/Blocked |
| 2 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | `not applicable` | 103-row primary-source audit evidence | Complete/Partial/Blocked |
| 3 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | Server/cart/checkout evidence; live UI where changed | Complete/Partial/Blocked |
| 4 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 5 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 6 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 7 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 8 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | `not applicable` | DOI/PMID resolver and public-projection evidence | Complete/Partial/Blocked |
| 9 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 10 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 11 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 12 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 13 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 14 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 15 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state for cart UI; `not applicable` for design-only recurring work | 375/768/1440 cart evidence plus owner-approved recurring architecture | Complete/Partial/Blocked |
| 16 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | `not applicable` for TEST-mode sync | Provider read-back and idempotent rerun | Complete/Partial/Blocked |
| 17 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | `not applicable` for inventory; exact READY URL if cleanup ships | Owner approval/post-cleanup scan, plus 375/768/1440 and no broken asset/link if cleanup ships | Complete/Partial/Blocked |
| 18 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact URL/state or `not deployed` | 375/768/1440 routes/outcome | Complete/Partial/Blocked |
| 19 | Exact SHA or `not merged` | Exact commands/counts or `not run` | Finding disposition | Exact READY production URL | Full live release matrix | Complete/Partial/Blocked |

No row may use “done” without the task-specific evidence required by the completion rule.
