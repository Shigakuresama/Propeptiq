import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ComponentProps } from "react";
import type { ProductPurchasePanel } from "./product-purchase-panel";
import type { CatalogItemDetail } from "./catalog-item-detail";
import type { LaboratoryConcentrationCalculator } from "./laboratory-concentration-calculator";

const promotionBarPath = "src/components/site/promotion-bar.tsx";

const clientEntries = [
  "src/components/commerce/add-to-cart-button.tsx",
  "src/components/commerce/catalog-explorer.tsx",
  "src/components/commerce/catalog-listing-card.tsx",
  "src/components/commerce/related-products-carousel.tsx",
  "src/components/commerce/laboratory-concentration-calculator.tsx",
  "src/components/commerce/quick-add-variant-sheet.tsx",
  "src/components/commerce/product-purchase-panel.tsx",
  promotionBarPath,
  "src/cart/cart-provider.tsx",
] as const;

const clientSafeDependencies = [
  "src/catalog/storefront-price-presentation.ts",
  "src/search/storefront-search.ts",
  "src/components/commerce/product-price.tsx",
  "src/components/commerce/variant-selector.tsx",
  "src/components/commerce/quantity-tier-selector.tsx",
  "src/domain/concentration.ts",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function importSpecifiers(contents: string): readonly string[] {
  return [...contents.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu)].map(
    (match) => match[1]!,
  );
}

function genericClientAuthorityViolation(specifier: string): boolean {
  return specifier === "server-only" ||
    /^@\/env(?:\/|$)/u.test(specifier) ||
    /^@\/config(?:\/|$)/u.test(specifier) ||
    /^@\/db(?:\/|$)/u.test(specifier) ||
    /checkout|cart-repository/iu.test(specifier) ||
    /stripe|payment-provider|provider-repositor/iu.test(specifier);
}

function isLocalRuntimeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("@/");
}

function promotionBarAuthorityViolation(from: string, specifier: string): boolean {
  if (genericClientAuthorityViolation(specifier)) return true;
  if (!isLocalRuntimeSpecifier(specifier)) return false;

  const resolvedPath = resolveRuntimeLocalImportForTest(from, specifier);
  return /^src\/(?:cart|env|config|db)(?:\/|$)/u.test(resolvedPath) ||
    genericClientAuthorityViolation(resolvedPath) ||
    /(?:^|[\/_-])variant(?:[\/_.-]|$)/iu.test(resolvedPath) ||
    /(?:^|[\/_-])promotions?(?:[\/_.-]|$)/iu.test(resolvedPath) ||
    /^src\/domain\/storefront-pricing(?:\.[^/]+)?$/u.test(resolvedPath) ||
    runtimeImportSpecifiers(source(resolvedPath)).includes("server-only");
}

function runtimeImportSpecifiers(contents: string): readonly string[] {
  return [...contents.matchAll(/^(?!\s*import\s+type)(?:import\s+[^;]+?\s+from\s+|import\s*)["']([^"']+)["']/gmu)]
    .map((match) => match[1]!);
}

function runtimeLocalImports(path: string): readonly string[] {
  return runtimeImportSpecifiers(source(path))
    .filter(isLocalRuntimeSpecifier);
}

function resolveRuntimeLocalImportForTest(from: string, specifier: string): string {
  if (!isLocalRuntimeSpecifier(specifier)) {
    throw new Error(`Unresolved local runtime import: ${from} -> ${specifier}`);
  }

  const workspaceRoot = resolve(process.cwd());
  const candidate = specifier.startsWith("@/")
    ? resolve(workspaceRoot, "src", specifier.slice(2))
    : resolve(workspaceRoot, dirname(from), specifier);
  const extensions = [".ts", ".tsx", ".js", ".jsx"] as const;
  const candidates = [
    candidate,
    ...extensions.map((extension) => `${candidate}${extension}`),
    ...extensions.map((extension) => resolve(candidate, `index${extension}`)),
  ];

  for (const absolutePath of candidates) {
    try {
      readFileSync(absolutePath, "utf8");
      const canonicalPath = relative(workspaceRoot, absolutePath).replaceAll("\\", "/");
      if (!canonicalPath.startsWith("src/")) break;
      return canonicalPath;
    } catch { /* continue */ }
  }
  throw new Error(`Unresolved local runtime import: ${from} -> ${specifier}`);
}

