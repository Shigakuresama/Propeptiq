import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "@/catalog/browse-catalog";
import { scanPublicCopy } from "@/domain/content-policy";
import {
  compoundInformationProfiles,
  getCompoundInformation,
} from "./compound-information";

describe("public compound information", () => {
  it("covers each of the 56 owner identities exactly once and rejects unknown names", () => {
    expect(compoundInformationProfiles).toHaveLength(56);
    expect(compoundInformationProfiles.map(({ slug, name }) => ({ slug, name }))).toEqual(
      browseCatalogProducts.map(({ slug, name }) => ({ slug, name })),
    );
    expect(new Set(compoundInformationProfiles.map(({ slug }) => slug)).size).toBe(56);
    for (const slug of ["missing", "__proto__", "constructor", "Tirzepatide"]) {
      expect(getCompoundInformation(slug)).toBeNull();
    }
  });

  it("binds each molecular value to a specific PubChem record and valid source links", () => {
    const references = compoundInformationProfiles.flatMap((profile) =>
      profile.referenceMolecule ? [profile.referenceMolecule] : [],
    );
    expect(references).toHaveLength(26);
    for (const profile of compoundInformationProfiles) {
      for (const source of profile.sourceUrls) {
        const url = new URL(source);
        expect(url.protocol).toBe("https:");
        expect(["pubchem.ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov"]).toContain(url.hostname);
        if (url.hostname === "pubmed.ncbi.nlm.nih.gov") {
          expect(url.pathname).toMatch(/^\/[1-9][0-9]{6,8}\/$/u);
        }
      }
      const reference = profile.referenceMolecule;
      if (!reference) continue;
      expect(reference.sourceUrl).toBe(`https://pubchem.ncbi.nlm.nih.gov/compound/${reference.cid}`);
      expect(profile.sourceUrls).toContain(reference.sourceUrl);
      expect(reference.molecularFormula).toMatch(/^(?:[A-Z][a-z]?[0-9]*)+[+-]?$/u);
      expect(Number(reference.molecularWeight)).toBeGreaterThan(0);
    }
  });

  it("preserves reviewed record precision and distinguishes the recorded chemical forms", () => {
    expect(getCompoundInformation("tirzepatide")?.referenceMolecule).toMatchObject({
      cid: 156588324, name: "Tirzepatide", molecularFormula: "C225H348N48O68", molecularWeight: "4813",
    });
    expect(getCompoundInformation("pinealon")?.referenceMolecule).toMatchObject({
      cid: 10273502, molecularWeight: "418.40",
    });
    expect(getCompoundInformation("5-amino-1mq")?.referenceMolecule).toMatchObject({
      cid: 950107, molecularFormula: "C10H11N2+", molecularWeight: "159.21",
    });
    expect(getCompoundInformation("5-amino-1mq")?.description).toContain("counterion");
    expect(getCompoundInformation("oxytocin-acetate")?.referenceMolecule).toMatchObject({
      cid: 12004215, molecularFormula: "C45H70N12O14S2",
    });
    expect(getCompoundInformation("oxytocin-acetate")?.description).toContain("1:1");
    expect(getCompoundInformation("glutathione")?.description).toContain("reduced glutathione");
    expect(getCompoundInformation("glutathione")?.description).toContain("does not establish a redox form");
    expect(getCompoundInformation("pe-22-28")?.referenceMolecule?.cid).toBe(165437303);
  });

  it("omits unsupported formulas for acronym collisions, mixed forms and unresolved identities", () => {
    for (const slug of [
      "hcg", "hgh", "kpv", "ghk-cu", "pt-141", "sermorelin-acetate", "tb500",
      "retatrutide", "cjc-1295-no-dac", "igf-1-lr3", "snap", "li-po-c",
      "li-po-c-without-b12", "lemon-bottle", "mt1", "mt2", "kisspeptin",
      "grp-2", "vip", "admax", "bac-water",
    ]) {
      expect(getCompoundInformation(slug)?.referenceMolecule, slug).toBeUndefined();
    }
    expect(getCompoundInformation("hcg")?.alternateNames).toContain("Human chorionic gonadotropin");
    expect(getCompoundInformation("retatrutide")?.sourceUrls).toContain(
      "https://pubchem.ncbi.nlm.nih.gov/substance/528343961",
    );
    expect(getCompoundInformation("tesmorelin")?.referenceMolecule?.name).toBe("Tesamorelin");
    expect(getCompoundInformation("cargrilintide")?.referenceMolecule?.name).toBe("Cagrilintide");
    expect(getCompoundInformation("epithalon")?.alternateNames).not.toContain("Epithalamin");
  });

  it("uses the owner-listed blend components without inventing ratios or expanding abbreviations", () => {
    const blends = compoundInformationProfiles.filter((profile) => profile.constituents);
    expect(blends).toHaveLength(9);
    expect(blends.every((profile) => !profile.referenceMolecule)).toBe(true);
    expect(getCompoundInformation("bpc-tb-blend-bb40")?.constituents).toEqual([
      { name: "BPC", amountLabel: "20 mg" }, { name: "TB", amountLabel: "20 mg" },
    ]);
    expect(getCompoundInformation("tesmorelin-ipa")?.constituents).toEqual([
      { name: "Tesmorelin", amountLabel: "10 mg" }, { name: "IPA", amountLabel: "3 mg" },
    ]);
    expect(getCompoundInformation("glow")?.constituents).toEqual([
      { name: "GHK" }, { name: "TB" }, { name: "BPC" },
    ]);
    expect(getCompoundInformation("semax-selank")?.constituents).toEqual([
      { name: "Semax" }, { name: "Selank" },
    ]);
    expect(getCompoundInformation("klow")?.constituents).toEqual([
      { name: "GHK", amountLabel: "50 mg" }, { name: "KPV", amountLabel: "10 mg" },
      { name: "BPC", amountLabel: "10 mg" }, { name: "TB", amountLabel: "10 mg" },
    ]);
  });

  it("keeps the public projection neutral and deeply immutable", () => {
    expect(Object.isFrozen(compoundInformationProfiles)).toBe(true);
    for (const profile of compoundInformationProfiles) {
      expect(Object.keys(profile).every((key) => [
        "slug", "name", "alternateNames", "description", "constituents", "referenceMolecule", "sourceUrls",
      ].includes(key))).toBe(true);
      const result = scanPublicCopy({ text: JSON.stringify(profile), claims: [] }, {
        version: "source-reviewed-compound-identity-v1", activeLotEvidenceIds: [],
      });
      expect(result.publishable, `${profile.slug}: ${JSON.stringify(result.violations)}`).toBe(true);
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.alternateNames)).toBe(true);
      expect(Object.isFrozen(profile.sourceUrls)).toBe(true);
      if (profile.referenceMolecule) expect(Object.isFrozen(profile.referenceMolecule)).toBe(true);
      if (profile.constituents) {
        expect(Object.isFrozen(profile.constituents)).toBe(true);
        expect(profile.constituents.every(Object.isFrozen)).toBe(true);
      }
    }
  });
});
