# Individual alternate gallery artwork

## Scope and status

Thirty original alternate illustrations for BPC-157, Tirzepatide, Retatrutide, NAD+, Semax and Selank, generated September 6, 2026 with the built-in image-generation tool. Each product receives five views in the existing order: three-quarter, multi-vial-study, copy-space-detail, overhead, ambient-studio. The existing 56 individual front assets and six shared masters are unchanged. This is not completion of all 280 alternate images: 250 alternates for the other 50 products remain shared.

These are conceptual product illustrations, not verified photographs of physical packaging, contents, scale or package quantities. The existing gallery disclosure and scene-specific truth notes remain required. No new amount, ingredient, stock, claim, certification or third-party image was introduced. Original generation files and earlier assets were retained; no asset deletion.

## Design and processing

The existing BPC-157 front was the design reference for five original BPC-157 scene generations. Each matching BPC-157 scene then served as the edit reference for the other five product descriptors. Exact prompts appear below. All 30 generated originals were visually inspected for spelling, label fit, complete vial boundaries, lighting/composition consistency and absence of unsupported props or claims.

Only format optimization was performed after generation, using the existing Sharp 0.35.3: `sharp(input).toColourspace('srgb').webp({ quality: 84, effort: 6 })`. No crop, resize, compositing or scripted lettering. Every source and output is 1,254 × 1,254 pixels. Actual combined encoded size: 1,382,048 bytes.

Each final workspace asset is `public/catalog/individual/<slug>/<scene>-v1.webp`. These map through `src/components/commerce/catalog-product-visual-manifest.ts`, not through pricing, catalog facts or provider configuration. Adding a reviewed set later requires its exact file path, measured dimensions and input/output hashes. Do not silently remap a product to another product's labeled image.

## Asset integrity register

