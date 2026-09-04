# Amino Club exact-equivalent price audit — 2026-09-04

## Result

This register is the reproducible Task 2A audit of all 103 canonical PropeptIQ variant rows. It records 40 `matched` rows, 41 `no_exact_equivalent` rows, and 22 `unresolved` rows. The 40 matched rows reproduce the 40 existing manifest base prices; therefore this audit makes no catalog price change. All other rows remain pending at zero.

The earlier 40/23 no-equivalent/unresolved split is superseded by this live pass: the official Melanotan I page explicitly exposes `MT-1` as an alias and only a `10MG` one-bottle variant, while the local MT1 row is `10ml`. That makes the row a proved unit mismatch (`no_exact_equivalent`), not an unresolved identity.

## Method and interpretation

- Official sources only: the live [Amino Club U.S. store](https://www.aminoclub.com/us/store) and product pages linked from it. No search snippets, aggregators, caches, marketplaces, or historical summaries are price authority here.
- The store inventory was observed at `2026-09-04T16:59:18.372Z`. Product-page timestamps below are exact browser-history timestamps from the same live session. The audited page-interaction window was `2026-09-04T17:01:18.180Z` through `2026-09-04T17:07:52.650Z`.
- A `matched` row requires the same compound or blend identity, the exact displayed amount/unit, and one bottle. Multi-variant selectors were exercised rather than inferring a higher amount from a `From` price.
- `List` is the ordinary one-bottle standard/list price in USD minor units. `Sale` is the separately displayed temporary promotional amount (HEAT35 35% or the page's Club Sale). Sale values are evidence only and are not canonical PropeptIQ base prices.
- The canonical manifest sets `packageQuantity: 1`. The source browse labels ending in `× 10 vials` are legacy owner input strings; they are not the runtime package quantity and were not used as an Amino Club package match.
- `no_exact_equivalent` means the official page proved the relevant identity but its live selector did not offer the local amount/unit. `unresolved` means the live official catalog did not prove the exact identity/formulation, so absence or a similar-looking title was not treated as proof.

## 103-row audit register

| # | Local product | Code | Local configuration | Official source and observation time | Official selected title / variant | List | Sale | Outcome | Evidence note |
| ---: | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | Tirzepatide | TR5 | 5mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 2 | Tirzepatide | TR10 | 10mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 3 | Tirzepatide | TR15 | 15mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 4 | Tirzepatide | TR20 | 20mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 5 | Tirzepatide | TR30 | 30mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:26.756Z` | GLP-2 (TR) · 30MG · 1 BOTTLE | 5999 USD | 3899 USD | matched | Exact selector interaction; standard and HEAT35 sale recorded separately. |
| 6 | Tirzepatide | TR40 | 40mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 7 | Tirzepatide | TR50 | 50mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 8 | Tirzepatide | TR60 | 60mg · 1 bottle | [GLP-2 60MG selected](https://www.aminoclub.com/us/products/glp-2?v_id=variant_01KYMPT97N0Q16T2QFRP83ZD84) · `2026-09-04T17:38:22.952Z` | GLP-2 (TR) · 60MG · 1 BOTTLE | 10999 USD | 7149 USD | matched | Direct first-party variant URL reproduced the 60MG selection and embedded response record; no `From`-price inference. |
| 9 | Tirzepatide | TR100 | 100mg · 1 bottle | [GLP-2](https://www.aminoclub.com/us/products/glp-2) · `2026-09-04T17:01:30.583Z` | GLP-2 (TR): 30MG, 60MG | — | — | no_exact_equivalent | Exact identity page offered only 30MG and 60MG. |
| 10 | Retatrutide | RT5 | 5mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT): 10MG, 20MG, 30MG | — | — | no_exact_equivalent | Exact identity page did not offer 5MG. |
| 11 | Retatrutide | RT10 | 10mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:18.180Z` | GLP-3 (RT) · 10MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact selector interaction; standard and HEAT35 sale recorded separately. |
| 12 | Retatrutide | RT15 | 15mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT): 10MG, 20MG, 30MG | — | — | no_exact_equivalent | Exact identity page did not offer 15MG. |
| 13 | Retatrutide | RT20 | 20mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:19.725Z` | GLP-3 (RT) · 20MG · 1 BOTTLE | 13499 USD | 8774 USD | matched | Exact higher variant selected; no `From`-price inference. |
| 14 | Retatrutide | RT30 | 30mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT) · 30MG · 1 BOTTLE | 19999 USD | 12999 USD | matched | Exact higher variant selected; no `From`-price inference. |
| 15 | Retatrutide | RT40 | 40mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT): 10MG, 20MG, 30MG | — | — | no_exact_equivalent | Exact identity page did not offer 40MG. |
| 16 | Retatrutide | RT50 | 50mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT): 10MG, 20MG, 30MG | — | — | no_exact_equivalent | Exact identity page did not offer 50MG. |
| 17 | Retatrutide | RT60 | 60mg · 1 bottle | [GLP-3](https://www.aminoclub.com/us/products/glp-3) · `2026-09-04T17:01:22.844Z` | GLP-3 (RT): 10MG, 20MG, 30MG | — | — | no_exact_equivalent | Exact identity page did not offer 60MG. |
| 18 | NAD+ | NJ100 | 100mg · 1 bottle | [NAD+](https://www.aminoclub.com/us/products/nad-plus) · `2026-09-04T17:01:55.225Z` | NAD+ · 500MG only | — | — | no_exact_equivalent | Exact identity page offered only 500MG. |
| 19 | NAD+ | NJ500 | 500mg · 1 bottle | [NAD+](https://www.aminoclub.com/us/products/nad-plus) · `2026-09-04T17:01:55.225Z` | NAD+ · 500MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact one-bottle standard price observed. |
| 20 | NAD+ | NJ1000 | 1000mg · 1 bottle | [NAD+](https://www.aminoclub.com/us/products/nad-plus) · `2026-09-04T17:01:55.225Z` | NAD+ · 500MG only | — | — | no_exact_equivalent | Exact identity page offered only 500MG. |
| 21 | HGH | H10 | 10iu · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No HGH listing proved | — | — | unresolved | Live official inventory did not prove HGH identity or a 10IU variant. |
| 22 | HGH | H15 | 15iu · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No HGH listing proved | — | — | unresolved | Live official inventory did not prove HGH identity or a 15IU variant. |
| 23 | HGH | H24 | 24iu · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No HGH listing proved | — | — | unresolved | Live official inventory did not prove HGH identity or a 24IU variant. |
| 24 | GHK-CU | CU50 | 50mg · 1 bottle | [GHK-Cu](https://www.aminoclub.com/us/products/ghk-cu) · `2026-09-04T17:01:38.511Z` | GHK-Cu · 50MG · 1 BOTTLE | 2999 USD | 1949 USD | matched | Exact selector interaction. |
| 25 | GHK-CU | CU100 | 100mg · 1 bottle | [GHK-Cu](https://www.aminoclub.com/us/products/ghk-cu) · `2026-09-04T17:01:42.137Z` | GHK-Cu · 100MG · 1 BOTTLE | 5799 USD | 3769 USD | matched | Exact higher variant selected; no `From`-price inference. |
| 26 | Tesmorelin | TESA5 | 5mg · 1 bottle | [Tesamorlin](https://www.aminoclub.com/us/products/tesamorlin) · `2026-09-04T17:01:46.086Z` | Tesamorlin · 10MG only | — | — | no_exact_equivalent | Official page's displayed title spelling retained; selector offered only 10MG. |
| 27 | Tesmorelin | TESA10 | 10mg · 1 bottle | [Tesamorlin](https://www.aminoclub.com/us/products/tesamorlin) · `2026-09-04T17:01:46.086Z` | Tesamorlin · 10MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact amount on the established equivalent title page. |
| 28 | Tesmorelin | TESA20 | 20mg · 1 bottle | [Tesamorlin](https://www.aminoclub.com/us/products/tesamorlin) · `2026-09-04T17:01:46.086Z` | Tesamorlin · 10MG only | — | — | no_exact_equivalent | Selector offered only 10MG. |
| 29 | Tesmorelin + IPA | TI13 | Tesmorelin 10mg + IPA 3mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No exact blend listing proved | — | — | unresolved | Store did not expose this exact compound pair and split amounts. |
| 30 | BPC-157 | BPC5 | 5mg · 1 bottle | [BPC-157](https://www.aminoclub.com/us/products/bpc-157) · `2026-09-04T17:02:10.008Z` | BPC-157 · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 31 | BPC-157 | BPC10 | 10mg · 1 bottle | [BPC-157](https://www.aminoclub.com/us/products/bpc-157) · `2026-09-04T17:02:10.008Z` | BPC-157 · 10MG · 1 BOTTLE | 3999 USD | 2599 USD | matched | Exact one-bottle standard price observed. |
| 32 | BPC-157 | BPC20 | 20mg · 1 bottle | [BPC-157](https://www.aminoclub.com/us/products/bpc-157) · `2026-09-04T17:02:10.008Z` | BPC-157 · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 33 | TB500 (Thymosin B4 acetate) | TB5 | 5mg · 1 bottle | [TB-500](https://www.aminoclub.com/us/products/tb-500) · `2026-09-04T17:02:56.089Z` | TB-500 · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 34 | TB500 (Thymosin B4 acetate) | TB10 | 10mg · 1 bottle | [TB-500](https://www.aminoclub.com/us/products/tb-500) · `2026-09-04T17:02:56.089Z` | TB-500 · 10MG · 1 BOTTLE | 3999 USD | 2599 USD | matched | Exact one-bottle standard price observed. |
| 35 | BPC 5mg + TB 5mg | BB10 | 10mg total · 1 bottle | [Wolverine](https://www.aminoclub.com/us/products/wolverine-stack) · `2026-09-04T17:05:08.087Z` | BPC-157/TB-500 (Wolverine) · 10MG · 1 BOTTLE | 7999 USD | 5199 USD | matched | Exact established BPC/TB blend and total amount. |
| 36 | BPC 10mg + TB 10mg | BB20 | 20mg total · 1 bottle | [Wolverine](https://www.aminoclub.com/us/products/wolverine-stack) · `2026-09-04T17:38:34.819Z` | BPC-157/TB-500 (Wolverine) · 20MG · 1 BOTTLE | 14999 USD | 9749 USD | matched | The official 20MG selector produced the visible price and embedded first-party response record preserved below. |
| 37 | BPC 20mg + TB 20mg | BB40 | 40mg total · 1 bottle | [Wolverine](https://www.aminoclub.com/us/products/wolverine-stack) · `2026-09-04T17:05:08.087Z` | BPC-157/TB-500 (Wolverine): 10MG, 20MG | — | — | no_exact_equivalent | Exact blend page did not offer 40MG. |
| 38 | AOD 9604 | AOD5 | 5mg · 1 bottle | [AOD-9604](https://www.aminoclub.com/us/products/aod-9604) · `2026-09-04T17:03:16.423Z` | AOD-9604 · 5MG · 1 BOTTLE | 4999 USD | 3249 USD | matched | Exact one-bottle standard price observed. |
| 39 | AOD 9604 | AOD10 | 10mg · 1 bottle | [AOD-9604](https://www.aminoclub.com/us/products/aod-9604) · `2026-09-04T17:03:16.423Z` | AOD-9604 · 5MG only | — | — | no_exact_equivalent | Exact identity page offered only 5MG. |
| 40 | MOTS-C | MS10 | 10mg · 1 bottle | [MOTS-C](https://www.aminoclub.com/us/products/mots-c) · `2026-09-04T17:01:47.586Z` | MOTS-C · 10MG · 1 BOTTLE | 3999 USD | 2599 USD | matched | Exact selector interaction. |
| 41 | MOTS-C | MS20 | 20mg · 1 bottle | [MOTS-C](https://www.aminoclub.com/us/products/mots-c) · `2026-09-04T17:01:51.367Z` | MOTS-C: 10MG, 40MG | — | — | no_exact_equivalent | Exact identity page did not offer 20MG. |
| 42 | MOTS-C | MS40 | 40mg · 1 bottle | [MOTS-C](https://www.aminoclub.com/us/products/mots-c) · `2026-09-04T17:01:51.367Z` | MOTS-C · 40MG · 1 BOTTLE | 13499 USD | 8774 USD | matched | Exact higher variant selected. |
| 43 | Selank | SK10 | 10mg · 1 bottle | [SELANK](https://www.aminoclub.com/us/products/selank) · `2026-09-04T17:02:36.036Z` | SELANK · 10MG · 1 BOTTLE | 2995 USD | 1947 USD | matched | Exact one-bottle standard price observed. |
| 44 | Semax | XA10 | 10mg · 1 bottle | [SEMAX](https://www.aminoclub.com/us/products/semax) · `2026-09-04T17:02:22.863Z` | SEMAX · 10MG · 1 BOTTLE | 2995 USD | 1947 USD | matched | Exact one-bottle standard price observed. |
| 45 | Semax + Selank | 20SS | 20mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No exact blend listing proved | — | — | unresolved | Separate products/sprays do not prove this exact blend or amount. |
| 46 | Thymosin Alpha-1 | TA5 | 5mg · 1 bottle | [Thymosin Alpha-1](https://www.aminoclub.com/us/products/thymosin-alpha-1) · `2026-09-04T17:04:27.809Z` | Thymosin Alpha-1 · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 47 | Thymosin Alpha-1 | TA10 | 10mg · 1 bottle | [Thymosin Alpha-1](https://www.aminoclub.com/us/products/thymosin-alpha-1) · `2026-09-04T17:04:27.809Z` | Thymosin Alpha-1 · 10MG · 1 BOTTLE | 3999 USD | 1999 USD | matched | Club Sale captured separately from the list price. |
| 48 | DSIP | DS5 | 5mg · 1 bottle | [DSIP](https://www.aminoclub.com/us/products/dsip) · `2026-09-04T17:04:25.365Z` | DSIP · 5MG · 1 BOTTLE | 2999 USD | 1499 USD | matched | Club Sale captured separately from the list price. |
| 49 | DSIP | DS10 | 10mg · 1 bottle | [DSIP](https://www.aminoclub.com/us/products/dsip) · `2026-09-04T17:04:25.365Z` | DSIP · 5MG only | — | — | no_exact_equivalent | Exact identity page offered only 5MG. |
| 50 | CJC-1295 NO DAC 5mg + IPA 5mg | CP10 | 10mg total · 1 bottle | [CJC/Ipa No DAC](https://www.aminoclub.com/us/products/cjc-ipa-no-dac) · `2026-09-04T17:05:10.814Z` | CJC-1295 / Ipamorelin (No DAC) · 10MG · 1 BOTTLE | 5999 USD | 3899 USD | matched | Exact established blend identity and total amount. |
| 51 | CJC-1295 NO DAC 10mg + IPA 10mg | CP20 | 20mg total · 1 bottle | [CJC/Ipa No DAC](https://www.aminoclub.com/us/products/cjc-ipa-no-dac) · `2026-09-04T17:05:10.814Z` | CJC-1295 / Ipamorelin (No DAC) · 10MG only | — | — | no_exact_equivalent | Exact blend page offered only 10MG. |
| 52 | Ipamorelin | IP5 | 5mg · 1 bottle | [Ipamorelin](https://www.aminoclub.com/us/products/ipamorelin) · `2026-09-04T17:03:46.442Z` | Ipamorelin · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 53 | Ipamorelin | IP10 | 10mg · 1 bottle | [Ipamorelin](https://www.aminoclub.com/us/products/ipamorelin) · `2026-09-04T17:03:46.442Z` | Ipamorelin · 10MG · 1 BOTTLE | 4999 USD | 3249 USD | matched | Exact one-bottle standard price observed. |
| 54 | HCG | G5K | 5000iu · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No HCG listing proved | — | — | unresolved | Live official inventory did not prove the exact identity or IU amount. |
| 55 | Cargrilintide | CGL5 | 5mg · 1 bottle | [Cagrilintide](https://www.aminoclub.com/us/products/cagrilintide) · `2026-09-04T17:03:12.219Z` | Cagrilintide · 10MG only | — | — | no_exact_equivalent | Established equivalent spelling page offered only 10MG. |
| 56 | Cargrilintide | CGL10 | 10mg · 1 bottle | [Cagrilintide](https://www.aminoclub.com/us/products/cagrilintide) · `2026-09-04T17:03:12.219Z` | Cagrilintide · 10MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact amount on the established equivalent title page. |
| 57 | Sermorelin Acetate | SMO5 | 5mg · 1 bottle | [Sermorelin](https://www.aminoclub.com/us/products/sermorelin) · `2026-09-04T17:04:05.092Z` | Sermorelin · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 58 | Sermorelin Acetate | SMO10 | 10mg · 1 bottle | [Sermorelin](https://www.aminoclub.com/us/products/sermorelin) · `2026-09-04T17:04:05.092Z` | Sermorelin · 10MG · 1 BOTTLE | 5999 USD | 3899 USD | matched | Exact one-bottle standard price observed. |
| 59 | PT-141 | PT141 | 10mg · 1 bottle | [PT-141](https://www.aminoclub.com/us/products/pt-141) · `2026-09-04T17:03:10.606Z` | PT-141 · 10MG · 1 BOTTLE | 2999 USD | 1949 USD | matched | Exact one-bottle standard price observed. |
| 60 | GLOW | BBG50 | GHK 35mg + TB 5mg + BPC 10mg · 1 bottle | [GLOW](https://www.aminoclub.com/us/products/glow) · `2026-09-04T17:05:08.987Z` | GLOW · 70MG only | — | — | no_exact_equivalent | Exact three-compound blend page offered only 70MG, not this 50MG composition. |
| 61 | GLOW | BBG70 | GHK 50mg + TB 10mg + BPC 10mg · 1 bottle | [GLOW](https://www.aminoclub.com/us/products/glow) · `2026-09-04T17:05:08.987Z` | GLOW · 70MG · 1 BOTTLE | 8999 USD | 5849 USD | matched | Exact established three-compound blend and total amount. |
| 62 | Oxytocin Acetate | OT10 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No Oxytocin listing proved | — | — | unresolved | Live official inventory did not prove this exact identity/amount. |
| 63 | LL37 | LL375 | 5mg · 1 bottle | [LL-37](https://www.aminoclub.com/us/products/ll-37) · `2026-09-04T17:03:56.749Z` | LL-37 · 5MG · 1 BOTTLE | 3499 USD | 2274 USD | matched | Exact one-bottle standard price observed. |
| 64 | Glutathione | GT600 | 600mg · 1 bottle | [Glutathione](https://www.aminoclub.com/us/products/glutathione) · `2026-09-04T17:02:25.755Z` | Glutathione · 1500MG only | — | — | no_exact_equivalent | Exact identity page offered only 1500MG. |
| 65 | Glutathione | GT1500 | 1500mg · 1 bottle | [Glutathione](https://www.aminoclub.com/us/products/glutathione) · `2026-09-04T17:02:25.755Z` | Glutathione · 1500MG · 1 BOTTLE | 5999 USD | 3899 USD | matched | Exact one-bottle standard price observed. |
| 66 | SNAP | SNP10 | 10mg · 1 bottle | [SNAP-8](https://www.aminoclub.com/us/products/snap-8) · `2026-09-04T17:04:26.566Z` | SNAP-8 · 10MG · 1 BOTTLE | 2999 USD | 1499 USD | matched | Established exact peptide identity; Club Sale recorded separately. |
| 67 | LI PO-C | LPC | 10ml · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No LI PO-C listing proved | — | — | unresolved | Live official inventory did not prove exact formulation or volume. |
| 68 | LI PO-C without B12 | LPC | 10ml · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No exact no-B12 listing proved | — | — | unresolved | Live official inventory did not prove exact formulation or volume. |
| 69 | Lemon bottle | LB | 10ml · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No Lemon bottle listing proved | — | — | unresolved | Live official inventory did not prove exact identity/formulation. |
| 70 | MT1 | MT1 | 10ml · 1 bottle | [Melanotan I](https://www.aminoclub.com/us/products/melanotan-i) · `2026-09-04T17:07:50.292Z` | Melanotan I · alias MT-1 · 10MG · 1 BOTTLE | — | — | no_exact_equivalent | Identity alias is explicit, but official unit is mg and local unit is ml. |
| 71 | MT2 | MT210 | 10mg · 1 bottle | [Melanotan II](https://www.aminoclub.com/us/products/melanotan-ii) · `2026-09-04T17:02:30.083Z` | Melanotan II · 10MG · 1 BOTTLE | 2995 USD | 1947 USD | matched | Established exact title/alias identity and amount. |
| 72 | SS-31 | 2S10 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No SS-31 listing proved | — | — | unresolved | Live official inventory did not prove exact identity/amount. |
| 73 | SS-31 | 2S50 | 50mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No SS-31 listing proved | — | — | unresolved | Live official inventory did not prove exact identity/amount. |
| 74 | KLOW | BBGK | GHK 50mg + KPV 10mg + BPC 10mg + TB 10mg · 1 bottle | [KLOW](https://www.aminoclub.com/us/products/klow) · `2026-09-04T17:05:09.843Z` | KLOW · 80MG · 1 BOTTLE | 9999 USD | 6499 USD | matched | Exact established four-compound blend and total amount. |
| 75 | 5-amino-1mq | 5A5 | 5mg · 1 bottle | [5-Amino-1MQ](https://www.aminoclub.com/us/products/5-amino-1mq) · `2026-09-04T17:03:04.762Z` | 5-Amino-1MQ · 50MG only | — | — | no_exact_equivalent | Exact identity page offered only 50MG. |
| 76 | 5-amino-1mq | 5A10 | 10mg · 1 bottle | [5-Amino-1MQ](https://www.aminoclub.com/us/products/5-amino-1mq) · `2026-09-04T17:03:04.762Z` | 5-Amino-1MQ · 50MG only | — | — | no_exact_equivalent | Exact identity page offered only 50MG. |
| 77 | 5-amino-1mq | 5A20 | 20mg · 1 bottle | [5-Amino-1MQ](https://www.aminoclub.com/us/products/5-amino-1mq) · `2026-09-04T17:03:04.762Z` | 5-Amino-1MQ · 50MG only | — | — | no_exact_equivalent | Exact identity page offered only 50MG. |
| 78 | 5-amino-1mq | 5A50 | 50mg · 1 bottle | [5-Amino-1MQ](https://www.aminoclub.com/us/products/5-amino-1mq) · `2026-09-04T17:03:04.762Z` | 5-Amino-1MQ · 50MG · 1 BOTTLE | 4999 USD | 3249 USD | matched | Exact one-bottle standard price observed. |
| 79 | KissPeptin | KS5 | 5mg · 1 bottle | [Kisspeptin](https://www.aminoclub.com/us/products/kisspeptin) · `2026-09-04T17:04:28.909Z` | Kisspeptin · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 80 | KissPeptin | KS10 | 10mg · 1 bottle | [Kisspeptin](https://www.aminoclub.com/us/products/kisspeptin) · `2026-09-04T17:04:28.909Z` | Kisspeptin · 10MG · 1 BOTTLE | 4999 USD | 3249 USD | matched | Exact one-bottle standard price observed. |
| 81 | Pinealon | PN5 | 5mg · 1 bottle | [Pinealon](https://www.aminoclub.com/us/products/pinealon) · `2026-09-04T17:04:31.941Z` | Pinealon · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 82 | PE-22-28 | PE10 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No PE-22-28 listing proved | — | — | unresolved | Live official inventory did not prove exact identity/amount. |
| 83 | IGF-1 LR3 | IG1 | 1mg · 1 bottle | [IGF-1 LR3](https://www.aminoclub.com/us/products/igf-1-lr3) · `2026-09-04T17:03:00.400Z` | IGF-1 LR3 · 1MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact one-bottle standard price observed. |
| 84 | ARA-290 | RA10 | 10mg · 1 bottle | [ARA-290](https://www.aminoclub.com/us/products/ara-290) · `2026-09-04T17:04:30.663Z` | ARA-290 · 10MG · 1 BOTTLE | 4999 USD | 2499 USD | matched | Club Sale captured separately from the list price. |
| 85 | Acetic Acid | AA | 3ml · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No Acetic Acid listing proved | — | — | unresolved | Live official inventory did not prove concentration, formulation, or volume. |
| 86 | Semaglutide | SM5 | 5mg · 1 bottle | [GLP-1](https://www.aminoclub.com/us/products/glp-1) · `2026-09-04T17:01:34.207Z` | GLP-1 (SM) · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 87 | Semaglutide | SM10 | 10mg · 1 bottle | [GLP-1](https://www.aminoclub.com/us/products/glp-1) · `2026-09-04T17:01:34.207Z` | GLP-1 (SM) · 10MG · 1 BOTTLE | 4999 USD | 3249 USD | matched | Exact one-bottle standard price observed. |
| 88 | Semaglutide | SM15 | 15mg · 1 bottle | [GLP-1](https://www.aminoclub.com/us/products/glp-1) · `2026-09-04T17:01:34.207Z` | GLP-1 (SM) · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 89 | Semaglutide | SM20 | 20mg · 1 bottle | [GLP-1](https://www.aminoclub.com/us/products/glp-1) · `2026-09-04T17:01:34.207Z` | GLP-1 (SM) · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 90 | Semaglutide | SM30 | 30mg · 1 bottle | [GLP-1](https://www.aminoclub.com/us/products/glp-1) · `2026-09-04T17:01:34.207Z` | GLP-1 (SM) · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 91 | KPV | KPV10 | 10mg · 1 bottle | [KPV](https://www.aminoclub.com/us/products/kpv) · `2026-09-04T17:02:14.188Z` | KPV · 10MG · 1 BOTTLE | 3999 USD | 2599 USD | matched | Exact one-bottle standard price observed. |
| 92 | Epithalon | ET10 | 10mg · 1 bottle | [Epithalon](https://www.aminoclub.com/us/products/epithalon) · `2026-09-04T17:03:42.079Z` | Epithalon · 10MG · 1 BOTTLE | 2999 USD | 1949 USD | matched | Exact one-bottle standard price observed. |
| 93 | Epithalon | ET50 | 50mg · 1 bottle | [Epithalon](https://www.aminoclub.com/us/products/epithalon) · `2026-09-04T17:03:42.079Z` | Epithalon · 10MG only | — | — | no_exact_equivalent | Exact identity page offered only 10MG. |
| 94 | CJC-1295 with DAC | CD5 | 5mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No with-DAC listing proved | — | — | unresolved | The No-DAC blend is not proof of this distinct compound. |
| 95 | CJC-1295 NO DAC | CND5 | 5mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No standalone No-DAC listing proved | — | — | unresolved | The CJC/Ipamorelin blend is not proof of standalone CJC-1295. |
| 96 | CJC-1295 NO DAC | CND10 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No standalone No-DAC listing proved | — | — | unresolved | The CJC/Ipamorelin blend is not proof of standalone CJC-1295. |
| 97 | GRP-2 | GRP-2 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No GRP-2 listing proved | — | — | unresolved | Live official inventory did not prove exact identity/amount. |
| 98 | VIP | VP10 | 10mg · 1 bottle | [VIP](https://www.aminoclub.com/us/products/vip) · `2026-09-04T17:04:29.818Z` | VIP · 10MG · 1 BOTTLE | 4999 USD | 2499 USD | matched | Club Sale captured separately from the list price. |
| 99 | Survodutide | SUR10 | 10mg · 1 bottle | [official store](https://www.aminoclub.com/us/store) · `2026-09-04T16:59:18.372Z` | No Survodutide listing proved | — | — | unresolved | Live official inventory did not prove exact identity/amount. |
| 100 | Admax | Admax | 10mg · 1 bottle | [Adamax Spray](https://www.aminoclub.com/us/products/adamax-spray) · `2026-09-04T17:07:52.650Z` | Adamax Spray · 15MG · 1 BOTTLE | — | — | unresolved | Similar title is a spray, uses different spelling, and is 15MG; exact local identity cannot be proved. |
| 101 | Cartalax | Car20 | 20mg · 1 bottle | [Cartalax](https://www.aminoclub.com/us/products/cartalax) · `2026-09-04T17:04:01.207Z` | Cartalax · 20MG · 1 BOTTLE | 6999 USD | 4549 USD | matched | Exact standard price observed; page was out of stock, which does not change list price evidence. |
| 102 | Bac water | BA3 | 3ml · 1 bottle | [Amino H2O](https://www.aminoclub.com/us/products/amino-h2o) · `2026-09-04T17:07:50.162Z` | Amino H2O · 10mL, 30mL | — | — | unresolved | Similar water product states 0.9% benzyl alcohol, but local formulation is unspecified; identity cannot be proved. |
| 103 | Bac water | BA10 | 10ml · 1 bottle | [Amino H2O](https://www.aminoclub.com/us/products/amino-h2o) · `2026-09-04T17:07:50.162Z` | Amino H2O · 10mL, 30mL | — | — | unresolved | Amount matches 10mL, but local formulation is unspecified; exact compound identity cannot be proved. |

## Reproducible higher-variant response evidence

Static text extraction from both product pages exposes the variant labels but only the lowest `From` price. The two higher-tier decisions below were therefore reproduced in a legitimate interactive first-party browser session and checked against the page's own Next.js response payload. This is a dated evidence artifact, not a promise that Amino Club will retain the same price or implementation.

| Local row | Reproduction path | Visible selected state | First-party embedded response fields |
| --- | --- | --- | --- |
| `tirzepatide:TR60` | Open the [official selected-variant URL](https://www.aminoclub.com/us/products/glp-2?v_id=variant_01KYMPT97N0Q16T2QFRP83ZD84) in a normal browser. Reproduced directly at `2026-09-04T17:38:22.952Z`. | `GLP-2 (TR)`; `60MG`; `$109.99` list; `$71.49` HEAT35 sale; one bottle. | `productId=prod_01KYMPT91W8QJV15Y9QSBYNHFK`; `productHandle=glp-2`; `variantId=variant_01KYMPT97N0Q16T2QFRP83ZD84`; `variantTitle=60MG`; `price=109.99`; `currency=USD`. |
| `bpc-tb-blend-bb20:BB20` | Open the [official Wolverine page](https://www.aminoclub.com/us/products/wolverine-stack), then select its visible `20MG` button. Reproduced at `2026-09-04T17:38:34.819Z`. | `BPC-157/TB-500 (Wolverine)`; `20MG`; `$149.99` list; `$97.49` HEAT35 sale; one bottle. | `productId=prod_01KE41BS0KXPMM05AT8JMB6VCP`; `productHandle=wolverine-stack`; `variantId=variant_01KE41BS3RF6FRHSRT5F5JWBYG`; `variantTitle=20MG`; `price=149.99`; `currency=USD`. |

The exact minimal product/variant/price fragments extracted from the official inline `self.__next_f` response records are retained below. Unrelated page copy, tracking data, and claims were excluded.

```json
{
  "productId": "prod_01KYMPT91W8QJV15Y9QSBYNHFK",
  "productName": "GLP-2 (TR)",
  "productHandle": "glp-2",
  "variantId": "variant_01KYMPT97N0Q16T2QFRP83ZD84",
  "variantTitle": "60MG",
  "price": 109.99,
  "currency": "USD"
}
```

```json
{
  "productId": "prod_01KE41BS0KXPMM05AT8JMB6VCP",
  "productName": "BPC-157/TB-500 (Wolverine)",
  "productHandle": "wolverine-stack",
  "variantId": "variant_01KE41BS3RF6FRHSRT5F5JWBYG",
  "variantTitle": "20MG",
  "price": 149.99,
  "currency": "USD"
}
```

The Wolverine variant identifier was also tested as a direct `?v_id=...` query at `2026-09-04T17:39:34.296Z`, but the official page did not honor it as an initial selected state and continued to show the unselected lowest `From` price. That query is deliberately not presented as a replay link. Wolverine must be reproduced through its visible `20MG` selector.

For independent review, confirm the selected button and list price in the rendered product block, then inspect the first-party inline `self.__next_f` response record for the exact identifier/title/price/currency tuple above. Do not use the unselected page's `From` price. A headless request that receives HTTP 403 does not reproduce the evidence and must not be treated as contradictory price data.

## Task 2B explicit-default decision register — owner authorized

The owner's September 4 instruction to review once more and then implement without another approval pause authorizes preserving the 56 previously displayed defaults below as explicit configuration. Each decision is keyed only by the exact `{ browseSlug, browseCode }` identity; its UUID is derived through the canonical storefront UUIDv5 identity function. Price, array position, amount, availability, Stripe data, and competitor merchandising do not select or change these defaults.

| `browseSlug` | Owner-authorized `browseCode` | Derived `defaultVariantId` |
| --- | --- | --- |
| tirzepatide | TR30 | `5ff78cc3-c541-5bf4-9f3b-12be2222cc75` |
| retatrutide | RT10 | `e10294a1-d79c-51a1-9137-ff69d2a9e762` |
| nad-plus | NJ500 | `edc81516-bf06-582a-a1cf-1421d6bb3068` |
| hgh | H10 | `c7907155-bca4-58e1-8e9e-b97bc3caa3e4` |
| ghk-cu | CU50 | `24c833de-f4f8-53c1-8b89-667fa10a0e5f` |
| tesmorelin | TESA10 | `b162f82c-8d1c-5665-87c8-d370c5c1ac9f` |
| tesmorelin-ipa | TI13 | `1710b19e-78dc-5ae9-9ee3-4151b1c4b8b7` |
| bpc-157 | BPC10 | `b0447a0a-6da0-5209-a273-cdb0035a5d97` |
| tb500 | TB10 | `d6f3dbef-459b-5bbe-bbeb-e097973174bc` |
| bpc-tb-blend | BB10 | `a09ac646-5e3b-515b-8ae3-04624282ee8c` |
| bpc-tb-blend-bb20 | BB20 | `76108f01-80e6-5f11-968b-4ba69d762320` |
| bpc-tb-blend-bb40 | BB40 | `552bcdae-13f0-54e9-8adb-5e686a5c0bf3` |
| aod-9604 | AOD5 | `2d3efed4-2c53-5593-9dec-0931bd2f1c44` |
| mots-c | MS10 | `844c60d7-36b7-526f-89a6-82ec1d501050` |
| selank | SK10 | `89f0742c-30ef-5196-a15b-1cb1e03426e9` |
| semax | XA10 | `005059ad-dd45-504c-b3e9-cfde386bbd2b` |
| semax-selank | 20SS | `3305a442-cc1d-5049-a7d2-097bdc41dd32` |
| thymosin-alpha-1 | TA10 | `cd66cb9a-e2f9-5971-9a01-0dbd1d9f6450` |
| dsip | DS5 | `8bc743dd-ddf2-54d7-9858-587b4b762605` |
| cjc-1295-no-dac-ipa | CP10 | `bbffa403-e0e5-53a4-a144-a60cc1fa8cf1` |
| cjc-1295-no-dac-ipa-cp20 | CP20 | `2c3211f2-34a5-5f05-b8e4-4813b7a50e42` |
| ipamorelin | IP10 | `e410a116-8f12-582d-890e-22dd9318fc56` |
| hcg | G5K | `f3106b5d-ef6a-5d8d-937a-536de87e4f05` |
| cargrilintide | CGL10 | `3b0273b9-3b5c-5111-b09a-b8419b5adc89` |
| sermorelin-acetate | SMO10 | `e1d9205b-4fbf-5bfc-95da-7c12f3bb63a7` |
| pt-141 | PT141 | `b3947bde-0c8a-5c54-91fc-45d2f12c1ad4` |
| glow | BBG70 | `5ffb2718-6989-55b4-a72d-01ff197ffdbc` |
| oxytocin-acetate | OT10 | `cdcc5a32-201a-5467-9dd8-aca915cc55df` |
| ll37 | LL375 | `5edfccec-11c5-5000-9cb0-7141dd144278` |
| glutathione | GT1500 | `05e9617d-8d17-5525-b8ba-2ef30ea1213d` |
| snap | SNP10 | `964bb892-b516-5d08-93c2-3e13ba47afad` |
| li-po-c | LPC | `49a95c80-1230-57db-8d74-f97b12d80dd7` |
| li-po-c-without-b12 | LPC | `db2c79d4-942d-5708-bbdd-0cd020641efd` |
| lemon-bottle | LB | `fe5ff5df-c740-5fe6-8a53-6e1e317590cd` |
| mt1 | MT1 | `c0a4886e-0762-54db-bb11-447dc673fa30` |
| mt2 | MT210 | `43e37aab-c03f-5376-bd16-7ea75e9e4e9f` |
| ss-31 | 2S10 | `dcf29255-da96-588f-804e-442a336cbe69` |
| klow | BBGK | `c12d3994-0164-52cc-a4fd-71d8b7720eb1` |
| 5-amino-1mq | 5A50 | `1c56b823-848e-5d8c-aaca-056168a033a2` |
| kisspeptin | KS10 | `513745eb-55bd-5baf-87fb-4915a6aee5a6` |
| pinealon | PN5 | `7881fc75-3c25-5bb6-b235-89b4a7baaa44` |
| pe-22-28 | PE10 | `b63653f8-a84d-556f-9e71-6643c6080a0d` |
| igf-1-lr3 | IG1 | `8f9bb57e-0355-566f-adde-2474a9c3efbc` |
| ara-290 | RA10 | `14520cb5-06ff-50c0-bebd-bf6c147f0cd8` |
| acetic-acid | AA | `ee0b5072-6daf-5cbb-917c-8dc81c92486d` |
| semaglutide | SM10 | `a6181236-9de5-55b3-ab83-0d7524f371b6` |
| kpv | KPV10 | `a9402071-c149-5af5-95f2-ad6588604210` |
| epithalon | ET10 | `f9dfb304-780f-5bdb-af82-660f5d6fe1d2` |
| cjc-1295-with-dac | CD5 | `ab7a14bf-9b9a-56b9-aca6-16ac31fb3d12` |
| cjc-1295-no-dac | CND5 | `37f13254-0e24-52ab-8cf0-5095d9ff5982` |
| grp-2 | GRP-2 | `bc60b820-f680-5376-b618-31a3d7be9ee7` |
| vip | VP10 | `a321b5e3-d39a-5b73-a26f-1614b4523d40` |
| survodutide | SUR10 | `c0b57d84-558c-541a-b6a0-189babae6fc4` |
| admax | Admax | `b6e9d630-8131-5e4b-bbb5-ca04abf087c2` |
| cartalax | Car20 | `5b420c28-d963-5673-9778-0730d0cae4de` |
| bac-water | BA3 | `3e70c3a4-a773-539d-a9b8-4e51427be8c4` |

## Change and release status

- Exact price changes: none. The re-audit confirms all 40 current manifest amounts.
- Pending rows: 63 remain at zero with no evidence object in the manifest.
- Explicit defaults: the owner authorized preserving all 56 listed defaults; each is now an immutable scoped decision and no runtime price/order fallback selects another variant.
- Provider boundary: no Stripe live/test reads or writes, no database/provider writes, and no secret or environment inspection occurred during this audit.
