# PROPEPTIQ Visible Storefront Correction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` and `superpowers:test-driven-development`. Preserve the isolated integration worktree and prove every behavior before merging the correction to local `main`.

**Goal:** Make the already-built storefront features visible from the owner-published catalog: 56 canonical product pages, 103 canonical variant choices, the automatic WINTER30 price presentation, and every exact Amino Club-equivalent price that has current first-party evidence, while keeping unverified prices honest and all unconfigured checkout paths fail-closed.

**Architecture:** Convert the reviewed browse/price decision manifest into the canonical public catalog configuration instead of maintaining an empty runtime source. Add a server-owned display-price projection for reviewed candidate prices and pending zero-dollar preview rows. Database-backed facts override configured display facts whenever the database contains the corresponding canonical variant. Scope configured campaign fallback to display-only variants so it cannot authorize or alter transactional database lines. Existing cart and Checkout authority remain unchanged: no inventory or Stripe mapping is invented, production Add/Checkout remains unavailable, and the server continues to revalidate every submitted variant.

**Verified starting facts:**

- Integration branch and local `main` start at `3734477f7b0d320cc1e4bb6a93e4976c3f6fbda1`; `origin/main` remains at `440be99e7ebe3b2900f3cba55faa406d5317e808`.
- The correct local build already renders the WINTER30 banner, but `storefrontCatalogData` is empty, so 56 products and 103 configurations render as browse-only records with no canonical selectors or prices.
- The reviewed decision manifest has 39 exact positive one-vial Amino Club price candidates and 64 pending zero-dollar rows. No Stripe IDs or inventory facts exist.
- The ordinary working folder is a dirty sibling checkout on another branch. Do not switch, clean, reset, or edit it.

## Non-negotiable boundaries

- Use only exact current official Amino Club evidence. Do not infer prices across formulations, blends, sprays, package counts, or similar names.
- Never invent stock, released lots, availability, Stripe IDs, legal/research content, related products, release chronology, or product claims.
- Product/variant identity remains the reviewed manifest UUID/SKU, never a parsed label or Stripe ID.
- Parsing an exact owner label may populate numeric amount/unit only for a single-value `mg`, `mcg`, or `iu` label. Compound blends and unsupported units remain `amount: null`.
- A reviewed positive display price may be visible without stock or Stripe mapping, but must be `preview_only`, `checkoutReady: false`, and non-addable in production.
- A pending zero-dollar row may show the layout-test `$0.00` sale state only in local/test/explicit preview modes. Production must say `Pricing coming soon` and show no misleading savings.
- Local/test/preview may add display-only variants to the local cart to exercise merging and tiers. This must never make a Checkout Session possible.
- Existing database-backed pricing, inventory, promotion reconciliation, server quote, Stripe, webhook, fulfillment, and refund authority must remain fail-closed and take precedence over display configuration.
- Do not push, deploy, query providers, inspect environment values, or mutate databases during this correction. The user separately authorized merging session work to local `main`.

## Task 1: Activate canonical display data with RED-first tests

**Primary files:**

- Create: `src/catalog/storefront-catalog-data.test.ts`
- Modify: `src/catalog/storefront-catalog-data.ts`
- Modify if required: `src/catalog/storefront-catalog-manifest.ts` and `.test.ts`
- Modify: `src/catalog/storefront-public.ts` and `.test.ts`
- Modify: `src/catalog/storefront-public-server.ts` and `.test.ts`
- Modify: `src/catalog/storefront-price-presentation.ts` and `.test.ts`
- Modify focused catalog/card/purchase/cart tests only when needed for the visible behavior
- Modify: `tests/e2e/public-storefront.spec.ts`
- Modify: `docs/runbooks/storefront-configuration.md`

### RED contract

Before production changes, add focused tests that fail because the source is empty and display-only active prices are unsupported:

