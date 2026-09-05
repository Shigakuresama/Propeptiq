import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";

import {
  catalogProductVisualManifest,
  getCatalogVisualIdentity,
} from "./catalog-product-visual-manifest";

const expectedVisuals = [
  [
    "front",
    "Front",
    "/catalog/visual-masters/front.webp",
    "5164763c33c82d3db31a3fdf63fa248931c3843e823f65164a5924ff0fb525b3",
  ],
  [
    "three-quarter",
    "Three-quarter",
    "/catalog/visual-masters/three-quarter.webp",
    "7a06992f37dfbaca9f5c501615caadd7b49581607bed73556625e04d53d50a05",
  ],
  [
    "multi-vial-study",
    "Multi-vial study",
    "/catalog/visual-masters/multi-vial-study.webp",
    "864f0f27bdbef52fdbdf095957be182b2b684909c4a7bda7c8fe3a9daf376be8",
  ],
  [
    "copy-space-detail",
    "Copy-space detail",
    "/catalog/visual-masters/copy-space-detail.webp",
    "72194dd2ebf65008729c867c9f59082255d06bde5849f79a052bc41f67b98218",
  ],
  [
    "overhead",
    "Overhead",
    "/catalog/visual-masters/overhead.webp",
    "9e904bb1f308c6153992d739bf46e2541d6b116bfb900f81594715f7711ad6f5",
  ],
  [
    "ambient-studio",
    "Ambient studio",
    "/catalog/visual-masters/ambient-studio.webp",
    "82e27fd60008638b48c0c6aad0f9471eac8c1ff583af764dd82610013e9d407f",
  ],
] as const;

describe("catalog product visual manifest", () => {
  it("records the exact six ordered illustrative sources and immutable metadata", () => {
    expect(catalogProductVisualManifest).toHaveLength(6);
    expect(
      catalogProductVisualManifest.map((visual) => [
        visual.id,
        visual.sceneLabel,
        visual.src,
        visual.inputSha256,
      ]),
    ).toEqual(expectedVisuals);

    expect(Object.isFrozen(catalogProductVisualManifest)).toBe(true);
    for (const visual of catalogProductVisualManifest) {
      expect(visual).toMatchObject({ width: 1254, height: 1254 });
      expect(visual.caption.trim()).not.toBe("");
      expect(visual.truthNote.trim()).not.toBe("");
      expect(visual.outputSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(Object.isFrozen(visual)).toBe(true);
      const bytes = readFileSync(
        resolve(process.cwd(), `public${visual.src}`),
      );
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(visual.outputSha256);
    }

    const multiVial = catalogProductVisualManifest[2]!;
    expect(`${multiVial.caption} ${multiVial.truthNote}`).toMatch(
      /pictured vial count does not indicate package quantity/iu,
    );
    const overhead = catalogProductVisualManifest[4]!;
    expect(`${overhead.caption} ${overhead.truthNote}`).toMatch(
      /not a scale reference/iu,
    );
  });

  it("produces frozen, deterministic, collision-free signatures for all 56 products", () => {
    expect(storefrontCatalogData.products).toHaveLength(56);
    const forward = new Map(
      storefrontCatalogData.products.map((product) => [
        product.slug,
        getCatalogVisualIdentity(product.slug, product.category),
      ]),
    );
    const reverse = new Map(
      [...storefrontCatalogData.products].reverse().map((product) => [
        product.slug,
        getCatalogVisualIdentity(product.slug, product.category),
      ]),
    );

    expect(reverse).toEqual(forward);
    expect(
      new Set(
        [...forward.values()].map(
          (identity) =>
            `${identity.accent}|${identity.rulePositionPercent}|${identity.recordMark}`,
        ),
      ).size,
    ).toBe(56);
    for (const identity of forward.values()) {
      expect(Object.isFrozen(identity)).toBe(true);
      expect(identity.accent).toMatch(/^(?:moss|teal|ink)$/u);
      expect(identity.rulePositionPercent).toBeGreaterThanOrEqual(18);
      expect(identity.rulePositionPercent).toBeLessThanOrEqual(82);
      expect(identity.recordMark).toMatch(/^PQ-[A-Z0-9-]+$/u);
    }

    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/commerce/catalog-product-visual-manifest.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date|crypto/iu);
  });
});
