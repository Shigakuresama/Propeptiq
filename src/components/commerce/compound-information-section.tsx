import { ExternalLink } from "lucide-react";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { getCompoundInformation } from "@/content/compound-information";

export function CompoundInformationSection({ product }: { product: PublicStorefrontProduct }) {
  const profile = getCompoundInformation(product.slug);
  if (!profile) return null;
  const molecule = profile.referenceMolecule;
  const sources = molecule ? [molecule.sourceUrl] : profile.sourceUrls.filter((url) => !url.includes("/rest/"));
  return <section aria-labelledby="compound-information-heading" className="compound-information mt-12 border-t border-border pt-8">
    <div className="compound-information__intro min-w-0">
      <p className="eyebrow">Know your compound</p>
      <h2 id="compound-information-heading" className="mt-3 font-heading text-3xl text-ink">Compound information</h2>
      <p className="mt-4 font-semibold">{profile.name}</p>
      {profile.description ? <p className="mt-3 text-sm leading-6 text-muted-ink">{profile.description}</p> : null}
      {sources.length > 0 ? (
        <details className="compound-information__references mt-5">
          <summary>
            <span>Identity references</span>{" "}
            <span className="compound-information__reference-count">{sources.length} {sources.length === 1 ? "source" : "sources"}</span>
          </summary>
          <ul>
            {sources.map((url) => (
              <li key={url}>
                <a className="record-link" href={url} target="_blank" rel="noopener noreferrer">
                  <span>{url.includes("pubchem.ncbi.nlm.nih.gov") ? "Explore the PubChem record" : url.includes("pubmed.ncbi.nlm.nih.gov") ? "View the PubMed reference" : "View the identity source"}</span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
    <div className="min-w-0">
      <dl className="compound-information__facts">
        <div className="compound-information__fact"><dt>Catalog identity</dt><dd>{product.sourceName}</dd></div>
        <div className="compound-information__fact"><dt>Intended use</dt><dd>Laboratory research</dd></div>
        {profile.alternateNames.length > 0 ? <div className="compound-information__fact"><dt>Research names</dt><dd>{profile.alternateNames.join(" · ")}</dd></div> : null}
        {molecule ? <>
          <div className="compound-information__fact"><dt>Reference molecule</dt><dd>{molecule.name}</dd></div>
          <div className="compound-information__fact"><dt>PubChem record</dt><dd>CID {molecule.cid}</dd></div>
          <div className="compound-information__fact"><dt>Molecular formula</dt><dd>{molecule.molecularFormula}</dd></div>
          <div className="compound-information__fact"><dt>Molecular weight</dt><dd>{molecule.molecularWeight} g/mol</dd></div>
        </> : null}
        {profile.constituents?.map((constituent) => <div className="compound-information__fact" key={constituent.name}><dt>Listed constituent</dt><dd>{constituent.name}{constituent.amountLabel ? ` · ${constituent.amountLabel}` : ""}</dd></div>)}
      </dl>
      {molecule ? <p className="mt-3 text-xs leading-5 text-muted-ink">Molecular data describe the reference compound in PubChem, not a laboratory analysis of this product or batch.</p> : null}
    </div>
  </section>;
}
