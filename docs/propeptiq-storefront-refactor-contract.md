# PROPEPTIQ Storefront Refactor Implementation Contract

**Status:** Discovery and owner decisions are complete; local implementation is authorized in subagent-driven mode. Production activation remains blocked on the business-supplied inputs and approval gates below. This document is an architecture and acceptance contract, not evidence that the features are implemented.

**Snapshot date:** 2026-08-30

**Authoritative worktree:** `propeptiq-labs-app/.worktrees/propeptiq-lightweight-commerce`

**Branch at discovery:** `feat/propeptiq-lightweight-commerce` at `8b34365`, clean and eight commits ahead of its remote. The eight local settlement, net-terms, invoice, and provider-event commits are unrelated work that must be preserved.

## Confirmed repository architecture

The application uses Next.js 16.3.2 App Router, React 19, Tailwind CSS 4, Radix/shadcn primitives, Drizzle/PostgreSQL, Clerk, and Stripe Checkout. Money already uses integer minor units. The public route-group layout owns the header, main landmark, and footer; checkout, account, authentication, admin, and research-set routes sit outside that public layout.

Two catalog models currently coexist without a shared purchasable variant:

1. `src/catalog/browse-catalog.ts` drives `/catalog` and `/catalog/items/[slug]`. It contains 56 owner-supplied product families and 103 display variants with approved local images, codes, and package-form labels. It intentionally has no canonical variant identity, SKU guarantee, numeric amount, price, currency, inventory, Stripe mapping, popularity rank, release date, related-product configuration, or approved research content. At least one source code (`LPC`) is not globally unique.
2. `src/catalog/types.ts`, `src/db/schema/catalog.ts`, `src/catalog/public-catalog.ts`, and `/catalog/[slug]` drive the transactional catalog. One database product currently represents one purchasable identity with product-level price and inventory. There is no variant table or normal link from the browse catalog into this route.

The local cart in `src/cart/cart-storage.ts` stores `{ productId, quantity }`, merges by product ID, caps each line at 25, and caps the cart at 50 distinct lines. The checkout request in `src/domain/checkout.ts` uses the same product identity and rejects duplicates at the server boundary.

The complete buyer path is:

```text
local cart
  -> /api/catalog/preview
  -> authenticated checkout and research attestation
  -> /api/checkout/quote
  -> /api/checkout/sessions
  -> authoritative catalog, inventory, promotion, shipping, and tax reload
  -> serializable reservation and immutable order snapshots
  -> hosted Stripe Checkout Session
  -> signed raw-body Stripe webhook
  -> idempotent provider-event, payment, inventory, and fulfillment processing
```

`src/commerce/provider-contracts.ts` already sends server-created inline Stripe `price_data`; the repository has no configured Stripe Price ID field. The success page is read-only and does not mark payment complete. Verified provider events are authoritative.

Four existing controls prevent zero-dollar checkout: the positive database price constraint, checkout fact validation, the zero-total money-domain rule, and the Stripe provider contract. Pending `$0` variants therefore require a presentation/cart state that cannot reach Checkout.

## Existing implementation to reuse

- Public shell: `src/app/(public)/layout.tsx`, `src/components/site/site-header.tsx`, `src/components/site/site-footer.tsx`
- Catalog and images: `src/catalog/browse-catalog.ts`, `src/catalog/browse-catalog-publication.ts`, `src/components/commerce/catalog-*`
- Transactional catalog: `src/catalog/public-catalog.ts`, `src/catalog/types.ts`, `src/db/schema/catalog.ts`
- Money and promotions: `src/domain/money.ts`, `src/domain/promotions.ts`
- Cart and stale-preview acknowledgement: `src/cart/cart-storage.ts`, `src/cart/preview.ts`, `src/cart/preview-types.ts`
- Checkout boundary: `src/domain/checkout.ts`, `src/commerce/checkout-http.ts`, `src/commerce/checkout-service.ts`, `src/commerce/provider-contracts.ts`
- Payment completion: `src/app/api/webhooks/stripe/route.ts`, `src/commerce/stripe-webhook-verifier.ts`, `src/commerce/provider-event-service.ts`
- Accessible overlay and disclosure primitives: `src/components/ui/sheet.tsx` and the installed Radix primitives
- Design tokens, focus, responsive, and reduced-motion rules: `src/app/globals.css`
- Central public copy seam: `src/lib/site-content.ts`
- Clipboard announcement pattern: `src/components/growth/shared-set-card.tsx`
- Storefront browser coverage: `tests/e2e/public-storefront.spec.ts`

The Tint & Go search implementation was not available in this workspace, so no inspection claim is made. PropeptIQ uses only the requested high-level interaction direction and its own verified local patterns for a lazy normalized index, deterministic ranking, a fixed bottom-center safe-area lane, short-viewport handling, collision priority, reserved bottom spacing, and reduced-motion coverage. Its existing Radix Sheet provides the required modal focus behavior and grouped-results foundation.

