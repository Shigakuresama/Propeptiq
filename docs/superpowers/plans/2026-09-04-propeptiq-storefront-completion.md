# PropeptIQ Storefront Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete customer-visible PropeptIQ storefront discussed with the owner, with every customer-visible feature proved in production and every private/audit task proved at its real authority boundary before it is marked complete.

**Architecture:** Preserve the existing Next.js App Router storefront and its server-authoritative catalog, pricing, promotion, cart, checkout, content, and search boundaries. Customer-facing copy and imagery are data-driven; payment and promotion facts are revalidated on the server; controlled research/legal content fails closed. Work is divided into independently reviewable releases. Customer-visible tasks require production and live-browser proof; private integrations, audits, and architecture tasks require evidence at their actual source-of-truth boundary and must not be given meaningless browser checkmarks.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4.3.3 plus shared CSS tokens, Radix UI, Stripe 22.5.0, Resend 6.22.1, Vitest 4.1.11, Testing Library, Playwright 1.62.1, Axe, Drizzle ORM, PostgreSQL/Neon, and Vercel.

**Spec:** Owner requirements in the September 4, 2026 task thread, plus [`docs/runbooks/storefront-configuration.md`](../../runbooks/storefront-configuration.md), [`docs/superpowers/plans/2026-08-30-propeptiq-commerce-foundation.md`](./2026-08-30-propeptiq-commerce-foundation.md), [`docs/superpowers/plans/2026-08-30-propeptiq-public-content.md`](./2026-08-30-propeptiq-public-content.md), and [`docs/superpowers/plans/2026-08-30-propeptiq-search-discovery.md`](./2026-08-30-propeptiq-search-discovery.md).

## Completion rule

Every top-level task needs these three facts before `- [ ]` may become `- [x]`:

1. the exact commit SHA that contains the accepted result;
2. the focused and regression checks that passed on that SHA; and
3. an adversarial review with no unresolved high- or medium-severity finding.

Customer-visible and hybrid tasks `3–7`, `9–15`, and `18` additionally require a successful merge, the exact `READY` production deployment URL, and live browser evidence at `375px`, `768px`, and `1440px`, including no material overflow, console error, hydration error, or keyboard failure. For hybrid Task 15, the cart UI requires this production proof while recurring-commerce design separately requires owner approval. Task 17 is inventory-only until approval; if its approved cleanup changes any production-reachable file, it becomes hybrid and requires the same merge/deployment/live-browser proof, including no broken asset or link.

Authority-bound/private work also uses task-specific proof: Task 1 requires the hashed source register; Task 2 requires the reproducible 103-row primary-source audit; Task 3 requires server pricing/checkout tests in addition to live WINTER30 proof; Task 8 requires DOI/PMID resolution and controlled-content projection tests; the private half of Task 15 requires an owner-approved recurring architecture contract in addition to live cart proof; Task 16 requires TEST-mode provider read-back plus an idempotent second run; Task 17 requires the approved inventory and post-cleanup rescan. Task 19 is complete only after the whole accepted release is merged, production is `READY`, and the final live matrix passes.

“Implemented,” “merged,” “deployed,” and “verified live” are different states. A component that exists only in code, a fixture, a test, a preview flag, or a local screenshot is not a completed customer-facing feature.

## Current evidence snapshot — September 4, 2026

