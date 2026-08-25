import { getPublicCatalog } from "@/catalog/server";
import { DemoNotice } from "@/components/site/demo-notice";
import { PageTransition } from "@/components/site/page-transition";
import { PublicHome } from "@/components/site/public-home";

export default async function HomePage() {
  const catalog = await getPublicCatalog();

  return (
    <PageTransition>
      {catalog.source === "synthetic-demo" ? <DemoNotice /> : null}
      <PublicHome catalog={catalog} />
    </PageTransition>
  );
}
