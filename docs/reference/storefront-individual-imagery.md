# Individual product artwork — catalog fronts

Generated September 5, 2026 Pacific (September 6 UTC) with the built-in image-generation tool, then encoded without creative alteration. These are original AI-generated catalog illustrations, **not actual packaging photographs or evidence of product contents, testing, quality, or availability**. No owner approval of physical packaging is asserted. Public disclosure remains visible.

## Release scope

First release (PR #31): BPC-157, Tirzepatide, Retatrutide, NAD+, Semax, Selank. Each is 1,254 × 1,254 pixels, sRGB WebP. That release reached production as main commit `7ba508c8e1193c0ffe26ab0b109bc012594a9418` and was inspected live. The remaining fifty fronts are documented in the continuation below. The shared gallery's other five scenes remain unchanged. This does not complete the full per-product six-view requirement.

The owner requested new original product imagery and instructed us to proceed. The implementation uses that authorization for disclosed conceptual artwork; it does not treat unavailable reference uploads as received or approved. Existing artwork is retained, and new files have versioned paths for a reversible release.

| Product slug | New file | Bytes | Output SHA-256 |
| --- | --- | ---: | --- |
| bpc-157 | [front-v1.webp](../../public/catalog/individual/bpc-157/front-v1.webp) | 42,076 | `14962877a70be6667b17ca843100f99ccf2d3a88f89a0c595e66422969679893` |
| tirzepatide | [front-v1.webp](../../public/catalog/individual/tirzepatide/front-v1.webp) | 37,708 | `236f9248340369ab8c898e3c98cee5b61ec15d3de0d50dc06fd37e775dbf4b51` |
| retatrutide | [front-v1.webp](../../public/catalog/individual/retatrutide/front-v1.webp) | 38,012 | `498bb5fcada2c34b94bd6cd0078f44606d03f5652211648a47eb68e70db9ac38` |
| nad-plus | [front-v1.webp](../../public/catalog/individual/nad-plus/front-v1.webp) | 37,362 | `4d5669cc0200b78347a6f85d244f26e3175a51293d23282c9f500e5824dc47b8` |
| semax | [front-v1.webp](../../public/catalog/individual/semax/front-v1.webp) | 37,734 | `e845ad20ac9843bd030a2ab83b0b78e39ecd910655852ecc1f6d4832882d580e` |
| selank | [front-v1.webp](../../public/catalog/individual/selank/front-v1.webp) | 38,016 | `8749b8e5d79a72e43e25d5b95270c59f4cf961039d3f346dca7bcff28b47ed85` |

Source PNG hashes and measured output metadata are recorded with the corresponding entries in `src/components/commerce/catalog-product-visual-manifest.ts`. Original PNGs are retained in the generating session's local generated-images directory, not overwritten. Product data, amount, price, inventory and provider mappings are not derived from pixels.

## Design and visual review

The base is one clear glass laboratory vial with a silver cap, warm ivory label/background and deep teal lower band. Only the wordmark, product name and existing research-use wording are printed. No mg amount is baked into the image; the selected variant and discount stay in the live data plate. Every generated original was inspected for the exact product spelling, legibility, unclipped vial/label, absence of extra objects or unsupported claims, and consistency with the base. Encoded BPC-157 was also inspected after optimization.

These illustrations do not establish a package size or a physically measured scale. No needles, capsules, ingredients, liquid contents or dosing examples were requested or added. A three-vial gallery composition remains an illustration, not a bundle quantity.

## Generation prompts

### Base BPC-157

> Use case: product-mockup. Create one original square, high-resolution PropeptIQ ecommerce hero artwork for BPC-157. Photorealistic modeled product illustration, not evidence of actual packaging. Scene: seamless warm ivory (#F4F1E8) studio background, gently brighter behind the object, minimal soft contact shadow. Subject: exactly one upright clear glass laboratory vial with a brushed silver aluminum crimp cap, front-on eye level, entirely visible and centered, occupying about 65 percent of image height, ample negative space around it. No visible contents or invented fill. Label: warm off-white matte full-wrap paper, a restrained deep teal (#1c5961) band across the bottom quarter, crisp dark ink typography. Exact text ONLY: upper third 'PROPEPTIQ' in uppercase geometric sans serif with generous letter spacing; below it, larger bold 'BPC-157'; small bottom line 'RESEARCH USE ONLY' in high-contrast type. No other letters or marks. Label lies naturally on the curved glass and is fully legible, straight and not warped. Soft large-source key light upper left, gentle right fill, controlled realistic glass highlights and silver texture. 85mm equivalent studio lens, entire vial and label sharp, natural material response, premium restrained scientific catalog aesthetic. Do not create an image grid or collage. Avoid: mg quantities, lot numbers, expiry dates, SKUs, prices, dose instructions, purity or testing claims, certifications, FDA marks, medical props, needles, syringes, people, hands, capsules, loose powders, liquid contents, third-party logos, watermarks, extra vials, botanical ingredients, decorative diagrams, and competitor trade dress. This is original PropeptIQ artwork.

### Matching product edits

Each edit used the original BPC-157 PNG as the sole reference, not a competitor image.

Tirzepatide:

> Create the matching original PropeptIQ product hero illustration for TIRZEPATIDE. Preserve this reference's exact square composition, single clear glass laboratory vial, silver crimp cap, warm ivory studio background, label geometry, deep teal bottom band, soft lighting, generous empty space and clinical restraint. Change ONLY the large product descriptor from BPC-157 to the exact text 'TIRZEPATIDE', sized to fit legibly. Preserve exact other label text 'PROPEPTIQ' and 'RESEARCH USE ONLY'. No mg, prices, contents, claims, dosage, certification, medical props, hands, or extra objects. Keep full vial and all label text sharp and readable. This is AI-generated conceptual product artwork, not documentation of actual packaging. Output one square image, not a grid.

The remaining four calls used this exact template, substituting PRODUCT with RETATRUTIDE, NAD+, SEMAX and SELANK respectively. For NAD+, the words “with a clear plus sign” followed “sized to fit legibly”.

> Create the matching original PropeptIQ product hero illustration for PRODUCT. Preserve reference exact square composition, single clear glass laboratory vial, silver crimp cap, warm ivory studio background, label geometry, deep teal bottom band, soft lighting and clinical restraint. Change ONLY large descriptor from BPC-157 to exact 'PRODUCT', sized to fit legibly. Preserve exact other label text 'PROPEPTIQ' and 'RESEARCH USE ONLY'. No mg, prices, visible contents, claims, dose, certification, medical props, hands, or extra objects. Full vial and label sharp and readable. AI-generated conceptual product artwork, not documentation of actual packaging. Output one square image, not a grid.

Generation is nondeterministic; repeating a prompt does not promise identical pixels. The byte hashes identify the delivered files.

## Encoding and verification

Used existing lockfile-resolved Sharp 0.35.3, already installed with Next, for one-time asset optimization only; no dependency or production converter was added. The operation was `sharp(input).toColourspace('srgb').webp({ quality: 84, effort: 6 }).toFile(newOutput)`, with an explicit refusal to overwrite an existing target. No crop, resize, relabel or compositing occurred.

Manifest tests must verify exact WebP bytes/hashes, measured dimensions, all 56 canonical slugs, preservation of the original six and unchanged shared tail. Component/browser checks must verify card/PDP agreement, loaded images, live variant/price state, disclosure, keyboard gallery controls and reserved layout. Production performance and deployment receipts belong to the completion plan; asset creation alone is not deployment evidence.

## Catalog-wide continuation — remaining fifty fronts

Generated September 5, 2026 Pacific (September 6 UTC), using the same built-in tool and BPC-157 original anchor. These fifty new files total 1,959,314 bytes. Combined with the original six, the mapping covers all 56 catalog products. The five shared alternate scenes and original six fronts are unchanged; full product-specific alternate-view coverage is still unfinished. Asset creation and mapping do not constitute deployment evidence.

Each original was visually inspected for the supplied catalog spelling, complete label, framing and absence of additional claims. The Cargrilintide label was corrected before encoding because its first version reached the vial edges. Source PNGs, including the rejected first version, remain retained locally. The existing names of the BPC/TB and CJC/IPA blends contain amounts; those names are reproduced verbatim, not inferred from display labels. Ordinary multi-variant product fronts do not add an amount. All variants, prices and availability remain live catalog data, not image-derived facts.

### Exact generation template

The following template was used once for every name in the table, replacing both NAME placeholders with that exact name. The sole reference was the original BPC-157 image described above.

> Use case: product-mockup. Edit the provided BPC-157 illustration into the matching original PropeptIQ hero for NAME. Preserve the exact square framing, one centered clear glass laboratory vial, brushed silver crimp cap, warm ivory seamless studio background and paper label, teal lower band, soft key light and contact shadow. Change ONLY the large descriptor 'BPC-157' to the exact catalog product name 'NAME'. Use clear dark ink type, comfortably fit long names on two or three centered lines rather than tiny compressed text. Preserve exact other text 'PROPEPTIQ' and 'RESEARCH USE ONLY'. No additional text. If the provided product name itself contains mg amounts, reproduce those characters exactly as part of the product name only; do not add any other amount. Do not correct or normalize the supplied spelling. No prices, dosage instructions, contents, lot, SKU, certification, medical props, people, hands, needles, extra vials or objects. Vial, label and text fully visible and sharp. This is conceptual AI-generated catalog artwork, not verified packaging photography. One square image, no grid.

Cargrilintide correction, using its first generated original as reference:

> Edit this exact illustration. Preserve all framing, lighting, vial geometry, background, teal band, PROPEPTIQ and RESEARCH USE ONLY text. ONLY reduce the font size of the exact descriptor 'Cargrilintide' by 22 percent, keep it centered on a single line within the ivory label with generous blank space on both sides, so no letters touch or extend beyond the label edge. Do not change spelling or add any text.

### Actual optimized assets

| Slug | Exact supplied descriptor | File | Bytes | Output SHA-256 |
| --- | --- | --- | ---: | --- |
| hgh | HGH | [front-v1.webp](../../public/catalog/individual/hgh/front-v1.webp) | 37,552 | `83e03da22de66dd19ff871e8132274bace6104c17c57830ad2eee4983878e1d4` |
| ghk-cu | GHK-CU | [front-v1.webp](../../public/catalog/individual/ghk-cu/front-v1.webp) | 37,982 | `a9ab9684635c01cc52efdd8afb8028c5f2d68714bf117009bc4183086c3d94ed` |
| tesmorelin | Tesmorelin | [front-v1.webp](../../public/catalog/individual/tesmorelin/front-v1.webp) | 38,396 | `bb9a4db8f7e27c64c268f606303d9552e802398aa34a739e39ba2f80afaf2e9e` |
| tesmorelin-ipa | Tesmorelin + IPA | [front-v1.webp](../../public/catalog/individual/tesmorelin-ipa/front-v1.webp) | 43,126 | `19539cc9b24be4639cb5e7105b72cc9a787fefcaf225331ba5573b0c2bfd452c` |
| tb500 | TB500 (Thymosin B4 acetate) | [front-v1.webp](../../public/catalog/individual/tb500/front-v1.webp) | 42,602 | `57bcddbcf57823310045184e5737fe02f125e7634dddfa56d76f20edcd0c78ed` |
| bpc-tb-blend | BPC 5mg + TB 5mg | [front-v1.webp](../../public/catalog/individual/bpc-tb-blend/front-v1.webp) | 41,226 | `596921c9bdb9179e21fe7bb8422f20b9d045009768cf63d03d3e4d353d8721f0` |
| bpc-tb-blend-bb20 | BPC 10mg + TB 10mg | [front-v1.webp](../../public/catalog/individual/bpc-tb-blend-bb20/front-v1.webp) | 39,654 | `807ae0db1348e63d5c16609c9ea0121ed76562571a3fef68e29e063a6e5f0db1` |
| bpc-tb-blend-bb40 | BPC 20mg + TB 20mg | [front-v1.webp](../../public/catalog/individual/bpc-tb-blend-bb40/front-v1.webp) | 40,956 | `4dbbd91c4ac056ae525e3a632fb40625e44f7b03dcf8ffea7deb894148d6ac8b` |
| aod-9604 | AOD 9604 | [front-v1.webp](../../public/catalog/individual/aod-9604/front-v1.webp) | 39,366 | `459d1ae99505f9abcd9ded060c8dfd5bf3149af1700016435c492b1a715a1d57` |
| mots-c | MOTS-C | [front-v1.webp](../../public/catalog/individual/mots-c/front-v1.webp) | 38,836 | `a9c731019a25fbac950e3cf658e8f9fa2839432b7301d6cf81e9cd448adf204f` |
| semax-selank | Semax + Selank | [front-v1.webp](../../public/catalog/individual/semax-selank/front-v1.webp) | 39,816 | `54251b3874b03b9fa1aaa7d6ec48b1efedcdad400c301ec025777bcabd6f27df` |
| thymosin-alpha-1 | Thymosin Alpha-1 | [front-v1.webp](../../public/catalog/individual/thymosin-alpha-1/front-v1.webp) | 40,198 | `89ba1bdab87470784e1fe22470669c38a51a1d0db76f2c9e10aa07eb61f19bbd` |
| dsip | DSIP | [front-v1.webp](../../public/catalog/individual/dsip/front-v1.webp) | 38,504 | `a7e6783700a3fe694ccc0ca25274f5fd8c0f1f9987cb9a6113f97421b6cae71c` |
| cjc-1295-no-dac-ipa | CJC-1295 NO DAC 5mg + IPA 5mg | [front-v1.webp](../../public/catalog/individual/cjc-1295-no-dac-ipa/front-v1.webp) | 42,560 | `8806ef697845a0872acac9915f708084b98eeddc57187300c4e444c6fb88edec` |
| cjc-1295-no-dac-ipa-cp20 | CJC-1295 NO DAC 10mg + IPA 10mg | [front-v1.webp](../../public/catalog/individual/cjc-1295-no-dac-ipa-cp20/front-v1.webp) | 43,324 | `cdc8297a8aa3af4cc4e1064eda212c7927fb1f44fd8c0fc6a8343359d4e08036` |
| ipamorelin | Ipamorelin | [front-v1.webp](../../public/catalog/individual/ipamorelin/front-v1.webp) | 39,392 | `b8e6c3850ecca97b3843e2edabf55b28d02db4e1e23d5cfc4d7ae4ffde4c9829` |
| hcg | HCG | [front-v1.webp](../../public/catalog/individual/hcg/front-v1.webp) | 37,166 | `61fe155863957e96b23f7cfadd0138481fc995a54aca732a9815b553e2ef7df8` |
| cargrilintide | Cargrilintide | [front-v1.webp](../../public/catalog/individual/cargrilintide/front-v1.webp) | 40,270 | `6ef2d0dc417bb223c83328ce6bcc9223c6d55e1b299ca3cc7785900d5b98eb74` |
| sermorelin-acetate | Sermorelin Acetate | [front-v1.webp](../../public/catalog/individual/sermorelin-acetate/front-v1.webp) | 41,546 | `97f1477ade0de9377bf19cb9b497a88812c66d412df337fba25e08018d2ba846` |
| pt-141 | PT-141 | [front-v1.webp](../../public/catalog/individual/pt-141/front-v1.webp) | 36,930 | `6e92c3f5404bb51c26bf644d1d239352236c226fecfcfd7c34673b9c1fb6b68d` |
| glow | GLOW | [front-v1.webp](../../public/catalog/individual/glow/front-v1.webp) | 39,464 | `2f15c6e9f6be2b7956defc8b4a0210d393b920576eb08575c1b07358f54bca60` |
| oxytocin-acetate | Oxytocin Acetate | [front-v1.webp](../../public/catalog/individual/oxytocin-acetate/front-v1.webp) | 41,738 | `2167fc52938c91eca76d83286a5b8caa23a4127dacba2b7f2a863988457083e8` |
| ll37 | LL37 | [front-v1.webp](../../public/catalog/individual/ll37/front-v1.webp) | 34,688 | `03cc9e21372aa1566080f21e2512c490dd8fcbb74348fa24e2e85d81c185a60a` |
| glutathione | Glutathione | [front-v1.webp](../../public/catalog/individual/glutathione/front-v1.webp) | 38,668 | `66af5d42ba95075cd797db28acdad908c2a767f8b3a1c026722cbe4be2927328` |
| snap | SNAP | [front-v1.webp](../../public/catalog/individual/snap/front-v1.webp) | 36,886 | `3efa81d610264dad99001d7da07fc76b1b03b97c527f34060d00f9d3d95bdba3` |
| li-po-c | LI PO-C | [front-v1.webp](../../public/catalog/individual/li-po-c/front-v1.webp) | 37,600 | `1a5a2e8f38cdfe2e1f1a258646eb62aa9b3b7242477af117e55ec147cb6019a9` |
| li-po-c-without-b12 | LI PO-C without B12 | [front-v1.webp](../../public/catalog/individual/li-po-c-without-b12/front-v1.webp) | 39,186 | `fb481c3f2258b869c6aef67cbe98ab41008554fde481aaa7163af3b39eaa18e3` |
| lemon-bottle | Lemon bottle | [front-v1.webp](../../public/catalog/individual/lemon-bottle/front-v1.webp) | 38,134 | `adae8a0c400273612285bb21b7ee52a72e97c2d562699d6bf65ed1ec3fb46b36` |
| mt1 | MT1 | [front-v1.webp](../../public/catalog/individual/mt1/front-v1.webp) | 34,902 | `a4d6b4c7193b04c1fb0c13f4667b63b27ff2f7c8780032c77f2bd9badf1f69e4` |
| mt2 | MT2 | [front-v1.webp](../../public/catalog/individual/mt2/front-v1.webp) | 36,712 | `66fd6b4b4e2c27b7652c605c6a1608c56d51cc91fecddf4a957669b3f048dd9b` |
| ss-31 | SS-31 | [front-v1.webp](../../public/catalog/individual/ss-31/front-v1.webp) | 39,632 | `9e9d0f65e27fee320b8f9fe576bdc337698c967f6e804087e3a58c1d07be6f41` |
| klow | KLOW | [front-v1.webp](../../public/catalog/individual/klow/front-v1.webp) | 37,346 | `7c35253cd5508e716519bdd90ad806eb7b43c96fd1b22ad530a046ba4f65ec20` |
| 5-amino-1mq | 5-amino-1mq | [front-v1.webp](../../public/catalog/individual/5-amino-1mq/front-v1.webp) | 41,138 | `1a1f95c81efa989290874612ed638afbb46d910f0f88254ff8cc498aa83e14f5` |
| kisspeptin | KissPeptin | [front-v1.webp](../../public/catalog/individual/kisspeptin/front-v1.webp) | 37,872 | `e1f5d78165d9a213bdadff6bd991d9c199810b3dd21a3a97dbea0ce419a4a9cf` |
| pinealon | Pinealon | [front-v1.webp](../../public/catalog/individual/pinealon/front-v1.webp) | 37,820 | `bf41acc3417cbf520c39def6f026e070697865b65afb52093ad23778332d60c7` |
| pe-22-28 | PE-22-28 | [front-v1.webp](../../public/catalog/individual/pe-22-28/front-v1.webp) | 40,498 | `04c43a612af6dae7b1e302b4a76ff13b35188bc995073a25b624f88b329fcac2` |
| igf-1-lr3 | IGF-1 LR3 | [front-v1.webp](../../public/catalog/individual/igf-1-lr3/front-v1.webp) | 38,692 | `4c842a44792f14161eec36748500df2e308b348c9cbb266b2f700573f30ac709` |
| ara-290 | ARA-290 | [front-v1.webp](../../public/catalog/individual/ara-290/front-v1.webp) | 39,532 | `dd6eaaf4008a4fd618c7763e44b282ff08ed1decb38f1a5edfc83cac30156ae5` |
| acetic-acid | Acetic Acid | [front-v1.webp](../../public/catalog/individual/acetic-acid/front-v1.webp) | 42,762 | `8fee30e341e232bc471b2f0084190e79fdf8cfbfae8e20fff027c8d6de1fab7e` |
| semaglutide | Semaglutide | [front-v1.webp](../../public/catalog/individual/semaglutide/front-v1.webp) | 40,238 | `49be36892028545713483ce2966f476b21a67b45fc9b0a895b3ca6ab950d0212` |
| kpv | KPV | [front-v1.webp](../../public/catalog/individual/kpv/front-v1.webp) | 37,054 | `34ed81f79d6a872d555f5dd287a89c107db202c5bf332624e6d999248e52e6cd` |
| epithalon | Epithalon | [front-v1.webp](../../public/catalog/individual/epithalon/front-v1.webp) | 38,076 | `d5efb8ee5f53ac251add00f43ed11c116ee4c030300c71d13599c093594182ea` |
| cjc-1295-with-dac | CJC-1295 with DAC | [front-v1.webp](../../public/catalog/individual/cjc-1295-with-dac/front-v1.webp) | 40,892 | `26b2d4ab766cfb4ef4c8cfc2ef11a1ecfe332a68216662c7c416951e96199e57` |
| cjc-1295-no-dac | CJC-1295 NO DAC | [front-v1.webp](../../public/catalog/individual/cjc-1295-no-dac/front-v1.webp) | 41,604 | `20e80cb1b3366978d4dd2086a09e11174049b0106de051a8744bc104830252e0` |
| grp-2 | GRP-2 | [front-v1.webp](../../public/catalog/individual/grp-2/front-v1.webp) | 38,852 | `cb42b12eeb009c37f0a7205c8496402a62222a6d937d45b78d9b023fb8430904` |
| vip | VIP | [front-v1.webp](../../public/catalog/individual/vip/front-v1.webp) | 36,658 | `1fa1eb0636e7f7619c58f0b96c42cb14916f9e7239cc7d2329154cb169ad5add` |
| survodutide | Survodutide | [front-v1.webp](../../public/catalog/individual/survodutide/front-v1.webp) | 39,012 | `de2755df546dae2b95ec1f28880c17166d89fab4e035b1959eaa3aab4209c81e` |
| admax | Admax | [front-v1.webp](../../public/catalog/individual/admax/front-v1.webp) | 37,920 | `fb9cc121470e46a56afc81ae83bd3a7257f1ecad7accc1e5df6c867f58b93dc0` |
| cartalax | Cartalax | [front-v1.webp](../../public/catalog/individual/cartalax/front-v1.webp) | 37,552 | `8bdcfdea4893f1bcbd02e430a19464488040efd7ee35c310dbe9b8ffd19fd853` |
| bac-water | Bac water | [front-v1.webp](../../public/catalog/individual/bac-water/front-v1.webp) | 38,784 | `90522683ceb92f53af162967418483edd6381189658f4d3baf98bc216b7f70fb` |

Input hashes and measured output metadata are recorded in the visual manifest. Encoding remains Sharp 0.35.3, sRGB WebP quality 84 / effort 6, with unchanged 1,254-square dimensions and no compositing. No original artwork or other production asset was deleted.
