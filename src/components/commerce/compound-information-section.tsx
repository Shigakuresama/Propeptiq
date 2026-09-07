import { ExternalLink } from "lucide-react";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { getCompoundInformation } from "@/content/compound-information";

export function CompoundInformationSection({ product }: { product: PublicStorefrontProduct }) {
  const profile = getCompoundInformation(product.slug);
  if (!profile) return null;
  const molecule = profile.referenceMolecule;
  const sources = molecule ? [molecule.sourceUrl] : profile.sourceUrls.filter((url) => !url.includes("/rest/"));
  return <section aria-labelledby="compound-information-heading" className="compound-information mt-12 border-t border-border pt-8">
    <div className="min-w-0">
      <p className="eyebrow">Know your compound</p>
      <h2 id="compound-information-heading" className="mt-3 font-heading text-3xl text-ink">Compound information</h2>
      <p className="mt-4 font-semibold">{profile.name}</p>
      {profile.description ? <p className="mt-3 text-sm leading-6 text-muted-ink">{profile.description}</p> : null}
      {profile.alternateNames.length > 0 ? <p className="mt-3 text-sm leading-6 text-muted-ink">Research names: {profile.alternateNames.join(" · ")}</p> : null}
      {sources.length > 0 ? <ul className="mt-3 list-none">
        {sources.map((url) => <li key={url}><a className="record-link inline-flex min-h-11 items-center gap-2 text-sm" href={url} target="_blank" rel="noopener noreferrer">{url.includes("pubchem.ncbi.nlm.nih.gov") ? "Explore the PubChem record" : url.includes("pubmed.ncbi.nlm.nih.gov") ? "View the PubMed reference" : "View the identity source"} <ExternalLink aria-hidden="true" className="size-4" /></a></li>)}
      </ul> : null}
    </div>
    <div className="min-w-0">
      <dl className="compound-information__facts">
        <div className="compound-information__fact"><dt>Catalog identity</dt><dd>{product.sourceName}</dd></div>
        <div className="compound-information__fact"><dt>Intended use</dt><dd>Laboratory research</dd></div>
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