| Area | Confirmed state | Completion state |
| --- | --- | --- |
| Initial visible refresh | Commit `638beac59254e9459e5b017727b93aede5eec37d` is on `origin/main`. | Merged; production result must be rechecked. |
| Corrective visible-storefront work | The current working branch contains uncommitted follow-up fixes for product visuals, logo behavior, product content projection, variant/quantity badge synchronization, related products, tests, and this ledger. | In progress; not merged or deployed. |
| Product prices | Of 103 local variants, 34 previously approved rows were rechecked against current official Amino Club pages and matched. The remaining evidence pass found 40 rows with no exact current equivalent and 29 unresolved rows (six historically approved higher-tier variants plus 23 pages/identities that could not be proved through the current official site). No additional exact match was proven among the 63 pending rows. | Open. No “all prices complete” claim is permitted, and unresolved/no-equivalent rows remain pending at zero. |
| Product imagery | A new original blank-vial layer exists and the corrective candidate composes it with each product's mapped backdrop and live label. | In progress; live result not verified. |
| Product information | Neutral per-product overview, catalog information, and exact-name PubMed discovery links exist in the corrective candidate. Product-specific technical facts, storage copy, and curated study summaries have not been supplied or approved. | Partial. |
| Related products | Candidate renders deterministic same-category catalog neighbors with an honest `Related Products` label. There is no evidence for “Frequently Researched Together.” | Partial placeholder; curated relationships remain open. |
| Why Choose and FAQ | Neutral data-driven components and records exist. Requested testing, cGMP, sourcing, clinical-dose, shipping, return, and subscription claims lack approved evidence/copy. | Partial. |
| Attachments | No study attachment or footer reference asset is present in the repository/workspace evidence reviewed for this plan. | Blocked on re-upload. |
| Newsletter/Resend | Code boundary exists. Vercel metadata confirms a sensitive Production variable named `NEWSLETTER_RESEND_API_KEY` is already installed, separate from transactional `RESEND_API_KEY`; its value/provider ownership was not inspected. Public collection remains closed because privacy/content/attempt-gate activation is incomplete and Preview newsletter configuration is absent. | Open; do not create a duplicate key. |
| Stripe catalog/subscriptions | Existing checkout is server-authoritative and uses canonical variants. The proposed six saved Prices per SKU and subscriptions are not implemented. | Open; architecture decision required. |

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

The source recovery result is recorded in [`docs/reference/storefront-study-source-register.md`](../../reference/storefront-study-source-register.md). No owner-provided study set, approved claim/legal copy, product-image approval set, or footer reference was found. Repository visual files are catalogued as repository provenance only; they are not approval evidence. One re-upload containing the study set and footer reference is required before Tasks 8 and 13 can be completed.

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
- Modify: `docs/runbooks/storefront-configuration.md`
- Create: `docs/reference/2026-09-04-amino-equivalent-price-audit.md`

**Interfaces:**
- Consumes: exact local `(browseSlug, browseCode, numeric amount, unit)` identities and current official Amino Club standard/list prices.
- Produces: `approvedStorefrontCatalogPriceDecisions` entries only for exact compound/blend and exact amount matches; unmatched or unprovable rows remain `pending` at zero. Also produces one explicit owner-approved `defaultVariantId` for each product.

- [ ] Write an exhaustive table for all 103 local variants with local name, code, amount/unit, official product URL, official selected variant, standard price in cents, observation time, and `matched | no_exact_equivalent | unresolved` result.
- [ ] Verify every official URL and variant interaction on the current Amino Club domain; never infer a higher-tier amount from “From” pricing and never use a temporary sale amount as the base price.
- [ ] Add or change a manifest decision only when the exact variant and ordinary one-vial standard price are directly observable; preserve zero-dollar pending state otherwise.
- [ ] Inventory all 56 products and record an explicit owner-approved `defaultVariantId`; never derive the default from array order, price approval, availability ordering, or a Stripe mapping. Leave this decision blocked rather than introducing a new implicit selection behavior when the owner has not chosen a default.
- [ ] Add tests that require unique `(browseSlug,browseCode)` keys, positive integer minor units for approved rows, exact currency, absolute official URL, observation timestamp, and zero/no evidence for pending rows.
- [ ] Add tests proving reorderings and later price approvals cannot silently change the selected default; regardless of a PDP default, multi-variant card `ADD` must open the variant chooser instead of adding an arbitrary variant.
- [ ] Run `npm test -- src/catalog/storefront-catalog-manifest.test.ts src/catalog/storefront-catalog-data.test.ts src/catalog/storefront-price-presentation.test.ts src/domain/storefront-pricing.test.ts`.
- [ ] Have a reviewer reproduce a representative single-variant, multi-variant, blend, and unmatched row from the official source before committing.

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

