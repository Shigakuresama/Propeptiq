<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PROPEPTIQ design system

### Heading typography rule

Customer-facing titles and headings visually render in uppercase through the shared
typography rules in `src/app/globals.css`. This includes page, section, subsection,
card/module, FAQ question, footer and promotional headings. Preserve semantic HTML
heading order and original source text.

Examples: RESEARCH MATERIALS DOCUMENTED WITH CLARITY; WHY CHOOSE PROPEPTIQ;
FREQUENTLY ASKED QUESTIONS; QUALITY RECORDS; PARTNER PROGRAM.

Do not uppercase paragraphs, product descriptions, input values, customer-entered
text, legal copy or buttons unless intentionally designed that way. A heading that
contains customer-entered text uses `data-heading-case="preserve"`; any other
exception must document its reason beside the component.

Retain the editorial Newsreader/Geist system, white and subtle neutral surfaces and restrained
teal accents. Reuse shared surfaces and 160–260ms color/border transitions. Keep
44px practical targets, visible focus, reduced-motion support and stable layouts
at 375/768/1024/1440px and 200% zoom. Commerce and program values stay server-owned.

## Storefront implementation rules

1. Publish no placeholder copy, unfinished feature descriptions, dummy statistics, dead controls, or fake success states.
2. Keep internal implementation terminology in developer documentation, outside storefront content.
3. Use the shared uppercase treatment for customer-facing titles and headings, with responsive scales, natural wrapping, and sufficient line height. Preserve logo treatment, body text, form values, and identifiers.
4. Preserve real product photography and source assets. Replace only explicitly targeted illustrations; never describe generated illustrations as photographs.
5. Shared product cards require consistent image sizing, readable names, accessible selectors, and deliberate savings-to-action spacing.
6. Resolve prices, promotions, stock, payment methods, guarantees, and documentation claims from verified sources. Never invent commercial facts.
7. Removing an error message is not a functional fix. Resolve its cause or provide an honest, actionable failure state.
8. Preserve authentication, research-use requirements, server validation, inventory checks, and checkout safeguards during presentation work.
9. Reuse shared white/neutral/teal design tokens and focused components. Do not introduce scattered theme overrides or recolor backgrounds within product photographs.
10. Every interactive element must work with pointer, keyboard, and touch where applicable; provide visible focus and respect reduced-motion preferences.
11. Verify affected pages visually and functionally, including ordinary desktop, mobile, tablet, and zoomed layouts, before claiming completion.
12. Record unresolved dependencies in developer documentation or the implementation report. Keep unfinished marketing copy out of public pages.
