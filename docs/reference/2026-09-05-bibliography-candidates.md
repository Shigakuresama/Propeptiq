# Bibliography candidates — September 5, 2026

**Status: internally researched candidates; not yet published.** This note is a source-verification packet for a separate content release. It does not approve a product claim, establish product equivalence, or change the public bibliography.

**Reviewed on:** 2026-09-05. **Repository observation:** `19d3f2d8850847df8ae0b243192059393f9d27a9` on `feat/mobile-purchase-dock`; concurrent work was preserved.

At inspection, the canonical catalog generated from `src/catalog/browse-catalog.ts` and the decision manifest contained 56 products. `content/compounds.json` mapped 17 compounds, `content/studies.json` contained 27 unique PMIDs, and `content/claims-audit.json` contained no claims. Thirty-nine products remained unmapped. The six PMIDs below are not among the existing 27. **This documentation addition does not expand the published 17-compound/27-study coverage.**

## Verification method and limits

- Queried primary PubMed and publisher records with web search and page retrieval; did not use vendor copy, aggregators, or generated summaries as scientific authority.
- Retrieved the six selected PubMed records in one request to the [NCBI EFetch endpoint](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=23168581,24136731,33077895,37268435,35713670,39814420&retmode=xml). The response was **HTTP 200** and contained all six exact PMID records, their titles, first authors, journal publication dates, publication types, and DOI metadata.
- Direct DOI redirects did not produce verified publisher resolution in this environment: five were rejected by the browser tool's URL-safety handling and the Neurology DOI returned HTTP 403. Therefore, the confirmed resolver evidence is **PMID retrieval**, not six successful DOI resolutions. DOI strings below were confirmed in NCBI metadata.
- The Dahan publisher page resolved directly at Springer. The Thompson publisher page also returned article content, while PMC full-text search excerpts supplied the explicit SS-31/elamipretide naming relationship and study-method context. Some direct PubMed/PMC page opens returned empty or browser-challenge responses; those failures are not presented as successful full-text retrievals.
- This is a bounded six-study candidate review, not a systematic literature review. No implication is made that these are the only relevant records or that a randomized design establishes a positive result.
- No product formulation, sequence, salt/form, excipients, manufacturing specifications, purity, storage conditions, or study-material equivalence was verified. No benefit claims, dosing instructions, administration recommendations, or legal copy are supplied.

## Candidate 1 — ARA-290

