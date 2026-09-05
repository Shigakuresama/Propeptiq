import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ComponentProps } from "react";
import type { ProductPurchasePanel } from "./product-purchase-panel";
import type { CatalogItemDetail } from "./catalog-item-detail";
import type { LaboratoryConcentrationCalculator } from "./laboratory-concentration-calculator";

const promotionBarPath = "src/components/site/promotion-bar.tsx";
const searchClientPaths = [
  "src/components/search/site-search-launcher.tsx",
  "src/components/search/site-search-sheet.tsx",
] as const;
const newsletterClientPath = "src/components/site/newsletter-form.tsx";
const scrollRevealClientPath = "src/components/site/scroll-reveal-controller.tsx";
const checkoutFormPath = "src/components/commerce/checkout-form.tsx";

const clientEntries = [
  "src/components/commerce/add-to-cart-button.tsx",
  "src/components/commerce/cart-drawer.tsx",
  "src/components/commerce/cart-view.tsx",
  "src/components/commerce/catalog-explorer.tsx",
  "src/components/commerce/catalog-item-detail.tsx",
  "src/components/commerce/catalog-product-gallery.tsx",
  "src/components/commerce/catalog-listing-card.tsx",
  "src/components/commerce/related-products-carousel.tsx",
  "src/components/commerce/laboratory-concentration-calculator.tsx",
  "src/components/commerce/quick-add-variant-sheet.tsx",
  "src/components/commerce/product-purchase-panel.tsx",
  "src/components/commerce/mobile-purchase-bar.tsx",
  "src/components/site/public-action-dock.tsx",
  checkoutFormPath,
  promotionBarPath,
  newsletterClientPath,
  scrollRevealClientPath,
  ...searchClientPaths,
  "src/cart/cart-provider.tsx",
] as const;

const cartDrawerClientPaths = [
  "src/components/commerce/cart-drawer.tsx",
  "src/components/commerce/cart-view.tsx",
] as const;

const clientSafeDependencies = [
  "src/catalog/storefront-price-presentation.ts",
  "src/search/storefront-search.ts",
  "src/components/commerce/product-price.tsx",
  "src/components/commerce/catalog-product-visual.tsx",
  "src/components/commerce/catalog-product-visual-manifest.ts",
  "src/content/compound-research-public.ts",
  "src/components/commerce/compound-research-section.tsx",
  "src/components/commerce/variant-selector.tsx",
  "src/components/commerce/quantity-tier-selector.tsx",
  "src/domain/concentration.ts",
  "src/newsletter/contracts.ts",
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
    /storefront-public-server|storefront-preview-source/iu.test(specifier) ||
    /(?:^|\/)catalog\/server(?:$|[./])/iu.test(specifier) ||
    /^@\/env(?:\/|$)/u.test(specifier) ||
    /^@\/config(?:\/|$)/u.test(specifier) ||
    /^@\/db(?:\/|$)/u.test(specifier) ||
    /(?:checkout-service|checkout-repositor|checkout-http|checkout-runtime)|cart-repository/iu.test(specifier) ||
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
  const parsed = ts.createSourceFile(
    "client-boundary-fixture.tsx",
    contents,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );

  const specifiers: string[] = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;

    const namedBindings = clause?.namedBindings;
    const isAllTypeNamedImport =
      namedBindings !== undefined &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.length > 0 &&
      namedBindings.elements.every((element) => element.isTypeOnly) &&
      clause?.name === undefined;
    if (isAllTypeNamedImport) continue;

    specifiers.push(statement.moduleSpecifier.text);
  }
  return specifiers;
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

