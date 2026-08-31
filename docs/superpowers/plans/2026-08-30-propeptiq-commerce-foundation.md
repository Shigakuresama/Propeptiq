# PROPEPTIQ Commerce Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce canonical variants, exact quantity-tier pricing, automatic promotions, variant-keyed cart behavior, and a fail-closed server/Stripe boundary without activating products that lack owner-approved commerce data.

**Architecture:** Add a normalized variant contract beside the two current catalog models, extend the existing PostgreSQL catalog and promotion authority, and migrate cart/checkout identity from product ID to variant ID. Pure integer pricing runs in every display and server path, while Checkout reloads and hashes canonical facts and preserves the existing inline Stripe `price_data` representation.

**Tech Stack:** Next.js 16.3.2, React 19, TypeScript, Zod, Drizzle/PostgreSQL, Vitest, Stripe Checkout

**Spec:** `docs/propeptiq-storefront-refactor-contract.md`

## Global Constraints

- Work only in `propeptiq-labs-app/.worktrees/propeptiq-lightweight-commerce`; preserve the eight local settlement, invoice, net-terms, and provider-event commits.
- Read the repository’s bundled Next.js 16.3.2 documentation before changing framework behavior.
- Never derive variant identity, SKU, amount, base price, currency, or Stripe mapping by parsing a display label.
- Use integer minor units and basis points; never use floating-point dollar arithmetic.
- Cart line identity is the stable canonical `variantId`; different variants never combine.
- The existing per-line maximum of 25 and distinct-line maximum of 50 remain in force.
- WINTER30 is automatic, sitewide, 30%, enabled, unbounded by dates, and authored in `America/Los_Angeles`.
- Do not enable Stripe customer-entered promotion codes for automatic WINTER30.
- Production Checkout requires an active positive price, available inventory, valid currency, and verified server-only payment mapping for every line.
- Test fixtures may contain clearly labelled fictional IDs and amounts; production configuration may contain only owner-approved facts.
- Existing referral, reward, shipping, tax, payment-event, reservation, and fulfillment behavior must remain intact.
- The owner confirmed that storefront savings and the existing referral discount compete through `selectBestAcquisitionDiscount`, while reward redemption remains separate.
- Local task commits are authorized for this execution. Do not migrate a shared database, call live Stripe, merge, or deploy without the corresponding separate authorization.

---

## File structure

### Create

- `src/catalog/storefront-types.ts` — canonical product, variant, price-status, and controlled-content types
- `src/catalog/storefront-bindings.ts` — strict parser for owner-approved browse-to-transactional bindings
- `src/catalog/storefront-bindings.test.ts` — duplicate/default/binding validation
- `src/catalog/storefront-catalog-data.ts` — single approved product/display/variant configuration after owner data is supplied
- `src/domain/storefront-pricing.ts` — pure quantity, promotion-activation, eligibility, and line-price functions
- `src/domain/storefront-pricing.test.ts` — quantity, lifecycle, scope, overlap, rounding, and overflow coverage
- `src/domain/storefront-promotions.ts` — server projection from persisted promotion records to automatic storefront promotions
- `src/domain/storefront-promotions.test.ts` — WINTER30 and persisted-record projection tests
- `src/cart/cart-migration.ts` — explicit v1-to-v2 reselection result
- `src/cart/cart-migration.test.ts` — no-silent-default migration coverage

### Modify

- `src/db/schema/enums.ts`, `src/db/schema/catalog.ts`, `src/db/schema/commerce.ts`, `src/db/schema/index.ts`
- `src/catalog/types.ts`, `src/catalog/database-catalog.ts`, `src/catalog/public-catalog.ts`, `src/catalog/demo-fixtures.ts`
- `src/catalog/browse-catalog.ts`, `src/catalog/browse-catalog-publication.ts`, `src/catalog/browse-catalog-server.ts`
- `src/domain/promotions.ts`, `src/domain/money.ts`, `src/domain/checkout.ts`
- `src/cart/cart-storage.ts`, `src/cart/cart-provider.tsx`, `src/cart/preview.ts`, `src/cart/preview-types.ts`
- `src/components/commerce/add-to-cart-button.tsx`, `src/components/commerce/cart-view.tsx`, `src/components/commerce/checkout-form.tsx`
- `src/commerce/checkout-ports.ts`, `src/commerce/checkout-identity.ts`, `src/commerce/checkout-service.ts`, `src/commerce/checkout-http.ts`
- `src/commerce/provider-contracts.ts`, `src/commerce/provider-checkout-orchestration.ts`, `src/commerce/stripe-payment-provider.ts`, `src/commerce/server-runtime.ts`
- `src/db/repositories/checkout-repository.ts`
- Focused unit, route, integration, and PostgreSQL contention tests beside those files

