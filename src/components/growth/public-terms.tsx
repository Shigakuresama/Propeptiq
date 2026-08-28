import type { Route } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/site/page-intro";
import type { CurrentGrowthTerms } from "@/growth/policies";

export function PublicTermsRecord({
  backHref,
  backLabel,
  terms,
  title,
  unavailableMessage,
}: Readonly<{
  backHref: Route;
  backLabel: string;
  terms: CurrentGrowthTerms | null;
  title: string;
  unavailableMessage: string;
}>) {
  return (
    <div className="site-container pb-20">
      <PageIntro
        eyebrow="Current server record"
        title={title}
        description="Only the current effective terms record is shown here."
      />
      {terms ? (
        <article className="record-sheet max-w-[76ch] p-6 sm:p-9">
          <p className="eyebrow">Version {terms.version}</p>
          <p className="mt-6 whitespace-pre-wrap text-base leading-8 text-ink">
            {terms.termsText}
          </p>
        </article>
      ) : (
        <p className="record-sheet text-base leading-7 text-muted-ink">
          {unavailableMessage}
        </p>
      )}
      <Link className="record-link mt-8 inline-flex min-h-11 items-center" href={backHref}>
        {backLabel}
      </Link>
    </div>
  );
}
