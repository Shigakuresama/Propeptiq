const motifs: Record<string, string> = {
  "owner-supplied-records": "M33 34h34v40H33z M40 44h20 M40 52h20 M40 60h13",
  "clear-purchase-states": "M30 39h40v32H30z M38 33v12 M62 33v12 M40 55l7 7 14-15",
  "exact-variant-identity": "m27 42 23-12 23 12-23 12z M27 52l23 12 23-12 M27 62l23 12 23-12",
  "visible-quantity-pricing": "M33 30h34v44H33z M40 39h20 M41 51h3 M56 51h3 M41 61h3 M56 61h3",
  "shared-search-index": "M59 57l15 15 M62 46a17 17 0 1 1-34 0 17 17 0 0 1 34 0 M38 46h14 M45 39v14",
  "research-use-boundary": "M41 28h18 M44 28v21L30 70q-3 5 3 5h34q6 0 3-5L56 49V28 M38 58h24",
};

/** Original geometric illustrations. Decoration, never certification seals. */
export function BrandIllustration({ kind }: { kind: string }) {
  return <svg className="brand-illustration" viewBox="0 0 100 100" aria-hidden="true" focusable="false" fill="none">
    <rect x="14" y="18" width="72" height="72" rx="22" fill="currentColor" opacity=".08" />
    <rect x="10" y="10" width="72" height="72" rx="22" fill="var(--canvas)" stroke="currentColor" strokeOpacity=".2" />
    <circle cx="72" cy="22" r="10" fill="currentColor" opacity=".14" />
    <g className="brand-illustration__motif" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={motifs[kind] ?? motifs["owner-supplied-records"]} />
    </g>
    <circle cx="23" cy="76" r="4" fill="currentColor" />
  </svg>;
}