## Reference and compliance context

Amino Club is a dated visual/interaction reference only. Its 2026-08-30 storefront demonstrates a promotion strip, crossed prices, percentage badges, catalog search/filtering, add actions, FAQ, and newsletter patterns. Its products, wording, claims, images, current campaign, and future site changes are outside scope.

Official-source review supports the supplemental caution but does not turn regulatory examples into application acceptance tests:

- Stripe Checkout accepts server-created line-item pricing and exposes a separate `allow_promotion_codes` control. A Checkout Session accepts at most one `discounts` entry. The application will retain server pricing authority and will not enable customer-entered Stripe promotion codes for automatic WINTER30.
- FDA’s 2026-03-31 Gram Peptides warning letter states that RUO statements did not overcome the overall website evidence of intended human use and specifically discusses bacteriostatic water sold with peptides requiring reconstitution. A distinct June 2026 peptide/RUO example asserted in the supplemental text was not verified and is not repeated as fact here.
- FTC health-products guidance requires prior substantiation for express and implied objective claims and evaluates the entire advertising context and the relevance of evidence to the specific product and claim.
- Stripe’s current support material says it supports some peptide businesses with limitations and may require preventive measures or additional review. A working integration is not merchant approval.

These sources justify a controlled-content and launch-gate design. They are not legal advice and do not supply approved public copy.

## Supplemental-suggestion rulings

| Suggestion | Ruling | Repository-specific treatment |
|---|---|---|
| Phase-gated execution and dependency order | Adopt | Split the work into independently reviewable commerce, catalog/product UI, search, public-content, and verification plans. |
| Server catalog owns price; Stripe IDs are mappings | Adopt | Preserve existing inline `price_data`; optional Stripe Product/Price IDs are activation or reconciliation metadata only and never accepted from the browser. |
| Automatic WINTER30 | Adopt with copy correction | Keep the original required banner text exactly: `WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30`. Copying the code is recognition/convenience only; no code entry or second Stripe discount is enabled. |
| `$0.00 -> $0.00` sale presentation | Adopt with environment restriction | Allow only in local, test, or an explicit non-production preview mode. Production shows `Pricing coming soon`, no savings, strikethrough, or percentage badge, and no Checkout Session. |
| `409 PRICE_CHANGED` and cart snapshot | Adapt | Reuse or version the existing opaque server `previewToken`. The client never sends authoritative prices, totals, discount percentages, promotion IDs, or Stripe IDs. |
| Controlled content statuses | Adopt | Public and search projections include approved content only. No AI-generated legal, medical, research, or marketing copy is introduced. |
| Calculator launch gate | Adopt | Implement neutral concentration arithmetic only, but production rendering remains disabled by server configuration until the binding content policy and business/legal review explicitly approve it. |
| Shared deterministic search contract | Adopt | One pure normalized index/scorer powers catalog and bottom search. No external AI, embeddings, vector database, or hosted search service. |
| Newsletter not configured | Adopt | Validate but do not store or transmit email; return `NEWSLETTER_NOT_CONFIGURED` and show honest temporary-unavailable copy. |
| Null social URLs | Rejected by owner | Preserve the original placeholder requirement: initialize Instagram, TikTok, X, and Facebook to `/`, render all four accessible icon links, and identify them as placeholders in the owner guide until real approved URLs are supplied. |
| Claimed June 2026 FDA example | Reject as unverified | The verified March FDA example and current FTC/Stripe primary sources are sufficient context. |

## Canonical catalog contract

The implementation will introduce a normalized projection without parsing identity, mg amount, price, or Stripe mapping from display labels:

```ts
export type PriceStatus = "pending" | "active" | "unavailable";
export type VariantAvailability = "preview_only" | "available" | "unavailable";

export type StorefrontVariant = Readonly<{
  id: string;
  productId: string;
  sku: string;
  label: string;
  amount: Readonly<{ value: number; unit: "mg" | "mcg" | "iu" }> | null;
  packageQuantity: number;
  currency: "USD";
  baseUnitMinor: number;
  priceStatus: PriceStatus;
  availability: VariantAvailability;
  stripeProductId: string | null;
  stripePriceId: string | null;
}>;

export type StorefrontProduct = Readonly<{
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  image: Readonly<{ src: string; alt: string; width: number; height: number }>;
  aliases: readonly string[];
  popularityRank: number;
  releasedAt: string;
  defaultVariantId: string;
  variantIds: readonly string[];
  relatedProductIds: readonly string[];
  contentIds: readonly string[];
}>;
```

