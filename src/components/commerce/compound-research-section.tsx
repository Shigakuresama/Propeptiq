import { ExternalLink } from "lucide-react";

import {
  compoundEvidenceContextLabels,
  compoundEvidenceLabels,
  compoundStudyDesignLabels,
  type PublicCompoundResearchEntry,
} from "@/content/compound-research-public";

export function CompoundResearchSection({
  research,
}: {
  research: PublicCompoundResearchEntry | null;
}) {
  if (!research || research.studies.length === 0) return null;

  return (
    <section
      aria-labelledby="verified-research-heading"
      className="mt-12 min-w-0 border-t border-border pt-10"
      id="research-references"
    >
      <div className="max-w-2xl">
        <p className="eyebrow">Primary literature</p>
        <h2 className="mt-3 font-heading text-3xl text-ink" id="verified-research-heading">
          Verified research references
        </h2>
        <p className="mt-4 leading-7 text-muted-ink">
          Primary-source bibliography for the named compound. These studies did not test this catalog item.
        </p>
        <p className="mt-4 text-sm font-medium text-accent-readable">
          {compoundEvidenceLabels[research.strongestEvidence]}
        </p>
      </div>

      <details className="record-panel mt-7 min-w-0">
        <summary className="min-h-11 cursor-pointer break-words px-4 py-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moss sm:px-6">
          <span className="font-heading text-2xl">{research.displayName}</span>
          <span className="mt-1 block text-sm text-muted-ink">
            {research.studies.length} verified {research.studies.length === 1 ? "reference" : "references"}
          </span>
        </summary>
        <div className="min-w-0 border-t border-border px-4 py-6 sm:px-6">
          {research.identityCaveat ? (
            <div className="info-record mb-6 break-words">
              <h3 className="text-sm font-semibold text-ink">Identity note</h3>
              <p className="mt-2 leading-7 text-muted-ink">{research.identityCaveat}</p>
            </div>
          ) : null}

          <ol className="m-0 list-none divide-y divide-border p-0">
            {research.studies.map((study) => (
              <li className="min-w-0 py-6 first:pt-0 last:pb-0" key={study.id}>
                <h3 className="font-heading text-xl leading-snug text-ink">
                  <a
                    className="record-link flex min-h-11 items-start gap-3 py-2 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moss"
                    href={study.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <span className="min-w-0">{study.title}</span>
                    <ExternalLink aria-hidden="true" className="mt-1 size-4 shrink-0" />
                  </a>
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-muted-ink">
                  {study.firstAuthor} · {study.year} · {study.journal}
                </p>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm leading-6 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="font-medium text-ink">Study design</dt>
                    <dd className="mt-1 break-words text-muted-ink">{compoundStudyDesignLabels[study.design]}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium text-ink">Research context</dt>
                    <dd className="mt-1 text-muted-ink">{compoundEvidenceContextLabels[study.evidenceContext]}</dd>
                  </div>
                  {study.sampleSize !== null ? (
                    <div className="min-w-0">
                      <dt className="font-medium text-ink">Sample size</dt>
                      <dd className="mt-1 text-muted-ink">{study.sampleSize} participants or samples</dd>
                    </div>
                  ) : null}
                  {study.population ? (
                    <div className="min-w-0">
                      <dt className="font-medium text-ink">Study population</dt>
                      <dd className="mt-1 break-words text-muted-ink">{study.population}</dd>
                    </div>
                  ) : null}
                  {study.duration ? (
                    <div className="min-w-0">
                      <dt className="font-medium text-ink">Duration</dt>
                      <dd className="mt-1 break-words text-muted-ink">{study.duration}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="mt-4 text-sm tabular-nums text-muted-ink">PMID: {study.pmid}</p>
                {study.doi ? (
                  <p className="mt-1 text-sm text-muted-ink [overflow-wrap:anywhere]">DOI: {study.doi}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </details>
      <p className="mt-6 max-w-prose text-sm leading-6 text-muted-ink">
        Bibliographic references do not establish the identity, purity, safety, effectiveness, or suitability of this catalog item and are not use guidance. For legitimate laboratory and research use only; not for human or veterinary use.
      </p>
    </section>
  );
}
