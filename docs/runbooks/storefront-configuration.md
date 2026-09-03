# Storefront Configuration Guide

This guide is for the business owner and the operators who approve storefront facts. It describes the repository as implemented today. It does not authorize a production launch, create catalog records, or approve any product, claim, policy, provider, or campaign.

Use these boundaries:

- **Business owner:** supplies the actual facts, source documents, approvals, dates, URLs, provider decisions, and accountable owners.
- **Authorized operator:** uses an existing capability-protected admin screen only for fields that screen actually supports, then reads the saved record back.
- **Developer/reviewer:** changes code-backed configuration or protected business rules, adds tests, and follows the production cutover process.
- **Never production data:** anything in `demo-fixtures`, a test file, a synthetic checkout route, or an E2E interception is a test double. Never copy its values into production.

## 1. Products and variants

The repository contains an owner-supplied **browse-only** catalog in [`src/catalog/browse-catalog.ts`](../../src/catalog/browse-catalog.ts). Its pinned manifest and publication authorization are in [`src/catalog/browse-catalog-publication.ts`](../../src/catalog/browse-catalog-publication.ts). Browse-only rows can supply names, categories, images, and display/package configurations, but they do not create a purchasable product, canonical mg variant, price, inventory record, or Stripe mapping.

Purchasable products require two reconciled sources:

| Fact | Current authoritative location |
| --- | --- |
| Database product ID, slug, name, package form, material identity, policy group, and lifecycle status | `products` in [`src/db/schema/catalog.ts`](../../src/db/schema/catalog.ts); existing draft/lifecycle operations are exposed through the capability-protected product resource defined in [`src/admin/access.ts`](../../src/admin/access.ts) and [`src/admin/actions.ts`](../../src/admin/actions.ts). |
| Stable variant ID, parent product ID, SKU, display label, numeric amount, amount unit, package quantity, lifecycle status, Stripe Product mapping, and Stripe Price mapping | `product_variants` in [`src/db/schema/catalog.ts`](../../src/db/schema/catalog.ts), reconciled with the server-only binding model in [`src/catalog/storefront-types.ts`](../../src/catalog/storefront-types.ts) and [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts). Edit a configured amount only in `approvedStorefrontCatalogAmountDecisions` in [`src/catalog/storefront-catalog-manifest.ts`](../../src/catalog/storefront-catalog-manifest.ts), by its exact `(browseSlug, browseCode)` key; never infer it from a label, SKU, image, or price. The current admin UI has no variant-authoring command. |
| Category, approved public description, image metadata, search aliases, popularity rank, release date, explicit default variant, exact related-product IDs, and controlled-content IDs | Canonical `StorefrontProduct` records in [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts), validated by [`src/catalog/storefront-bindings.ts`](../../src/catalog/storefront-bindings.ts) and projected by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts). Popularity rank and release date are nullable: every current configured product is `null` for both because no verified value was supplied. `null` means unknown; it is not a date, rank, array-order, or clock fallback. There is no owner CMS or admin form for these fields. |
| Runtime price status, amount, currency, availability, and provider mapping agreement | `product_prices`, `product_variants`, and released lot/inventory facts in [`src/db/schema/catalog.ts`](../../src/db/schema/catalog.ts), loaded by [`src/catalog/database-catalog.ts`](../../src/catalog/database-catalog.ts) and reconciled by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts). |

The canonical display source in [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts) now contains 56 products and 103 variant rows from the reviewed manifest. Reviewed positive rows are visible reference prices, but remain preview-only and do not make an item checkout-ready.

Product and variant identity is never derived from a display label. Editing text such as an mg label does **not** change the product ID, variant ID, numeric amount, amount unit, SKU, price, default variant, or Stripe mapping. Those fields must be changed together at their authoritative sources and pass reconciliation tests.