| Product slug | Scene | WebP bytes | Original PNG SHA-256 | Delivered WebP SHA-256 |
| --- | --- | ---: | --- | --- |
| bpc-157 | three-quarter | 50812 | `80bbed05f7483e35d63ce9dd88e46c2607003b7dccf4daab169a151eed45bcb8` | `16ac54de8690cc9c723f14d439048bcd6ed85d06683709d130543c89dcae970e` |
| bpc-157 | multi-vial-study | 52370 | `833d0c2d07f8dbc26af6cdef2529aaa6af154662187ce45a02257c38811af65c` | `34a4a4b71cbb858008aadf7d7e7c03476f31ea843cefc68e7409000278acb003` |
| bpc-157 | copy-space-detail | 31270 | `030078125785a7a917e87281899fd62e913aa87aae7713047e4567696ce37064` | `db8367ce4190320b18518d235c8a8fd6c7bdbf354bae2481e3a0bde78ab80650` |
| bpc-157 | overhead | 47324 | `09008ce87bb9e806129c31dcf1b75870d4b416d308f5204b5030e14e447566b2` | `3b6212949c0daaeb1e574bb7082256a0aba9ec1cfba26f8823961a60fec18b69` |
| bpc-157 | ambient-studio | 50286 | `0827d04ceb0ced5e4ad17f1279fdf3c92f2f8ab0b0150a26f83f337cdfbe8bd2` | `52780ad0b5fb8122bf8fb5c83a6ddf453f9d6c69a96f36a8401fb628e1e7a0c5` |
| tirzepatide | three-quarter | 49572 | `ec5dfe448fc24a76de6ef4c12ba569b8a488e757bda0f39dc723848a64f6040d` | `af0e761bd31ee3d53150644758a985f465bfa908cd12cda7013454c399595d3b` |
| tirzepatide | multi-vial-study | 54712 | `7403fbd967b549a5b01ec828ec5e0cad26c3c69800f06a8c620d3e1d27603daa` | `d5144530a355b93548bd26c77949157e0f7aeea0e2b8b69c451d9916eaf172db` |
| tirzepatide | copy-space-detail | 32462 | `95cb21fa36c89e852f3e538cbbe34e6482eb94c6d7f512c97a2b5dad1a57aca1` | `4f743657078ed3da22516cb2e338ee08ba11ecd09f0e7b7f3caa4a27539aa885` |
| tirzepatide | overhead | 44962 | `666b339ddf72dfe8fc0354a491b8b3dad7782f5448afd6667a408cfc6e99492a` | `9dbcc1f70d9fca89cc4c12365289fa01efd566f5a093b5681ea538b4326becce` |
| tirzepatide | ambient-studio | 50258 | `d61497fe7a11ba4cf62da804337a9b00a0e45b1a45845dd935f5ae33dd215744` | `25f89ff909494ceb48611f75a27cd077bc93ae14e7babde90a022023899c3e87` |
| retatrutide | three-quarter | 49896 | `8629e93aed48a9a3d5ca168e03b132d3eec73a8915fda8a356c3f2f576a6b499` | `a66dd47902ad696f2d9eadf0377dba788e875f6607eccf80d3ac65fa95822095` |
| retatrutide | multi-vial-study | 55624 | `a86ae49e5d42c6933852e0689a18a14172145d65de344922ae503359d98294b4` | `da7550d7a75ca88831ebab9a5ee2210d6e5295ea1b09c960c1510a8e1ec9b70f` |
| retatrutide | copy-space-detail | 33636 | `6c8e09c4eb62c731c60cab7bbdd9fd8e143f80014ae1de9686c69fb745186ad9` | `c066184519abbc12167e08cee0f9c157309cda9d23ff17bba2fe5e73d1eb5883` |
| retatrutide | overhead | 45440 | `955cf4d588b76f51bb21b858d5980c49dda9e27b6cf89cef64b6ae16a0dca28e` | `1a55529a0a3a29e9970fc2ea98f9523f0d5317c91199dc5f29b695b78846e1d2` |
| retatrutide | ambient-studio | 51406 | `055cf3e2204e16dfa81c417ff0ca6a91d87cfe5227935a28db21f8d313893757` | `08a8dd0d7739f5fc907b96069904dbe1e3a94abbc425c5582f9be49ee0697f8f` |
| nad-plus | three-quarter | 49552 | `788fe63bd49c8121e49b4cc92ce57cfbd053a851726cfad5ddc85c390ccbfdfc` | `57540642d052ae9af9bd3616e53c5fa1f8b1d95e28bb0b9cbeeaa0f758a8aa6b` |
| nad-plus | multi-vial-study | 52094 | `38412355002807e80b88ad6388a6744a397adf300b9bcef11d4e115ce3f5aa9c` | `410e72fa93e65b51504b71a2c64f8370e1fdc7cd361ea7f8123be5973ef0ab54` |
| nad-plus | copy-space-detail | 30564 | `fe99f3b17156af1d7552494281fd9156192c4a399fb530cb5d01878b3cd8278a` | `3f1aec7262fe1e33cd6ef7ba6f8c1f3f1af2fb472f45277c6b3feb374615b3dc` |
| nad-plus | overhead | 42258 | `8b8af8970a3a3ef6883258e96cec091b9e7af3694d8364dadfc6f0d522e0ee31` | `01299ba9b6de5d5288ae6f841846b5fda68ed54cf758a5d51c92e866148447b7` |
| nad-plus | ambient-studio | 47504 | `34a9de8d5ac469a54e58eadf41f977839846e70d911ab1610e08151b1bc4ed58` | `f0818bb5e4960997da4a2598db97077a3b5d734fd8880ee132206f861290efee` |
| semax | three-quarter | 50036 | `a7536edea9efc21e6a67724a28c7e0997e81d9e1b6fa175985a4bf135dd6454b` | `0850a79420a9b64e055f7db30a47bd8adc6c2b494443958b66b77e11c3c1ae8d` |
| semax | multi-vial-study | 54600 | `f03f9b09bb1ec64307ce55eee39e7740814b8c7fc0dfad3145a032d8af93e64f` | `0e974cd9a0e947abc8744f3d8de23454ad116c30167c5c3f2274d0fa3cb36e82` |
| semax | copy-space-detail | 31566 | `1c6009c7aff7d55dbe22bc16aa9b784d33f2ef962dbf98d0f36fa41db9328cb7` | `c73a29229320e9eb915b4d9caf3dcb1f9d6a7d2bab841cfd771cdf913069573c` |
| semax | overhead | 43896 | `6a5d97ae65099c1cc45d9878cce0823b40ebca3f8c6938679dc3dfa8b1aa0ecb` | `6fab9a372d80728908d85c9a994e34e915f3da75b7f40635b3e71fff90dbac08` |
| semax | ambient-studio | 50712 | `d4ea3d4ff14c9014ec294d34ddd501e8a4bb3fd081c9bec769147bac7dec495c` | `d0b02c17adf4f596a3d5766776856d564758f808046901a54c0df9a292f6837e` |
| selank | three-quarter | 46320 | `5f31705c2691ea68994e64d13c78f89ba73e8f64c2cfa4a1e5703fefa0625cf5` | `fc341029cb3a928672431259c1fdcce2ef0316e29eb4c29afc3a5c379ff47fc1` |
| selank | multi-vial-study | 53900 | `86de0ca20a0b1f362b513775d0ec2b2a1527b10a363ee335c225d4de254aa361` | `e153a8043b5b59de0593a43511c9466067f48fa9740c38497e6ac780a51a9dd6` |
| selank | copy-space-detail | 31922 | `81c38103886b4d629b0c4ec33431379c910013a171f2daf01e3f12ef9f9d63a9` | `8c2b6ca3755f262054f742ba94553d6782b2afd5d03572232ebe51f1a5100b6d` |
| selank | overhead | 44816 | `939bbc621c64da24e9b19860ca2fe0e49d49102483648cff4982441cbce1435d` | `216e525da72140545052675f546a62c648b9a53dbcfc6cfaf805e33130285647` |
| selank | ambient-studio | 52278 | `01df3372d2b0cb74389cb16e13c15d8c99d0a6a0e412aacd2b2695d414034807` | `455285ae7323625c169099be842efe2b66149de7db67ad99180cb2039d5fedf0` |