## Task 1: Canonical variant and binding contract

**Files:**

- Create: `src/catalog/storefront-types.ts`
- Create: `src/catalog/storefront-bindings.ts`
- Create: `src/catalog/storefront-bindings.test.ts`
- Create: `src/catalog/storefront-catalog-data.ts`
- Modify: `src/catalog/types.ts`
- Modify: `src/catalog/browse-catalog.ts`
- Modify: `src/catalog/browse-catalog-publication.ts`
- Modify: `src/catalog/browse-catalog-server.ts`

**Interfaces:**

- Consumes: current `BrowseCatalogProduct` presentation records and owner-approved binding input
- Produces: `StorefrontProduct`, `StorefrontVariant`, `StorefrontBinding`, `parseStorefrontBindings(input)`

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";

import { parseStorefrontBindings } from "./storefront-bindings";

const approved = {
  products: [{
    id: "10000000-0000-4000-8000-000000000001",
    browseSlug: "fixture-product",
    popularityRank: 1,
    releasedAt: "2026-08-30T00:00:00.000Z",
    defaultVariantId: "20000000-0000-4000-8000-000000000001",
    relatedProductIds: [],
    contentIds: [],
  }],
  variants: [{
    id: "20000000-0000-4000-8000-000000000001",
    productId: "10000000-0000-4000-8000-000000000001",
    browseCode: "FIXTURE-5",
    sku: "TEST-FIXTURE-5",
    label: "5 mg test fixture",
    amount: { value: 5, unit: "mg" },
    packageQuantity: 1,
    currency: "USD",
    baseUnitMinor: 0,
    priceStatus: "pending",
    availability: "preview_only",
    stripeProductId: null,
    stripePriceId: null,
  }],
} as const;

