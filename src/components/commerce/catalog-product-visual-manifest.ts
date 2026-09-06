export const catalogIllustrationDisclosure =
  "AI-generated catalog illustration — not actual product photography.";

export type CatalogProductVisualScene = Readonly<{
  id: string;
  sceneLabel: string;
  caption: string;
  truthNote: string;
  inputSha256: string;
  outputSha256: string;
  src: string;
  width: number;
  height: number;
}>;

// Original generated masters, encoded once as sRGB WebP at quality 84 / effort 6.
const scenes = [
  ["front", "Front", "Straight-on studio composition.", "Illustrative view only.", "5164763c33c82d3db31a3fdf63fa248931c3843e823f65164a5924ff0fb525b3", "cb78b5bedeccb16c6bb620776f1a6c8d870059728c332a29b2bcdca0fa188779"],
  ["three-quarter", "Three-quarter", "An angled studio detail.", "Illustrative view only.", "7a06992f37dfbaca9f5c501615caadd7b49581607bed73556625e04d53d50a05", "4e278686c655b7bc803dcb94f6862d7f3bc5db7378e85a2bbf4fd0354a3a5882"],
  ["multi-vial-study", "Multi-vial study", "A three-vial studio composition.", "Pictured vial count does not indicate package quantity.", "864f0f27bdbef52fdbdf095957be182b2b684909c4a7bda7c8fe3a9daf376be8", "fdcb5dcf0b2884b1def2c8f12d8485de8456bf23ecd7e39b436747089e3568de"],
  ["copy-space-detail", "Copy-space detail", "An offset studio composition.", "Illustrative view only.", "72194dd2ebf65008729c867c9f59082255d06bde5849f79a052bc41f67b98218", "7f9af4a1d804afddbc501d3e421c3d651b4f3670365866f36c6c2f52ef1aece8"],
  ["overhead", "Overhead", "A top-down studio view.", "This illustration is not a scale reference.", "9e904bb1f308c6153992d739bf46e2541d6b116bfb900f81594715f7711ad6f5", "cea92ba0cf03f0eceb2a0f2af32a5622030ef38d589ebc420d695d6b32fe1be4"],
  ["ambient-studio", "Ambient studio", "A softly lit stone-surface composition.", "Illustrative view only.", "82e27fd60008638b48c0c6aad0f9471eac8c1ff583af764dd82610013e9d407f", "8601dec17f4b72abfdabd8da095ff4b1afe142b330c5d447ae81afb4a45f03bf"],
] as const;

export const catalogProductVisualManifest: readonly CatalogProductVisualScene[] = Object.freeze(scenes.map(
  ([id, sceneLabel, caption, truthNote, inputSha256, outputSha256]) => Object.freeze({
    id, sceneLabel, caption, truthNote, inputSha256, outputSha256,
    src: `/catalog/visual-masters/${id}.webp`,
    width: 1254,
    height: 1254,
  }),
));

const productFronts = [
  ["bpc-157", "2bf1318c4c1dbc4ecc178489cc44ea7e47f259977e2eb4106eb0454842cd2a8b", "14962877a70be6667b17ca843100f99ccf2d3a88f89a0c595e66422969679893"],
  ["tirzepatide", "4cd6b2c1bb22846c7dd9d6e972f2d852b1c162781cc24fb550a3d1c17362bbbb", "236f9248340369ab8c898e3c98cee5b61ec15d3de0d50dc06fd37e775dbf4b51"],
  ["retatrutide", "f76a0b28116d2b928e62aee9c7cef8664e0186606c8b542d1993541b952160db", "498bb5fcada2c34b94bd6cd0078f44606d03f5652211648a47eb68e70db9ac38"],
  ["nad-plus", "8d9dc1a7f75871ec57fe3a25f1db30f03912ccf63c7c8844e3dd9e6292c812d0", "4d5669cc0200b78347a6f85d244f26e3175a51293d23282c9f500e5824dc47b8"],
  ["semax", "852571841f2bdc7384ef454d5272b82fbe4144851e94ea1e8b02f5dfbbd7645b", "e845ad20ac9843bd030a2ab83b0b78e39ecd910655852ecc1f6d4832882d580e"],
  ["selank", "abf3280ab817845ee3df65c3fbd800ce9701763d0ed7fa9e193d12f509ebceb7", "8749b8e5d79a72e43e25d5b95270c59f4cf961039d3f346dca7bcff28b47ed85"],
] as const;

export const catalogProductFrontVisuals: Readonly<Record<string, CatalogProductVisualScene>> =
  Object.freeze(Object.fromEntries(productFronts.map(([slug, inputSha256, outputSha256]) => [
    slug,
    Object.freeze({
      ...catalogProductVisualManifest[0]!,
      src: `/catalog/individual/${slug}/front-v1.webp`,
      width: 1254,
      height: 1254,
      inputSha256,
      outputSha256,
    }),
  ])));

const resolvedProductScenes = Object.freeze(Object.fromEntries(
  Object.entries(catalogProductFrontVisuals).map(([slug, front]) => [
    slug,
    Object.freeze([front, ...catalogProductVisualManifest.slice(1)]),
  ]),
)) as Readonly<Record<string, readonly CatalogProductVisualScene[]>>;

export function getCatalogProductVisualScenes(
  productSlug: string,
): readonly CatalogProductVisualScene[] {
  if (!Object.prototype.hasOwnProperty.call(catalogProductFrontVisuals, productSlug)) {
    return catalogProductVisualManifest;
  }
  return resolvedProductScenes[productSlug]!;
}

/** Stable visual identity only; never represents a lot, certification, or SKU. */
export function getCatalogVisualIdentity(slug: string, category: string) {
  let signature = 2166136261;
  for (const character of `${category}:${slug}`) {
    signature = Math.imul(signature ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const accents = ["moss", "teal", "ink"] as const;
  return Object.freeze({
    accent: accents[signature % accents.length]!,
    rulePositionPercent: 18 + (signature % 65),
    recordMark: `PQ-${signature.toString(36).toUpperCase()}`,
  });
}