## Exact prompt set

### BPC-157 — three-quarter

```text
Use case: product-mockup. Image 1 is the original PropeptIQ BPC-157 catalog illustration and the exact design reference. Create its matching THREE-QUARTER alternate view: exactly one same clear laboratory vial with brushed silver crimp cap, warm ivory paper label, dark ink lettering and deep teal lower band. Rotate the vial gently 25 degrees to the right, with the label still readable; camera slightly above eye level and closer than the front shot, but keep the entire cap, glass base and label within the square frame with comfortable margins. Preserve exact text only 'PROPEPTIQ', 'BPC-157', 'RESEARCH USE ONLY'. Preserve soft upper-left studio lighting, warm ivory seamless background, realistic glass and metal response, understated contact shadow. All product lettering sharp and comfortably inside the label. No mg, SKU, price, fill, ingredients, claims, certifications, people, hands, needles, extra props or vials. Original conceptual artwork, not documentation of actual packaging. One square high-resolution image, no grid.
```

### BPC-157 — multi-vial-study

```text
Use case: product-mockup. Image 1 is the exact PropeptIQ BPC-157 design reference. Create a three-vial studio composition: exactly three identical BPC-157 vials, staggered in depth, one centered in front fully sharp and two slightly behind with gently softened depth of field. All three caps and glass bases fit inside the square frame, no overlapping typography on the front vial. This is a visual composition, not a claim about package quantity. Preserve the clear laboratory glass vial, brushed silver crimp cap, warm ivory label, dark ink typography and deep teal lower band of the reference. Exact text only: 'PROPEPTIQ', 'BPC-157', 'RESEARCH USE ONLY'. No additional text, mg, SKU, prices, fill, visible contents, ingredients, certifications, product claims, people, needles, syringes or third-party branding. Keep labels accurate, no warped letters or clipped objects. Premium restrained photorealistic conceptual product illustration, not actual packaging documentation. One square high-resolution image, no grid.
```

### BPC-157 — copy-space-detail