describe("storefront client boundary", () => {
  it("enumerates every direct client entry and keeps server/env/database/payment code out", () => {
    for (const path of clientEntries) {
      const contents = source(path);
      expect(contents.trimStart(), path).toMatch(/^"use client";/u);
      expect(contents, `${path} process environment`).not.toMatch(/\bprocess\.env\b/u);

      for (const specifier of importSpecifiers(contents)) {
        expect(
          genericClientAuthorityViolation(specifier),
          `${path} forbidden client authority ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it.each([
    ["server banner adapter", "@/catalog/storefront-promotion-banner-server"],
    ["aliased server module", "@/catalog/storefront-public-server"],
    ["relative server module", "../../catalog/storefront-public-server"],
    ["cart state", "@/cart/cart-provider"],
    ["relative cart state", "../../cart/cart-provider"],
    ["variant mutation", "@/components/commerce/variant-selector"],
    ["promotion mutation", "@/domain/promotions"],
    ["pricing mutation", "@/domain/storefront-pricing"],
    ["checkout", "@/commerce/checkout-service"],
    ["payment provider", "@/commerce/payment-provider"],
    ["Stripe provider", "@/commerce/stripe-payment-provider"],
    ["environment", "@/env"],
    ["configuration", "@/config/env-schema"],
    ["database", "@/db/runtime"],
  ] as const)("rejects a PromotionBar runtime import of %s authority", (_label, specifier) => {
    const fixture = `import { syntheticAuthority } from "${specifier}";`;

    expect(
      runtimeImportSpecifiers(fixture)
        .filter((candidate) => promotionBarAuthorityViolation(promotionBarPath, candidate)),
    ).toEqual([specifier]);
  });

  it.each([
    ["third-party cart package", "shopping-cart-ui"],
    ["third-party server package", "universal-server-renderer"],
  ] as const)("allows an unrelated %s runtime import", (_label, specifier) => {
    expect(promotionBarAuthorityViolation(promotionBarPath, specifier)).toBe(false);
  });

  it("allows type-only local imports without granting runtime authority", () => {
    const fixture = 'import type { SyntheticAuthority } from "../../cart/cart-provider";';

    expect(runtimeImportSpecifiers(fixture)).toEqual([]);
  });

  it("keeps PromotionBar runtime imports free of mutation and server authorities", () => {
    expect(
      runtimeImportSpecifiers(source(promotionBarPath))
        .filter((specifier) => promotionBarAuthorityViolation(promotionBarPath, specifier)),
    ).toEqual([]);
  });

  it("keeps the shared client-safe pricing dependency graph free of server authorities", () => {
    for (const path of clientSafeDependencies) {
      const contents = source(path);
      expect(contents, `${path} server-only`).not.toMatch(/["']server-only["']/u);
      expect(contents, `${path} process environment`).not.toMatch(/\bprocess\.env\b/u);
      for (const specifier of importSpecifiers(contents)) {
        expect(specifier, `${path} environment`).not.toMatch(/^@\/env(?:\/|$)/u);
        expect(specifier, `${path} database`).not.toMatch(/^@\/db(?:\/|$)/u);
        expect(specifier, `${path} checkout/provider`).not.toMatch(
          /checkout|stripe|payment-provider|provider-repositor/iu,
        );
      }
    }
  });

  it("keeps the pure storefront search core free of local runtime dependencies", () => {
    expect(runtimeLocalImports("src/search/storefront-search.ts")).toEqual([]);
  });

  it("recursively bounds panel runtime imports and excludes server authorities", () => {
    const pending = ["src/components/commerce/product-purchase-panel.tsx", "src/components/commerce/related-products-carousel.tsx", "src/components/commerce/laboratory-concentration-calculator.tsx"];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!; if (visited.has(current)) continue; visited.add(current);
      const contents = source(current); expect(contents, current).not.toMatch(/process\.env/u);
      for (const specifier of runtimeLocalImports(current)) {
        expect(specifier, current).not.toMatch(/server-only|stripe|checkout|@\/config|@\/db|@\/env|payment-provider|provider-repositor/iu);
        pending.push(resolveRuntimeLocalImportForTest(current, specifier));
      }
    }
    expect(visited.size).toBeGreaterThan(3);
  });

  it("fails closed for an unresolved local runtime edge", () => {
    expect(() => resolveRuntimeLocalImportForTest("src/components/commerce/product-purchase-panel.tsx", "./definitely-missing")).toThrow(/Unresolved local runtime import/u);
  });

  it("keeps panel pricing required and exposes no mode prop", () => {
    const panel = source("src/components/commerce/product-purchase-panel.tsx");
    expect(panel).toMatch(/product:\s*CanonicalPublicStorefrontProduct;\s*pricing:\s*PublicStorefrontPricingContext/u);
    expect(panel).not.toMatch(/ProductPurchasePanelProps[^\n]*mode|mode\?:/u);
    type PanelProps = ComponentProps<typeof ProductPurchasePanel>;
    type DetailProps = ComponentProps<typeof CatalogItemDetail>;
    type CalculatorProps = ComponentProps<typeof LaboratoryConcentrationCalculator>;
    type CalculatorProjection = CalculatorProps["calculator"];
    expectTypeOf<PanelProps>().toHaveProperty("pricing"); expectTypeOf<PanelProps>().not.toHaveProperty("mode"); expectTypeOf<DetailProps>().toHaveProperty("pricing"); expectTypeOf<DetailProps>().toHaveProperty("calculator"); expectTypeOf<DetailProps>().not.toHaveProperty("mode");
    expectTypeOf<CalculatorProps>().toHaveProperty("calculator");
    expectTypeOf<CalculatorProjection>().toHaveProperty("title");
    expectTypeOf<CalculatorProjection>().toHaveProperty("body");
    expectTypeOf<CalculatorProjection>().toHaveProperty("limits");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("mode");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("product");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("variant");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("contentId");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("approvalNote");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("sourceReferences");
    expectTypeOf<CalculatorProjection>().not.toHaveProperty("reviewedAt");
  });

  it("has no contradictory client mode override or missing-pricing fallback", () => {
    const card = source("src/components/commerce/catalog-listing-card.tsx");
    const explorer = source("src/components/commerce/catalog-explorer.tsx");
    const quickAdd = source("src/components/commerce/quick-add-variant-sheet.tsx");
    const home = source("src/components/site/public-home.tsx");

    expect(card).not.toMatch(/pricingMode|pricing\?\s*:/u);
    expect(explorer).not.toMatch(/pricing\?\s*:/u);
    expect(home).not.toMatch(/pricing\?\s*:/u);
    expect(quickAdd).not.toMatch(/PricePresentationMode|\bmode\s*[?:]/u);
    expect(card).not.toMatch(/1970-01-01|automaticPromotions:\s*\[\]/u);
  });

  it("keeps catalog and home on the static shared storefront view path", () => {
    for (const path of [
      "src/app/(public)/catalog/page.tsx",
      "src/app/(public)/page.tsx",
    ]) {
      const contents = source(path);
      expect(contents, path).toContain("getPublicStorefrontView");
      expect(contents, path).not.toContain("getPublicStorefrontCatalog");
      expect(contents, path).not.toMatch(/\bimport\s*\(/u);
    }
  });
});