### Task 7: Deliver honest related-product recommendations

**Files:**
- Modify: `src/catalog/storefront-merchandising.ts`
- Modify: `src/components/commerce/related-products-carousel.tsx`
- Modify: corresponding tests and `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: explicit owner-approved related product IDs when supplied; until then, deterministic same-category placeholder IDs.
- Produces: a non-autoplay accessible carousel with product image, variant summary, pricing, availability, and safe quick add.

- [ ] Ship the honest `Related Products` carousel with one to four same-category placeholders, duplicate/current/unavailable filtering, and no no-op controls for a one-item list.
- [ ] Create an owner review table for every product's ordered related IDs and one-line merchandising reason; reasons may not imply medical effect, protocol, stacking, or customer behavior.
- [ ] Replace category placeholders with the approved relationships and render a reason only when that exact reason is approved content.
- [ ] Rename to `Frequently Researched Together` only if evidence or explicit approved merchandising language supports that claim.
- [ ] Verify keyboard/touch scroll, focus, reduced motion, quick-add variant selection, announcement, dimensions, and no layout shift.

## Phase C — Product information, research, and homepage content

### Task 8: Build the verified compound/study data pipeline

**Files:**
- Create after source recovery: `content/compounds.json`
- Create after source recovery: `content/studies.json`
- Create after source recovery: `content/claims-audit.json`
- Create: `src/content/compound-research.ts`
- Create: `src/content/compound-research.test.ts`
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

### Task 9: Complete every product information page

**Files:**
- Modify: `src/content/storefront-product-content.ts`
- Modify: `src/components/commerce/product-information-sections.tsx`
- Create: `src/components/commerce/compound-research-section.tsx`
- Modify: `src/components/commerce/catalog-item-detail.tsx`
- Test: co-located tests plus `tests/e2e/public-storefront.spec.ts`

**Interfaces:**
- Consumes: approved product overview, technical information, storage information, and Task 8 research DTO.
- Produces: ordered PDP sections with overview, catalog facts, technical/storage records, expandable research rows, citations, and one approved legal/RUO notice.

- [ ] Ship the current neutral product-specific overview, catalog record, and exact-name PubMed discovery link without exposing approval notes, timestamps, or raw source references.
- [ ] Ingest owner-approved product-specific technical and storage facts as separate controlled records; omit missing fields rather than filling them with generic advice.
- [ ] Render approved compound research as native disclosure rows with verified citation links opened with `target="_blank" rel="noopener noreferrer"`; render a neutral evidence-class label only after Task 8's deterministic rubric and exact public wording are owner/scientific-approved.
- [ ] Render the exact approved legal/FDA/RUO notice once at the bottom; do not call generated wording regulator- or attorney-approved.
- [ ] Prove every published product has the required section set or is intentionally unpublished; a PubMed search alone does not complete technical, storage, or curated research requirements.

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

**Interfaces:**
- Consumes: approved claim records and their business evidence.
- Produces: six responsive benefit cards with an icon, short headline, and sentence under 18 words.

- [ ] Keep the six existing neutral operational cards visible while claim evidence is incomplete.
- [ ] Create an evidence register for third-party testing, formulation amounts, proprietary-blend status, sourcing, cGMP facility status, and the sixth owner differentiator.
- [ ] Replace a neutral card only after its exact headline/body is supported and approved; otherwise leave the neutral card rather than inventing a claim.
- [ ] Verify 3-column desktop, 2-column tablet, 1-column phone layout; headings, icons, focus/contrast, and no horizontal overflow.

### Task 12: Complete FAQ and structured data without human-use advice

**Files:**
- Modify: `src/content/storefront-content.ts`
- Modify: `src/components/site/faq-section.tsx`
- Create: `src/components/site/faq-json-ld.tsx`
- Modify: `src/components/site/public-home.tsx`
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