```text
Use case: product-mockup. Image 1 is the exact PropeptIQ BPC-157 design reference. Create an offset studio composition: exactly one same BPC-157 vial standing upright in the left third of the square image, fully visible and sharply focused, with generous uncluttered ivory negative space on the right. The label remains clearly readable. No additional objects or ingredient props. Preserve the clear laboratory glass vial, brushed silver crimp cap, warm ivory label, dark ink typography and deep teal lower band of the reference. Exact text only: 'PROPEPTIQ', 'BPC-157', 'RESEARCH USE ONLY'. No additional text, mg, SKU, prices, fill, visible contents, ingredients, certifications, product claims, people, needles, syringes or third-party branding. Keep labels accurate, no warped letters or clipped objects. Premium restrained photorealistic conceptual product illustration, not actual packaging documentation. One square high-resolution image, no grid.
```

### BPC-157 — overhead

```text
Use case: product-mockup. Image 1 is the exact PropeptIQ BPC-157 design reference. Create a true directly overhead flat-lay: exactly one same BPC-157 vial lying horizontally on the warm ivory surface with its label facing straight upward toward the camera; cap at upper left and glass base at lower right, diagonally composed, all vial boundaries comfortably inside the square. Keep exact label lettering readable and naturally wrapped. No ruler or scale marker, no hands. This is not a physical scale reference. Preserve the clear laboratory glass vial, brushed silver crimp cap, warm ivory label, dark ink typography and deep teal lower band of the reference. Exact text only: 'PROPEPTIQ', 'BPC-157', 'RESEARCH USE ONLY'. No additional text, mg, SKU, prices, fill, visible contents, ingredients, certifications, product claims, people, needles, syringes or third-party branding. Keep labels accurate, no warped letters or clipped objects. Premium restrained photorealistic conceptual product illustration, not actual packaging documentation. One square high-resolution image, no grid.
```

### BPC-157 — ambient-studio

```text
Use case: product-mockup. Image 1 is the exact PropeptIQ BPC-157 design reference. Create an ambient studio view: exactly one same BPC-157 vial upright on a pale matte stone surface, soft natural window light from upper left, faint gentle organic light/shadow in an otherwise uncluttered warm ivory background. Vial centered, fully visible, entire label readable and sharp. No plants, medical props or other objects. Preserve the clear laboratory glass vial, brushed silver crimp cap, warm ivory label, dark ink typography and deep teal lower band of the reference. Exact text only: 'PROPEPTIQ', 'BPC-157', 'RESEARCH USE ONLY'. No additional text, mg, SKU, prices, fill, visible contents, ingredients, certifications, product claims, people, needles, syringes or third-party branding. Keep labels accurate, no warped letters or clipped objects. Premium restrained photorealistic conceptual product illustration, not actual packaging documentation. One square high-resolution image, no grid.
```