function searchClientAuthorityViolation(from: string, specifier: string): boolean {
  if (
    genericClientAuthorityViolation(specifier) ||
    /(?:^|[/_-])cart(?:$|[/_.-])/iu.test(specifier) ||
    /storefront-public-content-server|(?:^|\/)storefront-content(?:\.|$)/iu.test(
      specifier,
    )
  ) {
    return true;
  }
  if (!isLocalRuntimeSpecifier(specifier)) return false;

  const resolvedPath = resolveRuntimeLocalImportForTest(from, specifier);
  return !(
    /^src\/components\/search\/site-search-(?:launcher|sheet)\.tsx$/u.test(resolvedPath) ||
    /^src\/components\/ui\//u.test(resolvedPath) ||
    resolvedPath === "src/components/site/public-action-dock.tsx" ||
    resolvedPath === "src/lib/utils.ts" ||
    resolvedPath === "src/search/storefront-search.ts" ||
    resolvedPath === "src/content/public-information.ts"
  );
}

function checkoutClientAuthorityViolation(from: string, specifier: string): boolean {
  if (genericClientAuthorityViolation(specifier)) return true;
  if (!isLocalRuntimeSpecifier(specifier)) return false;

  const resolvedPath = resolveRuntimeLocalImportForTest(from, specifier);
  return /^src\/(?:config|env|db)(?:\/|$)/u.test(resolvedPath) ||
    resolvedPath === "src/catalog/server.ts" ||
    /stripe|payment-provider|provider-(?:checkout|repositor)|checkout-(?:service|repositor|http|runtime)/iu.test(
      resolvedPath,
    ) ||
    runtimeImportSpecifiers(source(resolvedPath)).includes("server-only");
}

