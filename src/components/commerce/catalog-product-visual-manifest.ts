export const catalogIllustrationDisclosure =
  "AI-generated catalog illustration — not actual product photography.";

// Original generated masters, encoded once as sRGB WebP at quality 84 / effort 6.
const scenes = [
  ["front", "Front", "Straight-on studio composition.", "Illustrative view only.", "5164763c33c82d3db31a3fdf63fa248931c3843e823f65164a5924ff0fb525b3", "cb78b5bedeccb16c6bb620776f1a6c8d870059728c332a29b2bcdca0fa188779"],
  ["three-quarter", "Three-quarter", "An angled studio detail.", "Illustrative view only.", "7a06992f37dfbaca9f5c501615caadd7b49581607bed73556625e04d53d50a05", "4e278686c655b7bc803dcb94f6862d7f3bc5db7378e85a2bbf4fd0354a3a5882"],
  ["multi-vial-study", "Multi-vial study", "A three-vial studio composition.", "Pictured vial count does not indicate package quantity.", "864f0f27bdbef52fdbdf095957be182b2b684909c4a7bda7c8fe3a9daf376be8", "fdcb5dcf0b2884b1def2c8f12d8485de8456bf23ecd7e39b436747089e3568de"],
  ["copy-space-detail", "Copy-space detail", "An offset studio composition.", "Illustrative view only.", "72194dd2ebf65008729c867c9f59082255d06bde5849f79a052bc41f67b98218", "7f9af4a1d804afddbc501d3e421c3d651b4f3670365866f36c6c2f52ef1aece8"],
  ["overhead", "Overhead", "A top-down studio view.", "This illustration is not a scale reference.", "9e904bb1f308c6153992d739bf46e2541d6b116bfb900f81594715f7711ad6f5", "cea92ba0cf03f0eceb2a0f2af32a5622030ef38d589ebc420d695d6b32fe1be4"],
  ["ambient-studio", "Ambient studio", "A softly lit stone-surface composition.", "Illustrative view only.", "82e27fd60008638b48c0c6aad0f9471eac8c1ff583af764dd82610013e9d407f", "8601dec17f4b72abfdabd8da095ff4b1afe142b330c5d447ae81afb4a45f03bf"],
] as const;

export const catalogProductVisualManifest = Object.freeze(scenes.map(
  ([id, sceneLabel, caption, truthNote, inputSha256, outputSha256]) => Object.freeze({
    id, sceneLabel, caption, truthNote, inputSha256, outputSha256,
    src: `/catalog/visual-masters/${id}.webp`,
    width: 1254,
    height: 1254,
  }),
));

export type CatalogProductVisualScene = (typeof catalogProductVisualManifest)[number];

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