### Tirzepatide — three-quarter

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ three-quarter scene to edit. Change ONLY the product descriptor BPC-157 to TIRZEPATIDE on every vial. Exact label text: PROPEPTIQ / TIRZEPATIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Tirzepatide — multi-vial-study

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ multi-vial-study scene to edit. Change ONLY the product descriptor BPC-157 to TIRZEPATIDE on every vial. Exact label text: PROPEPTIQ / TIRZEPATIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Tirzepatide — copy-space-detail

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ copy-space-detail scene to edit. Change ONLY the product descriptor BPC-157 to TIRZEPATIDE on every vial. Exact label text: PROPEPTIQ / TIRZEPATIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Tirzepatide — overhead

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ overhead scene to edit. Change ONLY the product descriptor BPC-157 to TIRZEPATIDE on every vial. Exact label text: PROPEPTIQ / TIRZEPATIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Tirzepatide — ambient-studio

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ ambient-studio scene to edit. Change ONLY the product descriptor BPC-157 to TIRZEPATIDE on every vial. Exact label text: PROPEPTIQ / TIRZEPATIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Retatrutide — three-quarter

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ three-quarter scene to edit. Change ONLY the product descriptor BPC-157 to RETATRUTIDE on every vial. Exact label text: PROPEPTIQ / RETATRUTIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Retatrutide — multi-vial-study

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ multi-vial-study scene to edit. Change ONLY the product descriptor BPC-157 to RETATRUTIDE on every vial. Exact label text: PROPEPTIQ / RETATRUTIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Retatrutide — copy-space-detail

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ copy-space-detail scene to edit. Change ONLY the product descriptor BPC-157 to RETATRUTIDE on every vial. Exact label text: PROPEPTIQ / RETATRUTIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Retatrutide — overhead

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ overhead scene to edit. Change ONLY the product descriptor BPC-157 to RETATRUTIDE on every vial. Exact label text: PROPEPTIQ / RETATRUTIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Retatrutide — ambient-studio

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ ambient-studio scene to edit. Change ONLY the product descriptor BPC-157 to RETATRUTIDE on every vial. Exact label text: PROPEPTIQ / RETATRUTIDE / RESEARCH USE ONLY. Fit the longer word cleanly inside the same ivory label with generous margins; keep the dark geometric typography. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### NAD+ — three-quarter

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ three-quarter scene to edit. Change ONLY the product descriptor BPC-157 to NAD+ on every vial. Exact label text: PROPEPTIQ / NAD+ / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### NAD+ — multi-vial-study

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ multi-vial-study scene to edit. Change ONLY the product descriptor BPC-157 to NAD+ on every vial. Exact label text: PROPEPTIQ / NAD+ / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### NAD+ — copy-space-detail

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ copy-space-detail scene to edit. Change ONLY the product descriptor BPC-157 to NAD+ on every vial. Exact label text: PROPEPTIQ / NAD+ / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### NAD+ — overhead

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ overhead scene to edit. Change ONLY the product descriptor BPC-157 to NAD+ on every vial. Exact label text: PROPEPTIQ / NAD+ / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### NAD+ — ambient-studio

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ ambient-studio scene to edit. Change ONLY the product descriptor BPC-157 to NAD+ on every vial. Exact label text: PROPEPTIQ / NAD+ / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Semax — three-quarter

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ three-quarter scene to edit. Change ONLY the product descriptor BPC-157 to SEMAX on every vial. Exact label text: PROPEPTIQ / SEMAX / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Semax — multi-vial-study

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ multi-vial-study scene to edit. Change ONLY the product descriptor BPC-157 to SEMAX on every vial. Exact label text: PROPEPTIQ / SEMAX / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Semax — copy-space-detail

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ copy-space-detail scene to edit. Change ONLY the product descriptor BPC-157 to SEMAX on every vial. Exact label text: PROPEPTIQ / SEMAX / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Semax — overhead

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ overhead scene to edit. Change ONLY the product descriptor BPC-157 to SEMAX on every vial. Exact label text: PROPEPTIQ / SEMAX / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Semax — ambient-studio

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ ambient-studio scene to edit. Change ONLY the product descriptor BPC-157 to SEMAX on every vial. Exact label text: PROPEPTIQ / SEMAX / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Selank — three-quarter

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ three-quarter scene to edit. Change ONLY the product descriptor BPC-157 to SELANK on every vial. Exact label text: PROPEPTIQ / SELANK / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Selank — multi-vial-study

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ multi-vial-study scene to edit. Change ONLY the product descriptor BPC-157 to SELANK on every vial. Exact label text: PROPEPTIQ / SELANK / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Selank — copy-space-detail

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ copy-space-detail scene to edit. Change ONLY the product descriptor BPC-157 to SELANK on every vial. Exact label text: PROPEPTIQ / SELANK / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Selank — overhead

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ overhead scene to edit. Change ONLY the product descriptor BPC-157 to SELANK on every vial. Exact label text: PROPEPTIQ / SELANK / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

### Selank — ambient-studio

```text
Use case: text-localization / product-mockup. Image 1 is the exact original PropeptIQ ambient-studio scene to edit. Change ONLY the product descriptor BPC-157 to SELANK on every vial. Exact label text: PROPEPTIQ / SELANK / RESEARCH USE ONLY. Keep the dark geometric typography, centered product descriptor and generous label margins. Preserve exactly the scene, number of vials, camera angle, crop, glass, silver cap, teal band, warm ivory backdrop, lighting, shadow, all object boundaries and square high resolution. No new text, mg, claims, ingredients, fill, hands, medical props, certification or branding. Original conceptual catalog illustration, not actual packaging documentation. One image, no grid.
```