The reviewed price manifest is [`src/catalog/storefront-catalog-manifest.ts`](../../src/catalog/storefront-catalog-manifest.ts). It is the decision source for deterministic identities, one-vial public labels, explicit amount decisions, and audited candidate base amounts. It covers 56 products and 103 scoped rows: 40 approved positive Amino-equivalent ordinary one-vial base-price candidates and 63 zero-dollar pending rows. Change a reviewed amount, label, source URL, or observation timestamp there only with its exact tests; never use transient competitor promotions as a base price. The 40 positive amounts are non-transactional reference prices for the displayed one-bottle variant, not live checkout prices; they have no inventory or Stripe mapping. The 63 unmatched rows remain pending zero-dollar placeholders in local/test/preview modes. Production purchase remains unavailable until canonical records, inventory, Stripe mappings, campaign reconciliation, and launch approvals are complete. WINTER30 is applied once by server pricing and is never baked into base amounts or stacked.

## 2. Prices and checkout readiness

Prices use integer currency minor units; browser-supplied prices, totals, discounts, promotion IDs, and Stripe IDs are not authority. The canonical price states are `pending`, `active`, and `unavailable`, defined in [`src/catalog/storefront-types.ts`](../../src/catalog/storefront-types.ts). Current V1 checkout is USD-only, so a mixed-currency or non-USD cart is rejected.

An active variant must have all of the following:

- a positive base price in integer minor units;
- an active price record and available variant/inventory state;
- an exact Stripe Product mapping and Stripe Price mapping that agree between the binding, database, and Stripe account;
- an available canonical product/variant relationship; and
- a current server-calculated pricing revision.

The validation rules live in [`src/catalog/storefront-bindings.ts`](../../src/catalog/storefront-bindings.ts), [`src/commerce/checkout-service.ts`](../../src/commerce/checkout-service.ts), and [`src/commerce/provider-contracts.ts`](../../src/commerce/provider-contracts.ts). Checkout reloads the canonical variant facts, recalculates every line, and returns `PRICE_CHANGED` for a stale cart or `CHECKOUT_UNAVAILABLE` for an ineligible line before creating a provider session. Stripe Checkout receives server-calculated inline line pricing; customer-entered Stripe promotion codes remain disabled.

The canonical merchandise pricing revision is schema V2. It covers commercial identity, price/version, variant and product availability, destination resolution, eligible automatic promotions, requested quantities, effective amounts, and payment mappings. It intentionally excludes raw global lot quantities and lot timestamps. Initial quote/session and the atomic prepare transaction still validate current global released inventory, and prepare still hashes the full locked facts (including `inventoryRevision`) before reserving anything. This separation prevents an attempt from mistaking its own reservation decrement for a customer-visible price change.

Immediately before the first provider create or a providerless retry, checkout re-proves the durable attempt and uses only that exact attempt's active, unexpired reservations as inventory authority. Reservation expiry must equal the persisted provider-preparation expiry as an absolute instant; ownership, order item, product, variant, lot, and requested quantity must agree. Missing, released, expired, nonreleased-lot, or insufficient valid coverage returns the affected variant as unavailable. Mismatched authority, duplicate ownership, unexpected active lines, or overcoverage fails closed before shipping, tax, prepare, or provider work. Ordinary browsing and quoting never use this internal reservation-aware port.

An already-prepared canonical attempt is not permission to create a new provider session from stale facts. When a V2 attempt is still providerless in `created` or `provider_unknown`, the server freshly revalidates its stored revision, complete quote, current catalog and promotion authority, full provider request, and binding snapshot immediately before any new provider-session creation. If those facts changed, Checkout returns `PRICE_CHANGED`; the customer must review a new quote and the browser uses a new idempotency key for that reviewed attempt. Network failures, provider-unknown results, and ordinary retries keep the existing key. An attempt with a known provider-session identifier remains on the existing retrieval/recovery path, and completed, expired, or failed attempts retain their terminal projection instead of creating another session.

Pending or zero-dollar records may exercise selection and cart behavior in local, test, or explicitly marked preview environments. In production, a pending record remains browse-only, displays `Pricing coming soon`, keeps checkout unavailable, and cannot create a Checkout Session. A zero-dollar record likewise cannot create production Checkout. The current canonical production configuration contains no purchasable variants or approved real prices.

