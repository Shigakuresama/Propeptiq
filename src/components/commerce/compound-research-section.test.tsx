import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { publicCompoundResearch } from "@/content/compound-research";
import type { PublicCompoundResearchEntry } from "@/content/compound-research-public";

import { CompoundResearchSection } from "./compound-research-section";

function researchFor(slug: string): PublicCompoundResearchEntry {
  const research = publicCompoundResearch.compounds.find(
    (compound) => compound.productSlug === slug,
  );
  if (!research) throw new Error(`Missing approved test source: ${slug}`);
  return research;
}

describe("CompoundResearchSection", () => {
  it("renders a native disclosure and canonical PubMed citations without product-effect copy", () => {
    render(<CompoundResearchSection research={researchFor("tirzepatide")} />);

    const section = screen.getByRole("region", { name: "Verified research references" });
    expect(within(section).getByText(
      "Primary-source bibliography for the named compound. These studies did not test this catalog item.",
    )).toBeVisible();
    const summary = section.querySelector("summary");
    expect(summary).toHaveTextContent("Tirzepatide");
    expect(summary).toHaveTextContent("2 verified references");
    expect(section.querySelectorAll("details")).toHaveLength(1);
    expect(summary).not.toHaveAttribute("role");
    expect(summary).not.toHaveAttribute("aria-expanded");
    expect(within(section).getByText("Randomized human research included")).toBeVisible();
    fireEvent.click(summary!);

    const firstStudy = within(section).getByRole("link", {
      name: "Tirzepatide Once Weekly for the Treatment of Obesity.",
    });
    expect(firstStudy).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/35658024/");
    expect(firstStudy).toHaveAttribute("target", "_blank");
    expect(firstStudy).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(section).getByText("PMID: 35658024")).toBeVisible();
    expect(within(section).getByText("Jastreboff AM · 2022 · N Engl J Med")).toBeVisible();
    expect(within(section).getByText("DOI: 10.1056/NEJMoa2206038")).toBeVisible();
    expect(within(section).getAllByRole("link")).toHaveLength(2);
    expect(within(section).getAllByText(
      "Bibliographic references do not establish the identity, purity, safety, effectiveness, or suitability of this catalog item and are not use guidance. For legitimate laboratory and research use only; not for human or veterinary use.",
    )).toHaveLength(1);
  });

  it.each([
    "5-amino-1mq", "aod-9604", "bpc-157", "cargrilintide", "cjc-1295-with-dac",
    "ghk-cu", "hcg", "igf-1-lr3", "ipamorelin", "mots-c", "nad-plus",
    "retatrutide", "semaglutide", "sermorelin-acetate", "survodutide", "tesmorelin", "tirzepatide",
  ])("renders only the supplied bibliography for %s", (slug) => {
    const research = researchFor(slug);
    const { container } = render(<CompoundResearchSection research={research} />);
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(container.querySelector("summary")).toHaveTextContent(research.displayName);
    expect(container.querySelectorAll("a")).toHaveLength(research.studies.length);
    for (const link of container.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/[1-9][0-9]{6,8}\/$/u);
    }
  });

  it.each([
    ["human_meta", "Human evidence synthesis included"],
    ["human_rct", "Randomized human research included"],
    ["human_observational", "Human research included"],
    ["animal_only", "Animal research only"],
    ["in_vitro_only", "In vitro research only"],
  ] as const)("uses a neutral context label for %s", (strongestEvidence, label) => {
    // Test-only input exercises labels not present in the approved source set.
    render(<CompoundResearchSection research={{ ...researchFor("aod-9604"), strongestEvidence }} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it("shows the exact identity caveat and omits absent optional study fields", () => {
    const research = researchFor("cargrilintide");
    const { container } = render(<CompoundResearchSection research={research} />);
    fireEvent.click(container.querySelector("summary")!);
    expect(screen.getByText("Identity note")).toBeVisible();
    expect(screen.getByText(research.identityCaveat!)).toBeVisible();
    expect(screen.queryByText("Sample size")).toBeNull();
    expect(screen.queryByText("Duration")).toBeNull();
    expect(container).not.toHaveTextContent("null");
    expect(container).not.toHaveTextContent("undefined");
  });

  it("renders supplied sample metadata while ignoring private fields at runtime", () => {
    // Clearly fictional test-only metadata checks the projection consumer allowlist.
    const source = researchFor("retatrutide");
    const study = source.studies[0];
    if (!study) throw new Error("Missing approved test study");
    const research = {
      ...source,
      mechanism: "PRIVATE_MECHANISM_SENTINEL",
      benefitClaim: "PRIVATE_BENEFIT_SENTINEL",
      studies: [{
        ...study,
        sampleSize: 12,
        population: "Fictional laboratory study population",
        duration: "Fictional study duration",
        studiedAmount: "PRIVATE_AMOUNT_SENTINEL",
        route: "PRIVATE_ROUTE_SENTINEL",
        outcomeSummary: "PRIVATE_OUTCOME_SENTINEL",
        verificationStatus: "PRIVATE_VERIFICATION_SENTINEL",
        reviewedOn: "PRIVATE_REVIEW_SENTINEL",
      }],
    };
    const { container } = render(<CompoundResearchSection research={research} />);
    fireEvent.click(container.querySelector("summary")!);
    expect(screen.getByText("12 participants or samples")).toBeVisible();
    expect(screen.getByText("Fictional laboratory study population")).toBeVisible();
    expect(screen.getByText("Fictional study duration")).toBeVisible();
    expect(container.innerHTML).not.toMatch(/PRIVATE_|studiedAmount|outcomeSummary|verificationStatus|reviewedOn|benefitClaim/iu);
  });

  it("keeps essential bibliography in server HTML without JavaScript", () => {
    const html = renderToStaticMarkup(<CompoundResearchSection research={researchFor("aod-9604")} />);
    expect(html).toContain("<summary");
    expect(html).toContain("AOD-9604");
    expect(html).toContain("https://pubmed.ncbi.nlm.nih.gov/11146367/");
    expect(html).not.toContain("onclick");
  });

  it("omits a section for absent or empty references", () => {
    const { container, rerender } = render(<CompoundResearchSection research={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CompoundResearchSection research={{ ...researchFor("retatrutide"), studies: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
