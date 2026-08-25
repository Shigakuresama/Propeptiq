# Responsive Public UI Handoff

**Status:** Approved implementation contract.

**Handoff version:** `responsive-v1`

**Visual source:** Superdesign draft `d5bd0bcf-c086-499d-904c-4eb8581d2bb4`, version `3`; explicitly approved with this handoff by the user in the Codex task at `2026-08-24T20:54:54-07:00`.

## 1. Design-system ruling

The automated UI recommendation for the query “compliance-first laboratory research ecommerce archival editorial restrained” returned a vibrant pink, block-based portfolio direction. That result is a product-type mismatch and is explicitly rejected. It conflicts with the evidence-led business purpose, the audited references, the Superdesign draft, and `design-system/MASTER.md`.

Reproducible review command used on 2026-08-24:

```powershell
python ..\.codex\skills\ui-ux-pro-max\scripts\search.py "compliance-first laboratory research ecommerce archival editorial restrained" --design-system -p "PROPEPTIQ LABS" -f markdown
```

The generated recommendation was review input only and was not persisted over the project design system.

The governing direction remains a calm archival/editorial public surface using off-white, ink, moss, Newsreader, Geist Sans, restrained rules, and low-shadow record surfaces. Authenticated operations may be denser but must share the same semantic tokens and accessibility behavior.

## 2. Public route and state contract

| Route | Purpose before an approved catalog exists | Primary action |
|---|---|---|
| `/` | Explain the research-only purpose, verified-access model, and evidence-governed platform without implying active inventory or operations | Review researcher access |
| `/catalog` | Truthful empty catalog: “No research materials are currently approved for sale.” | Review access requirements or policy |
| `/catalog/[slug]` | Return not-found unless an active approved public projection exists | None for missing/unpublished records |
| `/quality-records` | Explain lot-level evidence and provide an empty lookup state; show no record, result, laboratory, or COA without an approved public projection | Review evidence policy |
| `/research-use-policy` | State prohibited human/veterinary uses, purchaser responsibilities, and separate eligibility gates | Apply for access |
| `/access` | Explain sign-in/application paths for an individual researcher or organization without promising approval | Sign in or begin an application |

No public route shows a cart, price, stock, purity value, product card, testimonial, review, laboratory mark, certification, COA, or shipping promise unless the corresponding approved record exists. An empty catalog is a first-class finished state, not a loading placeholder.

### State ownership

| State | Owning surface | Public behavior |
|---|---|---|
| Loading | `/catalog` and `/quality-records` while reading approved public projections | Structural skeletons without product-like names, values, images, badges, or claims |
| Empty | `/catalog` and `/quality-records` | Explicitly state that no materials or public quality records are currently approved; provide policy/access navigation only |
| Public-data error | `/catalog` and `/quality-records` | Safe retry guidance and a stable reference code; disclose no dependency, rule, provider, or private-object detail |
| Unknown eligibility | Protected eligibility/order surfaces implemented in Tasks 8–9 | Deny checkout, create/maintain the hold, identify the affected gate in plain language, and route policy review |
| Manual review | Protected eligibility/order surfaces implemented in Tasks 8–9 | Deny checkout, show the pending exact-case review without promising approval or timing |
| Blocked/rejected/suspended | Protected application, eligibility, or order surfaces implemented in Tasks 6–9 | Deny the action and show only the authorized reason/next-step projection; never expose staff notes or evidence contents publicly |

Buyer-specific eligibility states do not appear on public product or marketing routes. Their accessibility and denial-path tests belong to the protected workflow tasks and final E2E suite, while the public route tests own loading, empty, and safe-error states.

## 3. Responsive composition

| Viewport | Navigation | Hero and records | Spacing and type |
|---|---|---|---|
| 375px | Wordmark, Account, and a labeled menu button. Menu opens a shadcn Sheet containing every primary route and the research-use restriction. | One column. Editorial statement first, document/record composition second. Proof Rail becomes a vertical ordered sequence. | 16px gutters; body at least 16px; display begins near 44px with controlled wrapping; 44×44px practical touch targets. |
| 768px | Sheet navigation remains unless all labels fit without collision; never truncate required labels. | Hero may remain stacked. Secondary evidence records can use two columns. Proof Rail may use two rows of two only when reading order remains unambiguous. | 24px gutters; body measure remains 58–72 characters; section rhythm 56–80px. |
| 1024px | Full navigation may appear when all links, account control, and restriction state fit at 200% zoom. | Editorial statement and record composition form a 7/5 or 6/6 grid. Proof Rail becomes one ordered horizontal row. | 32px gutters; display scales fluidly; text panels keep their reading measure. |
| 1440px | Full navigation inside the shared public container. | Layout stops at the 90rem maximum; whitespace expands instead of type or cards stretching indefinitely. | 32px gutters inside the max-width container; 80–128px section rhythm where composition supports it. |

Breakpoint behavior is content-driven. The implementation may keep the Sheet beyond 768px if localization, zoom, or real labels would otherwise collide.

## 4. Navigation behavior