The local synthetic driver implements the same server-only provider-create boundary so deterministic local checkout can exercise the complete flow. Its reservation projection is intentionally weaker than production: it has aggregate `hasReservations` state plus server-created durable V2 binding lines, not PostgreSQL's per-lot reservation journal. This is a test-double limitation and must not be used to relax the production repository checks. Production database contents, provider state, and deployment behavior remain unverified.

The existing `/admin/prices` operation is a legacy product-level price-history command. It does not author the required canonical variant, variant price status, or Stripe mappings by itself. Variant pricing needs an approved database/import path plus the matching server binding and review.

## 3. Quantity tiers and promotion precedence

The quantity tiers are code-protected in [`src/domain/storefront-pricing.ts`](../../src/domain/storefront-pricing.ts):

| Exact-variant quantity | Volume discount |
| --- | ---: |
| 1 | 0% |
| 2 | 8% |
| 3 through 9 | 10% |
| 10 or more | 30% |

Cart identity is the stable variant ID. Repeated additions of the same exact variant merge and reprice as one line in [`src/cart/cart-storage.ts`](../../src/cart/cart-storage.ts). Different variants, including different mg variants of the same product, remain separate lines and do not combine toward a tier. The current cart and checkout cap is 25 units per exact variant; changing that cap is also a reviewed code/test change.

For each exact variant, the pricing code compares the quantity discount with every eligible automatic storefront campaign and applies the **single highest percentage**. Percentages never add together, and equal promotions resolve deterministically. The protected tests are [`src/domain/storefront-pricing.test.ts`](../../src/domain/storefront-pricing.test.ts), [`src/cart/cart.test.ts`](../../src/cart/cart.test.ts), and [`src/commerce/checkout-service.test.ts`](../../src/commerce/checkout-service.test.ts).

Storefront savings then compete with an eligible customer-referral discount through the existing single-acquisition selector; only the larger acquisition benefit applies. An approved rewards redemption is a separate, later reservation/allocation and remains separately journaled. That boundary is in [`src/domain/promotions.ts`](../../src/domain/promotions.ts) and [`src/commerce/checkout-service.ts`](../../src/commerce/checkout-service.ts).

There is no owner-editable tier configuration seam. Changing these thresholds or percentages requires a reviewed code and test change.

## 4. WINTER30 and future campaigns

The owner display/application contract for `WINTER30` lives in [`src/config/storefront-promotions.ts`](../../src/config/storefront-promotions.ts). Edit campaign terms, dates, mode, or scope there only through a reviewed code-and-test change. `WINTER30` is automatic, not a customer-entered Stripe coupon. Its configured terms are:

- campaign key `winter30`;
- display code `WINTER30` and name `Winter Sale`;
- discount kind, active status, enabled state, and 3,000 basis points;
- no fixed amount or currency override;
- no start or end timestamp;
- timezone `America/Los_Angeles`;
- application mode `automatic`; and
- scope `sitewide`.

If dates are added to a future campaign, the start is inclusive and the end is exclusive. The server evaluates absolute instants; the configured IANA timezone is authoring/display metadata, and the browser clock is not authoritative. Owner-configured dates must be exactly representable at millisecond precision because the current PostgreSQL/JavaScript loaders emit `Date.toISOString()` values at millisecond precision. The strict input validator still accepts one through nine fractional digits, but digits beyond the first three are allowed in owner configuration only when they are zero; configuration is rejected rather than rounded or truncated.

[`src/catalog/storefront-promotion-banner-server.ts`](../../src/catalog/storefront-promotion-banner-server.ts) evaluates that immutable configuration directly at request time, so scheduled visibility is not frozen during prerendering and the banner is active even when there are no canonical products and browse publication is closed. The banner's copy control only copies the campaign code and announces the result; copying it does not apply another discount.

