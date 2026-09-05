# Storefront Configuration Guide

This guide is for the business owner and the operators who approve storefront facts. It describes the repository as implemented today. It does not authorize a production launch, create catalog records, or approve any product, claim, policy, provider, or campaign.

**September 5, 2026 visible release:** PR #17 merged the locally tested source candidate `f91ea55937df4a524fbceccb8cec4edd91412fc5` as `365b2acc673063643607b4aae1695e22bad49bab`. READY deployment `dpl_gSy5LMPTunhaifMUuJ4d3BgfA6fw` serves <https://propeptiq.com/> with the six-view illustration gallery, product bibliography, Why Choose cards, grouped FAQ/structured data, transparent logo, and related-card corrections. Phone/tablet/desktop live checks confirm those surfaces. See the [completion plan](../superpowers/plans/2026-09-04-propeptiq-storefront-completion.md) for exact evidence and unfinished tasks. This is not full-storefront completion or permission to activate payment.

Live testing also found a preexisting legacy-cart migration defect. PR #18 corrected it and deployed as `53372558e79c53e027fa217fec94b59daeee9d11` / READY `dpl_91pveTQACNnH6WsmCD72m4eiiaSR`. Empty v1 now loads ready; nonempty v1 remains untouched until explicit acknowledgement, and ADD shows a visible cart-review link instead of accepting an unsaved item. The correction passed 3,457 unit tests and four focused browser cases, plus lint/typecheck/build/artifact checks. Production add/merge/reload preserved Tirzepatide 30mg quantity 2 and `$83.98`, with checkout disabled; verification items were removed afterward. Historical candidate-stage notes below describe earlier checkpoints; this release status supersedes pending-release wording, but does not close missing prices, content, policies, providers, or recurring-commerce decisions.

Final local evidence: full browser 109/109 passed, zero skipped, unexpected, or flaky tests (504.217 seconds); independent pricing/tier/cart browser rerun 1/1 passed; full unit 229 files / 3,446 tests passed (33.44 seconds); lint, typecheck, workspace boundary, artifact-scanner 11/11, and Turbopack build passed. The final production artifact scan checked 1,260 files / 70,755,659 bytes with zero forbidden artifacts. Integration passed 33 files / 551 tests in 946.90 seconds; one guarded PostgreSQL-auth file / 3 tests was skipped and is not real-PostgreSQL verification. Gallery/search overlap, 195px no-JavaScript heading wrapping, and stale legacy-route test expectations were repaired and reverified. During an early browser batch, one not-yet-executed pricing-test locator was scoped to the named purchase summary; production source stayed unchanged throughout, and that test passed independently afterward. Local evidence is not deployment proof. Existing screenshot-only development hydration warnings and LCP hints remain distinguished from the explicit no-application-error browser assertions and pending live production logs.

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
| Category, approved public description, image metadata, search aliases, popularity rank, release date, explicit default variant, related-product IDs, and controlled-content IDs | Canonical `StorefrontProduct` records are assembled in [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts). Neutral product descriptions and content joins live in [`src/content/storefront-product-content.ts`](../../src/content/storefront-product-content.ts). Until the owner supplies curated relationships, [`src/catalog/storefront-merchandising.ts`](../../src/catalog/storefront-merchandising.ts) deterministically selects up to four adjacent products from the same owner-supplied category; these are catalog-navigation placeholders, not customer-behavior evidence or research/use recommendations. The result is validated by [`src/catalog/storefront-bindings.ts`](../../src/catalog/storefront-bindings.ts) and projected by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts). Popularity rank and release date are nullable: every current configured product is `null` for both because no verified value was supplied. `null` means unknown; it is not a date, rank, array-order, or clock fallback. There is no owner CMS or admin form for these fields. |
| Runtime price status, amount, currency, availability, and provider mapping agreement | `product_prices`, `product_variants`, and released lot/inventory facts in [`src/db/schema/catalog.ts`](../../src/db/schema/catalog.ts), loaded by [`src/catalog/database-catalog.ts`](../../src/catalog/database-catalog.ts) and reconciled by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts). |

The canonical display source in [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts) now contains 56 products and 103 variant rows from the reviewed manifest. Reviewed positive rows are visible reference prices, but remain preview-only and do not make an item checkout-ready.

The current illustration candidate replaces the earlier `composite_data_label_overlay` rendering with `illustration_with_catalog_data_plate` in [`src/components/commerce/catalog-product-visual.tsx`](../../src/components/commerce/catalog-product-visual.tsx). Scene order, labels, captions, explanatory notes, dimensions, input/output hashes, and the shared disclosure are centralized in [`src/components/commerce/catalog-product-visual-manifest.ts`](../../src/components/commerce/catalog-product-visual-manifest.ts). Six original 1,254 × 1,254 WebP masters live in [`public/catalog/visual-masters/`](../../public/catalog/visual-masters/): Front, Three-quarter, Multi-vial study, Copy-space detail, Overhead, and Ambient studio. These are shared illustrated scenes, not 56 separate product photography sets. Each product's live data plate supplies its name, selected variant, research-use label, sale badge, and deterministic visual accent/signature; the decorative signature is not a SKU, lot, or certification.

