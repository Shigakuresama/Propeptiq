import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { resolveProductPhotograph } from "@/catalog/product-photography";

// Editorial choices; this order is not a popularity or sales ranking.
const editorialSlugs = ["retatrutide", "tesmorelin", "hgh"] as const;

export function TrendingProducts({ products }: { products: readonly PublicStorefrontProduct[] }) {
  const selected = editorialSlugs.flatMap((slug) => {
    const product = products.find((entry) => entry.slug === slug);
    return product ? [product] : [];
  });
  if (!selected.length) return null;
  return <aside className="trending-showcase" aria-labelledby="trending-products-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="trending-products-heading" className="text-sm font-semibold uppercase tracking-widest">Trending products</h2>
      <span className="text-xs font-medium text-accent-readable">Editorial selection</span>
    </div>
    <ul className="mt-5 list-none p-0">
      {selected.map((product, index) => {
        const photo = resolveProductPhotograph(product.slug);
        return <li key={product.slug} className="trending-showcase__item">
          <Link href={`/catalog/items/${product.slug}`} className="trending-showcase__link">
            <span className="text-xs font-semibold text-accent-readable" aria-hidden="true">0{index + 1}</span>
            {photo ? <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes="96px" className="size-24 object-contain" /> : null}
            <h3 className="min-w-0 font-heading text-2xl uppercase leading-tight">{product.name}</h3>
            <ArrowUpRight aria-hidden="true" className="ml-auto size-5 shrink-0" />
          </Link>
        </li>;
      })}
    </ul>
    <Link href="/catalog" className="record-link mt-5 inline-flex min-h-11 items-center text-sm">
      {products.length} products in the catalog <ArrowUpRight className="ml-2 size-4" aria-hidden="true" />
    </Link>
  </aside>;
}
