import { getPublicBrowseCatalog } from "@/catalog/browse-catalog-server";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";

export default async function HomePage() {
  const catalog = await getPublicBrowseCatalog();

  return (
    <PageTransition>
      <PublicHome products={catalog.products} variantCount={catalog.variantCount} />
    </PageTransition>
  );
}
