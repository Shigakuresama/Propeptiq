import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";

import {
  catalogProductFrontVisuals,
  catalogProductVisualManifest,
  getCatalogProductVisualScenes,
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

const expectedCanonicalProductSlugs = [
  "5-amino-1mq",
  "acetic-acid",
  "admax",
  "aod-9604",
  "ara-290",
  "bac-water",
  "bpc-157",
  "bpc-tb-blend",
  "bpc-tb-blend-bb20",
  "bpc-tb-blend-bb40",
  "cargrilintide",
  "cartalax",
  "cjc-1295-no-dac",
  "cjc-1295-no-dac-ipa",
  "cjc-1295-no-dac-ipa-cp20",
  "cjc-1295-with-dac",
  "dsip",
  "epithalon",
  "ghk-cu",
  "glow",
  "glutathione",
  "grp-2",
  "hcg",
  "hgh",
  "igf-1-lr3",
  "ipamorelin",
  "kisspeptin",
  "klow",
  "kpv",
  "lemon-bottle",
  "li-po-c",
  "li-po-c-without-b12",
  "ll37",
  "mots-c",
  "mt1",
  "mt2",
  "nad-plus",
  "oxytocin-acetate",
  "pe-22-28",
  "pinealon",
  "pt-141",
  "retatrutide",
  "selank",
  "semaglutide",
  "semax",
  "semax-selank",
  "sermorelin-acetate",
  "snap",
  "ss-31",
  "survodutide",
  "tb500",
  "tesmorelin",
  "tesmorelin-ipa",
  "thymosin-alpha-1",
  "tirzepatide",
  "vip",
] as const;

const originalProductFronts = {
  "bpc-157": [
    "2bf1318c4c1dbc4ecc178489cc44ea7e47f259977e2eb4106eb0454842cd2a8b",
    "14962877a70be6667b17ca843100f99ccf2d3a88f89a0c595e66422969679893",
  ],
  tirzepatide: [
    "4cd6b2c1bb22846c7dd9d6e972f2d852b1c162781cc24fb550a3d1c17362bbbb",
    "236f9248340369ab8c898e3c98cee5b61ec15d3de0d50dc06fd37e775dbf4b51",
  ],
  retatrutide: [
    "f76a0b28116d2b928e62aee9c7cef8664e0186606c8b542d1993541b952160db",
    "498bb5fcada2c34b94bd6cd0078f44606d03f5652211648a47eb68e70db9ac38",
  ],
  "nad-plus": [
    "8d9dc1a7f75871ec57fe3a25f1db30f03912ccf63c7c8844e3dd9e6292c812d0",
    "4d5669cc0200b78347a6f85d244f26e3175a51293d23282c9f500e5824dc47b8",
  ],
  semax: [
    "852571841f2bdc7384ef454d5272b82fbe4144851e94ea1e8b02f5dfbbd7645b",
    "e845ad20ac9843bd030a2ab83b0b78e39ecd910655852ecc1f6d4832882d580e",
  ],
  selank: [
    "abf3280ab817845ee3df65c3fbd800ce9701763d0ed7fa9e193d12f509ebceb7",
    "8749b8e5d79a72e43e25d5b95270c59f4cf961039d3f346dca7bcff28b47ed85",
  ],
} as const;

const alternateProductSlugs = [
  "bpc-157",
  "tirzepatide",
  "retatrutide",
  "nad-plus",
  "semax",
  "selank",
] as const;
const alternateSceneIds = [
  "three-quarter",
  "multi-vial-study",
  "copy-space-detail",
  "overhead",
  "ambient-studio",
] as const;

describe("catalog product visual manifest", () => {
  it("resolves the exact 30 product-specific alternate assets while retaining 50 shared tails", async () => {
    const receipt = JSON.parse(readFileSync(resolve(
      process.cwd(),
      ".superpowers/sdd/2026-09-04-propeptiq-storefront-completion/task-4e-asset-receipt.json",
    ), "utf8")) as { assets: Array<{
      slug: string;
      scene: string;
      src: string;
      width: number;
      height: number;
      inputSha256: string;
      outputSha256: string;
      bytes: number;
    }> };
    expect(receipt.assets).toHaveLength(30);
    expect([...new Set(receipt.assets.map(({ slug }) => slug))]).toEqual([...alternateProductSlugs]);
    expect(new Set(receipt.assets.map(({ src }) => src))).toHaveLength(30);
    expect(new Set(receipt.assets.map(({ outputSha256 }) => outputSha256))).toHaveLength(30);

    for (const slug of alternateProductSlugs) {
      const expected = receipt.assets.filter((asset) => asset.slug === slug);
      expect(expected.map(({ scene }) => scene)).toEqual([...alternateSceneIds]);
      const resolved = getCatalogProductVisualScenes(slug);
      expect(resolved[0]).toBe(catalogProductFrontVisuals[slug]);
      expect(resolved.slice(1).map(({ id }) => id)).toEqual([...alternateSceneIds]);
      expect(resolved.slice(1).map(({ src }) => src)).toEqual(
        alternateSceneIds.map((scene) => `/catalog/individual/${slug}/${scene}-v1.webp`),
      );
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(getCatalogProductVisualScenes(slug)).toBe(resolved);

      for (const [index, expectedAsset] of expected.entries()) {
        const scene = resolved[index + 1]!;
        expect(scene).toMatchObject({
          id: expectedAsset.scene,
          src: expectedAsset.src,
          width: expectedAsset.width,
          height: expectedAsset.height,
          inputSha256: expectedAsset.inputSha256,
          outputSha256: expectedAsset.outputSha256,
        });
        expect(Object.isFrozen(scene)).toBe(true);
        const bytes = readFileSync(resolve(process.cwd(), `public${scene.src}`));
        expect(bytes).toHaveLength(expectedAsset.bytes);
        expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedAsset.outputSha256);
        expect(await sharp(bytes).metadata()).toMatchObject({
          format: "webp",
          width: 1254,
          height: 1254,
        });
      }
    }

    const sharedTailSlugs = expectedCanonicalProductSlugs.filter(
      (slug) => !alternateProductSlugs.includes(slug as (typeof alternateProductSlugs)[number]),
    );
    expect(sharedTailSlugs).toHaveLength(50);
    for (const slug of sharedTailSlugs) {
      expect(getCatalogProductVisualScenes(slug).slice(1)).toEqual(catalogProductVisualManifest.slice(1));
    }
  });

  it("resolves exact immutable fronts for all 56 canonical products without mutating the shared scene tail", async () => {
    const mappedSlugs = Object.keys(catalogProductFrontVisuals).sort();
    const expectedCatalogSlugs = storefrontCatalogData.products
      .map((product) => product.slug)
      .sort();
    const expectedMappedSources = Object.fromEntries(
      expectedCanonicalProductSlugs.map((slug) => [
        slug,
        `/catalog/individual/${slug}/front-v1.webp`,
      ]),
    );

    expect(mappedSlugs).toEqual([...expectedCanonicalProductSlugs]);
    expect(expectedCatalogSlugs).toEqual([...expectedCanonicalProductSlugs]);
    expect(new Set(Object.values(expectedMappedSources))).toHaveLength(56);
    expect(new Set(Object.values(catalogProductFrontVisuals).map((front) => front.src))).toHaveLength(56);
    expect(new Set(Object.values(catalogProductFrontVisuals).map((front) => front.outputSha256))).toHaveLength(56);
    expect(Object.isFrozen(catalogProductFrontVisuals)).toBe(true);
    for (const [slug, expectedSource] of Object.entries(expectedMappedSources)) {
      const resolved = getCatalogProductVisualScenes(slug);
      expect(resolved).toHaveLength(6);
      expect(resolved[0]).toMatchObject({ id: "front", src: expectedSource });
      if (!alternateProductSlugs.includes(slug as (typeof alternateProductSlugs)[number])) {
        expect(resolved.slice(1)).toEqual(catalogProductVisualManifest.slice(1));
      }
      expect(Object.isFrozen(resolved)).toBe(true);
      expect(Object.isFrozen(resolved[0])).toBe(true);
      expect(getCatalogProductVisualScenes(slug)).toEqual(resolved);
      expect(storefrontCatalogData.products.some((product) => product.slug === slug)).toBe(true);
      const bytes = readFileSync(resolve(process.cwd(), `public${expectedSource}`));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        resolved[0]!.outputSha256,
      );
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: "webp",
        width: resolved[0]!.width,
        height: resolved[0]!.height,
      });
    }

    for (const [slug, [inputSha256, outputSha256]] of Object.entries(originalProductFronts)) {
      expect(catalogProductFrontVisuals[slug]).toMatchObject({ inputSha256, outputSha256 });
    }

    const unmapped = getCatalogProductVisualScenes("fictional-unpublished-product");
    expect(unmapped).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("constructor")).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("toString")).toBe(catalogProductVisualManifest);
    expect(getCatalogProductVisualScenes("__proto__")).toBe(catalogProductVisualManifest);
  });

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
