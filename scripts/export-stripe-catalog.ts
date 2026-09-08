import { writeFileSync } from 'node:fs';
import { browseCatalogProducts } from '../src/catalog/browse-catalog';
import { storefrontCatalogDecisionManifest } from '../src/catalog/storefront-catalog-manifest';
import { QUANTITY_TIERS } from '../src/domain/storefront-pricing';
import { WINTER30_STOREFRONT_PROMOTION } from '../src/config/storefront-promotions';

const [originValue, output] = process.argv.slice(2);
if (!originValue || !output) throw new Error('Provide HTTPS storefront origin and output path');
const origin = new URL(originValue);
if (origin.protocol !== 'https:' || !output) throw new Error('Provide HTTPS storefront origin and output path');
const products = storefrontCatalogDecisionManifest.variants.map(variant => {
  const product = browseCatalogProducts.find(item => item.slug === variant.browseSlug)!;
  return {
    variantId: variant.id, productId: variant.productId, sku: variant.sku,
    name: `${product.name} — ${variant.publicLabel}`, slug: variant.browseSlug,
    label: variant.publicLabel, packageQuantity: variant.packageQuantity,
    image: new URL(product.image.src, origin).href,
    priceMinor: variant.decisionStatus === 'approved_candidate' ? variant.baseUnitMinor : null,
    priceStatus: variant.decisionStatus,
  };
});
writeFileSync(output, JSON.stringify({schemaVersion:1, products, promotion:WINTER30_STOREFRONT_PROMOTION, quantityTiers:QUANTITY_TIERS}, null, 2));
console.log(JSON.stringify({variants:products.length, priced:products.filter(p=>p.priceMinor !== null).length}));
