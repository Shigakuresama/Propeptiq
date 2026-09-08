import "server-only";
import mapping from "../../docs/deployment/stripe-sandbox-catalog.json";
import { isSandboxCheckoutEnvironmentConfigured } from "@/config/sandbox-configuration";
import type { ServerEnv } from "@/config/env-schema";
import { parseStorefrontBindings } from "./storefront-bindings";
import type { StorefrontCatalogData } from "./storefront-catalog-data";

/** Pin the sandbox's reviewed provider bindings; database stock/prices still decide availability. */
export function bindSandboxCatalog(environment: ServerEnv, catalog: StorefrontCatalogData): StorefrontCatalogData {
  if (!isSandboxCheckoutEnvironmentConfigured(environment)) return catalog;
  if (mapping.livemode !== false || mapping.accountId !== environment.STRIPE_ACCOUNT_ID) throw new Error("Sandbox mapping account mismatch");
  return {
    products: catalog.products,
    bindings: parseStorefrontBindings({
      products: catalog.bindings.products,
      variants: catalog.bindings.variants.map(variant => {
        const matches = mapping.variants.filter(value => value.variantId === variant.id);
        if (matches.length !== 1) throw new Error("Sandbox mapping identity mismatch");
        const match = matches[0]!;
        return {...variant,stripeProductId:match.stripeProductId,stripePriceId:match.stripePriceId};
      }),
    }),
  };
}
