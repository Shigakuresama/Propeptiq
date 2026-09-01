import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientEntries = [
  "src/components/commerce/add-to-cart-button.tsx",
  "src/components/commerce/catalog-explorer.tsx",
  "src/components/commerce/catalog-listing-card.tsx",
  "src/components/commerce/quick-add-variant-sheet.tsx",
  "src/components/commerce/product-purchase-panel.tsx",
  "src/cart/cart-provider.tsx",
] as const;

const clientSafeDependencies = [
  "src/catalog/storefront-price-presentation.ts",
  "src/components/commerce/product-price.tsx",
  "src/components/commerce/variant-selector.tsx",
  "src/components/commerce/quantity-tier-selector.tsx",
] as const;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function importSpecifiers(contents: string): readonly string[] {
  return [...contents.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu)].map(
    (match) => match[1]!,
  );
}

function runtimeLocalImports(path: string): readonly string[] {
  const contents = source(path);
  return [...contents.matchAll(/^(?!\s*import\s+type)(?:import\s+[^;]+?\s+from\s+|import\s*)["']([^"']+)["']/gmu)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/"));
}

function resolveRuntimeLocalImportForTest(from: string, specifier: string): string {
  const candidate = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : `${from.slice(0, from.lastIndexOf("/"))}/${specifier}`;
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx"];
  for (const suffix of extensions) {
    try { source(`${candidate}${suffix}`); return `${candidate}${suffix}`; } catch { /* continue */ }
    for (const ext of extensions.slice(1)) { try { source(`${candidate}/index${ext}`); return `${candidate}/index${ext}`; } catch { /* continue */ } }
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
        expect(specifier, `${path} server-only`).not.toBe("server-only");
        expect(specifier, `${path} environment`).not.toMatch(/^@\/env(?:\/|$)/u);
        expect(specifier, `${path} database`).not.toMatch(/^@\/db(?:\/|$)/u);
        expect(specifier, `${path} checkout`).not.toMatch(/checkout|cart-repository/iu);
        expect(specifier, `${path} provider`).not.toMatch(
          /stripe|payment-provider|provider-repositor/iu,
        );
      }
    }
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

  it("recursively bounds panel runtime imports and excludes server authorities", () => {
    const pending = ["src/components/commerce/product-purchase-panel.tsx"];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!; if (visited.has(current)) continue; visited.add(current);
      const contents = source(current); expect(contents, current).not.toMatch(/process\.env/u);
      for (const specifier of runtimeLocalImports(current)) {
        expect(specifier, current).not.toMatch(/server-only|stripe|checkout|@\/db|@\/env|payment-provider|provider-repositor/iu);
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