[`src/components/commerce/catalog-product-gallery.tsx`](../../src/components/commerce/catalog-product-gallery.tsx) renders the six scenes on product pages with manual previous/next controls, labelled tabs, Arrow/Home/End navigation, and a polite view announcement. It has no autoplay. Cards and related cards use the Front scene. Next Image keeps explicit dimensions and responsive `sizes`; below-the-fold card images are lazy-loaded. The visible disclosure reads `AI-generated catalog illustration — not actual product photography.` It sits in the gallery header inside the unchanged 4:3 panel following the measured search-launcher collision correction. The Multi-vial study does not indicate package quantity, and Overhead is not a scale reference. Edit scene metadata in the manifest, live styling in [`src/app/globals.css`](../../src/app/globals.css), and product facts in the canonical catalog; do not bake variant text or prices into image files. This implementation does not claim to supply actual product photography.

Product and variant identity is never derived from a display label. Editing text such as an mg label does **not** change the product ID, variant ID, numeric amount, amount unit, SKU, price, default variant, or Stripe mapping. Those fields must be changed together at their authoritative sources and pass reconciliation tests.

The reviewed price manifest is [`src/catalog/storefront-catalog-manifest.ts`](../../src/catalog/storefront-catalog-manifest.ts). It is the decision source for deterministic identities, one-vial public labels, explicit amount decisions, and audited candidate base amounts. It covers 56 products and 103 scoped rows: 40 approved positive Amino-equivalent ordinary one-vial base-price candidates and 63 zero-dollar pending rows. Change a reviewed amount, label, source URL, or observation timestamp there only with its exact tests; never use transient competitor promotions as a base price. The 40 positive amounts are non-transactional reference prices for the displayed one-bottle variant, not live checkout prices; they have no inventory or Stripe mapping. The 63 unmatched rows remain pending zero-dollar placeholders in local/test/preview modes. Production purchase remains unavailable until canonical records, inventory, Stripe mappings, campaign reconciliation, and launch approvals are complete. WINTER30 is applied once by server pricing and is never baked into base amounts or stacked.

### Public cart display boundary

[`src/cart/storefront-preview-source.ts`](../../src/cart/storefront-preview-source.ts) projects the already-public product name, exact variant label, SKU, package quantity, price status, reference amount, and eligible public promotion labels from `PublicStorefrontView` into the cart display source. [`src/cart/preview.ts`](../../src/cart/preview.ts) applies the shared server pricing calculation and returns the exact version-2 display DTO. The browser validates that DTO with [`src/cart/preview-presentation.ts`](../../src/cart/preview-presentation.ts), stores it only in the version-2 same-tab presentation envelope, and rejects malformed, stale, missing, extra, reordered, wrong-ID, or wrong-quantity rows before rendering them.

In Production, a reviewed positive `preview_only` variant may enter browser cart storage and show its server-calculated standard price, effective price, quantity or automatic-promotion discount, savings, and line subtotal. Its purchase state remains `checkout_unavailable`: it cannot continue to a quote, Checkout Session, or payment. A pending Production variant remains non-addable and displays `Pricing coming soon`; the local/test/explicit Preview zero-dollar layout is not production price authority.

Public cart inventory is deliberately `null` (unknown). The cart does not infer stock, sold-out status, or checkout readiness from a public display row. `SafeCartPreview`, the checkout `PRICE_CHANGED` response, quote validation, inventory reservations, Stripe mappings, tax, shipping, fulfillment, and provider capability remain separate server-authoritative boundaries and are still required before live checkout can open.

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

Pending or zero-dollar records may exercise selection and cart behavior in local, test, or explicitly marked preview environments. In production, a pending record remains browse-only, displays `Pricing coming soon`, keeps checkout unavailable, and cannot create a Checkout Session. A zero-dollar record likewise cannot create production Checkout. The canonical configuration has 40 reviewed positive reference-price rows and 63 pending rows, but none of those configured display rows establishes checkout-ready inventory or payment mappings.

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

Pending and unavailable price states sort after active prices. A product card selects only its explicit `defaultVariantId`, including when that variant is pending, unavailable, or zero; if the configured ID is absent from the product, selection fails closed instead of substituting another variant. Price approval, displayed price, array order, amount, availability, and Stripe mapping never change the selected card default. The same explicit-default authority supplies price sorting. The card variant selection and displayed price rules are in [`src/catalog/storefront-price-presentation.ts`](../../src/catalog/storefront-price-presentation.ts) and [`src/search/catalog-discovery.ts`](../../src/search/catalog-discovery.ts).

