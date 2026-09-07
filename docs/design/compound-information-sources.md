# Compound information sources

Reviewed and retrieved: **2026-09-06**. This is a static public identity projection for all **56 owner catalog products**, with **26 PubChem molecular references**, **36 neutral identity descriptions**, and **9 blends with owner-listed constituents**. Missing molecular fields are intentional omissions, not placeholders or zero values.

## Scope and publication boundary

`src/content/compound-information.ts` is client-safe static data. It imports no research dataset, server-only module, provider configuration or secret, and makes no runtime network calls. The existing `content/compounds.json`, studies, claims audit and `compound-research` publication protections were not changed.

Names and blend constituent labels come from `src/catalog/browse-catalog.ts`. Additional reviewed research names and PubMed identity links come from `content/compounds.json` and its existing reviewed study IDs. Those names are navigation/identity references, not proof of catalog-lot equivalence. The projection excludes study methods, outcomes, benefit claims, routes, instructions, CAS numbers and inferred peptide lengths.

**Reference formula and molecular weight describe the cited database record, not the supplied lot.** They do not establish salt/counterion, hydration, redox form, sequence, formulation, concentration, purity, quality, approval or equivalence of the catalog material. The consuming section must present these as reference values and keep this distinction visible. `molecularWeight` is in g/mol and retains the exact precision returned by PubChem as a string.

## Verification method

