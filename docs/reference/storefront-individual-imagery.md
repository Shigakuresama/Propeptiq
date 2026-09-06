# Individual product artwork — first six fronts

Generated September 5, 2026 Pacific (September 6 UTC) with the built-in image-generation tool, then encoded without creative alteration. These are original AI-generated catalog illustrations, **not actual packaging photographs or evidence of product contents, testing, quality, or availability**. No owner approval of physical packaging is asserted. Public disclosure remains visible.

## Release scope

New fronts: BPC-157, Tirzepatide, Retatrutide, NAD+, Semax, Selank. Each is 1,254 × 1,254 pixels, sRGB WebP. The shared gallery's other five scenes remain unchanged. The other fifty products retain the shared front until their own artwork is delivered. This does not complete the full per-product six-view requirement.

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

Manifest tests must verify exact WebP bytes/hashes, measured dimensions, six canonical slugs and unchanged shared tail. Component/browser checks must verify card/PDP agreement, loaded images, live variant/price state, disclosure, keyboard gallery controls and reserved layout. Production performance and deployment receipts belong to the completion plan; asset creation alone is not deployment evidence.
