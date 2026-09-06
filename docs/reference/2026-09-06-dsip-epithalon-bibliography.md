# DSIP and Epithalon bibliography verification

Status: source-verified metadata for the Task 8D release candidate. This document does not establish production deployment, product identity, efficacy, safety, storage conditions, or approval of marketing claims.

## Sources and classifications

| Catalog page | Primary record | Indexed year / first author | Study context retained |
| --- | --- | --- | --- |
| DSIP | [PMID 1299794](https://pubmed.ncbi.nlm.nih.gov/1299794/) | 1992 / Bes F | Randomized controlled trial indexing; 16 people with chronic insomnia |
| DSIP | [PMID 6895513](https://pubmed.ncbi.nlm.nih.gov/6895513/) | 1981 / Schneider-Helmert D | Human interventional study; six healthy volunteers; random allocation not established |
| Epithalon | [PMID 40493162](https://pubmed.ncbi.nlm.nih.gov/40493162/) | 2025 / Gatta M | In-vitro experiment using ARPE-19 cells, not human participants |
| Epithalon | [PMID 17955380](https://pubmed.ncbi.nlm.nih.gov/17955380/) | 2007 / Sibarov DA | Animal experiment in male Wistar rats; animal count not established in indexed abstract |

The DSIP literature name is delta sleep-inducing peptide. The Epithalon catalog spelling is linked to literature using Epitalon, with an explicit identity caveat. The synthetic tetrapeptide in those papers is not treated as interchangeable with Epithalamin or a pineal extract. A literature-name correspondence does not verify the composition or identity of any catalog material.

The existing aggregate `animal_only` selects an animal study when the included set has no human studies. Because this set also contains a cell-line experiment, its display wording is **Animal research included**. Each paper retains its separate research context; the cell-line study is never classified as human-participant research. The existing `in_vitro` context receives the corresponding `in_vitro_experimental` design label, **In vitro experiment**. No database schema or migration is involved.

## Reproducible verification and limits

On September 6, 2026, the [exact NCBI EFetch request](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=1299794,6895513,40493162,17955380&retmode=xml) returned all four requested published articles. The root reviewer read their indexed titles, abstracts, author/journal/year metadata, identifiers and publication types. The status readback at **2026-09-06T04:52:56Z** found no indexed correction or retraction/withdrawal publication type. This is a dated observation, not a guarantee against unindexed or later notices.

- DOI [10.1159/000118919](https://doi.org/10.1159/000118919) redirected to its Karger article; the publisher's automated response was 403. Crossref confirmed the DOI and main title, but its 2008 date conflicts with NCBI's 1992 bibliographic year. Preserve the NCBI year; do not claim that publisher full text was retrieved.
- PMID 6895513 has no DOI in the retrieved NCBI record; none is fabricated.
- DOI [10.1007/s12015-025-10911-x](https://doi.org/10.1007/s12015-025-10911-x) resolved to Springer with HTTP 200. The publisher text confirms the in-vitro cell model. Crossref corroborated the identifier and title.
- DOI [10.1007/s11055-007-0095-3](https://doi.org/10.1007/s11055-007-0095-3) returned a 302 to an HTTP Springer destination. No insecure downgrade was followed. Crossref and NCBI corroborated the DOI/title/year. A separately requested HTTPS publisher path returned 200, but automated extraction did not independently confirm its article title; full-text verification is not claimed.

Earlier PowerShell extraction used `.InnerText` on auto-converted strings and printed null titles/abstracts; the subsequent explicit XML-node extraction supplied the exact text. A failed DOI-follow command also left a previous response variable populated: that stale value is excluded from evidence. The separate no-redirect HTTP client request above establishes the actual 2007 DOI redirect.

Only neutral bibliography is proposed: no benefit claim, mechanism, administration route, studied amount, protocol, duration, or outcome narrative is added. Small or old studies are not presented as proof of effectiveness. These additions do not complete technical/storage content or the remaining catalog bibliography.
