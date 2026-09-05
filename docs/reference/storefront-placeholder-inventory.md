# Storefront illustrative-content inventory

Inspection date: September 5, 2026. Baseline: `19d3f2d8850847df8ae0b243192059393f9d27a9` (PR #20). This is an inventory, **not deletion approval**. No listed asset, copy, fixture, or link has been removed by this audit.

The owner approved original illustrative imagery and `/` social placeholders. Those exceptions remain intentional. New photographic assets, product claims, final policies and technical/storage copy are not supplied by this inventory.

## Proposed actions

| Artifact and source | Current reachability/evidence | Proposed action | Replacement and recovery |
| --- | --- | --- | --- |
| 56 older product illustrations, exact paths below; binary line N/A. Catalog references are generated at `src/catalog/browse-catalog.ts:82–88`. | Still served as public URLs and retained in catalog metadata. The primary catalog/PDP/related visual uses the new six-scene manifest instead. Metadata references mean these are **not proved dead**. | Preserve. Consider retirement only after approving every path and reconciling all catalog metadata/alternate consumers. Do not delete merely because the primary gallery changed. | Six new shared scenes already exist, but do not represent 56 actual product photo sets. Original bytes remain in this baseline commit. |
| `public/catalog/vial-base-v2.png`; binary line N/A. | No non-document source reference found in the inspected worktree; directly accessible as a public asset. It is a candidate unused older master, not automatically disposable. | Candidate removal only after explicit row approval and a final reference scan. | Current front scene is `public/catalog/visual-masters/front.webp`; retain Git history for recovery. |
| `public/brand/propeptiq-logo.png`; binary line N/A. | No current non-document source reference found. Header/footer use `BrandMark`, including the separately retained mark below. Direct public URL still exists. | Candidate removal only after explicit row approval and checking any external use. | Current wordmark is rendered by `src/components/site/brand-mark.tsx`; original file remains recoverable from this baseline. |
| `public/brand/propeptiq-mark.png`; used by `src/components/site/brand-mark.tsx:23`. | Actively rendered and covered by current browser tests. | Keep. It is not an unused logo merely because the wordmark changed. | No replacement required. |
| Six current generated masters in `public/catalog/visual-masters/`; manifest/disclosure at `src/components/commerce/catalog-product-visual-manifest.ts:1–21`. | Live primary gallery/cards. Explicit disclosure: AI-generated illustration, not actual product photography. Multi-vial/overhead truth notes prevent package/scale implications. | Keep owner-authorized illustrations. Replace only with approved new imagery; do not remove the disclosure while imagery remains illustrative. | Actual product photography is not present. These files and hashes are retained in the manifest. |
| Generated product overview/catalog-record/literature-discovery copy in `src/content/storefront-product-content.ts:13–14,49–100`. | Live controlled content. Approval note explicitly identifies owner-authorized neutral placeholder copy. PubMed discovery links are searches, not the separate verified bibliography. | Replace incrementally with sourced, product-specific copy when supported. Do not delete all product information or invent technical/storage facts. | Verified bibliography currently covers 17 compounds; it does not substantiate broader claims or replace missing product specifications. Recover prior wording from baseline. |
| Six Why Choose and eight FAQ records in `src/content/storefront-content.ts:42–164`. | Live homepage and shared search/schema. Neutral operational wording; approval note distinguishes it from final business-reviewed copy. | Keep the functioning section. Replace individual records only with owner-approved, supportable wording; update visible FAQ and JSON-LD from the same source. | Testing, clinical-dose, purity, cGMP and guarantee claims require real supporting business evidence; none is supplied here. |
| Social URLs in `src/lib/site-content.ts:281–285`. | Instagram, TikTok, X and Facebook currently target `/`, as expressly requested. | Keep the approved placeholders until exact profiles are supplied. | Four real profile URLs are still needed; do not guess account handles. |
| Missing legal/support destinations in `src/lib/site-content.ts:253–267`; disabled newsletter configuration at `:199–211`. | Null destinations are omitted. Newsletter is unavailable, not a simulated success. | Replace with real approved destinations/provider behavior; do not create empty policies or invent legal approval. | Privacy/contact/shipping/returns/refund/FDA content and newsletter activation decisions remain open. |
| Synthetic catalog/demo geometry: `src/catalog/demo-fixtures.ts`, `src/components/site/demo-notice.tsx`, `src/components/commerce/product-card.tsx:24–38`. | Explicitly synthetic/local-only authority. `src/catalog/catalog-source.ts:22–66` rejects demo mode for production; `next.config.ts:4–29` selects a disabled production module. Current artifact scan proves the configured build has zero forbidden matches. | Keep necessary local/test fixtures and guards. Do not confuse test data with published catalog content or remove verification coverage. | No production replacement required. |

## Exact older product-illustration set (56 files)

All are under `public/catalog/`; the set is listed literally to prevent a broad directory deletion from including the new `visual-masters` directory or other assets.

```text
5-amino-1mq.webp
acetic-acid.webp
admax.webp
aod-9604.webp
ara-290.webp
bac-water.webp
bpc-157.webp
bpc-tb-blend-bb20.webp
bpc-tb-blend-bb40.webp
bpc-tb-blend.webp
cargrilintide.webp
cartalax.webp
cjc-1295-no-dac-ipa-cp20.webp
cjc-1295-no-dac-ipa.webp
cjc-1295-no-dac.webp
cjc-1295-with-dac.webp
dsip.webp
epithalon.webp
ghk-cu.webp
glow.webp
glutathione.webp
grp-2.webp
hcg.webp
hgh.webp
igf-1-lr3.webp
ipamorelin.webp
kisspeptin.webp
klow.webp
kpv.webp
lemon-bottle.webp
li-po-c-without-b12.webp
li-po-c.webp
ll37.webp
mots-c.webp
mt1.webp
mt2.webp
nad-plus.webp
oxytocin-acetate.webp
pe-22-28.webp
pinealon.webp
pt-141.webp
retatrutide.webp
selank.webp
semaglutide.webp
semax-selank.webp
semax.webp
sermorelin-acetate.webp
snap.webp
ss-31.webp
survodutide.webp
tb500.webp
tesmorelin-ipa.webp
tesmorelin.webp
thymosin-alpha-1.webp
tirzepatide.webp
vip.webp
```

Current retained scene files: `front.webp`, `three-quarter.webp`, `multi-vial-study.webp`, `copy-space-detail.webp`, `overhead.webp`, and `ambient-studio.webp` under `public/catalog/visual-masters/`.

## Verification and limits

- Enumerated `public/` and counted exactly 56 top-level catalog WebPs; new masters are a separate six-file directory.
- Traced old image URL generation and public metadata projection in `browse-catalog.ts` and `storefront-public.ts`. References are still present, so no zero-reference deletion claim is made.
- Searched non-test public component/content/site-configuration files for lorem ipsum, testimonial/“as seen in” strings, purity-style percentages, clinically-dosed/cGMP/third-party-tested wording. No matching invented-review or unsupported marketing artifact was found in that scoped text scan. This is not a legal substantiation audit or proof about live databases/external services.
- Input `placeholder` attributes, deterministic visual identifiers, approved catalog arrays and clearly isolated test fixtures are not dummy customer-facing records merely because they match broad search terms.
- No external asset consumers, deployment settings, live database records, secrets or newsletter addresses were inspected. No deletion or provider operation occurred.

**Approval boundary:** Stop before any cleanup. The owner must name the rows/files to retire or replace. Recheck reachability on the final change head, execute only accepted paths, retain recoverable history, and rerun asset/link/build/browser checks afterward. Other independent storefront work can continue without deleting this content.
