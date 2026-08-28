import { createHash } from "node:crypto";

import { z } from "zod";

import {
  browseCatalogProducts,
  type BrowseCatalogProduct,
  validateBrowseCatalogProduct,
} from "./browse-catalog";

export const browseCatalogPublicationId =
  "owner-pdf-2026-08-27-07cd4aa0-v1" as const;

export const browseCatalogSourceDocumentSha256 =
  "07cd4aa023c5455444d52f360841bc126b245c3eb30f0a19fea17bdf9b92f0bf" as const;

export const browseCatalogRowsSha256 =
  "172dc8d9a1b8989a80c5db124a44a84805350643ef4a4df01ba0c84caf1321f5" as const;

function fingerprintBrowseCatalogRows(
  products: readonly BrowseCatalogProduct[],
): string {
  const canonicalRows = products.map((product) => [
    product.slug,
    product.name,
    product.sourceName,
    product.category,
    product.image.src,
    product.image.alt,
    product.variants.map((variant) => [
      variant.code,
      variant.packageForm,
      variant.sourceName ?? null,
    ]),
  ]);

  return createHash("sha256")
    .update(JSON.stringify(canonicalRows))
    .digest("hex");
}

const manifestEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1"),
    source: z.literal("owner-supplied"),
    publicationId: z.literal(browseCatalogPublicationId),
    sourceDocumentSha256: z.literal(browseCatalogSourceDocumentSha256),
    products: z.array(z.unknown()).min(1),
  })
  .strict();

export type OwnerBrowseCatalogManifest = Readonly<{
  schemaVersion: "1";
  source: "owner-supplied";
  publicationId: typeof browseCatalogPublicationId;
  sourceDocumentSha256: typeof browseCatalogSourceDocumentSha256;
  products: readonly BrowseCatalogProduct[];
}>;

export type PublishedBrowseCatalog = Readonly<{
  publicationId: typeof browseCatalogPublicationId | null;
  products: readonly BrowseCatalogProduct[];
  variantCount: number;
}>;

export function validateBrowseCatalogManifest(
  candidate: unknown,
): OwnerBrowseCatalogManifest {
  const result = manifestEnvelopeSchema.safeParse(candidate);
  if (!result.success) {
    const issuePath = result.error.issues[0]?.path.join(".") || "unknown field";
    throw new Error(`Invalid owner browse catalog manifest at ${issuePath}`);
  }

  const products = result.data.products.map(validateBrowseCatalogProduct);
  const uniqueSlugs = new Set(products.map(({ slug }) => slug));
  if (uniqueSlugs.size !== products.length) {
    throw new Error("Owner browse catalog contains duplicate product slugs");
  }

  const variantCount = products.reduce(
    (total, product) => total + product.variants.length,
    0,
  );
  if (products.length !== 53 || variantCount !== 103) {
    throw new Error("Owner browse catalog is incomplete");
  }
  if (fingerprintBrowseCatalogRows(products) !== browseCatalogRowsSha256) {
    throw new Error(
      "Owner browse catalog rows do not match the pinned publication",
    );
  }

  return Object.freeze({
    schemaVersion: result.data.schemaVersion,
    source: result.data.source,
    publicationId: result.data.publicationId,
    sourceDocumentSha256: result.data.sourceDocumentSha256,
    products: Object.freeze(products),
  });
}

export const ownerBrowseCatalogManifest = validateBrowseCatalogManifest({
  schemaVersion: "1",
  source: "owner-supplied",
  publicationId: browseCatalogPublicationId,
  sourceDocumentSha256: browseCatalogSourceDocumentSha256,
  products: browseCatalogProducts,
});

const unpublishedBrowseCatalog: PublishedBrowseCatalog = Object.freeze({
  publicationId: null,
  products: Object.freeze([]),
  variantCount: 0,
});

export function resolvePublishedBrowseCatalog(
  configuredPublication: string | undefined,
): PublishedBrowseCatalog {
  if (!configuredPublication) return unpublishedBrowseCatalog;
  if (configuredPublication !== ownerBrowseCatalogManifest.publicationId) {
    throw new Error("Browse catalog publication does not match the owner manifest");
  }

  return Object.freeze({
    publicationId: ownerBrowseCatalogManifest.publicationId,
    products: ownerBrowseCatalogManifest.products,
    variantCount: ownerBrowseCatalogManifest.products.reduce(
      (total, product) => total + product.variants.length,
      0,
    ),
  });
}