Banner visibility remains independent from catalog pricing and does not create a product, make any product purchasable, or authorize a Stripe Checkout Session. Positive production pricing and checkout still require canonical products and variants, positive active prices, inventory, payment mappings, and exactly one active persisted promotion row whose public terms and scope match every applicable active owner configuration. If that row is absent, duplicated, malformed, inactive, scheduled away, expired, or mismatched, affected positive public prices fall back to the established `Pricing coming soon` state and Checkout returns `CHECKOUT_UNAVAILABLE` before quote, reservation, order, or provider preparation. A missing or mismatched row never falls back to a lower price while the independent banner advertises the configured campaign. [`src/catalog/storefront-promotion-projection.ts`](../../src/catalog/storefront-promotion-projection.ts) and the checkout repository omit a configured same-key row when any term or scope differs. The code-configured banner is never inserted into authoritative checkout facts. [`src/commerce/provider-contracts.ts`](../../src/commerce/provider-contracts.ts) keeps Stripe's customer-entered promotion-code field off and sends no Stripe discount entry for this automatic campaign.

The `promotions_winter30_exact` schema constraint in [`src/db/schema/catalog.ts`](../../src/db/schema/catalog.ts) is a defense-in-depth mirror of the owner configuration; it does not insert a campaign. Any future WINTER30 term, date, mode, or scope change requires a reviewed matching schema/data change before positive checkout can use the new terms. The WINTER30 record in [`src/catalog/demo-fixtures.ts`](../../src/catalog/demo-fixtures.ts) remains a clearly synthetic database fixture whose business fields are derived from the owner configuration; its synthetic UUID/version must never be promoted to production. Live database rows, publication state, provider configuration, and deployment behavior remain unverified; this source audit did not query or change them.

The current `/admin/promotions` form manages the older draft fields, product/policy-group targets, dates, and lifecycle. It does not author `campaignKey`, `enabled`, `timezone`, `applicationMode`, `scope`, or variant targets. Publishing WINTER30 or another automatic campaign requires a reviewed database/import change or an approved extension of that admin boundary, followed by projection, checkout, and browser verification.

## 5. Search and related products

Catalog search and the permanent bottom search use the same deterministic scorer in [`src/search/storefront-search.ts`](../../src/search/storefront-search.ts) and the same normalized projection in [`src/search/storefront-index.ts`](../../src/search/storefront-index.ts). There is no external AI, embedding, vector, or hosted search service.

Approved searchable product fields include product name, slug, aliases, category, browse source/package terms, SKU, variant label, and approved `product_information` titles/bodies. Informational results come only from approved records and approved destinations in [`src/content/public-information.ts`](../../src/content/public-information.ts). Draft and retired content is excluded.

Catalog sorting uses:

- the explicit popularity rank for “Most popular”;
- the explicit release timestamp for “Newest”;
- the currently displayed effective price of the selected available card variant for price sorting; and
- stable alphabetical and ID fallbacks for ties.

Pending and unavailable price states sort after active prices. A product card first honors its explicit `defaultVariantId` when that variant is non-unavailable, has a priced presentation, and has a positive base amount. Otherwise it chooses the lowest displayed effective unit price among those positive-base candidates, using label and stable ID as deterministic ties. If none qualify, it falls back only to the explicit default for pending, unavailable, or local-zero presentation; it never uses the first array element. The same card-selection authority supplies price sorting. The card variant selection and displayed price rules are in [`src/catalog/storefront-price-presentation.ts`](../../src/catalog/storefront-price-presentation.ts) and [`src/search/catalog-discovery.ts`](../../src/search/catalog-discovery.ts).

Related products come only from each canonical product's exact `relatedProductIds`, never random order. They are resolved through [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts) and rendered by [`src/components/commerce/related-products-carousel.tsx`](../../src/components/commerce/related-products-carousel.tsx). Update both sides of a relationship only if that is the approved merchandising decision; do not infer related products from names or categories.

The canonical product detail route is `src/app/(public)/catalog/items/[slug]/page.tsx`. The older `src/app/(public)/catalog/[slug]/page.tsx` route still exists for browse compatibility and keeps purchasing disabled. Do not treat the legacy route as canonical checkout evidence; retaining or redirecting it is a separate reviewed routing decision.