describe("parseStorefrontBindings", () => {
  it("accepts an explicit pending-price test fixture", () => {
    expect(parseStorefrontBindings(approved).variants[0]?.sku).toBe("TEST-FIXTURE-5");
  });

  it("rejects duplicate variant IDs and SKUs", () => {
    expect(() => parseStorefrontBindings({
      ...approved,
      variants: [approved.variants[0], approved.variants[0]],
    })).toThrow();
  });

  it("rejects a default variant outside the product", () => {
    expect(() => parseStorefrontBindings({
      ...approved,
      products: [{ ...approved.products[0], defaultVariantId: "20000000-0000-4000-8000-000000000099" }],
    })).toThrow();
  });

  it("does not infer an amount or package quantity from a label", () => {
    const { amount: _amount, packageQuantity: _packageQuantity, ...withoutCanonicalFacts } = approved.variants[0];
    expect(() => parseStorefrontBindings({ ...approved, variants: [withoutCanonicalFacts] })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/catalog/storefront-bindings.test.ts`

Expected: FAIL because `storefront-bindings.ts` does not exist.

- [ ] **Step 3: Add exact canonical types and strict parsing**

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

Use strict Zod object schemas, UUID validation for internal IDs, positive integer validation for `packageQuantity` and popularity rank, ISO-instant validation for `releasedAt`, global uniqueness refinements for SKU and variant ID, product/default-variant membership validation, and a rule that `priceStatus: "active"` requires `baseUnitMinor > 0`, `availability: "available"`, and non-null Stripe mapping fields.

After the owner supplies the missing canonical facts, copy the already approved names, categories, local image references, source references, and display labels into `storefront-catalog-data.ts` together with those supplied facts. Make `browse-catalog.ts` a compatibility projection of this single record set, update the 56-product/103-variant publication invariant against the canonical projection, and remove its independent `ownerSuppliedProducts` array. Until those facts arrive, keep the current browse data unchanged and do not create a partially invented canonical production record.

- [ ] **Step 4: Run the focused test and type check**

Run: `npm test -- src/catalog/storefront-bindings.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit only under execution authorization**

Review that no public type includes Stripe mapping fields and no production binding was invented.

```powershell
git add src/catalog/storefront-types.ts src/catalog/storefront-bindings.ts src/catalog/storefront-bindings.test.ts src/catalog/storefront-catalog-data.ts src/catalog/types.ts src/catalog/browse-catalog.ts src/catalog/browse-catalog-publication.ts src/catalog/browse-catalog-server.ts
git commit -m "feat(catalog): define canonical storefront variants"
```

## Task 2: Pure quantity and automatic-promotion pricing

**Files:**

- Create: `src/domain/storefront-pricing.ts`
- Create: `src/domain/storefront-pricing.test.ts`

**Interfaces:**

- Consumes: `StorefrontVariant`, server current time, configured promotions
- Produces: `quantityDiscountBps(quantity)`, `isStorefrontPromotionActive(promotion, now)`, `promotionApplies(promotion, target)`, `resolveEffectiveDiscount(input)`, `calculateVariantLinePrice(input)`

- [ ] **Step 1: Write the full pricing matrix as failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  calculateVariantLinePrice,
  isStorefrontPromotionActive,
  quantityDiscountBps,
  resolveEffectiveDiscount,
} from "./storefront-pricing";

describe("quantityDiscountBps", () => {
  it.each([[1, 0], [2, 800], [3, 1000], [4, 1000], [9, 1000], [10, 3000], [11, 3000], [25, 3000]])(
    "prices quantity %i at %i basis points",
    (quantity, expected) => expect(quantityDiscountBps(quantity)).toBe(expected),
  );
});

describe("nonstacking discounts", () => {
  it.each([[1, 3000], [2, 3000], [3, 3000], [10, 3000]])(
    "applies WINTER30 once at quantity %i",
    (quantity, expected) => expect(resolveEffectiveDiscount({
      quantityDiscountBps: quantityDiscountBps(quantity),
      eligiblePromotions: [{ id: "winter30", discountBps: 3000 }],
    }).discountBps).toBe(expected),
  );

  it("selects the highest overlapping promotion with deterministic attribution", () => {
    expect(resolveEffectiveDiscount({
      quantityDiscountBps: 1000,
      eligiblePromotions: [
        { id: "alpha", discountBps: 2000 },
        { id: "winter30", discountBps: 3000 },
        { id: "zulu", discountBps: 3000 },
      ],
    })).toEqual({ source: "promotion", discountBps: 3000, promotionId: "winter30" });
  });

  it("compares storefront savings with referral without reward stacking", () => {
    expect(selectBestAcquisitionDiscount({
      candidates: [
        { source: "promotion", discountMinor: 3_000 },
        { source: "referral", discountMinor: 5_000 },
      ],
    })).toMatchObject({ ok: true, value: { source: "referral", discountMinor: 5_000 } });
  });
});

describe("integer line pricing", () => {
  it("rounds the discounted unit once and then multiplies", () => {
    expect(calculateVariantLinePrice({
      variantId: "fixture",
      baseUnitMinor: 999,
      quantity: 2,
      effectiveDiscount: { source: "quantity", discountBps: 800, promotionId: null },
    })).toMatchObject({ effectiveUnitMinor: 919, lineSubtotalMinor: 1838, lineSavingsMinor: 160 });
  });

  it("keeps zero-dollar preview math at zero without declaring checkout readiness", () => {
    expect(calculateVariantLinePrice({
      variantId: "fixture",
      baseUnitMinor: 0,
      quantity: 11,
      effectiveDiscount: { source: "promotion", discountBps: 3000, promotionId: "winter30" },
    })).toMatchObject({ effectiveUnitMinor: 0, lineSubtotalMinor: 0, checkoutReady: false });
  });
});

describe("promotion intervals", () => {
  it("uses an inclusive start and exclusive end", () => {
    const promotion = {
      enabled: true,
      startAt: "2026-08-30T08:00:00.000Z",
      endAt: "2026-08-31T08:00:00.000Z",
    } as const;
    expect(isStorefrontPromotionActive(promotion, new Date(promotion.startAt))).toBe(true);
    expect(isStorefrontPromotionActive(promotion, new Date(promotion.endAt))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/domain/storefront-pricing.test.ts`

Expected: FAIL because the pricing module does not exist.

- [ ] **Step 3: Implement exact integer pricing**

```ts
export const QUANTITY_TIERS = Object.freeze([
  { minQuantity: 1, discountBps: 0 },
  { minQuantity: 2, discountBps: 800 },
  { minQuantity: 3, discountBps: 1000 },
  { minQuantity: 10, discountBps: 3000 },
] as const);

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function quantityDiscountBps(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 25) {
    throw new RangeError("quantity must be an integer from 1 through 25");
  }
  return QUANTITY_TIERS.reduce(
    (discount, tier) => quantity >= tier.minQuantity ? tier.discountBps : discount,
    0,
  );
}

export function calculateVariantLinePrice(input: LinePriceInput): EffectiveLinePrice {
  const factor = BigInt(10_000 - input.effectiveDiscount.discountBps);
  const unit = roundHalfUp(BigInt(input.baseUnitMinor) * factor, 10_000n);
  const subtotal = unit * BigInt(input.quantity);
  const gross = BigInt(input.baseUnitMinor) * BigInt(input.quantity);
  if (subtotal > BigInt(Number.MAX_SAFE_INTEGER) || gross > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("line amount exceeds safe integer range");
  }
  return Object.freeze({
    variantId: input.variantId,
    quantity: input.quantity,
    baseUnitMinor: input.baseUnitMinor,
    effectiveDiscountBps: input.effectiveDiscount.discountBps,
    effectiveUnitMinor: Number(unit),
    lineSubtotalMinor: Number(subtotal),
    lineSavingsMinor: Number(gross - subtotal),
    appliedPromotionIds: input.effectiveDiscount.promotionId ? [input.effectiveDiscount.promotionId] : [],
    checkoutReady: input.baseUnitMinor > 0,
  });
}
```

Implement activation from the server-supplied `now`, eligibility for sitewide/product/variant scopes, and stable overlap ordering by descending basis points then ascending promotion ID. A promotion tied with the quantity tier wins attribution but never adds its percentage.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/domain/storefront-pricing.test.ts`

Expected: PASS for the complete quantity/lifecycle/overlap/rounding matrix.

- [ ] **Step 5: Review and commit only under execution authorization**

```powershell
git add src/domain/storefront-pricing.ts src/domain/storefront-pricing.test.ts
git commit -m "feat(pricing): add nonstacking variant quantity tiers"
```

## Task 3: Persisted variants, promotion configuration, and activation gates

**Files:**

- Modify: `src/db/schema/enums.ts`
- Modify: `src/db/schema/catalog.ts`
- Modify: `src/db/schema/commerce.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/catalog/database-catalog.ts`
- Modify: `src/catalog/public-catalog.ts`
- Modify: `src/catalog/demo-fixtures.ts`
- Modify: `src/db/repositories/checkout-repository.ts`
- Create: generated migration and snapshot under `src/db/migrations/`
- Test: `tests/integration/task6-schema.test.ts`
- Test: `tests/integration/catalog-repository.test.ts`
- Test: `tests/integration/checkout-repository.test.ts`

**Interfaces:**

- Consumes: validated storefront bindings from Task 1
- Produces: variant-level price/inventory facts and automatic storefront promotion records for Tasks 4–6

- [ ] **Step 1: Write failing schema and repository tests**

Assert these exact invariants:

```ts
expect(await repository.getCheckoutVariantFacts(variantId)).toMatchObject({
  variantId,
  productId,
  sku: "TEST-FIXTURE-5",
  priceStatus: "pending",
  amountMinor: 0,
  currency: "USD",
  stripePriceId: null,
  availableQuantity: 0,
});
```

Add integration cases that reject duplicate SKU, mismatched product/variant on an order item, overlapping current prices for one variant, an active zero-dollar price, and a WINTER30 record whose percentage is not exactly 3000 basis points. Assert unbound existing browse rows remain publishable for exploration but absent from checkout facts.

- [ ] **Step 2: Run the focused integration tests and verify the missing-schema failures**

Run: `npm run test:integration -- tests/integration/task6-schema.test.ts tests/integration/catalog-repository.test.ts tests/integration/checkout-repository.test.ts`

Expected: FAIL because `product_variants`, variant foreign keys, price status, and promotion application fields do not exist.

- [ ] **Step 3: Add an additive, fail-closed schema**

Create `product_variants` with UUID primary key, product foreign key, globally unique nonblank SKU, owner-approved label, nullable canonical numeric amount plus unit enum, positive package quantity, active/inactive status, and server-only nullable Stripe Product/Price IDs. Add `price_status` (`pending`, `active`, `unavailable`) to versioned prices and permit zero only for `pending`; keep `active` strictly positive.

Add variant foreign keys to prices, lots, and order-item snapshots. During the compatibility window retain existing product foreign keys and make the new variant relation nullable for historical records; new buyer checkout requires a non-null variant relation. The generated migration must abort rather than guess if populated current product/price/lot rows lack an exact owner-approved mapping.

Extend persisted promotions with stable campaign key, enabled state, timezone, application mode, sitewide scope, and variant targets. Seed or fixture WINTER30 only through the existing environment-specific catalog fixture mechanism:

```ts
{
  campaignKey: "winter30",
  displayName: "Winter Sale",
  displayCode: "WINTER30",
  basisPoints: 3000,
  enabled: true,
  startsAt: null,
  endsAt: null,
  timezone: "America/Los_Angeles",
  applicationMode: "automatic",
  scope: "sitewide",
}
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`

Expected: one generated migration and updated Drizzle metadata.

Run: `npm run db:check`

Expected: PASS.

Inspect the SQL and prove it contains no label parser, default-first-variant backfill, destructive table drop, or silent product-to-variant guess.

- [ ] **Step 5: Run schema and repository tests**

Run: `npm run test:integration -- tests/integration/task6-schema.test.ts tests/integration/catalog-repository.test.ts tests/integration/checkout-repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Review and commit only under execution authorization**

```powershell
git add src/db/schema src/db/migrations src/catalog/database-catalog.ts src/catalog/public-catalog.ts src/catalog/demo-fixtures.ts src/db/repositories/checkout-repository.ts tests/integration
git commit -m "feat(db): persist canonical commerce variants"
```

## Task 4: Variant-keyed cart v2 and explicit v1 reselection

**Files:**

- Modify: `src/cart/cart-storage.ts`
- Modify: `src/cart/cart-provider.tsx`
- Modify: `src/cart/preview.ts`
- Modify: `src/cart/preview-types.ts`
- Create: `src/cart/cart-migration.ts`
- Create: `src/cart/cart-migration.test.ts`
- Modify: `src/cart/cart.test.ts`
- Modify: `src/components/commerce/add-to-cart-button.tsx`
- Modify: `src/components/commerce/cart-view.tsx`

**Interfaces:**

- Consumes: canonical `variantId` from Task 1 and variant price projection from Task 3
- Produces: `CartLineV2`, `normalizeCart`, `addVariant`, `CartPreviewItem.variantId`, and explicit legacy reselection state

- [ ] **Step 1: Write failing merge/separation/migration tests**

```ts
it("merges repeated additions of the exact variant", () => {
  expect(normalizeCart([
    { variantId: "variant-a", quantity: 1 },
    { variantId: "variant-a", quantity: 2 },
  ])).toEqual([{ variantId: "variant-a", quantity: 3 }]);
});

it("keeps mg variants on separate lines", () => {
  expect(normalizeCart([
    { variantId: "variant-5mg", quantity: 2 },
    { variantId: "variant-10mg", quantity: 2 },
  ])).toEqual([
    { variantId: "variant-5mg", quantity: 2 },
    { variantId: "variant-10mg", quantity: 2 },
  ]);
});

it("requires reselection for a v1 product-only cart", () => {
  expect(deserializeCart(JSON.stringify({
    version: 1,
    items: [{ productId: "10000000-0000-4000-8000-000000000001", quantity: 2 }],
  }))).toEqual({ status: "variant_reselection_required", legacyItemCount: 2 });
});
```

Also assert quantities 25 and 26 clamp or reject exactly as the existing cart contract specifies, and that a merged line recalculates from the 0% tier to the 8%, 10%, or 30% tier through the preview projection.

- [ ] **Step 2: Run focused tests and verify they fail on product identity**

Run: `npm test -- src/cart/cart.test.ts src/cart/cart-migration.test.ts src/cart/preview-presentation.test.ts`

Expected: FAIL because the cart still stores `productId` and version 1.

- [ ] **Step 3: Implement v2 identity and migration result**

```ts
export const CART_STORAGE_KEY = "propeptiq.cart.v2";

export type CartLine = Readonly<{ variantId: string; quantity: number }>;

export type CartLoadResult =
  | Readonly<{ status: "ready"; items: readonly CartLine[] }>
  | Readonly<{ status: "variant_reselection_required"; legacyItemCount: number }>;
```

Use a `Map<variantId, quantity>` in `normalizeCart`, preserve the 25/50 caps, and have the provider expose `addVariant(variantId, quantity = 1)`. Read the old storage key only to produce the reselection message; never map a product-only line to the first or default variant. After the user acknowledges reselection, clear only the old cart key and leave unrelated storage untouched.

- [ ] **Step 4: Run cart and component tests**

Run: `npm test -- src/cart/cart.test.ts src/cart/cart-migration.test.ts src/cart/preview-presentation.test.ts src/components/commerce/cart-view.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and commit only under execution authorization**

```powershell
git add src/cart src/components/commerce/add-to-cart-button.tsx src/components/commerce/cart-view.tsx
git commit -m "feat(cart): key lines by canonical variant"
```

## Task 5: Authoritative quote, stale-price acknowledgement, and tamper rejection

**Files:**

- Modify: `src/domain/checkout.ts`
- Modify: `src/commerce/checkout-ports.ts`
- Modify: `src/commerce/checkout-identity.ts`
- Modify: `src/commerce/checkout-service.ts`
- Modify: `src/commerce/checkout-http.ts`
- Modify: `src/cart/preview.ts`
- Modify: `src/cart/preview-types.ts`
- Modify: `src/components/commerce/checkout-form.tsx`
- Modify: `src/db/repositories/checkout-repository.ts`
- Test: `src/domain/checkout.test.ts`
- Test: `src/commerce/checkout-service.test.ts`
- Test: `src/app/api/checkout/quote/route.test.ts`
- Test: `src/app/api/checkout/sessions/route.test.ts`

**Interfaces:**

- Consumes: variant facts and pure pricing from Tasks 2–4
- Produces: variant-only `CheckoutRequest`, opaque `pricingRevision`, `PRICE_CHANGED`, and `CHECKOUT_UNAVAILABLE`

- [ ] **Step 1: Write failing hostile-request and lifecycle tests**

Test that the strict parser accepts only:

```ts
{
  items: [{ variantId: "20000000-0000-4000-8000-000000000001", quantity: 2 }],
  destination: validDestination,
  pricingRevision: "a".repeat(64),
}
```

and rejects extra `productId`, `baseUnitMinor`, `discountBps`, `totalMinor`, `stripePriceId`, `currency`, `promotionIds`, or claimed automatic-promotion fields as `unexpected_field`.

Add service/route cases for:

- inactive, scheduled, expired, partial-scope, and overlapping promotions;
- quote at one price followed by a changed price before session creation;
- pending/zero price, missing Stripe mapping, invalid currency, unavailable inventory, and quantity 26;
- a client claiming inactive WINTER30;
- a client attempting to combine two variant IDs;
- exact 409 `PRICE_CHANGED` response with refreshed safe lines and no provider call;
- exact `CHECKOUT_UNAVAILABLE` reason codes with affected variant IDs and no provider call.

- [ ] **Step 2: Run the focused checkout suite and verify failures**

Run: `npm test -- src/domain/checkout.test.ts src/commerce/checkout-service.test.ts src/app/api/checkout/quote/route.test.ts src/app/api/checkout/sessions/route.test.ts`

Expected: FAIL because checkout accepts product IDs and has no automatic pricing revision contract.

- [ ] **Step 3: Implement the strict request and safe result types**

```ts
export type CheckoutRequest = Readonly<{
  items: readonly Readonly<{ variantId: string; quantity: number }>[];
  destination: CheckoutDestination;
  pricingRevision: string;
  rewardRedemptionPoints?: number;
}>;

export type CheckoutUnavailable = Readonly<{
  status: "CHECKOUT_UNAVAILABLE";
  reasons: readonly Readonly<{
    variantId: string;
    code: "pricing_coming_soon" | "payment_mapping_missing" | "unavailable" | "invalid_currency";
  }>[];
}>;

export type PriceChanged = Readonly<{
  status: "PRICE_CHANGED";
  pricingRevision: string;
  cart: SafeCartPreview;
}>;
```

Compute `pricingRevision` as a SHA-256 digest of canonical variant ID, price-book ID/version, base minor amount, currency, availability/inventory revision, quantity, active automatic-promotion IDs/versions, and effective line price. It is an opaque stale-state signal, not a signed browser price. The session endpoint reloads facts and returns 409 before reservation/provider creation when the revision differs.

The prepared-plan facts hash and repository lock/recheck must include variant/product relation, SKU snapshot, price version, quantity, effective promotion identity, and Stripe mapping. Preserve serializable reservations, idempotency, shipping, tax, referral/reward behavior, and webhook authority.

Under the owner-confirmed rule, sum canonical line savings into one storefront acquisition candidate, compare it with the existing referral candidate using `selectBestAcquisitionDiscount`, and apply only the larger candidate. Apply any valid reward redemption afterward through the existing reward-reservation path. Add a checkout-service regression proving a 30% WINTER30 candidate and a smaller referral do not stack, a larger referral replaces storefront savings, and reward redemption remains separately journaled.

- [ ] **Step 4: Run checkout, integration, and contention tests**

Run: `npm test -- src/domain/checkout.test.ts src/commerce/checkout-service.test.ts src/app/api/checkout/quote/route.test.ts src/app/api/checkout/sessions/route.test.ts`

Expected: PASS.

Run: `npm run test:integration -- tests/integration/checkout-repository.test.ts`

Expected: PASS.

Run only with the repository’s exact isolated PostgreSQL guards present: `npm run test:postgres:checkout -- tests/postgres/checkout-contention.postgres.test.ts`

Expected with guards present: PASS. Without both guards: NOT RUN, with no concurrency claim.

- [ ] **Step 5: Review and commit only under execution authorization**

```powershell
git add src/domain/checkout.ts src/commerce/checkout-ports.ts src/commerce/checkout-identity.ts src/commerce/checkout-service.ts src/commerce/checkout-http.ts src/cart/preview.ts src/cart/preview-types.ts src/components/commerce/checkout-form.tsx src/db/repositories/checkout-repository.ts src/domain/checkout.test.ts src/commerce/checkout-service.test.ts src/app/api/checkout/quote/route.test.ts src/app/api/checkout/sessions/route.test.ts tests/integration/checkout-repository.test.ts tests/postgres/checkout-contention.postgres.test.ts
git commit -m "feat(checkout): revalidate variant pricing server side"
```

## Task 6: Inline Stripe pricing with server-only mapping verification

**Files:**

- Modify: `src/commerce/provider-contracts.ts`
- Modify: `src/commerce/provider-checkout-orchestration.ts`
- Modify: `src/commerce/stripe-payment-provider.ts`
- Modify: `src/commerce/server-runtime.ts`
- Modify: `src/commerce/checkout-ports.ts`
- Modify: `src/commerce/payment-provider.ts`
- Modify: `src/db/repositories/provider-session-repository.ts`
- Modify: `src/auth/local-commerce-driver.ts`
- Modify: `src/db/schema/commerce.ts`
- Add: a generated additive migration for provider request schema V2
- Test: `src/commerce/provider-contracts.test.ts`
- Test: `src/commerce/provider-checkout-orchestration.test.ts`
- Test: `src/commerce/stripe-payment-provider.test.ts`
- Test: `src/commerce/server-runtime.test.ts`
- Test: `tests/integration/provider-session-repository.test.ts`

**Interfaces:**

- Consumes: authoritative prepared variant lines from Task 5
- Produces: a variant-keyed provider request schema V2, one inline Stripe merchandise line per internal variant line, strict server-only mapping verification, explicit V1 legacy replay, and unchanged webhook/refund reconciliation

- [ ] **Step 1: Write failing provider contract tests**

```ts
expect(buildStripeCheckoutRequestV2(prepared)).toMatchObject({
  allow_promotion_codes: false,
  line_items: [{
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: 1838,
      product: "prod_synthetic_variant_fixture",
    },
  }],
});
```

Assert that two distinct variants sharing one product remain two deterministic lines, duplicate variant IDs fail, and reversing input order produces a byte-identical request/hash. The request never contains a client-supplied Price ID, never sends `line_items[].price`, never creates merchandise through `product_data`, and never sends WINTER30 as a Stripe discount or customer promotion-code field.

Merchandise uses the validated existing `price_data.product`. Its Checkout-visible name comes from the owner-configured Stripe Product. Variant/SKU/requested-quantity/price-version/mapping facts remain in the application's durable internal request/order snapshot, not Stripe line metadata. Preserve existing bounded Session and PaymentIntent metadata (`orderId`, `attemptId`) without adding Price/Product IDs, secrets, or unnecessary PII.

Add lazy adapter tests using Stripe test doubles only. On the same owner-account SDK context used for Session creation, call `accounts.retrieveCurrent()` and `prices.retrieve(configuredPriceId, { expand: ["product"] })`; do not invent Connect routing. Fail closed for a missing/404/transport-failed Price, wrong Price ID, inactive/recurring/tiered/custom/decimal-only Price, null/non-positive/unsafe/wrong amount, wrong account/mode/currency/Product, deleted/inactive Product, or malformed/future response. Runtime assembly itself must make no network call and no raw Stripe response/error may be persisted or logged.

- [ ] **Step 2: Run focused provider tests and verify failures**

Run: `npm test -- src/commerce/provider-contracts.test.ts src/commerce/provider-checkout-orchestration.test.ts src/commerce/stripe-payment-provider.test.ts`

Expected: FAIL because V1 is product-keyed, two variants of one product collide, provider mappings are not remotely verified, and automatic-promotion suppression is not explicit.

- [ ] **Step 3: Preserve inline line totals and verify mappings server-side**

```ts
export type StripeVariantLine = Readonly<{
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  requestedQuantity: number;
  netLineMinor: number;
  baseUnitMinor: number;
  currency: "USD";
  priceBookId: string;
  priceVersion: number;
  stripeProductId: string;
  stripePriceId: string;
}>;
```

De-duplicate and sort canonical lines by `variantId`; `productId` is a relationship fact, never line identity. Join `netLineMinor` from the final allocated `plan.totals.lines.totalMinor`, after referral/reward allocation. Keep Stripe `quantity: 1` and use that complete server-calculated amount as inline `unit_amount`. Treat the configured Stripe Price as an activation/reconciliation mapping only: its exact active one-time/per-unit positive integer amount must equal the authoritative base unit amount, its currency/mode/account must match, and its expanded active Product must equal `stripeProductId`.

Preserve positive-only server-authoritative `Shipping` and `Sales tax` as their existing synthetic inline `product_data` component lines. Do not enable `automatic_tax`, Stripe shipping options, adjustable quantity, `discounts`, or customer promotion codes. Prove both zero and nonzero shipping/tax totals reconcile exactly.

Introduce provider request schema V2 for new canonical attempts and preserve an explicit V1 product-keyed compatibility path for already-persisted legacy/null-variant attempts. Never reinterpret V1 as V2. Generate an additive schema migration if the current coherence constraint permits only V1; do not apply it to a shared database.

Use this state ordering:

1. A fresh canonical attempt verifies account/Price bindings before preparation, reservation, durable attempt creation, or Session creation. Any deterministic mismatch or verifier transport/SDK failure returns a safe unavailable/retryable result with zero commercial side effects.
2. After successful verification, prepare/recheck/reserve and create with the exact persisted request/hash/idempotency key. Definite create rejection follows the existing release path; create uncertainty becomes `provider_unknown` and retains the reservation.
3. A durable attempt with a known Session ID bypasses mutable current Price verification and retrieves/validates the exact Session.
4. A durable unknown/no-session attempt re-verifies only before another idempotent create. Verification failure leaves it `provider_unknown` with its reservation.
5. Preserve safe checkout URL normalization, `maxNetworkRetries: 0`, context/CAS fences, raw-body signature verification, verified paid-event authority, refund reconciliation, and unchanged order/attempt correlation.

- [ ] **Step 4: Run provider and webhook regression tests**

Run: `npm test -- src/commerce/provider-contracts.test.ts src/commerce/provider-checkout-orchestration.test.ts src/commerce/stripe-payment-provider.test.ts src/commerce/server-runtime.test.ts src/commerce/local-payment-provider.test.ts src/commerce/provider-context.test.ts src/commerce/stripe-webhook-verifier.test.ts src/commerce/webhook-http.test.ts src/commerce/provider-event-service.test.ts src/app/api/webhooks/stripe/route.test.ts`

Run: `npm run test:integration -- tests/integration/provider-session-repository.test.ts tests/integration/provider-event-repository.test.ts tests/integration/provider-event-processing.test.ts`

Expected: PASS, including V1 legacy replay, V2 two-variant durable replay, verifier-before-write ordering, known/unknown Session state transitions, exact `amount_total`, paid-event fulfillment, and refund-event reconciliation.

- [ ] **Step 5: Run the Phase 1 gate**

Run sequentially:

```powershell
npm run verify:workspace-boundary
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Then execute the complete Task 6 offline checkpoint matrix in `docs/testing.md` against the same unchanged candidate, including full synthetic E2E, privacy/security, workspace-boundary, artifact-scanner, isolated type-generation/typecheck, production-disabled Turbopack and Webpack build/artifact scans, migration reproducibility hashes, and final Git inventory. Follow its inherited `.next` preservation protocol exactly.

Expected: every required executed command passes. A skipped or unavailable lane is not a pass and must be reported exactly. Do not report the guarded PostgreSQL lane or any live Stripe behavior unless its required guards/environment were actually present and the command passed. Unit test doubles do not establish live account/provider approval.

- [ ] **Step 6: Independent review and authorized commit**

Request an adversarial review of the exact Phase 1 diff, resolve every actionable finding with regression coverage, rerun the relevant gate, then commit only under execution authorization:

```powershell
git add src/commerce src/catalog src/cart src/domain src/db src/components/commerce tests
git commit -m "feat(commerce): enforce canonical variant checkout"
```

## Phase 1 completion gate

Phase 1 is complete only when canonical variants exist without fabricated business data; quantities 1, 2, 3, 4, 9, 10, and 11 prove 0/8/10/30% behavior; same variants merge and different variants remain separate; WINTER30 and overlapping campaigns select one highest percentage; stale prices produce 409 and no session; hostile client amounts/discounts/IDs are ignored or rejected; `$0`, pending, unavailable, unbound, or invalid lines cannot create a session; and all existing payment/webhook/fulfillment regression tests remain green.
