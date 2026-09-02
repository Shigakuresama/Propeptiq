import {
  browseCatalogProducts,
  type BrowseCatalogProduct,
} from "./browse-catalog";
import {
  resolvePublishedBrowseCatalog,
  type PublishedBrowseCatalog,
} from "./browse-catalog-publication";
import { parseStorefrontBindings } from "./storefront-bindings";
import { getStorefrontCatalogDecision } from "./storefront-catalog-manifest";
import type { StorefrontCatalogData } from "./storefront-catalog-data";
import type { DatabaseCatalogRecordSet } from "./database-catalog";
import type {
  StorefrontBinding,
  StorefrontBindingProduct,
  StorefrontBindingVariant,
  StorefrontProduct,
} from "./storefront-types";
import {
  getApprovedStorefrontContent,
  type ApprovedStorefrontContent,
  type ControlledContentRecord,
} from "@/content/storefront-content";

export type PublicStorefrontDisplayConfiguration = Readonly<{
  displayCode: string;
  packageForm: string;
  sourceName?: string;
  sourcePage?: number;
}>;

export type PublicStorefrontCommon = Readonly<{
  slug: string;
  name: string;
  sourceName: string;
  category: string;
  image: Readonly<{
    src: string;
    alt: string;
    width: number;
    height: number;
  }>;
  displayConfigurations: readonly PublicStorefrontDisplayConfiguration[];
}>;

export type PublicStorefrontVariant = Readonly<{
  id: string;
  sku: string;
  label: string;
  amount: Readonly<{ value: number; unit: "mg" | "mcg" | "iu" }> | null;
  packageQuantity: number;
  availability: "preview_only" | "available" | "unavailable";
  priceStatus: "pending" | "active" | "unavailable";
  baseUnitMinor: number | null;
  currency: "USD" | null;
  checkoutReady: boolean;
}>;

export type CanonicalPublicStorefrontProduct = PublicStorefrontCommon &
  Readonly<{
    kind: "canonical";
    id: string;
    description: string | null;
    aliases: readonly string[];
    popularityRank: number;
    releasedAt: string;
    defaultVariantId: string;
    variants: readonly PublicStorefrontVariant[];
    relatedProductIds: readonly string[];
    content: readonly ApprovedStorefrontContent[];
  }>;

export type BrowseOnlyPublicStorefrontProduct = PublicStorefrontCommon &
  Readonly<{
    kind: "browse_only";
    id: null;
    defaultVariantId: null;
    variants: readonly [];
    pricingState: "pricing_pending";
  }>;

export type PublicStorefrontProduct =
  | CanonicalPublicStorefrontProduct
  | BrowseOnlyPublicStorefrontProduct;

export type RuntimeVariantPresentationFact = Readonly<
  | {
      variantId: string;
      productId: string;
      priceStatus: "active";
      baseUnitMinor: number;
      currency: "USD";
      availability: "preview_only" | "available" | "unavailable";
      availableQuantity: number;
      paymentMappingStatus: "configured_match" | "missing_or_mismatched";
      checkoutReady: boolean;
    }
  | {
      variantId: string;
      productId: string;
      priceStatus: "pending";
      baseUnitMinor: number | null;
      currency: "USD" | null;
      availability: "preview_only" | "unavailable";
      availableQuantity: number;
      paymentMappingStatus: "configured_match" | "missing_or_mismatched";
      checkoutReady: false;
    }
  | {
      variantId: string;
      productId: string;
      priceStatus: "unavailable";
      baseUnitMinor: null;
      currency: null;
      availability: "unavailable";
      availableQuantity: number;
      paymentMappingStatus: "configured_match" | "missing_or_mismatched";
      checkoutReady: false;
    }
>;

export type VerifiedStorefrontImageMetadata = Readonly<{
  src: string;
  width: number;
  height: number;
}>;

export type PublicStorefrontCatalog = Readonly<{
  publicationId: PublishedBrowseCatalog["publicationId"];
  products: readonly PublicStorefrontProduct[];
  displayConfigurationCount: number;
}>;