The bottom launcher lazily makes one query-free `GET /api/storefront-search` request, validates and caches the approved index for the page lifetime, and searches locally afterward. Its loader is in [`src/components/search/site-search-launcher.tsx`](../../src/components/search/site-search-launcher.tsx); the GET-only server boundary is [`src/app/api/storefront-search/route.ts`](../../src/app/api/storefront-search/route.ts). Informational page and FAQ/section links appear only when their exact route or fragment is listed in `publicInformationDestinations`. The current destination registry approves no fragments.

Tint & Go's implementation was unavailable in this workspace and was not inspected. The delivered interaction follows PropeptIQ's verified local architecture plus the requested high-level interaction direction.

## 6. Approved homepage, product, and legal content

Controlled content is defined in [`src/content/storefront-content.ts`](../../src/content/storefront-content.ts). Every record has a stable ID, kind, `draft|approved|retired` status, title, body, source references, approval note, reviewed timestamp, and optional effective timestamp. The supported kinds are:

- `why_choose`;
- `faq`;
- `legal_notice`;
- `product_information`; and
- `calculator_copy`.

Only approved records can render or enter search. Production arrays are currently empty. `Why choose PropeptIQ` and FAQ records are projected by [`src/content/storefront-public-content-server.ts`](../../src/content/storefront-public-content-server.ts) and rendered by the server-safe components in [`src/components/site/why-choose-propeptiq.tsx`](../../src/components/site/why-choose-propeptiq.tsx) and [`src/components/site/faq-section.tsx`](../../src/components/site/faq-section.tsx). Product information is attached by exact `contentIds` in canonical product configuration and projected by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts).

Search destinations are a separate approval gate in [`src/content/public-information.ts`](../../src/content/public-information.ts). A content record does not create its own route or anchor. Add an exact route or fragment only after that destination exists and is approved; invalid, duplicate, draft, retired, or unapproved destinations fail closed.

The footer renders the two existing research restrictions from [`src/lib/site-content.ts`](../../src/lib/site-content.ts) and any approved `legal_notice` records. No approved legal-notice records are configured today. Do not describe generated or draft copy as attorney-, regulator-, FDA-, or business-approved. Claims, research summaries, storage wording, safety wording, and legal notices need source-specific business review before they become `approved`.

## 7. Newsletter

Newsletter signup is intentionally closed. [`src/lib/site-content.ts`](../../src/lib/site-content.ts) has an empty approved privacy-destination policy and `newsletterConfiguration.privacyHref` is `null`. [`src/app/api/newsletter/route.ts`](../../src/app/api/newsletter/route.ts) creates the production handler without a mailing-list gateway or attempt gate.

Because the approved privacy destination, subscriber gateway, and abuse/attempt gate are absent, the server returns `NEWSLETTER_NOT_CONFIGURED` before reading the request body. The form stays disabled, does not store or transmit the address, and cannot show a success state. This behavior is protected by [`src/newsletter/server.ts`](../../src/newsletter/server.ts), [`src/newsletter/contracts.ts`](../../src/newsletter/contracts.ts), and [`src/components/site/newsletter-form.tsx`](../../src/components/site/newsletter-form.tsx).

The repository's `EMAIL_MODE` and Resend fields are reserved for transactional-email architecture. There is no production Resend delivery adapter in the current runtime, and those fields are not a mailing-list subscriber provider. Do not reuse them for newsletter collection without a reviewed subscriber provider, consent/retention policy, privacy route, attempt gate, duplicate semantics, deletion process, and incident owner.

## 8. Footer and social URLs

Footer groups, link destinations, and social URLs are centralized in [`src/lib/site-content.ts`](../../src/lib/site-content.ts); rendering and validation are in [`src/components/site/site-footer.tsx`](../../src/components/site/site-footer.tsx).

The four owner-authorized placeholders are currently:

- Instagram → `/`
- TikTok → `/`
- X → `/`
- Facebook → `/`

Replace a placeholder only with the approved public profile URL. The validator accepts the `/` placeholder or an absolute HTTPS URL with a host and no embedded username/password. Invalid values are omitted. Validate all four labels, destinations, keyboard focus, and mobile layout after a change.