The current `Related Products` carousel provides category navigation. [`src/catalog/storefront-merchandising.ts`](../../src/catalog/storefront-merchandising.ts) sorts stable slugs/IDs before selecting one to four adjacent records in the same supported owner-supplied category; reordering the input catalog or adding an unrelated category does not change the selection. It excludes self/duplicate IDs and rejects malformed configuration. The canonical IDs are joined into each product by [`src/catalog/storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts), resolved through [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts), and rendered by [`src/components/commerce/related-products-carousel.tsx`](../../src/components/commerce/related-products-carousel.tsx). Products with only unavailable variants are omitted; preview-only products remain visible with their honest price/purchase state. All 56 configured products currently have at least one surviving same-category peer.

The customer introduction is `Explore more products in this category.` One-item lists omit navigation controls; multi-item controls are disabled when their direction has no further scroll, and update after resizing or scrolling. The row supports keyboard arrows, touch scroll-snap, visible focus, and reduced-motion scrolling. It reuses the normal listing card and exact-variant quick-add sheet; repeat additions merge by variant ID, and the existing cart provider owns the confirmation announcement. Owner-curated relationships and merchandising reasons are still outstanding; this category-navigation implementation makes no research-frequency or use-pairing claim.

The canonical product detail route is `src/app/(public)/catalog/items/[slug]/page.tsx`. The older `src/app/(public)/catalog/[slug]/page.tsx` route now resolves the authoritative storefront and redirects every valid product slug to the canonical item route; unknown slugs remain not found and loading failures fail closed. This prevents a valid legacy link from silently bypassing the canonical product information, pricing, and related-product experience.

The bottom launcher lazily makes one query-free `GET /api/storefront-search` request, validates and caches the approved index for the page lifetime, and searches locally afterward. Its loader is in [`src/components/search/site-search-launcher.tsx`](../../src/components/search/site-search-launcher.tsx); the GET-only server boundary is [`src/app/api/storefront-search/route.ts`](../../src/app/api/storefront-search/route.ts). Informational page and FAQ/section links appear only when their exact route or fragment is listed in `publicInformationDestinations`. The registry currently approves the rendered homepage Why Choose section, FAQ section, and eight exact FAQ anchors.

Tint & Go's implementation was unavailable in this workspace and was not inspected. The delivered interaction follows PropeptIQ's verified local architecture plus the requested high-level interaction direction.

## 6. Approved homepage, product, and legal content

Controlled content is defined in [`src/content/storefront-content.ts`](../../src/content/storefront-content.ts). Every record has a stable ID, kind, `draft|approved|retired` status, title, body, source references, approval note, reviewed timestamp, and optional effective timestamp. The supported kinds are:

- `why_choose`;
- `faq`;
- `legal_notice`;
- `product_description`;
- `product_information`; and
- `calculator_copy`.

Only approved records can render or enter search. For this requested placeholder release, the owner authorized neutral placeholder copy to be published while final business-reviewed product copy is unavailable; each record carries that exact note and no fabricated review timestamp. This exception does not turn the placeholders into legal, scientific, or marketing approval. The registry currently contains six neutral Why Choose items, eight operational FAQs, and three neutral records for each of the 56 catalog products: one distinct overview, one catalog-information record, and one PubMed-discovery record. `Why choose PropeptIQ` and FAQ records are projected by [`src/content/storefront-public-content-server.ts`](../../src/content/storefront-public-content-server.ts) and rendered by the server-safe components in [`src/components/site/why-choose-propeptiq.tsx`](../../src/components/site/why-choose-propeptiq.tsx) and [`src/components/site/faq-section.tsx`](../../src/components/site/faq-section.tsx). Product descriptions and exact content IDs are defined in [`src/content/storefront-product-content.ts`](../../src/content/storefront-product-content.ts), attached in canonical product configuration, and allowlist-projected by [`src/catalog/storefront-public.ts`](../../src/catalog/storefront-public.ts); private approval notes, timestamps, and raw source references are not serialized to the browser.

Each product currently links to an official PubMed search for its exact catalog name. This is an uncurated literature-discovery link, not an approved study list, endorsement, product claim, or use recommendation. The shared [`src/content/public-literature.ts`](../../src/content/public-literature.ts) allowlist accepts only strict HTTPS PubMed search URLs with one nonblank `term` parameter; [`src/components/commerce/product-information-sections.tsx`](../../src/components/commerce/product-information-sections.tsx) renders that safe projection while other raw source-reference values remain private. Product-specific study summaries, technical facts, storage instructions, or claims must still be added as separately reviewed controlled content and must not be inferred from search results.

### Verified compound bibliography

The candidate also has a separate, exact product-to-bibliography join for 17 compounds and 27 unique study PMIDs. Edit compound identity, catalog slug, aliases, study IDs, and identity notes in [`content/compounds.json`](../../content/compounds.json); edit verified bibliographic metadata in [`content/studies.json`](../../content/studies.json). The source records carry `verified_primary_source`, `public_neutral_metadata`, and the September 4 review date. This documentation update checked local source counts/joins; it did not rerun external DOI/PMID resolution. Preserve the source-verification evidence in the release record. [`content/claims-audit.json`](../../content/claims-audit.json) currently has an empty claims array; mechanisms and benefit claims are null. These records describe the cited studies, not tests of the product being sold.

[`src/content/compound-research.ts`](../../src/content/compound-research.ts) validates those server-only sources, study-design/context compatibility, identity joins, canonical PubMed URLs, and the public field allowlist. [`src/content/compound-research-public.ts`](../../src/content/compound-research-public.ts) defines the browser-safe types and neutral labels. The canonical product route, [`src/app/(public)/catalog/items/[slug]/page.tsx`](../../src/app/(public)/catalog/items/[slug]/page.tsx), passes only the matching `productSlug` entry, or null, to [`src/components/commerce/compound-research-section.tsx`](../../src/components/commerce/compound-research-section.tsx). The `#research-references` section renders a native disclosure with study title, author/year/journal, design/context, available sample/population/duration metadata, PMID/DOI, and a direct PubMed link opened with `noopener noreferrer`. It omits absent fields and never passes studied amounts, routes, outcomes, approval notes, or a benefit claim to the component.

The 17 mapped catalog slugs are `tirzepatide`, `semaglutide`, `retatrutide`, `survodutide`, `cargrilintide`, `aod-9604`, `mots-c`, `nad-plus`, `5-amino-1mq`, `bpc-157`, `ghk-cu`, `tesmorelin`, `ipamorelin`, `cjc-1295-with-dac`, `sermorelin-acetate`, `igf-1-lr3`, and `hcg`. The other 39 product pages omit this bibliography section; they retain their neutral catalog information and literature-discovery link. Adding a citation requires resolving its exact DOI/PMID against its primary source and checking compound/form/population relevance. A search result or similarly named compound must not populate an unmapped product. Product-specific technical/storage content, study summaries, owner-provided study attachments, and claims review remain outstanding.

### Why Choose and FAQ

The six source-backed operational cards are `Catalog clarity`, `Clear availability`, `Exact variant selection`, `Transparent quantity pricing`, `Search from anywhere`, and `Research-use focus`. Their exact copy is in `homepageContentRecords` within [`src/content/storefront-content.ts`](../../src/content/storefront-content.ts); the renderer maps stable IDs to icons and uses one column on phones, two from `md`, and three from `xl`. This describes storefront behavior. Third-party testing, clinical-dose, purity, sourcing, cGMP, shipping, and guarantee claims remain unverified and are not substituted into these cards.

The eight operational FAQs use the same content registry and public homepage projection. [`src/components/site/faq-section.tsx`](../../src/components/site/faq-section.tsx) uses native `details/summary` with the shared `name="propeptiq-home-faq"` group for single-open behavior without custom accordion JavaScript. [`src/components/site/faq-json-ld.tsx`](../../src/components/site/faq-json-ld.tsx) serializes exactly the same question/answer entries into one safely escaped `FAQPage` script; [`src/components/site/public-home.tsx`](../../src/components/site/public-home.tsx) supplies that same array to the visible FAQ and JSON-LD components. Add shipping, returns, testing, or subscription answers only when the corresponding policies/features and exact copy exist. Component parity and script-escape checks exist; current-candidate native-keyboard, JavaScript-disabled, responsive, and browser checks are coordinated separately and remain pending until recorded by the release owner.

Search destinations are a separate approval gate in [`src/content/public-information.ts`](../../src/content/public-information.ts). A content record does not create its own route or anchor. Add an exact route or fragment only after that destination exists and is approved; invalid, duplicate, draft, retired, or unapproved destinations fail closed.

The footer renders the two existing research restrictions from [`src/lib/site-content.ts`](../../src/lib/site-content.ts) and any approved `legal_notice` records. No approved legal-notice records are configured today. Do not describe generated or draft copy as attorney-, regulator-, FDA-, or business-approved. Claims, research summaries, storage wording, safety wording, and legal notices need source-specific business review before they become `approved`.

## 7. Newsletter

Newsletter signup is intentionally closed. [`src/lib/site-content.ts`](../../src/lib/site-content.ts) has an empty approved privacy-destination policy and a frozen `newsletterConfiguration` with `enabled: false` and `privacyHref: null`. The homepage and API runtime consume that same launch flag. A privacy link or installed environment values alone cannot enable collection.

The prepared server-only adapter in [`src/newsletter/resend-gateway.ts`](../../src/newsletter/resend-gateway.ts) creates a global Resend Contact with one exact Topic opt-in. It sends only the normalized email and `topics: [{ id, subscription: "opt_in" }]`; it does not set global `unsubscribed`, names, properties, segments, a legacy Audience, source metadata, or product/research data. Provider errors and malformed responses become one fixed internal failure. Resend does not document a stable create-contact duplicate/upsert result, so duplicate, resubscribe, and global-unsubscribe behavior remains deliberately undefined and closed.

The prepared attempt gate in [`src/newsletter/attempt-gate.ts`](../../src/newsletter/attempt-gate.ts) accepts one validated caller address, HMACs it for the `newsletter.subscribe` operation, and uses the existing `public.rate_limit_windows` store through a lazy runtime database session. Only the scope hash, window timestamps, count, and expiry are persisted. The raw address and email are not rate-limit records. Presence and permissions for that public table in the target deployment database are not verified by source code and remain an activation blocker; do not substitute the Better Auth-only `propeptiq_auth.rate_limit_windows` table.

[`src/newsletter/runtime.ts`](../../src/newsletter/runtime.ts) checks the code-backed launch flag and approved privacy destination before reading newsletter environment configuration. With the current disabled/null production configuration, [`src/app/api/newsletter/route.ts`](../../src/app/api/newsletter/route.ts) returns `NEWSLETTER_NOT_CONFIGURED` before reading the request body, acquiring a database session, or constructing/calling the provider. The form stays disabled, does not store or transmit the address, and cannot show a success state. A configured submission still receives the strict client and server email/consent validation, same-origin JSON boundary, 1,024-byte request limit, durable attempt gate, and fixed safe result mapping in [`src/newsletter/server.ts`](../../src/newsletter/server.ts), [`src/newsletter/contracts.ts`](../../src/newsletter/contracts.ts), and [`src/components/site/newsletter-form.tsx`](../../src/components/site/newsletter-form.tsx).

Newsletter environment settings are documented without values in [`.env.example`](../../.env.example): `NEWSLETTER_MODE`, `NEWSLETTER_RESEND_API_KEY`, `NEWSLETTER_RESEND_TOPIC_ID`, `NEWSLETTER_RATE_LIMIT_MAX`, and `NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS`. Enabled newsletter mode also requires `RATE_LIMIT_SECRET` and the same `test` or `live` `DATABASE_MODE`. Test/live deployment identity rules apply. The maximum is 1 through 100 attempts and the window is 60 through 86,400 seconds. The owner must select these values from an approved abuse policy; the application does not invent defaults. Values may be installed while `NEWSLETTER_MODE=disabled` without activating collection.

The current runtime separately includes a server-side Better Auth Resend adapter for transactional verification and password-reset email. It is gated by `EMAIL_MODE` and uses `RESEND_API_KEY`; it is not a mailing-list subscriber provider. Newsletter Contacts/Topics require a dedicated Resend `full_access` key in `NEWSLETTER_RESEND_API_KEY`, and enabled configuration rejects reuse of the transactional key. `EMAIL_MODE` and `RESEND_FROM` are not newsletter dependencies.

Before changing `newsletterConfiguration.enabled` or `NEWSLETTER_MODE`, obtain and verify all of the following: an approved privacy route and exact consent/privacy wording; retention/deletion policy and incident-response owner; owner-selected attempt limit/window and abuse handling; target-database presence/permissions for `public.rate_limit_windows`; duplicate/resubscribe/global-unsubscribe semantics; the intended Resend team, verified domain, Topic, and dedicated full-access key; and a successful Preview read-back. Installing a key or Topic is preparation only and is not approval to collect addresses.

## 8. Footer and social URLs

Footer groups, link destinations, and social URLs are centralized in [`src/lib/site-content.ts`](../../src/lib/site-content.ts); rendering and validation are in [`src/components/site/site-footer.tsx`](../../src/components/site/site-footer.tsx).

The four owner-authorized placeholders are currently:

- Instagram → `/`
- TikTok → `/`
- X → `/`
- Facebook → `/`

Replace a placeholder only with the approved public profile URL. The validator accepts the `/` placeholder or an absolute HTTPS URL with a host and no embedded username/password. Invalid values are omitted. Validate all four labels, destinations, keyboard focus, and mobile layout after a change.

Available footer/support links are Catalog, Cart, Quality Records, Rewards, Partner Program, account Order Tracking, FAQ, and Research Use Only. The central FAQ entry points to `/#faq`, so the shared footer reaches the approved homepage section from both the homepage and product pages, including without JavaScript. Contact or Support, Shipping information, Privacy Policy, Terms and Conditions, Shipping and Returns, Refund Policy, and FDA Disclaimer render no footer link while their routes/copy are missing. There are no corresponding approved Privacy, Terms, Shipping/Returns, Refund, Contact/Support, or FDA routes/copy in the repository. The footer-reference rebuild and remaining requested footer links remain open work.

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
npm test -- src/catalog/storefront-bindings.test.ts src/catalog/storefront-public.test.ts src/catalog/storefront-merchandising.test.ts src/search/storefront-search.test.ts src/search/storefront-index.test.ts src/search/catalog-discovery.test.ts src/components/search/site-search-sheet.test.tsx src/components/commerce/related-products-carousel.test.tsx src/components/commerce/related-products-composition.test.tsx src/components/commerce/related-products-carousel-flow.test.tsx
```

Focused public-content/newsletter/footer/calculator checks:

```powershell
npm test -- src/content/storefront-content.test.ts src/content/storefront-product-content.test.ts src/content/public-information.test.ts src/content/storefront-public-content-server.test.ts src/components/commerce/product-information-sections.test.tsx src/components/site/public-home.test.tsx src/components/site/site-footer.test.tsx src/newsletter/server.test.ts src/config/concentration-calculator.test.ts
```

Focused illustration, bibliography, and FAQ parity checks:

```powershell
npm test -- src/components/commerce/catalog-product-visual-manifest.test.ts src/components/commerce/catalog-product-gallery.test.tsx src/components/commerce/catalog-product-visual.test.tsx src/content/compound-research.test.ts src/components/commerce/compound-research-section.test.tsx src/components/site/faq-json-ld.test.tsx
```

Both related flow files now use names discovered by the normal unit/component runner: `related-products-composition.test.tsx` and `related-products-carousel-flow.test.tsx`. Their old `.integration.test.tsx` names were excluded by both test configurations. The composition suite proves the actual 56-product configured catalog projection and exact-variant quick add. The flow suite preserves the real card/sheet/cart assertions with explicitly labelled synthetic catalog fixtures, including keyboard variant selection and full-cart rejection. The September 5 merchandising/catalog/carousel/composition run passed 4 files / 26 tests; the subsequent standard runner command for both composition/flow suites passed 2 files / 6 tests. Focused ESLint, repository typecheck, and scoped diff checks also passed during the related-product work. These are local results, not production verification.

Focused public browser checks:

```powershell
npx playwright test tests/e2e/public-storefront.spec.ts
npx playwright test tests/e2e/storefront-content.spec.ts tests/e2e/storefront-faq.spec.ts
```

Focused catalog/schema integration checks:

```powershell
npm run test:integration -- tests/integration/catalog-repository.test.ts tests/integration/task6-schema.test.ts
```

`npm run test:integration` uses the repository's isolated local integration harness. The external lanes are separate:

- **Real PostgreSQL lane:** `npm run test:postgres:checkout` is destructive and must run only against an explicitly isolated test database with both guard variables required by [`tests/integration/helpers/database.ts`](../../tests/integration/helpers/database.ts).
- **Provider-positive lane:** requires an approved Stripe sandbox/account, valid provider mappings, and the configured server-only prerequisites. It was not run by this documentation task and must never be enabled by copying fixture values or credentials into documentation.
- **Browser-positive lane:** local Playwright exercises the shell, configured catalog/reference-price/gallery/content presentation, closed purchase states, and separately labelled injected search or commerce fixtures. These checks can prove the visible configured storefront without creating inventory or provider records. Positive checkout, newsletter delivery, or enabled calculator behavior still requires the corresponding approved records and isolated preview dependencies; no browser check authorizes a production provider call.

Browser tests use the configured local Playwright server; they do not prove live authentication, Stripe, tax, shipping, fulfillment, newsletter, or database behavior.

## Owner change matrix

| What | Authoritative location | Who should change it | Required validation | Current blocker/status |
| --- | --- | --- | --- | --- |
| Browse names, categories, images, package/display configurations | [`browse-catalog.ts`](../../src/catalog/browse-catalog.ts) and pinned [`browse-catalog-publication.ts`](../../src/catalog/browse-catalog-publication.ts) | Owner supplies a revised source; developer creates and reviews a new pinned manifest | Manifest fingerprint, public-copy policy, publication, browser checks | Owner browse manifest exists; deployment publication state was not inspected |
| Canonical product and variant identity | [`storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts), [`storefront-bindings.ts`](../../src/catalog/storefront-bindings.ts), and database [`catalog.ts`](../../src/db/schema/catalog.ts) | Owner supplies facts; reviewed developer/import plus authorized database operator | Binding, schema, reconciliation, catalog, cart, checkout tests | 56 product/103 variant display identities and explicit defaults are configured; production database reconciliation and purchasable readiness are unverified |
| Prices and Stripe mappings | [`storefront-catalog-manifest.ts`](../../src/catalog/storefront-catalog-manifest.ts), `product_prices`/`product_variants` in [`catalog.ts`](../../src/db/schema/catalog.ts), and matching storefront bindings | Owner/finance and Stripe account owner approve; authorized operator/developer implements | Positive integer/currency, provider binding, server quote/session, webhook tests | 40 reviewed positive reference amounts; 63 pending rows; configured display records have no operational Stripe mappings |
| Quantity tiers and non-stacking | [`storefront-pricing.ts`](../../src/domain/storefront-pricing.ts) and checkout/cart code | Developer only after an owner rule change | Pricing matrix, cart merge, checkout regression tests | Implemented and code-protected; no owner config seam |
| Automatic campaigns | Owner terms in [`storefront-promotions.ts`](../../src/config/storefront-promotions.ts), database promotion tables/constraints in [`catalog.ts`](../../src/db/schema/catalog.ts), projection, and checkout | Owner approves terms; authorized reviewed database/admin implementation | Interval/scope/overlap, banner, persisted-row reconciliation, cart, checkout, Stripe request tests | Owner-configured banner active; current admin cannot author automatic fields; positive pricing still needs an exact persisted row |
| Related products, rank, release date, aliases, default variant | [`storefront-merchandising.ts`](../../src/catalog/storefront-merchandising.ts) and [`storefront-catalog-data.ts`](../../src/catalog/storefront-catalog-data.ts) | Owner supplies decisions; developer changes reviewed config | Binding, discovery sort/search, related carousel and composition/flow tests | All 56 products have one to four stable same-category peers and explicit defaults; curated relationships/reasons, rank, and release dates remain open |
| Illustrative gallery and data plate | [`catalog-product-visual-manifest.ts`](../../src/components/commerce/catalog-product-visual-manifest.ts), [`catalog-product-visual.tsx`](../../src/components/commerce/catalog-product-visual.tsx), [`catalog-product-gallery.tsx`](../../src/components/commerce/catalog-product-gallery.tsx), and [`visual-masters/`](../../public/catalog/visual-masters/) | Owner approves visual direction/assets; developer updates manifest and rendering | Asset hashes/dimensions, gallery keyboard, image load, label geometry, browser/CLS checks | Six shared illustrative WebP scenes and live per-product data plate are in the candidate; not actual product photography and not deployed |
| Verified compound bibliography | [`compounds.json`](../../content/compounds.json), [`studies.json`](../../content/studies.json), [`claims-audit.json`](../../content/claims-audit.json), and [`compound-research.ts`](../../src/content/compound-research.ts) | Scientific/content owner approves sources and scope; developer validates the projection | Exact DOI/PMID primary-source resolution, identity/context joins, private-field exclusion, route/component tests | 17 compound mappings/27 verified PMIDs; 39 products have no curated bibliography; technical/storage content and claims remain open |
| Why Choose, FAQ, product info, calculator copy, legal notices | [`storefront-content.ts`](../../src/content/storefront-content.ts), [`storefront-product-content.ts`](../../src/content/storefront-product-content.ts), and [`faq-json-ld.tsx`](../../src/components/site/faq-json-ld.tsx) | Business/content/legal reviewer approves; developer enters reviewed records | Status/metadata, content policy, homepage/product/footer/search, native disclosure, and visible/schema parity tests | Six operational Why cards, eight grouped FAQs with matching JSON-LD, and neutral product records are in the candidate; calculator/legal records remain gated |
| Searchable pages and anchors | [`public-information.ts`](../../src/content/public-information.ts) | Content owner approves destination; developer updates allowlist and record | Route/anchor existence, index, dialog, keyboard/browser tests | Homepage Why/FAQ anchors are approved; other missing public routes remain gated |
| Newsletter | [`site-content.ts`](../../src/lib/site-content.ts), [`newsletter/runtime.ts`](../../src/newsletter/runtime.ts), [`newsletter/resend-gateway.ts`](../../src/newsletter/resend-gateway.ts), [`newsletter/attempt-gate.ts`](../../src/newsletter/attempt-gate.ts), and API composition | Privacy owner and mailing-list owner decide; authorized developer/operator enables only after all gates pass | Consent/privacy, same-origin, rate/attempt, duplicate/error/provider, Preview read-back | Adapter and durable gate prepared; launch flag false and privacy destination null; closed before body/provider/database access |
| Footer links and social profiles | [`site-content.ts`](../../src/lib/site-content.ts) | Owner supplies approved routes/URLs; developer updates central config | Destination, safe URL, accessibility, responsive browser checks | Four `/` placeholders; multiple support/legal routes absent |
| Laboratory calculator | [`.env.example`](../../.env.example), [`concentration-calculator.ts`](../../src/config/concentration-calculator.ts), controlled content | Business/legal reviewer approves; deployment owner sets mode after reviewed code/content | Limits, neutral-copy policy, product page, keyboard/mobile/reduced-motion tests | Mode defaults disabled; configuration null; approved copy absent |
| Cutover and rollback | [production cutover](./production-cutover.md) and [incidents/recovery](./incidents-and-recovery.md) | Explicitly authorized deployment/operations owner | Backup, migration, provider, webhook, smoke test, rollback read-back | Owner merge/deployment authorization exists; this documentation task performed no merge/deployment and the current candidate's release evidence is pending |

