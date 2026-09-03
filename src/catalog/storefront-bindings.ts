import { z } from "zod";

import type {
  StorefrontBinding,
  StorefrontBindingProduct,
  StorefrontBindingVariant,
} from "./storefront-types";

const uuidSchema = z.string().uuid();
const nonblankStringSchema = z.string().trim().min(1);

const bindingProductSchema = z
  .object({
    id: uuidSchema,
    browseSlug: nonblankStringSchema,
    popularityRank: z.number().int().positive().nullable(),
    releasedAt: z.iso.datetime({ offset: true }).nullable(),
    defaultVariantId: uuidSchema,
    relatedProductIds: z.array(uuidSchema),
    contentIds: z.array(uuidSchema),
  })
  .strict();

const bindingVariantSchema = z
  .object({
    id: uuidSchema,
    productId: uuidSchema,
    browseCode: nonblankStringSchema,
    sku: nonblankStringSchema,
    label: nonblankStringSchema,
    amount: z
      .object({
        value: z.number().positive(),
        unit: z.enum(["mg", "mcg", "iu"]),
      })
      .strict()
      .nullable(),
    packageQuantity: z.number().int().positive(),
    currency: z.literal("USD"),
    baseUnitMinor: z.number().int().nonnegative(),
    priceStatus: z.enum(["pending", "active", "unavailable"]),
    availability: z.enum(["preview_only", "available", "unavailable"]),
    stripeProductId: nonblankStringSchema.nullable(),
    stripePriceId: nonblankStringSchema.nullable(),
  })
  .strict()
  .superRefine((variant, context) => {
    if (variant.priceStatus !== "active") return;

    if (variant.baseUnitMinor <= 0) {
      context.addIssue({
        code: "custom",
        path: ["baseUnitMinor"],
        message: "An active storefront variant must have a positive base unit amount",
      });
    }
    if (variant.availability !== "available") {
      context.addIssue({
        code: "custom",
        path: ["availability"],
        message: "An active storefront variant must be available",
      });
    }
    if (variant.stripeProductId === null) {
      context.addIssue({
        code: "custom",
        path: ["stripeProductId"],
        message: "An active storefront variant must have a Stripe product mapping",
      });
    }
    if (variant.stripePriceId === null) {
      context.addIssue({
        code: "custom",
        path: ["stripePriceId"],
        message: "An active storefront variant must have a Stripe price mapping",
      });
    }
  });

const bindingSchema = z
  .object({
    products: z.array(bindingProductSchema),
    variants: z.array(bindingVariantSchema),
  })
  .strict()
  .superRefine((binding, context) => {
    const productIds = new Set<string>();
    const browseSlugs = new Set<string>();
    const variantIds = new Set<string>();
    const skus = new Set<string>();
    const variantsByProductId = new Map<string, Set<string>>();

    for (const [index, product] of binding.products.entries()) {
      if (productIds.has(product.id)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "id"],
          message: "Storefront binding contains duplicate product IDs",
        });
      }
      productIds.add(product.id);
      if (browseSlugs.has(product.browseSlug)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "browseSlug"],
          message: "Storefront binding contains duplicate browse slugs",
        });
      }
      browseSlugs.add(product.browseSlug);
    }

    for (const [index, variant] of binding.variants.entries()) {
      if (variantIds.has(variant.id)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "id"],
          message: "Storefront binding contains duplicate variant IDs",
        });
      }
      variantIds.add(variant.id);
      if (skus.has(variant.sku)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "sku"],
          message: "Storefront binding contains duplicate SKUs",
        });
      }
      skus.add(variant.sku);

      const productVariants = variantsByProductId.get(variant.productId) ?? new Set<string>();
      productVariants.add(variant.id);
      variantsByProductId.set(variant.productId, productVariants);
      if (!productIds.has(variant.productId)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "productId"],
          message: "Storefront variant must belong to a bound product",
        });
      }
    }

    for (const [index, product] of binding.products.entries()) {
      const productVariants = variantsByProductId.get(product.id);
      if (!productVariants?.has(product.defaultVariantId)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "defaultVariantId"],
          message: "Storefront product default variant must belong to that product",
        });
      }

      for (const relatedProductId of product.relatedProductIds) {
        if (!productIds.has(relatedProductId) || relatedProductId === product.id) {
          context.addIssue({
            code: "custom",
            path: ["products", index, "relatedProductIds"],
            message: "Storefront product relationships must reference another bound product",
          });
        }
      }
      if (new Set(product.relatedProductIds).size !== product.relatedProductIds.length) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "relatedProductIds"],
          message: "Storefront product relationships must not contain duplicate IDs",
        });
      }
    }
  });

function freezeProduct(
  product: z.infer<typeof bindingProductSchema>,
): StorefrontBindingProduct {
  return Object.freeze({
    ...product,
    relatedProductIds: Object.freeze([...product.relatedProductIds]),
    contentIds: Object.freeze([...product.contentIds]),
  });
}

function freezeVariant(
  variant: z.infer<typeof bindingVariantSchema>,
): StorefrontBindingVariant {
  return Object.freeze({
    ...variant,
    amount: variant.amount === null ? null : Object.freeze({ ...variant.amount }),
  });
}

export function parseStorefrontBindings(input: unknown): StorefrontBinding {
  const parsed = bindingSchema.parse(input);

  return Object.freeze({
    products: Object.freeze(parsed.products.map(freezeProduct)),
    variants: Object.freeze(parsed.variants.map(freezeVariant)),
  });
}
