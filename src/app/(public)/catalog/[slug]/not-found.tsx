import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function CatalogRecordNotFound() {
  return (
    <div className="site-container py-20">
      <section className="empty-record">
        <p className="eyebrow">Catalog state</p>
        <h1 className="mt-4 font-heading text-page text-ink">Catalog record unavailable.</h1>
        <p className="mt-5 max-w-[62ch] leading-7 text-muted-ink">
          This slug does not identify an active public product record. Inactive and unknown records fail closed.
        </p>
        <Button asChild className="action-primary mt-7">
          <Link href="/catalog">Return to catalog</Link>
        </Button>
      </section>
    </div>
  );
}