function cartDrawerDataRouteViolation(contents: string): boolean {
  const routeLiterals = contents.match(/["'`]\/api\/(?:catalog|data)[^"'`]*["'`]/gu) ?? [];
  return routeLiterals.some((literal) => literal.slice(1, -1) !== "/api/catalog/preview");
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

  it("keeps the cart drawer browser graph on canonical cart state and the one preview endpoint", () => {
    const pending: string[] = [...cartDrawerClientPaths];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const contents = source(current);
      expect(contents, `${current} environment`).not.toMatch(/\bprocess\.env\b/u);
      expect(contents, `${current} provider authority`).not.toMatch(
        /stripe|payment-provider|provider-repositor|checkout-service|storefront-public-server/iu,
      );
      for (const specifier of runtimeLocalImports(current)) {
        expect(genericClientAuthorityViolation(specifier), `${current} -> ${specifier}`).toBe(false);
        pending.push(resolveRuntimeLocalImportForTest(current, specifier));
      }
    }

    const drawerGraph = [...visited].map(source).join("\n");
    expect(drawerGraph.match(/\/api\/catalog\/preview/gu)).toHaveLength(1);
    expect(cartDrawerDataRouteViolation(drawerGraph)).toBe(false);
    expect(visited).toContain("src/cart/cart-provider.tsx");
    expect(visited).toContain("src/cart/preview-presentation.ts");
  });

  it.each([
    ["nested catalog", 'fetch("/api/catalog/products")', true],
    ["nested data", 'fetch("/api/data/export")', true],
    ["preview suffix", 'fetch("/api/catalog/preview/history")', true],
    ["preview query", 'fetch("/api/catalog/preview?draft=1")', true],
    ["bare catalog", 'fetch("/api/catalog")', true],
    ["bare data", 'fetch("/api/data")', true],
    ["exact preview", 'fetch("/api/catalog/preview")', false],
  ] as const)("classifies the %s route literal", (_label, contents, expected) => {
    expect(cartDrawerDataRouteViolation(contents)).toBe(expected);
  });

  it.each([
    ["legacy catalog alias", "@/catalog/server"],
    ["legacy catalog relative path", "../../catalog/server"],
    ["promotion configuration", "@/config/storefront-promotions"],
    ["Stripe provider", "@/commerce/stripe-payment-provider"],
    ["database runtime", "@/db/runtime"],
    ["environment runtime", "@/env/runtime"],
    ["provider repository", "@/db/repositories/provider-event-repository"],
    ["checkout success reader", "@/commerce/checkout-success-read"],
    ["invoice checkout orchestration", "@/commerce/invoice-checkout-orchestration"],
    ["provider checkout orchestration", "@/commerce/provider-checkout-orchestration"],
  ] as const)("rejects a CheckoutForm runtime import of %s", (_label, specifier) => {
    expect(checkoutClientAuthorityViolation(checkoutFormPath, specifier)).toBe(true);
  });

  it("allows CheckoutForm to import its client-safe identity validator", () => {
    expect(
      checkoutClientAuthorityViolation(
        checkoutFormPath,
        "@/commerce/checkout-identity",
      ),
    ).toBe(false);
  });

  it("recursively keeps CheckoutForm free of legacy catalog, promotion, provider, and server authority", () => {
    const pending = [checkoutFormPath];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const contents = source(current);
      expect(contents, `${current} process environment`).not.toMatch(/\bprocess\.env\b/u);

      for (const specifier of runtimeImportSpecifiers(contents)) {
        expect(
          checkoutClientAuthorityViolation(current, specifier),
          `${current} forbidden checkout client authority ${specifier}`,
        ).toBe(false);
        if (isLocalRuntimeSpecifier(specifier)) {
          pending.push(resolveRuntimeLocalImportForTest(current, specifier));
        }
      }
    }

    expect(visited).toContain(checkoutFormPath);
    expect(visited).toContain("src/commerce/checkout-identity.ts");
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

  it("allows an all-type named import without granting runtime authority", () => {
    const fixture = 'import { type Winter30PromotionView } from "@/catalog/storefront-promotion-banner";';

    expect(runtimeImportSpecifiers(fixture)).toEqual([]);
  });

  it.each([
    [
      "mixed named",
      'import { type Winter30PromotionView, selectWinter30PromotionView } from "@/catalog/storefront-promotion-banner";',
    ],
    [
      "default plus named type",
      'import promotionSelector, { type Winter30PromotionView } from "@/catalog/storefront-promotion-banner";',
    ],
    [
      "side effect",
      'import "@/catalog/storefront-promotion-banner";',
    ],
    [
      "multiline mixed named",
      `import {
        type Winter30PromotionView,
        selectWinter30PromotionView,
      } from "@/catalog/storefront-promotion-banner";`,
    ],
  ] as const)("detects and rejects a %s authoritative runtime import", (_label, fixture) => {
    const specifier = "@/catalog/storefront-promotion-banner";
    const runtimeSpecifiers = runtimeImportSpecifiers(fixture);

    expect(runtimeSpecifiers).toEqual([specifier]);
    expect(
      runtimeSpecifiers.filter((candidate) =>
        promotionBarAuthorityViolation(promotionBarPath, candidate)),
    ).toEqual([specifier]);
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
        expect(
          genericClientAuthorityViolation(specifier),
          `${path} forbidden client-safe graph authority ${specifier}`,
        ).toBe(false);
        expect(specifier, `${path} environment`).not.toMatch(/^@\/env(?:\/|$)/u);
        expect(specifier, `${path} database`).not.toMatch(/^@\/db(?:\/|$)/u);
        expect(specifier, `${path} checkout/provider`).not.toMatch(
          /checkout|stripe|payment-provider|provider-repositor/iu,
        );
      }
    }
  });

  it("recursively keeps the newsletter browser graph free of server, provider, PII-storage, cart, and checkout authority", () => {
    const pending = [newsletterClientPath];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const contents = source(current);
      expect(contents, `${current} server or secret authority`).not.toMatch(
        /server-only|process\.env|@\/env|@\/config|@\/db|resend|stripe|payment-provider|provider-repositor|cart-provider|checkout-service/iu,
      );
      expect(contents, `${current} browser persistence or logging`).not.toMatch(
        /localStorage|sessionStorage|document\.cookie|console\.(?:log|warn|error)/u,
      );
      for (const specifier of runtimeLocalImports(current)) {
        expect(
          genericClientAuthorityViolation(specifier),
          `${current} forbidden newsletter client authority ${specifier}`,
        ).toBe(false);
        pending.push(resolveRuntimeLocalImportForTest(current, specifier));
      }
    }

    expect(visited).toContain(newsletterClientPath);
    expect(visited).toContain("src/newsletter/contracts.ts");
    expect(visited).not.toContain("src/newsletter/server.ts");
  });

  it("keeps the pure storefront search core free of local runtime dependencies", () => {
    expect(runtimeLocalImports("src/search/storefront-search.ts")).toEqual([]);
  });

  it("bounds the scroll reveal controller to React, Next navigation, and browser APIs", () => {
    const contents = source(scrollRevealClientPath);

    expect(runtimeImportSpecifiers(contents)).toEqual(["react", "next/navigation"]);
    expect(runtimeLocalImports(scrollRevealClientPath)).toEqual([]);
    expect(contents).not.toMatch(
      /server-only|process\.env|@\/(?:content|catalog|cart|commerce|newsletter|config|env|db)|checkout|stripe|payment-provider|provider-repositor/iu,
    );
  });

  it("recursively bounds the launcher and Sheet to browser-safe search, href-policy, and UI code", () => {
    const pending: string[] = [...searchClientPaths];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const contents = source(current);
      expect(contents, `${current} environment`).not.toMatch(/\bprocess\.env\b/u);
      if (searchClientPaths.includes(current as typeof searchClientPaths[number])) {
        expect(contents, `${current} raw controlled content`).not.toMatch(
          /publicInformationRecords|getApprovedPublicInformation/iu,
        );
      }
      // Approved navigation copy may mention checkout. Authority is bounded by
      // imports, while provider/cart implementation names remain forbidden in
      // the browser graph itself.
      expect(contents, `${current} commerce authority`).not.toMatch(
        /stripe|payment-provider|provider-repositor|cart-provider/iu,
      );
      for (const specifier of runtimeImportSpecifiers(contents)) {
        expect(
          searchClientAuthorityViolation(current, specifier),
          `${current} forbidden search client authority ${specifier}`,
        ).toBe(false);
        if (isLocalRuntimeSpecifier(specifier)) {
          pending.push(resolveRuntimeLocalImportForTest(current, specifier));
        }
      }
    }

    const directRuntimeImports = searchClientPaths.flatMap((path) =>
      runtimeImportSpecifiers(source(path))
    );
    expect(directRuntimeImports).toContain("@/search/storefront-search");
    expect(directRuntimeImports).toContain("@/content/public-information");
    expect(directRuntimeImports).not.toContain("@/search/storefront-index");
    expect(directRuntimeImports).not.toContain(
      "@/content/storefront-public-content-server",
    );
    expect(directRuntimeImports).not.toContain("@/content/storefront-content");
    expect(visited.size).toBeGreaterThan(searchClientPaths.length);
    expect(visited).toContain("src/components/site/public-action-dock.tsx");
    expect(runtimeLocalImports("src/components/site/public-action-dock.tsx")).toEqual([]);
  });

  it.each([
    ["server-only content view", "@/content/storefront-public-content-server"],
    ["raw controlled content", "@/content/storefront-content"],
    ["server-only marker", "server-only"],
    ["environment", "@/env/runtime"],
    ["database", "@/db/runtime"],
    ["provider", "@/commerce/payment-provider"],
    ["cart", "@/cart/cart-provider"],
    ["checkout", "@/commerce/checkout-service"],
  ] as const)("rejects search-client runtime access to %s", (_label, specifier) => {
    expect(
      searchClientAuthorityViolation(searchClientPaths[0], specifier),
    ).toBe(true);
  });

  it("keeps catalog discovery data serializable and imports only the browser-safe core at runtime", () => {
    const explorerRuntimeImports = runtimeImportSpecifiers(
      source("src/components/commerce/catalog-explorer.tsx"),
    );

    expect(explorerRuntimeImports).toContain("@/search/storefront-search");
    expect(explorerRuntimeImports).not.toContain("@/search/catalog-discovery");
    for (const forbiddenImport of [
      "@/catalog/storefront-public-server",
      "@/search/storefront-index",
      "@/catalog/storefront-price-presentation",
    ]) {
      expect(explorerRuntimeImports).not.toContain(forbiddenImport);
    }
    expect(source("src/components/commerce/catalog-explorer.tsx")).not.toMatch(
      /\/api\/storefront-search|public-information|database|process\.env|stripe|checkout/iu,
    );
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