1. `storefrontCatalogData` contains exactly 56 canonical products, 56 product bindings, and 103 variant bindings; every identity and SKU exactly matches the reviewed manifest.
2. Every product preserves the owner name/category/image and exact manifest variant order. Popularity uses the explicit owner catalog order. All products share the actual reviewed catalog-record timestamp rather than invented release chronology, so alphabetical/stable-ID fallback resolves ties.
3. Tirzepatide has nine exact variants. TR30 has base `5999`, TR60 has `10999`, both use null Stripe mappings and display-only availability. TR5 remains pending at `0`.
4. Single-value labels yield exact numeric `mg`, `mcg`, or `iu` amounts; blends and `ml` rows remain null. Prices are never derived from labels.
5. The server produces configured display facts when no database variant owns the ID: 39 positive reviewed rows become public priced/display-only variants and 64 zero rows remain pending preview rows.
6. A valid database fact for a canonical variant overrides its configured display fact. A database-owned but malformed/unreconciled variant fails closed instead of falling back to the static display price.
7. Configured WINTER30 applies exactly once and only to configured display variants when no authoritative database campaign exists. It must never leak onto an unreconciled database-backed line.
8. In production, positive display-only prices render with `Checkout unavailable`; pending zero rows render `Pricing coming soon`. In local/test/preview, positive display-only and zero pending rows may exercise the local cart, but no checkout-ready state is created.
9. Exact arithmetic: TR30 `$59.99 -> $41.99`, savings `$18.00`; TR60 `$109.99 -> $76.99`, savings `$33.00`. Quantities 1, 2, 3, 4, 9, 10, and 11 remain exactly 30% during WINTER30, never stacked to 38% or 40%.

Run the new focused tests and retain the expected failure evidence before implementation.

### Implementation contract

- Build immutable canonical products/bindings from the existing owner browse catalog plus reviewed decision manifest; do not create another hand-maintained price table.
- Choose each explicit default variant deterministically: the first reviewed positive candidate in owner order, otherwise the first explicitly listed owner variant. Document this preview default and keep it editable in the decision source.
- Model display-only active price facts as non-transactional presentation facts. Extend public price presentation only as needed for `preview_only + active + positive + checkoutReady:false`.
- Merge display facts and database facts by stable variant ID. Presence of a database variant ID blocks static fallback for that ID even when database reconciliation fails.
- Derive configured automatic-promotion presentation only after strict existing activation validation. Rewrite its eligible scope to the surviving display-only variant IDs; preserve authoritative database promotion projection for database-backed lines.
- Keep production cart/Add unavailable for display-only or pending records. Keep all existing Checkout guards and server-authoritative pricing unchanged.
- Remove or update runbook statements that incorrectly say reviewed public prices must remain invisible until Stripe/inventory activation; explicitly distinguish visible reference pricing from purchasable commerce.

### Focused GREEN gate

Run at minimum:

```powershell
npm test -- src/catalog/storefront-catalog-data.test.ts src/catalog/storefront-catalog-manifest.test.ts src/catalog/storefront-public.test.ts src/catalog/storefront-public-server.test.ts src/catalog/storefront-price-presentation.test.ts src/components/commerce/catalog-listing-card.test.tsx src/components/commerce/product-purchase-panel.test.tsx src/cart/cart.test.ts src/commerce/checkout-service.test.ts
```

Then run lint, typecheck, workspace-boundary verification, and `git diff --check`.

## Task 2: Prove the customer-visible flow and checkout boundary

Update the existing public-storefront browser file with exact local/test assertions:

- homepage shows the WINTER30 bar once;
- catalog contains 56 canonical product cards and 103 variant choices/configurations;
- priced cards show crossed standard price, emphasized 30%-off price, badge, and honest status;
- Tirzepatide detail exposes nine radio variants, quantity presets/controls, dynamic TR30/TR60 prices, savings, and subtotal;
- a pending variant shows `$0.00 -> $0.00` only in the local/test browser configuration;
- repeated local additions of one exact variant merge, while a different variant remains separate;
- no missing-mapping or pending line can initiate a production Stripe session;
- 320px and the existing required viewport matrix have no horizontal overflow, including the permanent search launcher.

Run the focused Playwright file first. Inspect screenshots at phone and desktop widths. Fix only reproduced in-scope layout defects. Then run the repository's complete unit, integration, E2E, dual-build/artifact, and migration-reproducibility gates without claiming an unobserved result.

## Task 3: Independent review and local-main integration

- Request a fresh adversarial review of the exact correction diff for stale-price leakage, promotion scope leakage, false inventory/availability claims, client authority, checkout bypass, accessibility, and responsive regressions.
- Resolve every actionable finding with a focused failing regression test, then rerun affected gates.
- Commit the correction on the isolated integration branch.
- Fast-forward local `main` to the reviewed correction after proving the integration worktree is clean. Do not alter the dirty primary sibling checkout.
- Report separately that `origin/main` and production remain unchanged until an authorized push/deployment is performed.

## Definition of done

The correction is done when the correct local-main build visibly presents all owner-published product families as canonical product pages, exposes every canonical variant selector, applies WINTER30 consistently to every verified display price, preserves honest pending placeholders for unmatched variants, never claims stock or enables production checkout without authoritative records/mappings, passes the full observed repository gate, receives independent approval, and is fast-forwarded to local `main` without touching unrelated user work.