export function resolvePublicStorefrontRelatedProducts(
  catalog: PublicStorefrontCatalog,
  currentProduct: CanonicalPublicStorefrontProduct,
): readonly CanonicalPublicStorefrontProduct[] {
  const productsById = new Map(
    catalog.products.flatMap((product) =>
      product.kind === "canonical" ? [[product.id, product] as const] : [],
    ),
  );
  const seen = new Set<string>();
  const related = currentProduct.relatedProductIds.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const product = productsById.get(id);
    if (
      !product ||
      product.id === currentProduct.id ||
      product.variants.length === 0 ||
      product.variants.every((variant) => variant.availability === "unavailable")
    ) return [];
    return [product];
  });
  return Object.freeze(related);
}

export type PublicStorefrontSources = Readonly<{
  configuredPublicationId: string | undefined;
  catalogData: StorefrontCatalogData;
  runtimeVariantFacts: readonly RuntimeVariantPresentationFact[];
  controlledContent: readonly ControlledContentRecord[];
  verifiedImageMetadata: readonly VerifiedStorefrontImageMetadata[];
}>;

export type StorefrontProjectionErrorCode =
  | "binding_product_mismatch"
  | "binding_variant_mismatch"
  | "canonical_catalog_invalid"
  | "image_metadata_mismatch";

export class StorefrontProjectionError extends Error {
  readonly code: StorefrontProjectionErrorCode;

  constructor(code: StorefrontProjectionErrorCode, message: string) {
    super(message);
    this.name = "StorefrontProjectionError";
    this.code = code;
  }
}

export const storefrontImageMetadata: readonly VerifiedStorefrontImageMetadata[] =
  Object.freeze(
    browseCatalogProducts.map((product) =>
      Object.freeze({ src: product.image.src, width: 1254, height: 1254 }),
    ),
  );

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function runtimeFactIsValid(fact: RuntimeVariantPresentationFact): boolean {
  if (
    fact.variantId.trim().length === 0 ||
    fact.productId.trim().length === 0 ||
    !isNonnegativeSafeInteger(fact.availableQuantity)
  ) {
    return false;
  }

  if (fact.priceStatus === "active") {
    if (
      !Number.isSafeInteger(fact.baseUnitMinor) ||
      fact.baseUnitMinor <= 0 ||
      fact.currency !== "USD"
    ) {
      return false;
    }
  } else if (fact.priceStatus === "pending") {
    const nullPair = fact.baseUnitMinor === null && fact.currency === null;
    const usdPair =
      isNonnegativeSafeInteger(fact.baseUnitMinor) && fact.currency === "USD";
    if (!nullPair && !usdPair) return false;
  } else if (fact.baseUnitMinor !== null || fact.currency !== null) {
    return false;
  }

  if (
    fact.checkoutReady &&
    !(
      fact.priceStatus === "active" &&
      fact.baseUnitMinor > 0 &&
      fact.currency === "USD" &&
      fact.availability === "available" &&
      fact.paymentMappingStatus === "configured_match"
    )
  ) {
    return false;
  }

  return true;
}

export function parseRuntimeVariantPresentationFacts(
  input: readonly RuntimeVariantPresentationFact[],
): readonly RuntimeVariantPresentationFact[] {
  const variantIds = new Set<string>();
  return Object.freeze(
    input.map((fact) => {
      if (variantIds.has(fact.variantId)) {
        throw new Error("Duplicate runtime variant presentation fact");
      }
      variantIds.add(fact.variantId);
      if (!runtimeFactIsValid(fact)) {
        throw new Error("Invalid runtime variant presentation fact or checkout-ready state");
      }
      return Object.freeze({ ...fact });
    }),
  );
}