Available footer/support destinations are Catalog, Cart, Quality Records, Rewards, Partner Program, account Order Tracking, and Research Use Only. The following requested destinations are still absent and intentionally render no link: FAQ destination, Contact or Support, Shipping information, Privacy Policy, Terms and Conditions, Shipping and Returns, Refund Policy, and FDA Disclaimer. There are no corresponding approved Privacy, Terms, Shipping/Returns, Refund, Contact/Support, or FDA routes/copy in the repository. Do not publish empty or generated policy pages to fill these slots.

## 9. Laboratory calculator

The calculator has three gates:

1. the server-owned `RECONSTITUTION_CALCULATOR_MODE` setting documented in [`.env.example`](../../.env.example) and validated by [`src/config/env-schema.ts`](../../src/config/env-schema.ts);
2. a structurally approved configuration with business-approved limits, placement, approval note, review time, publication policy, and controlled-content ID in [`src/config/concentration-calculator.ts`](../../src/config/concentration-calculator.ts); and
3. exactly one approved neutral `calculator_copy` record in [`src/content/storefront-content.ts`](../../src/content/storefront-content.ts).

The default mode is disabled, production rejects preview mode, `concentrationCalculatorConfiguration` is currently `null`, and controlled calculator copy is absent. The public server projection in [`src/config/concentration-calculator-server.ts`](../../src/config/concentration-calculator-server.ts) therefore returns no calculator for production.

When all gates are approved, the component may perform only:

- vial mg divided by diluent mL to produce mg/mL;
- mg/mL converted to mcg/mL; and
- material contained in an optional sample volume.

The calculator must not recommend a dose, draw volume, syringe units, schedule, frequency, administration technique, treatment, protocol, or expected effect. Before enabling it, the owner must approve the exact limits, neutral title/body, source references, placement, review metadata, and accountable production reviewer; then a developer must run the calculator, content-policy, product-page, browser, and reduced-motion tests.

## 10. Production readiness

Do not turn on buyer commerce from this guide. Follow the existing [production cutover runbook](./production-cutover.md), use [incidents and recovery](./incidents-and-recovery.md) for containment/rollback, and keep the [failed-order](./failed-orders.md), [refund and reconciliation](./refunds-reconciliation.md), and [compliance-hold](./compliance-holds.md) procedures available.

Production readiness requires evidence for all of the following:

- approved canonical product, variant, price, inventory, relation, image, and controlled-content records;
- reviewed migrations and reconciliation between code bindings, database rows, and provider mappings;
- Stripe account and business-category acceptance, valid product/price mappings, webhook signing, tax, shipping, and payment configuration;
- an accountable fulfillment flow, inventory release behavior, carrier evidence, and customer-support ownership;
- approved legal, research-use, FDA, privacy, consent, claims, research, and storage content plus real routes;
- a newsletter provider and attempt gate, or an explicit decision to remain closed;
- real social URLs or an explicit decision to keep the owner-authorized placeholders;
- calculator limits/copy/placement approval if the calculator is to be public;
- backup, migration rollback, incident response, and credential-rotation readiness; and
- explicit deployment authority and post-deployment read-back.

A working local build or Stripe API integration is not provider-account approval. A schema, test fixture, or admin draft is not a production record. Production database contents, provider state, and deployment behavior remain unverified. This documentation task did not query a live database or provider, apply migrations, push, merge, deploy, or publish.

## 11. Focused verification commands

Run these repository commands from the project root after a configuration or code change:

```powershell
npm run verify:workspace-boundary
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run db:check
npm run build
npm run verify:production-artifacts
npm run test:artifact-scanner
```

Focused pricing/cart/checkout checks:

```powershell
npm test -- src/config/storefront-promotions.test.ts src/domain/storefront-pricing.test.ts src/cart/cart.test.ts src/catalog/storefront-price-presentation.test.ts src/catalog/storefront-promotion-projection.test.ts src/catalog/storefront-promotion-banner.test.ts src/catalog/storefront-promotion-banner-server.test.ts src/commerce/checkout-service.test.ts src/commerce/provider-contracts.test.ts
```

Focused catalog/search checks:

```powershell
npm test -- src/catalog/storefront-bindings.test.ts src/catalog/storefront-public.test.ts src/search/storefront-search.test.ts src/search/storefront-index.test.ts src/search/catalog-discovery.test.ts src/components/search/site-search-sheet.test.tsx src/components/commerce/related-products-carousel.test.tsx src/components/commerce/related-products-carousel.integration.test.tsx src/components/commerce/related-products-composition.integration.test.tsx
```

Focused public-content/newsletter/footer/calculator checks:

```powershell
npm test -- src/content/storefront-content.test.ts src/content/public-information.test.ts src/content/storefront-public-content-server.test.ts src/components/site/public-home.test.tsx src/components/site/site-footer.test.tsx src/newsletter/server.test.ts src/config/concentration-calculator.test.ts
```

Focused public browser checks:

```powershell
npx playwright test tests/e2e/public-storefront.spec.ts
```

Focused catalog/schema integration checks:

```powershell
npm run test:integration -- tests/integration/catalog-repository.test.ts tests/integration/task6-schema.test.ts
```

`npm run test:integration` uses the repository's isolated local integration harness. The external lanes are separate:

- **Real PostgreSQL lane:** `npm run test:postgres:checkout` is destructive and must run only against an explicitly isolated test database with both guard variables required by [`tests/integration/helpers/database.ts`](../../tests/integration/helpers/database.ts).
- **Provider-positive lane:** requires an approved Stripe sandbox/account, valid provider mappings, and the configured server-only prerequisites. It was not run by this documentation task and must never be enabled by copying fixture values or credentials into documentation.
- **Browser-positive lane:** the local Playwright suite proves the implemented shell, fixture/closed states, and injected search behavior. A positive browser run with real products, WINTER30, approved content, newsletter delivery, or the calculator needs the corresponding approved records and isolated preview dependencies first; it does not authorize a production provider call.

Browser tests use the configured local Playwright server; they do not prove live Clerk, Stripe, tax, shipping, fulfillment, newsletter, or database behavior.

## Owner change matrix

| What | Authoritative location | Who should change it | Required validation | Current blocker/status |
| --- | --- | --- | --- | --- |
| Browse names, categories, images, package/display configurations | [`browse-catalog.ts`](../../src/catalog/browse-catalog.ts) and pinned [`browse-catalog-publication.ts`](../../src/catalog/browse-catalog-publication.ts) | Owner supplies a revised source; developer creates and reviews a new pinned manifest | Manifest fingerprint, public-copy policy, publication, browser checks | Owner browse manifest exists; deployment publication state was not inspected |
| Canonical product and variant identity | [`storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts), [`storefront-bindings.ts`](../../src/catalog/storefront-bindings.ts), and database [`catalog.ts`](../../src/db/schema/catalog.ts) | Owner supplies facts; reviewed developer/import plus authorized database operator | Binding, schema, reconciliation, catalog, cart, checkout tests | Display identities are projected; purchasable database records remain absent |
| Prices and Stripe mappings | `product_prices`/`product_variants` in [`catalog.ts`](../../src/db/schema/catalog.ts) and matching storefront bindings | Owner/finance and Stripe account owner approve; authorized operator/developer implements | Positive integer/currency, provider binding, server quote/session, webhook tests | No approved real variant prices or mappings in canonical config |
| Quantity tiers and non-stacking | [`storefront-pricing.ts`](../../src/domain/storefront-pricing.ts) and checkout/cart code | Developer only after an owner rule change | Pricing matrix, cart merge, checkout regression tests | Implemented and code-protected; no owner config seam |
| Automatic campaigns | Owner terms in [`storefront-promotions.ts`](../../src/config/storefront-promotions.ts), database promotion tables/constraints in [`catalog.ts`](../../src/db/schema/catalog.ts), projection, and checkout | Owner approves terms; authorized reviewed database/admin implementation | Interval/scope/overlap, banner, persisted-row reconciliation, cart, checkout, Stripe request tests | Owner-configured banner active; current admin cannot author automatic fields; positive pricing still needs an exact persisted row |
| Related products, rank, release date, aliases, default variant | [`storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts) | Owner supplies decisions; developer changes reviewed config | Binding, discovery sort/search, related carousel tests | Relationships/content remain empty pending owner decisions |
| Why Choose, FAQ, product info, calculator copy, legal notices | [`storefront-content.ts`](../../src/content/storefront-content.ts) | Business/content/legal reviewer approves; developer enters reviewed records | Status/metadata, content policy, homepage/product/footer/search tests | Production registry is empty |
| Searchable pages and anchors | [`public-information.ts`](../../src/content/public-information.ts) | Content owner approves destination; developer updates allowlist and record | Route/anchor existence, index, dialog, keyboard/browser tests | Information registry empty; no approved fragments |
| Newsletter | [`site-content.ts`](../../src/lib/site-content.ts), [`newsletter/server.ts`](../../src/newsletter/server.ts), and API composition | Privacy owner and mailing-list owner decide; developer adds reviewed adapters | Consent/privacy, same-origin, rate/attempt, duplicate/error/provider tests | Privacy destination null; gateway and attempt gate absent; closed |
| Footer links and social profiles | [`site-content.ts`](../../src/lib/site-content.ts) | Owner supplies approved routes/URLs; developer updates central config | Destination, safe URL, accessibility, responsive browser checks | Four `/` placeholders; multiple support/legal routes absent |
| Laboratory calculator | [`.env.example`](../../.env.example), [`concentration-calculator.ts`](../../src/config/concentration-calculator.ts), controlled content | Business/legal reviewer approves; deployment owner sets mode after reviewed code/content | Limits, neutral-copy policy, product page, keyboard/mobile/reduced-motion tests | Mode defaults disabled; configuration null; approved copy absent |
| Cutover and rollback | [production cutover](./production-cutover.md) and [incidents/recovery](./incidents-and-recovery.md) | Explicitly authorized deployment/operations owner | Backup, migration, provider, webhook, smoke test, rollback read-back | No deployment was authorized or performed by this task |