Primary documentation: [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) and its [official Markdown documentation](https://pubchem.ncbi.nlm.nih.gov/pcfe/docs/markdown/pug-rest.md). Queries used complete-name matching, owner catalog names and existing reviewed display names/aliases. Sequential requests were spaced at least 420 ms apart, below the requested three requests/second cap. No dependency was added.

Each included CID was re-fetched through its property endpoint and synonyms endpoint. A unique API hit was not sufficient on its own: title, expanded identity, relevant form and known acronym collisions were reviewed. When a name returned several records, an independently established exact title was required. PubChem synonym lists were selectively reviewed; they were not copied wholesale because they can conflate forms or contain supplier labels.

The initial property request pattern was `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{URL-encoded-name}/property/MolecularFormula,MolecularWeight,Title/JSON?name_type=complete`. Direct property and synonym URLs below are the exact successfully retrieved sources. PubChem's description endpoint returned no description for most records; its PUG View description service returned 503. Neutral text uses the verified names/synonyms plus official summary descriptions where explicitly noted. No inaccessible description was inferred.

## Included molecular records

The table preserves the database title and returned values, including trailing zeros. All links are primary PubChem sources.

| Catalog slug | Reference title / CID | Formula | g/mol | Exact property and identity sources |
| --- | --- | --- | --- | --- |
| `tirzepatide` | [Tirzepatide · 156588324](https://pubchem.ncbi.nlm.nih.gov/compound/156588324) | `C225H348N48O68` | `4813` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/156588324/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/156588324/synonyms/JSON) |
| `nad-plus` | [Nadide · 5892](https://pubchem.ncbi.nlm.nih.gov/compound/5892) | `C21H27N7O14P2` | `663.4` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5892/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5892/synonyms/JSON) |
| `tesmorelin` | [Tesamorelin · 16137828](https://pubchem.ncbi.nlm.nih.gov/compound/16137828) | `C221H366N72O67S` | `5136` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16137828/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16137828/synonyms/JSON) |
| `bpc-157` | [Bpc-157 · 9941957](https://pubchem.ncbi.nlm.nih.gov/compound/9941957) | `C62H98N16O22` | `1419.5` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9941957/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9941957/synonyms/JSON) |
| `aod-9604` | [Aod-9604 · 71300630](https://pubchem.ncbi.nlm.nih.gov/compound/71300630) | `C78H123N23O23S2` | `1815.1` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/71300630/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/71300630/synonyms/JSON) |
| `mots-c` | [Mots-c · 146675088](https://pubchem.ncbi.nlm.nih.gov/compound/146675088) | `C101H152N28O22S2` | `2174.6` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/146675088/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/146675088/synonyms/JSON) |
| `selank` | [Selank · 11765600](https://pubchem.ncbi.nlm.nih.gov/compound/11765600) | `C33H57N11O9` | `751.9` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/11765600/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/11765600/synonyms/JSON) |
| `semax` | [ACTH (4-7), Pro-Gly-Pro- · 9811102](https://pubchem.ncbi.nlm.nih.gov/compound/9811102) | `C37H51N9O10S` | `813.9` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9811102/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9811102/synonyms/JSON) |
| `thymosin-alpha-1` | [Thymalfasin · 16130571](https://pubchem.ncbi.nlm.nih.gov/compound/16130571) | `C129H215N33O55` | `3108.3` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16130571/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16130571/synonyms/JSON) |
| `dsip` | [Delta Sleep-Inducing Peptide · 68816](https://pubchem.ncbi.nlm.nih.gov/compound/68816) | `C35H48N10O15` | `848.8` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/68816/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/68816/synonyms/JSON) |
| `ipamorelin` | [Ipamorelin · 9831659](https://pubchem.ncbi.nlm.nih.gov/compound/9831659) | `C38H49N9O5` | `711.9` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9831659/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/9831659/synonyms/JSON) |
| `cargrilintide` | [Cagrilintide · 171397054](https://pubchem.ncbi.nlm.nih.gov/compound/171397054) | `C194H312N54O59S2` | `4409` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/171397054/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/171397054/synonyms/JSON) |
| `oxytocin-acetate` | [Oxytocin acetate · 12004215](https://pubchem.ncbi.nlm.nih.gov/compound/12004215) | `C45H70N12O14S2` | `1067.2` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/12004215/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/12004215/synonyms/JSON) |
| `ll37` | [LL-37 · 16198951](https://pubchem.ncbi.nlm.nih.gov/compound/16198951) | `C205H340N60O53` | `4493` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16198951/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16198951/synonyms/JSON) |
| `glutathione` | [Glutathione · 124886](https://pubchem.ncbi.nlm.nih.gov/compound/124886) | `C10H17N3O6S` | `307.33` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/124886/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/124886/synonyms/JSON) |
| `ss-31` | [Elamipretide · 11764719](https://pubchem.ncbi.nlm.nih.gov/compound/11764719) | `C32H49N9O5` | `639.8` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/11764719/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/11764719/synonyms/JSON) |
| `5-amino-1mq` | [5-Amino-1-methylquinolinium · 950107](https://pubchem.ncbi.nlm.nih.gov/compound/950107) | `C10H11N2+` | `159.21` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/950107/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/950107/synonyms/JSON) |
| `pinealon` | [Glu-Asp-Arg · 10273502](https://pubchem.ncbi.nlm.nih.gov/compound/10273502) | `C15H26N6O8` | `418.40` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/10273502/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/10273502/synonyms/JSON) |
| `pe-22-28` | [L-Arginine, glycyl-L-valyl-L-seryl-L-tryptophylglycyl-L-leucyl- · 165437303](https://pubchem.ncbi.nlm.nih.gov/compound/165437303) | `C35H55N11O9` | `773.9` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/165437303/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/165437303/synonyms/JSON) |
| `ara-290` | [Cibinetide · 91810664](https://pubchem.ncbi.nlm.nih.gov/compound/91810664) | `C51H84N16O21` | `1257.3` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/91810664/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/91810664/synonyms/JSON) |
| `acetic-acid` | [Acetic Acid · 176](https://pubchem.ncbi.nlm.nih.gov/compound/176) | `C2H4O2` | `60.05` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/176/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/176/synonyms/JSON) |
| `semaglutide` | [Semaglutide · 56843331](https://pubchem.ncbi.nlm.nih.gov/compound/56843331) | `C187H291N45O59` | `4114` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/56843331/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/56843331/synonyms/JSON) |
| `epithalon` | [Epitalon · 219042](https://pubchem.ncbi.nlm.nih.gov/compound/219042) | `C14H22N4O9` | `390.35` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/219042/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/219042/synonyms/JSON) |
| `cjc-1295-with-dac` | [Cjc 1295 · 91971820](https://pubchem.ncbi.nlm.nih.gov/compound/91971820) | `C165H269N47O46` | `3647.2` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/91971820/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/91971820/synonyms/JSON) |
| `survodutide` | [Survodutide · 168429725](https://pubchem.ncbi.nlm.nih.gov/compound/168429725) | `C192H289N47O61` | `4232` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/168429725/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/168429725/synonyms/JSON) |
| `cartalax` | [Alanyl-glutamyl-aspartic acid · 87815447](https://pubchem.ncbi.nlm.nih.gov/compound/87815447) | `C12H19N3O8` | `333.29` | [Properties](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/87815447/property/MolecularFormula,MolecularWeight,Title/JSON), [synonyms](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/87815447/synonyms/JSON) |

### Match decisions and description provenance

- **tirzepatide:** Exact title Tirzepatide in CID 156588324, independently located in the official summary. The name API returned five other CIDs with equal formula/weight; no arbitrary first-result selection. Neutral peptide/diacid description comes from this summary.
- **nad-plus:** Reviewed expanded name and exact NAD+ query identify Nadide; preserves the reference protonation/form as returned.
- **tesmorelin:** Reviewed mapping from catalog Tesmorelin to Tesamorelin; original spelling retained. Not a claim of supplied-material equivalence.
- **bpc-157:** Exact BPC-157 title/name; Bepecin is present in the CID synonyms.
- **aod-9604:** Exact AOD-9604 name/title; punctuation alias AOD9604 is reviewed. Do not infer a supplied salt from depositor synonyms.
- **mots-c:** Exact name/title; neutral mitochondria-derived peptide wording is present in the CID synonyms.
- **selank:** Exact title; TP-7 is present in the CID synonyms.
- **semax:** Exact Semax synonym; title is ACTH (4-7), Pro-Gly-Pro-. No physiological claims copied.
- **thymosin-alpha-1:** Reviewed typography/name variants map to Thymalfasin; title and synonyms verified.
- **dsip:** Of two exact-name results, selects the record titled Delta Sleep-Inducing Peptide matching the reviewed full name; Emideltide is a recorded synonym.
- **ipamorelin:** Exact title; NNC-26-0161 is a recorded synonym. No supplier salt inferred.
- **cargrilintide:** Reviewed mapping from Cargrilintide to Cagrilintide; catalog spelling retained.
- **oxytocin-acetate:** Exact title and name. Synonyms specify monoacetate / acetate (1:1); profile explicitly limits values to that reference form.
- **ll37:** Reviewed LL-37 spelling matches exact title. Ropocamptide is a recorded synonym; no antimicrobial claim copied.
- **glutathione:** Exact title. Synonyms identify reduced glutathione; profile explicitly states that catalog naming does not establish redox form.
- **ss-31:** Exact SS-31 synonym maps to Elamipretide, consistent with reviewed aliases. MTP-131 also appears in the record.
- **5-amino-1mq:** Reviewed full name exactly matches the quinolinium ion. Formula includes charge, excludes an unestablished counterion; precision preserved.
- **pinealon:** Exact Pinealon synonym maps to Glu-Asp-Arg. Neutral expanded name is recorded; no supplier salt inferred.
- **pe-22-28:** Official search located PE 22-28 with whitespace replacing the first hyphen. CID synonym and properties verified; separate acetate CID 172871876 is explicitly distinguished.
- **ara-290:** Exact ARA-290 synonym maps to Cibinetide. Reference-name correspondence does not establish study-material or catalog-lot equivalence.
- **acetic-acid:** Exact name/title; ethanoic acid is a recorded synonym. Formula does not establish concentration of catalog material.
- **semaglutide:** Exact name/title; research identifiers copied only as neutral identifiers, not brands or approval claims.
- **epithalon:** Exact Epithalon synonym maps to Epitalon. Selective aliases exclude Epithalamin despite its presence among depositor synonyms; reviewed identity protections remain intact.
- **cjc-1295-with-dac:** Uses existing reviewed CJC-1295 alias and exact record; never reused for NO DAC or blend entries.
- **survodutide:** Among three same-properties results, selects the record with the exact title Survodutide, not either generic CID title.
- **cartalax:** Exact Cartalax synonym. Initial name request received 503; official summary located this CID, and direct properties/synonyms succeeded. Tripeptide classification is in PubChem’s ChEBI description.

The peptide/diacid wording for Tirzepatide was verified on the [official Tirzepatide summary](https://pubchem.ncbi.nlm.nih.gov/compound/Zepbound), which identifies CID 156588324. The Cartalax tripeptide statement is in the [CID description response](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/87815447/description/JSON), attributed there to ChEBI. Sermorelin acetate's neutral salt/peptide description is in its [official summary](https://pubchem.ncbi.nlm.nih.gov/compound/Sermorelin-Acetate). Retatrutide's identifiers are in the [Reference Collection substance record](https://pubchem.ncbi.nlm.nih.gov/substance/528343961). Pharmacology, medical indications and benefit statements from these pages are excluded.

## Owner-sourced blend identities

No blend is assigned the formula of one of its constituents. Abbreviations such as BPC, TB, GHK and IPA remain exactly as supplied; they are not automatically expanded to other catalog identities. Amounts are component labels from the source catalog, not use instructions.

| Catalog slug | Owner-listed constituents | Public amount handling |
| --- | --- | --- |
| `tesmorelin-ipa` | Tesmorelin 10 mg + IPA 3 mg | Both explicit amounts retained. |
| `bpc-tb-blend` | BPC 5 mg + TB 5 mg | Both explicit amounts retained. |
| `bpc-tb-blend-bb20` | BPC 10 mg + TB 10 mg | Both explicit amounts retained. |
| `bpc-tb-blend-bb40` | BPC 20 mg + TB 20 mg | Both explicit amounts retained. |
| `semax-selank` | Semax + Selank; total 20 mg | Individual amounts omitted because the source does not give a ratio. |
| `cjc-1295-no-dac-ipa` | CJC-1295 NO DAC 5 mg + IPA 5 mg | Both explicit amounts retained. |
| `cjc-1295-no-dac-ipa-cp20` | CJC-1295 NO DAC 10 mg + IPA 10 mg | Both explicit amounts retained. |
| `glow` | BBG50: GHK 35 mg + TB 5 mg + BPC 10 mg; BBG70: GHK 50 mg + TB 10 mg + BPC 10 mg | Names only in the static profile; amounts vary by selected variant. |
| `klow` | GHK 50 mg + KPV 10 mg + BPC 10 mg + TB 10 mg | All explicit amounts retained. |

## Remaining identities and intentional omissions

These 21 entries plus the nine blends account for all 30 profiles without a molecular reference. Failure to resolve a record in this review does not prove that no record exists. An unsupported expansion is omitted until evidence establishes it.

| Catalog slug | Evidence and decision |
| --- | --- |
| `retatrutide` | Reference Collection SID 528343961 supplies the exact identity and LY-3437943 / LY3437943 names but no discrete CID. IUPHAR substance SID 507750402 links a Triple G CID (171390338), whose current CID title/synonyms do not contain Retatrutide. That indirect structure is not assigned here. |
| `hgh` | Owner acronym only; no reviewed expanded identity or exact molecular form supplied. |
| `ghk-cu` | Exact name lookup returns six records with different copper stoichiometry/protonation, including CID 139035031 (C14H21CuN6O4-) and CID 133697840 (C28H48CuN12O8). Do not pick one arbitrarily. |
| `tb500` | Preserves exact owner label TB500 (Thymosin B4 acetate). Do not silently substitute a thymosin fragment or an unestablished salt composition. |
| `hcg` | Exact acronym lookup returns CID 4369448, delta-(L-alpha-Aminoadipoyl)-L-cysteinyl-glycine, an unrelated small-molecule acronym collision. Excluded; reviewed Human chorionic gonadotropin name retained. |
| `sermorelin-acetate` | Named Reference Collection SID 483927746 supports acetate-salt/peptide identity but has no discrete CID. GHRH(1-29) lookup gave a different molecular form (CID 16199244); parent sermorelin, acetate and hydrate records also differ. No formula assigned. |
| `pt-141` | Exact lookup returns Bremelanotide CID 9941379 and Bremelanotide Acetate CID 91971505 with different formulas/weights. Owner label does not choose the form. |
| `snap` | Owner trade/acronym label only; no reviewed expanded composition. |
| `li-po-c` | Owner label and volume only; no constituent recipe supplied. |
| `li-po-c-without-b12` | Owner distinguishes this label as without B12; no additional constituent recipe inferred. |
| `lemon-bottle` | Owner trade label and volume only; no molecular identity established. |
| `mt1` | Owner acronym and volume only; no expansion to a particular molecule assumed. |
| `mt2` | Owner acronym and mass only; no expansion to a particular molecule assumed. |
| `kisspeptin` | Owner family name does not specify a discrete molecular form or peptide length. |
| `igf-1-lr3` | Reviewed Long R3 IGF-I / Long [R3] insulin-like growth factor-I names retained. Exact candidates did not resolve to a CID; no generic IGF-I structure substituted. |
| `kpv` | Exact acronym query returns CID 13294447, 5-Phenyl-2-keto-valeric acid. Excluded as an unrelated acronym collision; retain reviewed research name KPV without an invented sequence. |
| `cjc-1295-no-dac` | Exact owner name did not resolve to a CID. No with-DAC molecular record reused and no unreviewed alias introduced. |
| `grp-2` | Preserves owner GRP-2 spelling. Do not silently change it to GHRP-2. |
| `vip` | Owner acronym only; no reviewed molecular form/species/length selected. |
| `admax` | Owner trade label only; no verified constituent identity. |
| `bac-water` | Owner laboratory label and volumes only; no preservative percentage, purity or composition inferred. |

Additional exact sources for the form decisions: [GHK-Cu name query](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/GHK-Cu/property/MolecularFormula,MolecularWeight,Title/JSON?name_type=complete), [PT-141 name query](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/PT-141/property/MolecularFormula,MolecularWeight,Title/JSON?name_type=complete), [HCG name query](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/hCG/property/MolecularFormula,MolecularWeight,Title/JSON?name_type=complete), [KPV name query](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/KPV/property/MolecularFormula,MolecularWeight,Title/JSON?name_type=complete), [Sermorelin acetate reference collection](https://pubchem.ncbi.nlm.nih.gov/substance/483927746), [PE 22-28 acetate](https://pubchem.ncbi.nlm.nih.gov/compound/172871876), and the [IUPHAR-deposited Retatrutide substance](https://pubchem.ncbi.nlm.nih.gov/substance/507750402).

## Reproduction and maintenance

1. Compare the exported slugs/names against `browseCatalogProducts`: exactly 56 entries, one profile per owner identity.
2. Fetch any linked property and synonym endpoint, then compare title, CID, formula and weight to that profile. Preserve the returned precision; do not reformat by inventing decimal places. Space requests by at least 420 ms and run them sequentially. Treat 404/503 as unresolved, never as permission to fabricate a replacement.
3. Check the match decision before changing an identity, especially salts, acronyms, blends and spelling mappings. New aliases require primary-source verification and must not bypass existing research publication protections.
4. Run `npx vitest run src/content/compound-information.test.ts` and scoped ESLint. Tests cover complete coverage, record binding, reference forms/precision, false acronym matches, blend ratios, valid primary links, neutral public copy and deep immutability. Tests perform no live external requests.
5. Browser verification belongs to the consuming section: labels must say reference molecule/reference values, source links must be usable, optional fields must be absent when unsupported, and narrow screens must wrap long molecular titles/formulas without overflow.