Proposed exact join: compound ID `ara-290` → existing catalog slug `ara-290`. Both papers explicitly name ARA 290. The 2013 publisher text describes an 11-amino-acid peptide derived from erythropoietin's structure; this does not make it erythropoietin or establish the identity of PropeptIQ's material. [Primary publisher record](https://link.springer.com/article/10.2119/molmed.2013.00122)

### PMID 23168581

- **Title:** Safety and efficacy of ARA 290 in sarcoidosis patients with symptoms of small fiber neuropathy: a randomized, double-blind pilot study.
- **Authors / publication:** Heij L et al.; *Molecular Medicine* (`Mol Med`), 2012, volume 18, pages 1430–1436.
- **Identifiers:** PMID `23168581`; DOI `10.2119/molmed.2012.00332`.
- **Primary URL:** <https://pubmed.ncbi.nlm.nih.gov/23168581/>
- **Study context:** Human randomized, double-blind, placebo-controlled exploratory trial; 22 participants with sarcoidosis and symptoms of small-fiber neuropathy. The study used an intravenous route; this is study metadata, not product-use guidance.
- **Interpretation limit:** Small pilot with multiple symptom and functional measures. Findings varied by measure; the paper must not be reduced to a general efficacy or safety claim for the catalog product.

### PMID 24136731

- **Title:** ARA 290 improves symptoms in patients with sarcoidosis-associated small nerve fiber loss and increases corneal nerve fiber density.
- **Authors / publication:** Dahan A et al.; *Molecular Medicine* (`Mol Med`), 2013, volume 19, pages 334–345.
- **Identifiers:** PMID `24136731`; DOI `10.2119/molmed.2013.00122`.
- **Primary URLs:** [PubMed](https://pubmed.ncbi.nlm.nih.gov/24136731/); [publisher](https://link.springer.com/article/10.2119/molmed.2013.00122).
- **Study context:** Human randomized, blinded, placebo-controlled, single-site study; 38 participants with sarcoidosis and neuropathy symptoms. The study used a subcutaneous route; no product-use recommendation follows.
- **Interpretation limit:** Specific diseased population and measured endpoints; skin and corneal findings are not interchangeable. The paper title is a bibliographic title, not an endorsed PropeptIQ claim.

## Candidate 2 — SS-31

Proposed exact join: compound ID `ss-31` → existing catalog slug `ss-31`; candidate alternate name `elamipretide`. The Thompson paper explicitly identifies SS-31 as elamipretide and supplies its peptide structure. That literature relationship does not verify the sequence, chemical form, quality, or formulation of the catalog vial. [Primary full-text record](https://pmc.ncbi.nlm.nih.gov/articles/PMC7935714/)

### PMID 33077895

- **Title, abbreviated:** A phase 2/3 randomized clinical trial followed by an open-label extension to evaluate the effectiveness of elamipretide in Barth syndrome… The full bibliographic title was returned by NCBI and remains available at the primary URLs below.
- **Authors / publication:** W Reid Thompson et al.; *Genetics in Medicine* (`Genet Med`), 2021, volume 23, pages 471–478; electronically published October 20, 2020. NCBI's structured first-author name is `Reid Thompson W`; do not silently shorten the surname.
- **Identifiers:** PMID `33077895`; DOI `10.1038/s41436-020-01006-8`.
- **Primary URLs:** [PubMed](https://pubmed.ncbi.nlm.nih.gov/33077895/); [publisher](https://www.nature.com/articles/s41436-020-01006-8); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7935714/).
- **Study context:** Human randomized, double-blind, placebo-controlled crossover trial followed by an open-label extension; 12 male participants with genetically confirmed Barth syndrome. The study used a subcutaneous route.
- **Interpretation limit:** Neither primary endpoint was met in the randomized phase. Findings from the later open-label extension must not be presented as randomized evidence or generalized to the catalog product.

### PMID 37268435

- **Title:** Efficacy and Safety of Elamipretide in Individuals With Primary Mitochondrial Myopathy: The MMPOWER-3 Randomized Clinical Trial.
- **Authors / publication:** Karaa A et al.; *Neurology*, 2023, volume 101, pages e238–e252.
- **Identifiers:** PMID `37268435`; DOI `10.1212/WNL.0000000000207402`.
- **Primary URLs:** [PubMed](https://pubmed.ncbi.nlm.nih.gov/37268435/); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10382259/).
- **Study context:** Human phase-three randomized, double-blind, placebo-controlled trial; 218 participants with genetically confirmed primary mitochondrial myopathy. The study used a subcutaneous route.
- **Interpretation limit:** The primary walking-distance and fatigue endpoints were not met. A neutral bibliography must not imply a demonstrated general benefit or replace the trial result with favorable post-hoc subgroup findings.

## Candidate 3 — Thymosin Alpha-1

Proposed exact join: compound ID `thymosin-alpha-1` → existing catalog slug `thymosin-alpha-1`. The studies explicitly name thymosin alpha 1 / thymosin α1. This naming correspondence does not prove equivalence of study drug and catalog material.

### PMID 35713670

- **Title:** Immune enhancement in patients with predicted severe acute necrotising pancreatitis: a multicentre double-blind randomised controlled trial.
- **Authors / publication:** Ke L et al.; *Intensive Care Medicine* (`Intensive Care Med`), 2022, volume 48, pages 899–909.
- **Identifiers:** PMID `35713670`; DOI `10.1007/s00134-022-06745-7`.
- **Primary URL:** <https://pubmed.ncbi.nlm.nih.gov/35713670/>
- **Study context:** Human multicentre randomized, double-blind, placebo-controlled trial; 508 participants with predicted severe acute necrotising pancreatitis. The study used a subcutaneous route.
- **Interpretation limit:** The trial did not demonstrate improvement in its primary infected-pancreatic-necrosis endpoint. It is not substantiation of an immune-support or other marketing claim for this storefront.

### PMID 39814420

- **Title:** The efficacy and safety of thymosin α1 for sepsis (TESTS): multicentre, double blinded, randomised, placebo controlled, phase 3 trial.
- **Authors / publication:** Wu J et al.; *BMJ*, 2025, volume 388, article e082583.
- **Identifiers:** PMID `39814420`; DOI `10.1136/bmj-2024-082583`.
- **Primary URLs:** [PubMed](https://pubmed.ncbi.nlm.nih.gov/39814420/); [publisher](https://www.bmj.com/content/388/bmj-2024-082583).
- **Study context:** Human phase-three randomized, double-blind, placebo-controlled trial; 1,106 randomized adults with sepsis, with 1,089 included in the modified intention-to-treat analysis. The study used a subcutaneous route.
- **Interpretation limit:** No clear reduction in the primary mortality outcome was demonstrated. Retain the correction below and do not reuse outdated statistics from the original abstract or an earlier indexed copy.

### Linked correction — not an additional study

- **Record type:** Published erratum to PMID `39814420`; no authors listed.
- **Identifiers / publication:** PMID `40447307`; DOI `10.1136/bmj.r1098`; *BMJ*, 2025, volume 389, article r1098, published May 30, 2025.
- **Primary URLs:** [PubMed correction record](https://pubmed.ncbi.nlm.nih.gov/40447307/); [publisher correction](https://www.bmj.com/content/389/bmj.r1098).
- **Verified relevance:** The publisher correction explains that survival and immunological data were updated after database-verification errors. It changes reported statistics and the data-sharing statement. The correction must accompany the source register if the parent paper is accepted; it must not be counted as a seventh independent study. No corrected statistics are proposed for public product copy here.

**Future linked-record contract, not a published data change:** represent this separately from the study registry as `{ recordType: "correction", correctionPmid: "40447307", parentPmid: "39814420" }`. The content-release validator must require the parent to exist in the accepted study registry, reject unknown parents and duplicate correction identities, and exclude correction records from study counts and compound `studyIds`/evidence joins. Keep the correction linked to its parent in the internal source register; do not insert it as an independent seventh study. Add these assertions when that separate content release implements the registry.

## Requirements for a separate content release

1. Preserve the existing public boundary: neutral citations and allowed study metadata only. Keep `mechanism` and `benefitClaim` null and the claims audit empty. A `human_rct` classification denotes study design, not positive findings, product substantiation, or human-use permission.
2. Add approved exact compound-to-slug and PMID-to-compound joins together with the data. `src/content/compound-research.ts` currently has explicit `authorizedCompoundSlugs` and `authorizedPmidCompounds` registries plus exact registry-count validation; this is not a data-only insertion.
3. Update the review-date contract coherently. `REVIEWED_ON`, the `ParsedStudy.reviewedOn` literal, and validation currently require `2026-09-04`. New records were verified on **2026-09-05**. Do not falsely backdate them or re-date the existing 27 records without re-verifying them. Support the actual per-record review dates through the controlled registry and corresponding tests.
4. Preserve source-specific names and publication dates, including the Thompson 2021 issue year / 2020 electronic date distinction. Use the complete verified title from the primary record when creating the bibliographic data, not this note's abbreviated display title.
5. Retain an explicit internal identity caveat for every candidate: trial formulation, sequence/form, manufacturing, and catalog-product equivalence remain unverified. Do not derive mg options, storage directions, laboratory protocols, or claims from these papers.
6. Keep route, amount, outcome, and private review metadata excluded from the public DTO as the current boundary requires. The route descriptions above are internal source context, not proposed storefront copy.
7. Add focused tests for the new exact joins, duplicate/unknown PMID rejection, allowed review dates, unchanged null-claim policy, public-field exclusion, unmapped-product omission, and the linked-correction evidence record. Then verify the intended product pages in a separate reviewed release.
8. Recheck source availability and the parent paper's correction status at publication time. If a source cannot be verified then, leave the candidate unpublished and state the uncertainty; do not fabricate a substitute.

No source code, research JSON, published content, or provider configuration was changed by this research task. No implementation tests were run for the read-only research phase.