## Launch blockers still requiring business input

- [ ] Canonical stable product IDs and exact joins for the owner browse products.
- [ ] Canonical variant IDs, real numeric amounts/units, package quantities, SKUs, explicit default variants, and lifecycle/availability decisions.
- [ ] Approved real base prices, price status, currency decision within the current USD-only boundary, and matching Stripe Product/Price mappings.
- [ ] Approved inventory/lot availability and the physical fulfillment, shipping, tax, carrier, returns, and support operating decisions.
- [ ] Approved popularity ranks, release dates, aliases, related-product IDs, product image reconciliation, and product content IDs.
- [ ] Approved product descriptions, claims, source-backed research, storage wording, technical information, and review metadata.
- [ ] Approved Why Choose and FAQ content plus approved FAQ/section destinations.
- [ ] Approved research-use, legal, FDA, privacy, terms, shipping/returns, refund, and contact/support copy and routes. No generated copy should be treated as approved.
- [ ] A newsletter provider, abuse/attempt gate, consent/retention/deletion decision, approved privacy route, duplicate behavior, and accountable incident owner—or an explicit decision to remain unavailable.
- [ ] Real Instagram, TikTok, X, and Facebook profile URLs, or explicit acceptance of the current `/` placeholders for launch.
- [ ] Calculator maximum inputs, neutral copy, sources, placement, review metadata, and explicit public-launch approval if it is to be enabled.
- [ ] An authoritative persisted WINTER30 publication path and accountable database campaign operator for positive production pricing; the owner code configuration and schema constraint do not create the row.
- [ ] Stripe account/business acceptance, provider mapping reconciliation, webhook/signature operations, and production-safe payment/tax/shipping configuration.
- [ ] Reviewed database migration/import plan, backup, reconciliation, rollback, fulfillment ownership, and production incident response.
- [ ] Deployment-specific browse publication and capability settings, explicit deployment authority, and post-deployment verification.
- [ ] An explicit reviewed decision to retain or redirect the legacy browse-only `/catalog/[slug]` route; it is not the canonical purchasable product route.