## Amino Club exact-equivalent price snapshot

The dated September 4, 2026 primary-source audit is recorded in [`docs/reference/2026-09-04-amino-equivalent-price-audit.md`](../reference/2026-09-04-amino-equivalent-price-audit.md). Its exhaustive 103-row result is 40 `matched`, 41 `no_exact_equivalent`, and 22 `unresolved`. The 40 matched rows reproduce the existing manifest's ordinary one-bottle USD list prices, so the audit changes no price. Temporary Amino Club HEAT35 and Club Sale amounts are recorded separately and are not PropeptIQ base-price authority. The other 63 rows remain pending at zero with no evidence object.

The owner authorized preserving the 56 previously displayed defaults as explicit `{ browseSlug, browseCode }` decisions. Their `defaultVariantId` values are derived only through the canonical storefront UUIDv5 identity function and remain stable under product/variant reordering or later price approval. Multi-variant card `ADD` still opens the variant chooser and does not silently add the default.

## Outstanding delivery and launch inputs

- [ ] Reconcile the configured 56 product/103 variant IDs, exact amount/package decisions, SKUs, defaults, and joins with the authoritative production database/import path. The display identities already exist; operational lifecycle/availability remains unverified.
- [ ] Resolve the 63 unmatched/unresolved price rows with owner-supplied amounts or exact primary-source equivalents, and approve operational price records within the USD-only boundary. The 40 positive reference amounts are already configured; matching Stripe Product/Price mappings and checkout readiness are not established by those amounts.
- [ ] Approved inventory/lot availability and the physical fulfillment, shipping, tax, carrier, returns, and support operating decisions.
- [ ] Approved popularity ranks, release dates, additional search aliases, and owner-curated related relationships/reasons. Stable category-navigation IDs, explicit defaults, illustrative presentation artwork, neutral descriptions, and product content IDs are configured.
- [ ] Finish the original individual-product visual scope and recover the missing owner study/image/footer references. The six current shared scenes are disclosed illustrations; they must not be presented as actual product photography or as recovered owner attachments. This is not a new approval gate for the already authorized neutral UI work.
- [ ] Complete research coverage where justified: 17 compounds/27 verified study records are present, while 39 products have no curated bibliography. Product-specific study summaries, technical facts, storage wording, claims, and any exact product/form relevance statements still require source-specific review; metadata is not substantiation of a product claim.
- [ ] Approved research-use, legal, FDA, privacy, terms, shipping/returns, refund, and contact/support copy and routes. No generated copy should be treated as approved.
- [ ] Newsletter activation: approved privacy route and exact consent/privacy wording; retention/deletion policy and accountable incident owner; owner-selected attempt limit/window and abuse policy; verified target `public.rate_limit_windows` presence/permissions; documented duplicate/resubscribe/global-unsubscribe behavior; verified Resend team/domain/Topic and dedicated full-access key; and successful Preview read-back. The prepared adapter/gate remain disabled until every item passes.
- [ ] Real Instagram, TikTok, X, and Facebook profile URLs when available; the owner already authorized the current `/` placeholders, so missing profiles alone do not undo that decision.
- [ ] Finish the requested footer-reference layout, mobile sticky purchase/cart experience, and remaining responsive/motion acceptance. The existing approved `/#faq` destination is now wired into the shared footer; this does not complete the remaining footer redesign or missing policies.
- [ ] Confirm whether Subscribe & Save and `1 / 3 / 6` bundles are to replace or supplement the existing `1 / 2 / 3 / 10+` contract. Recurring discounts, renewal/cancellation/refund terms, fulfillment, mixed-cart behavior, and TEST-mode mapping/read-back remain separate unfinished tasks; no recurring product is created by a visual toggle.
- [ ] Calculator maximum inputs, neutral copy, sources, placement, review metadata, and explicit public-launch approval if it is to be enabled.
- [ ] An authoritative persisted WINTER30 publication path and accountable database campaign operator for positive production pricing; the owner code configuration and schema constraint do not create the row.
- [ ] Stripe account/business acceptance, provider mapping reconciliation, webhook/signature operations, and production-safe payment/tax/shipping configuration.
- [ ] Reviewed database migration/import plan, backup, reconciliation, rollback, fulfillment ownership, and production incident response.
- [ ] Verify deployment-specific publication/capability settings, merge the accepted candidate under the existing owner authorization, and record the exact production deployment plus live phone/tablet/desktop results. Current browser/build verification is pending with the release coordinator.
- [ ] Verify the implemented legacy `/catalog/[slug]` redirect reaches the canonical `/catalog/items/[slug]` product experience after deployment; the route decision is implemented, but this documentation update supplies no live redirect proof.
