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

Retain the editorial Newsreader/Geist system, warm neutral surfaces and restrained
teal accents. Reuse shared surfaces and 160–260ms color/border transitions. Keep
44px practical targets, visible focus, reduced-motion support and stable layouts
at 375/768/1024/1440px and 200% zoom. Commerce and program values stay server-owned.