function nonblank(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function bindingAmountMatchesDatabase(
  binding: StorefrontBindingVariant,
  database: DatabaseCatalogRecordSet["variants"][number],
): boolean {
  if (binding.amount === null) {
    return database.canonicalAmount === null && database.amountUnit === null;
  }
  return (
    database.canonicalAmount === binding.amount.value &&
    database.amountUnit === binding.amount.unit
  );
}

function isCurrentAt(
  effectiveAt: string,
  supersededAt: string | null,
  now: Date,
): boolean {
  const effective = new Date(effectiveAt).getTime();
  return (
    Number.isFinite(effective) &&
    effective <= now.getTime() &&
    supersededAt === null
  );
}

function availableQuantityForVariant(
  records: DatabaseCatalogRecordSet,
  productId: string,
  variantId: string,
  now: Date,
): number | null {
  let total = 0;
  for (const lot of records.lots) {
    const expiresAt = lot.expiresAt === null
      ? null
      : new Date(lot.expiresAt).getTime();
    if (
      lot.productId !== productId ||
      lot.variantId !== variantId ||
      lot.status !== "released" ||
      !Number.isSafeInteger(lot.availableQuantity) ||
      lot.availableQuantity <= 0 ||
      (expiresAt !== null &&
        (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()))
    ) {
      continue;
    }
    total += lot.availableQuantity;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function buildRuntimeVariantPresentationFacts(input: Readonly<{
  records: DatabaseCatalogRecordSet;
  bindings: StorefrontBinding;
  now: Date;
}>): readonly RuntimeVariantPresentationFact[] {
  const bindings = parseStorefrontBindings(input.bindings);
  const productsById = new Map(
    input.records.products.map((product) => [product.id, product] as const),
  );
  const variantsById = new Map<
    string,
    DatabaseCatalogRecordSet["variants"]
  >();
  for (const variant of input.records.variants) {
    const matches = variantsById.get(variant.id) ?? [];
    variantsById.set(variant.id, [...matches, variant]);
  }
  const facts: RuntimeVariantPresentationFact[] = [];
  for (const binding of bindings.variants) {
    const product = productsById.get(binding.productId);
    const databaseVariants = variantsById.get(binding.id) ?? [];
    if (databaseVariants.length !== 1 || !product) continue;
    const databaseVariant = databaseVariants[0]!;
    if (
      databaseVariant.productId !== binding.productId ||
      databaseVariant.sku !== binding.sku ||
      databaseVariant.packageQuantity !== binding.packageQuantity ||
      !bindingAmountMatchesDatabase(binding, databaseVariant)
    ) {
      continue;
    }

    const currentUsdPrices = input.records.prices.filter(
      (price) =>
        price.productId === binding.productId &&
        price.variantId === binding.id &&
        price.currency === "USD" &&
        isCurrentAt(price.effectiveAt, price.supersededAt, input.now),
    );
    if (currentUsdPrices.length !== 1) continue;
    const currentPrice = currentUsdPrices[0]!;
    const availableQuantity = availableQuantityForVariant(
      input.records,
      binding.productId,
      binding.id,
      input.now,
    );
    if (availableQuantity === null) continue;
    const paymentMappingStatus =
      nonblank(binding.stripeProductId) &&
      nonblank(binding.stripePriceId) &&
      nonblank(databaseVariant.stripeProductId) &&
      nonblank(databaseVariant.stripePriceId) &&
      binding.stripeProductId === databaseVariant.stripeProductId &&
      binding.stripePriceId === databaseVariant.stripePriceId
        ? "configured_match"
        : "missing_or_mismatched";
    const identitiesActive =
      product.status === "active" && databaseVariant.status === "active";

    if (currentPrice.priceStatus === "active") {
      if (
        currentPrice.amountMinor === null ||
        !Number.isSafeInteger(currentPrice.amountMinor) ||
        currentPrice.amountMinor <= 0
      ) {
        continue;
      }
      const availability =
        identitiesActive && availableQuantity > 0
          ? "available" as const
          : "unavailable" as const;
      const checkoutReady =
        availability === "available" &&
        paymentMappingStatus === "configured_match";
      facts.push({
        variantId: binding.id,
        productId: binding.productId,
        priceStatus: "active",
        baseUnitMinor: currentPrice.amountMinor,
        currency: "USD",
        availability,
        availableQuantity,
        paymentMappingStatus,
        checkoutReady,
      });
      continue;
    }

    if (currentPrice.priceStatus === "pending") {
      if (
        currentPrice.amountMinor !== null &&
        (!isNonnegativeSafeInteger(currentPrice.amountMinor))
      ) {
        continue;
      }
      facts.push({
        variantId: binding.id,
        productId: binding.productId,
        priceStatus: "pending",
        baseUnitMinor: currentPrice.amountMinor,
        currency: currentPrice.amountMinor === null ? null : "USD",
        availability: identitiesActive ? "preview_only" : "unavailable",
        availableQuantity,
        paymentMappingStatus,
        checkoutReady: false,
      });
      continue;
    }

    facts.push({
      variantId: binding.id,
      productId: binding.productId,
      priceStatus: "unavailable",
      baseUnitMinor: null,
      currency: null,
      availability: "unavailable",
      availableQuantity,
      paymentMappingStatus,
      checkoutReady: false,
    });
  }

  return parseRuntimeVariantPresentationFacts(facts);
}

/** Static, reviewed reference prices are presentation-only and never checkout-ready. */
export function buildConfiguredDisplayVariantFacts(
  catalogData: StorefrontCatalogData,
): readonly RuntimeVariantPresentationFact[] {
  return Object.freeze(catalogData.bindings.variants.map((variant) =>
    variant.baseUnitMinor > 0
      ? Object.freeze({ variantId: variant.id, productId: variant.productId, priceStatus: "active" as const,
          baseUnitMinor: variant.baseUnitMinor, currency: "USD" as const, availability: "preview_only" as const,
          availableQuantity: 0, paymentMappingStatus: "missing_or_mismatched" as const, checkoutReady: false })
      : Object.freeze({ variantId: variant.id, productId: variant.productId, priceStatus: "pending" as const,
          baseUnitMinor: 0, currency: "USD" as const, availability: "preview_only" as const,
          availableQuantity: 0, paymentMappingStatus: "missing_or_mismatched" as const, checkoutReady: false }),
  ));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function requireImageMetadata(
  src: string,
  expected: Readonly<{ width?: number; height?: number }>,
  imageBySrc: ReadonlyMap<string, VerifiedStorefrontImageMetadata>,
): VerifiedStorefrontImageMetadata {
  const metadata = imageBySrc.get(src);
  if (
    !metadata ||
    !Number.isSafeInteger(metadata.width) ||
    !Number.isSafeInteger(metadata.height) ||
    metadata.width <= 0 ||
    metadata.height <= 0 ||
    (expected.width !== undefined && expected.width !== metadata.width) ||
    (expected.height !== undefined && expected.height !== metadata.height)
  ) {
    throw new StorefrontProjectionError(
      "image_metadata_mismatch",
      `Verified image metadata does not match ${src}`,
    );
  }
  return metadata;
}

function displayConfigurations(
  product: BrowseCatalogProduct,
): readonly PublicStorefrontDisplayConfiguration[] {
  return Object.freeze(
    product.variants.map((variant) =>
      Object.freeze({
        displayCode: variant.code,
        packageForm: getStorefrontCatalogDecision(product.slug, variant.code).publicLabel,
        ...(variant.sourceName === undefined ? {} : { sourceName: variant.sourceName }),
        ...(variant.sourcePage === undefined ? {} : { sourcePage: variant.sourcePage }),
      }),
    ),
  );
}

function browseOnlyProduct(
  product: BrowseCatalogProduct,
  imageBySrc: ReadonlyMap<string, VerifiedStorefrontImageMetadata>,
): BrowseOnlyPublicStorefrontProduct {
  const metadata = requireImageMetadata(product.image.src, {}, imageBySrc);
  return Object.freeze({
    kind: "browse_only",
    id: null,
    slug: product.slug,
    name: product.name,
    sourceName: product.sourceName,
    category: product.category,
    image: Object.freeze({
      src: product.image.src,
      alt: product.image.alt,
      width: metadata.width,
      height: metadata.height,
    }),
    displayConfigurations: displayConfigurations(product),
    defaultVariantId: null,
    variants: Object.freeze([]) as readonly [],
    pricingState: "pricing_pending",
  });
}

function assertCanonicalBindingAgreement(
  canonical: StorefrontProduct,
  binding: StorefrontBindingProduct,
): void {
  if (
    canonical.id !== binding.id ||
    canonical.slug !== binding.browseSlug ||
    canonical.popularityRank !== binding.popularityRank ||
    canonical.releasedAt !== binding.releasedAt ||
    canonical.defaultVariantId !== binding.defaultVariantId ||
    !arraysEqual(canonical.relatedProductIds, binding.relatedProductIds) ||
    !arraysEqual(canonical.contentIds, binding.contentIds)
  ) {
    throw new StorefrontProjectionError(
      "binding_product_mismatch",
      `Canonical product does not agree with its browse binding: ${binding.browseSlug}`,
    );
  }
}

function pendingPublicVariant(
  variant: StorefrontBindingVariant,
): PublicStorefrontVariant {
  return Object.freeze({
    id: variant.id,
    sku: variant.sku,
    label: variant.label,
    amount: variant.amount === null ? null : Object.freeze({ ...variant.amount }),
    packageQuantity: variant.packageQuantity,
    availability: "preview_only",
    priceStatus: "pending",
    baseUnitMinor: null,
    currency: null,
    checkoutReady: false,
  });
}

function publicVariant(
  variant: StorefrontBindingVariant,
  productId: string,
  fact: RuntimeVariantPresentationFact | undefined,
): PublicStorefrontVariant {
  if (!fact || fact.productId !== productId) return pendingPublicVariant(variant);
  return Object.freeze({
    id: variant.id,
    sku: variant.sku,
    label: variant.label,
    amount: variant.amount === null ? null : Object.freeze({ ...variant.amount }),
    packageQuantity: variant.packageQuantity,
    availability: fact.availability,
    priceStatus: fact.priceStatus,
    baseUnitMinor: fact.baseUnitMinor,
    currency: fact.currency,
    checkoutReady: fact.checkoutReady,
  });
}

function canonicalPublicProduct(input: Readonly<{
  browseProduct: BrowseCatalogProduct;
  canonical: StorefrontProduct;
  bindingProduct: StorefrontBindingProduct;
  bindingVariants: readonly StorefrontBindingVariant[];
  runtimeFactsByVariantId: ReadonlyMap<string, RuntimeVariantPresentationFact>;
  approvedContentById: ReadonlyMap<string, ApprovedStorefrontContent>;
  imageBySrc: ReadonlyMap<string, VerifiedStorefrontImageMetadata>;
}>): CanonicalPublicStorefrontProduct {
  assertCanonicalBindingAgreement(input.canonical, input.bindingProduct);
  const variantsById = new Map(
    input.bindingVariants.map((variant) => [variant.id, variant] as const),
  );
  if (
    variantsById.size !== input.bindingVariants.length ||
    input.bindingVariants.some((variant) => variant.productId !== input.canonical.id) ||
    input.canonical.variantIds.length !== input.bindingVariants.length ||
    new Set(input.canonical.variantIds).size !== input.canonical.variantIds.length ||
    input.canonical.variantIds.some((variantId) => !variantsById.has(variantId)) ||
    !input.canonical.variantIds.includes(input.canonical.defaultVariantId)
  ) {
    throw new StorefrontProjectionError(
      "binding_variant_mismatch",
      `Canonical variant membership does not agree for ${input.canonical.slug}`,
    );
  }
  const metadata = requireImageMetadata(
    input.canonical.image.src,
    input.canonical.image,
    input.imageBySrc,
  );

  const variants = Object.freeze(
    input.canonical.variantIds.map((variantId) => {
      const variant = variantsById.get(variantId)!;
      return publicVariant(
        variant,
        input.canonical.id,
        input.runtimeFactsByVariantId.get(variantId),
      );
    }),
  );
  const content = Object.freeze(
    input.canonical.contentIds.flatMap((contentId) => {
      const record = input.approvedContentById.get(contentId);
      return record ? [record] : [];
    }),
  );

  return Object.freeze({
    kind: "canonical",
    id: input.canonical.id,
    slug: input.canonical.slug,
    name: input.canonical.name,
    sourceName: input.browseProduct.sourceName,
    category: input.canonical.category,
    description: input.canonical.description,
    image: Object.freeze({
      src: input.canonical.image.src,
      alt: input.canonical.image.alt,
      width: metadata.width,
      height: metadata.height,
    }),
    displayConfigurations: displayConfigurations(input.browseProduct),
    aliases: Object.freeze([...input.canonical.aliases]),
    popularityRank: input.canonical.popularityRank,
    releasedAt: input.canonical.releasedAt,
    defaultVariantId: input.canonical.defaultVariantId,
    variants,
    relatedProductIds: Object.freeze([...input.canonical.relatedProductIds]),
    content,
  });
}

export function buildPublicStorefrontCatalog(
  sources: PublicStorefrontSources,
): PublicStorefrontCatalog {
  const bindings = parseStorefrontBindings(sources.catalogData.bindings);
  const published = resolvePublishedBrowseCatalog(
    sources.configuredPublicationId,
    bindings,
  );
  const runtimeFacts = parseRuntimeVariantPresentationFacts(
    sources.runtimeVariantFacts,
  );
  const canonicalById = new Map<string, StorefrontProduct>();
  for (const product of sources.catalogData.products) {
    if (canonicalById.has(product.id)) {
      throw new StorefrontProjectionError(
        "canonical_catalog_invalid",
        `Canonical catalog contains duplicate product ID ${product.id}`,
      );
    }
    canonicalById.set(product.id, product);
  }
  const bindingByBrowseSlug = new Map(
    bindings.products.map((product) => [product.browseSlug, product] as const),
  );
  const variantsByProductId = new Map<string, StorefrontBindingVariant[]>();
  for (const variant of bindings.variants) {
    const variants = variantsByProductId.get(variant.productId) ?? [];
    variants.push(variant);
    variantsByProductId.set(variant.productId, variants);
  }
  for (const bindingProduct of bindings.products) {
    if (!canonicalById.has(bindingProduct.id)) {
      throw new StorefrontProjectionError(
        "binding_product_mismatch",
        `Browse binding has no canonical product: ${bindingProduct.browseSlug}`,
      );
    }
  }
  if (sources.catalogData.products.length !== bindings.products.length) {
    throw new StorefrontProjectionError(
      "canonical_catalog_invalid",
      "Every canonical product must have one explicit browse binding",
    );
  }

  const runtimeFactsByVariantId = new Map(
    runtimeFacts.map((fact) => [fact.variantId, fact] as const),
  );
  const approvedContentById = new Map(
    getApprovedStorefrontContent(sources.controlledContent).map((record) => [
      record.id,
      record,
    ] as const),
  );
  const imageBySrc = new Map(
    sources.verifiedImageMetadata.map((image) => [image.src, image] as const),
  );

  const products = Object.freeze(
    published.products.map((browseProduct): PublicStorefrontProduct => {
      const bindingProduct = bindingByBrowseSlug.get(browseProduct.slug);
      if (!bindingProduct) return browseOnlyProduct(browseProduct, imageBySrc);
      const canonical = canonicalById.get(bindingProduct.id)!;
      return canonicalPublicProduct({
        browseProduct,
        canonical,
        bindingProduct,
        bindingVariants: variantsByProductId.get(canonical.id) ?? [],
        runtimeFactsByVariantId,
        approvedContentById,
        imageBySrc,
      });
    }),
  );

  return Object.freeze({
    publicationId: published.publicationId,
    products,
    displayConfigurationCount: products.reduce(
      (total, product) => total + product.displayConfigurations.length,
      0,
    ),
  });
}

export function findPublicStorefrontProduct(
  catalog: Pick<PublicStorefrontCatalog, "products">,
  slug: string,
): PublicStorefrontProduct | null {
  return catalog.products.find((product) => product.slug === slug) ?? null;
}

export type LegacyCatalogConvergenceProduct = Readonly<{
  id: string;
  slug: string;
  price: Readonly<{ amountMinor: number; currency: string }>;
  availableQuantity: number;
  requiresDemoDisclosure: boolean;
}>;

export type LegacyConvergenceReason =
  | Readonly<{ slug: string; code: "missing_target" }>
  | Readonly<{
      slug: string;
      code: "slug_collision";
      targetProductIds: readonly (string | null)[];
    }>
  | Readonly<{
      slug: string;
      code: "identity_unproven";
      legacyProductId: string;
      targetProductId: string | null;
    }>
  | Readonly<{
      slug: string;
      code: "default_variant_missing";
      defaultVariantId: string | null;
    }>
  | Readonly<{
      slug: string;
      code: "price_mismatch";
      legacyAmountMinor: number;
      legacyCurrency: string;
      targetAmountMinor: number | null;
      targetCurrency: "USD" | null;
      targetPriceStatus: "pending" | "active" | "unavailable" | null;
    }>
  | Readonly<{
      slug: string;
      code: "availability_mismatch";
      legacyAvailable: boolean;
      targetAvailable: boolean;
    }>
  | Readonly<{ slug: string; code: "demo_semantics_unrepresented" }>;

export type LegacyConvergenceResult =
  | Readonly<{ ready: true; reasons: readonly [] }>
  | Readonly<{ ready: false; reasons: readonly LegacyConvergenceReason[] }>;

export function assessLegacyCatalogConvergence(
  legacyProducts: readonly LegacyCatalogConvergenceProduct[],
  storefrontProducts: readonly PublicStorefrontProduct[],
): LegacyConvergenceResult {
  const targetsBySlug = new Map<string, PublicStorefrontProduct[]>();
  for (const product of storefrontProducts) {
    const targets = targetsBySlug.get(product.slug) ?? [];
    targets.push(product);
    targetsBySlug.set(product.slug, targets);
  }
  const reasons: LegacyConvergenceReason[] = [];
  for (const legacy of legacyProducts) {
    const targets = targetsBySlug.get(legacy.slug) ?? [];
    if (targets.length === 0) {
      reasons.push({ slug: legacy.slug, code: "missing_target" });
      continue;
    }
    if (targets.length > 1) {
      reasons.push({
        slug: legacy.slug,
        code: "slug_collision",
        targetProductIds: Object.freeze(targets.map((target) => target.id)),
      });
      continue;
    }
    const target = targets[0]!;
    if (target.kind === "browse_only" || target.id !== legacy.id) {
      reasons.push({
        slug: legacy.slug,
        code: "identity_unproven",
        legacyProductId: legacy.id,
        targetProductId: target.id,
      });
      continue;
    }
    const defaultVariant = target.variants.find(
      (variant) => variant.id === target.defaultVariantId,
    );
    if (!defaultVariant) {
      reasons.push({
        slug: legacy.slug,
        code: "default_variant_missing",
        defaultVariantId: target.defaultVariantId,
      });
      continue;
    }
    if (
      defaultVariant.priceStatus !== "active" ||
      defaultVariant.baseUnitMinor !== legacy.price.amountMinor ||
      defaultVariant.currency !== legacy.price.currency
    ) {
      reasons.push({
        slug: legacy.slug,
        code: "price_mismatch",
        legacyAmountMinor: legacy.price.amountMinor,
        legacyCurrency: legacy.price.currency,
        targetAmountMinor: defaultVariant.baseUnitMinor,
        targetCurrency: defaultVariant.currency,
        targetPriceStatus: defaultVariant.priceStatus,
      });
    }
    const legacyAvailable = legacy.availableQuantity > 0;
    const targetAvailable = defaultVariant.availability === "available";
    if (legacyAvailable !== targetAvailable) {
      reasons.push({
        slug: legacy.slug,
        code: "availability_mismatch",
        legacyAvailable,
        targetAvailable,
      });
    }
    if (legacy.requiresDemoDisclosure) {
      reasons.push({
        slug: legacy.slug,
        code: "demo_semantics_unrepresented",
      });
    }
  }

  reasons.sort((left, right) =>
    left.slug.localeCompare(right.slug, "en-US") ||
    left.code.localeCompare(right.code, "en-US"),
  );
  return reasons.length === 0
    ? Object.freeze({ ready: true, reasons: [] as const })
    : Object.freeze({ ready: false, reasons: Object.freeze(reasons) });
}
