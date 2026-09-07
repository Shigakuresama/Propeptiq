import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  findPublicStorefrontProduct,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

import { CompoundInformationSection } from "./compound-information-section";

const catalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});

function productFor(slug: string) {
  const product = findPublicStorefrontProduct(catalog, slug);
  if (!product) throw new Error(`Missing source catalog product: ${slug}`);
  return product;
}

function facts(section: HTMLElement) {
  return [...section.querySelectorAll("dt")].map((term) => ({
    label: term.textContent,
    value: term.nextElementSibling?.textContent,
  }));
}

describe("CompoundInformationSection", () => {
  it("keeps the factual overview and molecular caveat visible with native references collapsed", () => {
    const product = productFor("tirzepatide");
    render(<CompoundInformationSection product={product} />);
    const section = screen.getByRole("region", { name: "Compound information" });
    expect(within(section).getByText(
      "The Tirzepatide reference describes a synthetic peptide conjugated to a fatty diacid group.",
    )).toBeVisible();
    expect(facts(section)).toEqual([
      { label: "Catalog identity", value: product.sourceName },
      { label: "Intended use", value: "Laboratory research" },
      { label: "Reference molecule", value: "Tirzepatide" },
      { label: "PubChem record", value: "CID 156588324" },
      { label: "Molecular formula", value: "C225H348N48O68" },
      { label: "Molecular weight", value: "4813 g/mol" },
    ]);
    expect(within(section).getByText(
      "Molecular data describe the reference compound in PubChem, not a laboratory analysis of this product or batch.",
    )).toBeVisible();
    const disclosure = section.querySelector("details")!;
    const summary = disclosure.querySelector("summary")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(summary).toHaveTextContent("Identity references 1 source");
    expect(summary).not.toHaveAttribute("role");
    expect(summary).not.toHaveAttribute("aria-expanded");
    expect(disclosure.querySelector("a")).not.toBeVisible();
    fireEvent.click(summary);
    const reference = within(section).getByRole("link", { name: "Explore the PubChem record" });
    expect(reference).toBeVisible();
    expect(reference).toHaveAttribute("href", "https://pubchem.ncbi.nlm.nih.gov/compound/156588324");
    expect(reference).toHaveAttribute("target", "_blank");
    expect(reference).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("retains research names and every existing source for an ambiguous molecular identity", () => {
    render(<CompoundInformationSection product={productFor("ghk-cu")} />);
    const section = screen.getByRole("region", { name: "Compound information" });
    expect(within(section).getByText(
      "Copper tripeptide complex is a reviewed research name associated with GHK-Cu. PubChem indexes several different copper complexes under this name.",
    )).toBeVisible();
    expect(within(section).getByText("Research names").nextElementSibling).toHaveTextContent("Copper tripeptide complex");
    expect(within(section).queryByText("Molecular formula")).toBeNull();
    const disclosure = section.querySelector("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(disclosure.querySelector("summary")).toHaveTextContent("3 sources");
    expect([...disclosure.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://pubchem.ncbi.nlm.nih.gov/compound/139035031",
      "https://pubchem.ncbi.nlm.nih.gov/compound/133697840",
      "https://pubmed.ncbi.nlm.nih.gov/16847171/",
    ]);
  });

  it("preserves listed blend amounts without inventing molecular data or an empty disclosure", () => {
    const product = productFor("bpc-tb-blend");
    render(<CompoundInformationSection product={product} />);
    const section = screen.getByRole("region", { name: "Compound information" });
    expect(facts(section)).toEqual([
      { label: "Catalog identity", value: product.sourceName },
      { label: "Intended use", value: "Laboratory research" },
      { label: "Listed constituent", value: "BPC · 5 mg" },
      { label: "Listed constituent", value: "TB · 5 mg" },
    ]);
    expect(section.querySelector("details")).toBeNull();
  });

  it("preserves reference links in server HTML without requiring JavaScript to expand them", () => {
    const html = renderToStaticMarkup(<CompoundInformationSection product={productFor("retatrutide")} />);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("https://pubchem.ncbi.nlm.nih.gov/substance/528343961");
    expect(html).toContain("https://pubmed.ncbi.nlm.nih.gov/37366315/");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/u);
    expect(html).not.toContain("onclick");
  });
});
