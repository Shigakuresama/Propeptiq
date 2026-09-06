# KPV, LL37 and glutathione bibliography verification

Status: source-verified neutral metadata for Task 8E. This is not a deployment receipt, product substantiation, medical advice, or approval of marketing claims or catalog-material identity.

## Exact records

| Catalog page | Primary record | Author / issue year | Context retained |
| --- | --- | --- | --- |
| KPV | [PMID 18061177](https://pubmed.ncbi.nlm.nih.gov/18061177/) | Dalmasso G / 2008 | KPV cell-line and mouse experiments; no aggregate sample size established |
| KPV | [PMID 27458604](https://pubmed.ncbi.nlm.nih.gov/27458604/) | Viennois E / 2016 | Mouse KPV experiments, with separate human tissue observations about PepT1; not a human KPV treatment trial |
| LL37 | [PMID 25041740](https://pubmed.ncbi.nlm.nih.gov/25041740/) | Grönberg A / 2014 | Randomized trial; 34 people with venous leg ulcers |
| LL37 | [PMID 34687253](https://pubmed.ncbi.nlm.nih.gov/34687253/) | Mahlapuu M / 2021 | Randomized trial; 148 people with hard-to-heal venous leg ulcers |
| Glutathione | [PMID 24791752](https://pubmed.ncbi.nlm.nih.gov/24791752/) | Richie JP Jr / 2015 | Randomized trial; 54 non-smoking adults |
| Glutathione | [PMID 21875351](https://pubmed.ncbi.nlm.nih.gov/21875351/) | Allen J / 2011 | Randomized trial; 40 enrolled, 39 completed per protocol |

Only names, bibliography and study context are joined. KPV is not treated as full alpha-MSH or a blend. LL37 is linked to the literature spelling LL-37 without asserting that the catalog material matches investigational preparations. Neither glutathione's chemical/redox form nor a route/formulation is inferred from its catalog name.

The KPV pair needs the aggregate label **Preclinical research included**. The existing preclinical study context already supports the records; the aggregate previously fell through to “In vitro research only,” which would omit the mouse context. The new `preclinical_only` aggregate is selected after the existing human/animal rules and before the in-vitro fallback. Prior classifications remain unchanged. This is an application taxonomy correction, not a database schema or migration.

## Primary-source verification

At **2026-09-06T05:20:16Z**, [official NCBI EFetch](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=18061177,27458604,25041740,34687253,24791752,21875351&retmode=xml) returned all six exact records with HTTP 200. The controller read the indexed abstracts, titles, identifiers, authors, journal issue dates, publication types and linked-notice fields. The four human trial records carry randomized-trial indexing; the KPV records do not.

No indexed correction, retraction, withdrawal or expression of concern was found in these records at that checkpoint. Richie has two `CommentIn` links: [commentary PMID 25792077](https://pubmed.ncbi.nlm.nih.gov/25792077/) and [author reply PMID 25808115](https://pubmed.ncbi.nlm.nih.gov/25808115/). They are not corrections and do not increase the study or correction count. This is dated indexed evidence, not a guarantee against later or unindexed notices.

All six DOIs returned registry redirects, and Crossref confirmed their identities and corresponding titles:

- [10.1053/j.gastro.2007.10.026](https://doi.org/10.1053/j.gastro.2007.10.026) and [10.1016/j.jcmgh.2016.01.006](https://doi.org/10.1016/j.jcmgh.2016.01.006): HTTPS Elsevier destinations.
- [10.1111/wrr.12211](https://doi.org/10.1111/wrr.12211) and [10.1111/wrr.12977](https://doi.org/10.1111/wrr.12977): HTTPS Wiley destinations; registry title markup/dash typography differ from NCBI plain text.
- [10.1007/s00394-014-0706-z](https://doi.org/10.1007/s00394-014-0706-z): HTTP Springer destination; no insecure redirect was followed. Crossref's 2014 online publication precedes the NCBI 2015 journal issue; retain the issue year.
- [10.1089/acm.2010.0716](https://doi.org/10.1089/acm.2010.0716): HTTPS SAGE destination.

Registry resolution and indexed abstract access do not mean every publisher full text was read. Some browser-search PubMed responses were empty; the official XML supplied the verified metadata instead.

## Publication limits

Exact bibliographic titles may describe authors' study conclusions; they are not PropeptIQ product claims. The larger LL-37 trial reported no significant overall healing improvement, and the Allen glutathione trial reported no significant biomarker changes. These limits informed the decision not to add efficacy narratives or infer benefits from the presence of trials. Neither these negative results nor the other papers' outcomes are transformed into catalog-material claims.

All six new studied-amount, duration, route and outcome fields remain null. Mechanism and benefit claims remain null, with an empty claims audit. No dosing, administration guidance, product-specific storage instructions, legal approval, purity or safety assertion is added. Full product-information coverage remains unfinished.