- The first focusable control is a visible-on-focus “Skip to main content” link.
- The wordmark returns home. Primary routes are Research Catalog, Quality Records, Research-Use Policy, and Researcher Access. Account status is a distinct control.
- The mobile trigger has an accessible name such as “Open navigation,” exposes expanded state, and uses a consistent Lucide menu icon rather than an emoji.
- The shadcn Sheet traps focus while open, closes on Escape, restores focus to its trigger, and keeps every destination keyboard-operable.
- The research-only restriction remains visible either in the header context or at the beginning of the Sheet; it is not footer-only.
- No anonymous or ineligible state exposes a cart or checkout action.

## 5. Typography contract

- Set body text first: Geist Sans, `clamp(1rem, 0.97rem + 0.12vw, 1.0625rem)`, line-height 1.5, 58–72-character measure, and no edge-to-edge mobile paragraphs.
- Use Newsreader at weights 500–600 for editorial headings and Geist Sans for interface labels. No third font family.
- Keep at most three heading levels on public pages and preserve sequential semantic hierarchy.
- Do not hyphenate headings. Avoid centered paragraphs; reserve centering for short isolated titles only.
- Short uppercase labels use 0.08em letterspacing and never exceed one line.
- Use curly quotation marks/apostrophes, true en/em dashes, the multiplication sign for dimensions, and one space after punctuation. JSX uses real UTF-8 characters or string expressions, not literal Unicode escape text.
- Numeric evidence, lot identifiers, timestamps, and money use tabular figures.

## 6. Proof Rail — the only planned public data visualization

The Proof Rail is an ordered provenance relationship, not a performance chart:

1. Material identity
2. Analytical method
3. Lot/batch
4. COA state

Each node includes a text label, explicit state, and evidence action only when backed by a real approved record. Color is never the sole state indicator. In the empty-catalog state, the rail explains the relationship without showing fictional identifiers, values, methods, laboratories, or documents.

At 1024px and above, a subtle rule may connect the four nodes. Below that width, use a semantic ordered list with a vertical rule or no connector. The DOM order never changes across breakpoints. A separate chart/dashboard is prohibited until real data and a decision-use case exist.

The testable accessibility contract is:

- One `<ol aria-label="Evidence relationship">` contains four `<li>` elements in the exact order above.
- Every node has a visible stage label and visible state text. A status icon is supplemental and `aria-hidden="true"`.
- The rail is not navigation and uses neither `aria-current` nor stepper/progress semantics.
- When an approved evidence destination exists, use a normal descriptive link. When it does not, render plain state text such as “No approved public record”; never render an empty link, disabled link, or fictional destination.
- If a future quality-record lookup changes results asynchronously, move focus to its result/error heading or announce the concise status through a dedicated polite status region; do not make the entire rail a live region.

## 7. Motion and state changes

- Controls use 160–260ms color/opacity transitions with no scale-induced layout shift.
- View transitions are reserved for approved catalog-list to product-record continuity. They are not used to decorate the empty catalog, policy pages, or routine tab changes.
- `prefers-reduced-motion: reduce` removes transforms and shared-element animation while preserving navigation and focus.
- Loading, empty, unknown, manual-review, blocked, and error states are visually distinct and have plain-language text. Skeletons never resemble invented product data.

## 8. Accessibility and truthfulness acceptance checks

- No horizontal scroll at 375px and no obscured content at 200% zoom.
- Body text and essential controls meet WCAG AA contrast; keyboard focus is clearly visible.
- DOM order, tab order, and reading order match the visible composition at every breakpoint.
- Every image has an evidence-appropriate alternative text decision: meaningful alt text for approved content, empty alt for decoration, and no unapproved product imagery.
- All form fields have persistent labels, descriptions where needed, inline errors, and an error summary for failed submission.
- Required restrictions are never hidden behind hover, tooltips, carousels, or collapsed footer content.
- Browser tests cover 375px, 768px, 1024px, and 1440px; keyboard-only navigation; reduced motion; 200% zoom; empty/loading/error states; and prohibited-language scans.

## 9. Responsive adaptation record

| Adaptation from desktop draft version 3 | Rationale | Approval state |
|---|---|---|
| Add a labeled mobile navigation trigger and shadcn Sheet containing all routes and the research-use restriction | The inspected 375px draft showed only the wordmark and Account action, leaving no mobile route discovery | Approved in `responsive-v1` |
| Keep the Sheet until labels fit at zoom rather than forcing a fixed tablet breakpoint | Prevent collision, truncation, and hidden policy access | Approved in `responsive-v1` |
| Convert the horizontal Proof Rail to the same ordered vertical relationship on narrow screens | Preserve DOM/reading order and avoid horizontal overflow | Approved in `responsive-v1` |
| Stack the hero record composition beneath the editorial statement on narrow screens | Preserve readable display wrapping and document detail | Approved in `responsive-v1` |

Approval record: `responsive-v1`, approved by the user in the Codex task at `2026-08-24T20:54:54-07:00`, with no requested revisions. Task 5 must implement this exact route, responsive, accessibility, truthfulness, and state contract; any necessary deviation requires a recorded accessibility/compliance rationale.

Approval of the visual direction authorizes responsive adaptation and implementation work only. It does not approve any product, category, jurisdiction, provider, price, lot, laboratory, COA, claim, inventory, or production launch gate.