`packageQuantity` makes the cart unit explicit and prevents a label such as `5mg × 10 vials` from silently deciding whether quantity one means one vial or one ten-vial package. Real IDs, SKUs, amounts, dates, ranks, default variants, relationships, availability, and payment mappings must come from owner-approved data. Test fixtures may use clearly labelled fictional values; production configuration may not.

During migration, the existing browse catalog is an input, not a second long-term authority. The approved names, categories, images, source references, and display labels move into the canonical storefront data record once the missing owner facts are supplied. `browse-catalog.ts` may temporarily export a compatibility projection, but its independent `ownerSuppliedProducts` definitions must be removed after all callers migrate. Versioned base prices, variant availability/inventory, and promotions remain in the existing server catalog/database authority; the public projection reads them rather than copying them into components.

## Canonical pricing and promotion contract

Quantity pricing applies independently to one exact `variantId` cart line:

- 1: 0%
- 2: 8%
- 3 through 9: 10%
- 10 through the retained repository maximum of 25: 30%

The repository maximum of 25 remains unless the owner asks to change it; the new requirement defines the 10+ tier but does not require removing the existing safety limit.

```ts
export type StorefrontPromotion = Readonly<{
  id: string;
  displayName: string;
  displayCode: string | null;
  percentage: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  scope:
    | Readonly<{ kind: "sitewide" }>
    | Readonly<{ kind: "products"; productIds: readonly string[] }>
    | Readonly<{ kind: "variants"; variantIds: readonly string[] }>;
  applicationMode: "automatic" | "code_required";
}>;

export type EffectiveLinePrice = Readonly<{
  variantId: string;
  quantity: number;
  baseUnitMinor: number;
  effectiveDiscountPct: number;
  effectiveUnitMinor: number;
  lineSubtotalMinor: number;
  lineSavingsMinor: number;
  appliedPromotionIds: readonly string[];
}>;
```

For positive integer money values, round the unit amount once with integer arithmetic, then multiply by quantity:

```text
effectiveDiscountPct = max(quantityDiscountPct, highestEligiblePromotionPct)
effectiveUnitMinor = roundHalfUp(baseUnitMinor * (100 - effectiveDiscountPct) / 100)
lineSubtotalMinor = effectiveUnitMinor * quantity
lineSavingsMinor = baseUnitMinor * quantity - lineSubtotalMinor
```

Promotion activation uses the server clock. `startAt` is inclusive, `endAt` is exclusive, and null means no boundary. The configured IANA timezone is for campaign authoring/display; timestamps are stored as ISO 8601 instants. Overlapping campaigns contribute only the highest eligible percentage. Mixed-currency carts remain rejected.

WINTER30 is configured as enabled, sitewide, 30%, automatic, no start, no end, and `America/Los_Angeles` unless a verified business timezone supersedes it. The banner disappears when it is disabled or inactive. The Stripe customer-entered promotion-code field remains disabled.

## Checkout contract

The browser sends canonical `variantId`, quantity, destination, optional reward-redemption points under the existing contract, and an opaque server-issued pricing/preview token. Automatic promotions and referral attribution are resolved from server state. The browser does not send an amount, effective discount, promotion ID or eligibility, currency authority, Stripe Product ID, or Stripe Price ID.

Immediately before creating a session, the server:

1. Reloads canonical variants and current inventory.
2. Rejects quantities outside 1–25 and separate duplicate variant lines at the HTTP boundary.
3. Recomputes quantity tiers and all eligible automatic promotions.
4. Recomputes shipping, tax, existing acquisition behavior, and total through the established domain services.
5. Compares the opaque pricing revision with the current server revision; on change, returns HTTP 409 with a safe refreshed quote and creates no session.
6. Rejects every line whose price is not active and positive, currency is invalid, availability is false, or required payment mapping is missing.
7. Writes variant, quantity, pricing-version, and applied-promotion snapshots to the internal order/reconciliation metadata.
8. Creates Stripe Checkout line items from server-calculated inline `price_data` and keeps `allow_promotion_codes` disabled.

The provider representation will retain the repository’s current one-Stripe-line-per-internal-line convention: Stripe quantity is `1`, and `unit_amount` is the complete authoritative internal line subtotal. The description includes the actual purchased quantity and variant SKU. This preserves exact per-line rounding and avoids changing established provider reconciliation semantics.

Typed safe failures include `CHECKOUT_UNAVAILABLE` with reason codes and affected variant IDs, plus `PRICE_CHANGED` with a refreshed safe cart projection. They contain no secrets, provider internals, stack traces, or unapproved content.

## Search contract

Catalog and bottom search share a pure document projection and scorer. Approved fields include product name, category, SKU, variant label, approved aliases/tags, approved description, public page title, approved FAQ, and relevant public section headings.

Normalization lowercases, applies Unicode normalization, strips diacritics for matching, normalizes punctuation/whitespace, and tokenizes fields. Ranking is deterministic:

1. Exact name, SKU, title, or alias
2. Prefix
3. Complete token
4. Substring
5. Category/tag/approved description
6. Conservative bounded fuzzy match for queries of four or more characters

Tie-breaking is score, configured popularity rank where relevant, alphabetical title, then stable ID. Catalog price sorting uses the lowest active effective price among available variants unless `defaultVariantId` is explicitly selected for display; pending and unavailable products sort after active-price products in both directions.

The bottom search is a public-layout Radix Sheet with Product and Pages or Information groups, normal links, arrow-key navigation, Enter selection, Escape close, focus trap/restore, mobile full-screen treatment, safe-area spacing, and a live result count. It gives navigation recommendations only and never medical, dosage, administration, or product-use guidance.

Informational destinations are an explicit approved registry rather than inferred links:

```ts
export type PublicInformationEntry = Readonly<{
  id: string;
  title: string;
  href: `/${string}`;
  description: string;
  keywords: readonly string[];
  status: "draft" | "approved" | "retired";
}>;
```

The registry contains existing public pages and verified section anchors only. Every href is validated as same-origin and public before it can enter the shared search index.

## Controlled content and public launch gates

Research, storage, FAQs, legal/disclaimer copy, marketing claims, and calculator explanatory text are controlled content:

```ts
export type ControlledContent = Readonly<{
  id: string;
  status: "draft" | "approved" | "retired";
  sourceReferences: readonly string[];
  approvalNote: string | null;
  reviewedAt: string | null;
  effectiveAt: string | null;
}>;
```

Only approved content is public or searchable. Missing legal/support routes remain absent and are listed in the launch handoff; no empty or AI-generated policies are created.

The calculator performs only `mg / mL`, `mg/mL -> mcg/mL`, and material in a user-entered sample volume. It never supplies dosage, recommended volume, syringe units, frequency, injection technique, administration, treatment, protocol, or product-specific human-use examples. Its code and tests may ship while production rendering remains disabled by a server-owned `RECONSTITUTION_CALCULATOR_MODE=disabled|preview|approved` setting; production accepts only `disabled` or `approved`, and the default is `disabled`.

Newsletter submission uses a provider adapter. Without a configured provider it validates the email and explicit consent, stores/transmits nothing, returns `NEWSLETTER_NOT_CONFIGURED`, and displays an accessible temporary-unavailable state rather than success.

## Dependency graph and phase gates

```text
A Discovery and owner decisions
  -> B canonical catalog and variant schema
  -> C pure pricing and automatic promotions
  -> D cart identity and merging
  -> E checkout, persistence, and Stripe boundary

B -> F catalog and product UI -> G related products
B -> H shared search index -> I permanent bottom search
B -> J approved homepage/FAQ/footer/newsletter content
B -> K calculator implementation behind launch gate

E, F, G, I, J, K -> L accessibility, performance, browser, and release verification
```

Each phase starts with focused failing tests, changes only its direct dependency surface, runs lint/type/unit/build checks proportionate to the phase, and receives an independent review before a dependent phase begins. Obsolete code is removed only after its replacement is implemented and verified. This planning work does not authorize commits, merges, deployments, live provider writes, database migrations, or production activation.

## Exact plan set

1. `docs/superpowers/plans/2026-08-30-propeptiq-commerce-foundation.md`
2. `docs/superpowers/plans/2026-08-30-propeptiq-catalog-product-ui.md`
3. `docs/superpowers/plans/2026-08-30-propeptiq-search-discovery.md`
4. `docs/superpowers/plans/2026-08-30-propeptiq-public-content.md`
5. `docs/superpowers/plans/2026-08-30-propeptiq-storefront-verification.md`

## Owner decisions resolved on 2026-08-30

1. Cart quantity one means one individual bottle/vial. The neutral calculator may be implemented, but it remains disabled in production until its separate content/compliance launch approval.
2. Canonical quantity/store-promotion savings are aggregated and compared with the existing referral discount through `selectBestAcquisitionDiscount`; only the larger acquisition discount applies. Redeemed reward points remain a separate earned-value redemption.
3. Instagram, TikTok, X, and Facebook icons render as accessible placeholders with `/` URLs until the owner supplies real approved profiles. The owner guide and launch handoff must identify those destinations as placeholders.
4. Local implementation and task commits are authorized in subagent-driven mode. Shared-database migration, live Stripe/provider calls, merge, deployment, and production publication remain separately gated.

## Business-supplied activation data

The following remain launch inputs, not implementation inventions: canonical product and variant IDs, unique SKUs, numeric amounts/units for blends and non-mg products, package quantity, default variants, prices, popularity ranks, release dates, related-product IDs, availability/inventory bindings, approved product/research/storage/FAQ/legal content, newsletter provider, real social URLs, Stripe mapping IDs, payment-provider approval, tax registrations, shipping configuration, and calculator public-content approval.
