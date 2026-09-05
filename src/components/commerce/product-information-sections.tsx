import { ExternalLink } from "lucide-react";

import type { PublicStorefrontContent } from "@/catalog/storefront-public";
import { projectPublicLiteratureReference } from "@/content/public-literature";

export function ProductInformationSections({
  records,
}: {
  records: readonly PublicStorefrontContent[];
}) {
  const visibleRecords = records.filter(
    (record) =>
      record.status === "approved" &&
      (record.kind === "product_information" || record.kind === "legal_notice"),
  );
  if (visibleRecords.length === 0) return null;

  return (
    <section
      aria-labelledby="product-information-heading"
      className="mt-12 border-t border-border pt-10"
    >
      <div className="max-w-2xl">
        <p className="eyebrow">Research catalog record</p>
        <h2
          className="mt-3 font-heading text-3xl text-ink"
          id="product-information-heading"
        >
          Product information
        </h2>
      </div>

      <div className="mt-7 grid gap-5">
        {visibleRecords.map((record) => {
          const references = record.literatureReferences.flatMap((reference) => {
            const projected = projectPublicLiteratureReference(reference.href);
            return projected === null ? [] : [projected];
          });
          return (
            <article className="info-record" key={record.id}>
              <h3 className="font-heading text-2xl text-ink">{record.title}</h3>
              <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-ink">
                {record.body}
              </p>
              {references.length > 0 ? (
                <ul className="mt-5 list-none space-y-3 p-0">
                  {references.map((reference) => (
                    <li key={reference.href}>
                      <a
                        aria-label={`Search PubMed for ${reference.term}`}
                        className="record-link inline-flex min-h-11 items-center gap-2"
                        href={reference.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span>External literature search</span>
                        <ExternalLink aria-hidden="true" className="size-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
