# PROPEPTIQ Public Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the automatic WINTER30 banner, approved Why Choose/FAQ sections, an honest newsletter integration boundary, grouped footer navigation, owner-requested social placeholders, and an owner configuration guide without fabricating claims or policies.

**Architecture:** Extend the existing central content/config seam with strict controlled-content records and public projections. Server components filter approval and campaign state; small client components handle copying, disclosures, validation, and status announcements, while missing providers/routes remain visibly unavailable or omitted and social placeholders remain explicitly marked for owner replacement.

**Tech Stack:** Next.js 16.3.2 App Router, React 19, TypeScript, Zod, Radix/shadcn, Lucide, Vitest/Testing Library

**Spec:** `docs/propeptiq-storefront-refactor-contract.md`

## Global Constraints

- Complete the commerce foundation before rendering WINTER30 and complete the shared index before indexing FAQs/sections.
- Banner copy is exactly `WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30`.
- WINTER30 is automatic; copying the code does not add, stack, or enable a Stripe discount.
- Render only `approved` controlled content; draft/retired content is neither public nor searchable.
- Do not create purity, testing, shipping, guarantee, therapeutic, safety, legal-approval, FDA-approval, or research-outcome claims.
- Do not create empty or AI-generated policy pages.
- Without a newsletter provider and approved privacy route, validate locally but store/transmit nothing and never show success.
- Test success and duplicate newsletter states only with explicit in-memory test doubles.
- Initialize Instagram, TikTok, X, and Facebook URLs to `/` and render all four accessible icon links as owner-requested placeholders. Identify them as placeholders in the owner guide and handoff.
- Preserve existing public routes and unrelated rewards/affiliate/footer behavior.
- Local task commits are authorized for this execution. Do not merge, deploy, publish unapproved copy, or configure external providers without separate authorization.

---

## File structure

### Create

- `src/content/storefront-content.ts` and `.test.ts` — controlled public content and link/social configuration
- `src/content/public-information.ts` and `.test.ts` — approved public page and section destinations for search
- `src/components/site/promotion-bar.tsx` and `.test.tsx`
- `src/components/site/why-choose-propeptiq.tsx` and `.test.tsx`
- `src/components/site/faq-section.tsx` and `.test.tsx`
- `src/components/site/public-home.test.tsx`
- `src/components/site/site-footer.test.tsx`
- `src/newsletter/contracts.ts`
- `src/newsletter/server.ts` and `.test.ts`
- `src/app/api/newsletter/route.ts` and `.test.ts`
- `src/components/site/newsletter-form.tsx` and `.test.tsx`
- `docs/runbooks/storefront-configuration.md`

### Modify

- `src/lib/site-content.ts`
- `src/app/(public)/layout.tsx`
- `src/components/site/public-home.tsx`
- `src/components/site/site-footer.tsx` and tests
- `src/app/globals.css`
- `src/search/storefront-index.ts` and tests
- `src/config/env-schema.ts` and tests if a real newsletter provider is later approved

## Task 1: Controlled content registry and automatic promotion bar

**Files:**

- Create: `src/content/storefront-content.ts`
- Create: `src/content/storefront-content.test.ts`
- Create: `src/content/public-information.ts`
- Create: `src/content/public-information.test.ts`
- Create: `src/components/site/promotion-bar.tsx`
- Create: `src/components/site/promotion-bar.test.tsx`
- Modify: `src/app/(public)/layout.tsx`
- Modify: `src/search/storefront-index.ts`

**Interfaces:**

- Consumes: persisted active-promotion projection and owner-approved content records
- Produces: `getApprovedStorefrontContent()`, `getApprovedPublicInformation()`, `ActivePromotionView`, and the banner below navigation

- [ ] **Step 1: Write failing approval and banner tests**

```ts
it("publishes only approved records", () => {
  expect(getApprovedStorefrontContent(contentFixtures).map((entry) => entry.id)).toEqual(["approved-entry"]);
});

it("publishes only approved same-origin information destinations", () => {
  expect(getApprovedPublicInformation(informationFixtures).map((entry) => entry.href)).toEqual([
    "/quality-records",
    "/research-use-policy",
    "/#faq-approved-entry",
  ]);
});
```

```tsx
it("renders exact automatic WINTER30 copy and accessible confirmation", async () => {
  render(<PromotionBar promotion={{ id: "winter30", code: "WINTER30", percentage: 30 }} />);
  expect(screen.getByText("WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Copy promotion code WINTER30" }));
  expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
});

it("renders nothing without an active server promotion", () => {
  const { container } = render(<PromotionBar promotion={null} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run focused tests and verify missing-module failures**

Run: `npm test -- src/content/storefront-content.test.ts src/content/public-information.test.ts src/components/site/promotion-bar.test.tsx src/search/storefront-index.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement strict controlled records and banner**

```ts
export type ControlledContentRecord = Readonly<{
  id: string;
  kind: "why_choose" | "faq" | "legal_notice" | "product_information" | "calculator_copy";
  status: "draft" | "approved" | "retired";
  title: string;
  body: string;
  sourceReferences: readonly string[];
  approvalNote: string | null;
  reviewedAt: string | null;
  effectiveAt: string | null;
}>;

export type ActivePromotionView = Readonly<{
  id: "winter30" | string;
  code: string | null;
  percentage: number;
}> | null;

export type PublicInformationEntry = Readonly<{
  id: string;
  title: string;
  href: `/${string}`;
  description: string;
  keywords: readonly string[];
  status: "draft" | "approved" | "retired";
}>;
```

Filter approval on the server before passing content to public components or the search index. Validate information hrefs as same-origin public paths and include the existing public pages plus verified section anchors; never synthesize an anchor from draft content. Mount the promotion bar immediately after `SiteHeader` in the public layout. Reuse the existing clipboard error/success pattern, add a decorative snowflake with `aria-hidden="true"`, and keep the full campaign sentence as text rather than icon-only content.

- [ ] **Step 4: Run content, banner, and shell tests**

Run: `npm test -- src/content/storefront-content.test.ts src/content/public-information.test.ts src/components/site/promotion-bar.test.tsx src/components/site/public-shell.test.tsx src/search/storefront-index.test.ts`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/content/storefront-content.ts src/content/storefront-content.test.ts src/content/public-information.ts src/content/public-information.test.ts src/components/site/promotion-bar.tsx src/components/site/promotion-bar.test.tsx 'src/app/(public)/layout.tsx' src/components/site/public-shell.test.tsx src/search/storefront-index.ts src/search/storefront-index.test.ts
git commit -m "feat(site): add approved automatic promotion banner"
```

## Task 2: Why Choose PropeptIQ and semantic FAQ

**Files:**

- Create: `src/components/site/why-choose-propeptiq.tsx`
- Create: `src/components/site/why-choose-propeptiq.test.tsx`
- Create: `src/components/site/faq-section.tsx`
- Create: `src/components/site/faq-section.test.tsx`
- Modify: `src/components/site/public-home.tsx`
- Create: `src/components/site/public-home.test.tsx`
- Modify: `src/content/storefront-content.ts`
- Modify: `src/search/storefront-index.ts`

**Interfaces:**

- Consumes: approved `why_choose` and `faq` records
- Produces: reusable server-safe homepage sections and searchable FAQ anchors

- [ ] **Step 1: Write failing semantic tests**

```tsx
it("renders approved value statements only", () => {
  render(<WhyChoosePropeptIQ items={[approvedItem]} />);
  expect(screen.getByRole("heading", { name: "Why choose PropeptIQ" })).toBeVisible();
  expect(screen.getByText(approvedItem.body)).toBeVisible();
});

it("uses native disclosure with stable searchable anchors", async () => {
  render(<FaqSection entries={[approvedFaq]} />);
  const disclosure = screen.getByText(approvedFaq.question).closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  await user.click(screen.getByText(approvedFaq.question));
  expect(disclosure).toHaveAttribute("open");
  expect(screen.getByText(approvedFaq.answer)).toBeVisible();
  expect(disclosure).toHaveAttribute("id", `faq-${approvedFaq.id}`);
});
```

Assert empty approved arrays render no empty heading/section and draft FAQ rows never reach the component or index.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- src/components/site/why-choose-propeptiq.test.tsx src/components/site/faq-section.test.tsx src/components/site/public-home.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement data-only sections**

Use semantic `<section>`, ordered headings, and native `<details><summary>` so answers remain available if hydration is delayed. Keep content in the central registry, not component literals. Populate production rows only from already approved repository wording or newly supplied owner approvals; component tests use explicit test fixtures.

Add approved FAQ documents to the search index with `/#faq-{id}` hrefs.

- [ ] **Step 4: Run homepage and index tests**

Run: `npm test -- src/components/site/why-choose-propeptiq.test.tsx src/components/site/faq-section.test.tsx src/components/site/public-home.test.tsx src/search/storefront-index.test.ts`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/components/site/why-choose-propeptiq.tsx src/components/site/why-choose-propeptiq.test.tsx src/components/site/faq-section.tsx src/components/site/faq-section.test.tsx src/components/site/public-home.tsx src/components/site/public-home.test.tsx src/content/storefront-content.ts src/search/storefront-index.ts src/search/storefront-index.test.ts
git commit -m "feat(home): add approved value and FAQ sections"
```

## Task 3: Honest newsletter adapter and form

**Files:**

- Create: `src/newsletter/contracts.ts`
- Create: `src/newsletter/server.ts`
- Create: `src/newsletter/server.test.ts`
- Create: `src/app/api/newsletter/route.ts`
- Create: `src/app/api/newsletter/route.test.ts`
- Create: `src/components/site/newsletter-form.tsx`
- Create: `src/components/site/newsletter-form.test.tsx`
- Modify: `src/components/site/public-home.tsx`

**Interfaces:**

- Consumes: validated `{ email, consent: true }`, optional approved gateway, approved privacy href
- Produces: typed newsletter result and accessible form state

- [ ] **Step 1: Write failing server and UI tests**

```ts
it("does not call storage or transport when no provider is configured", async () => {
  const result = await subscribeToNewsletter({ email: "reader@example.test", consent: true }, { gateway: null });
  expect(result).toEqual({ status: "NEWSLETTER_NOT_CONFIGURED" });
});
```

```tsx
it("requires unselected consent and shows honest unavailable status", async () => {
  render(<NewsletterForm privacyHref="/privacy-policy" submit={notConfiguredSubmit} />);
  expect(screen.getByRole("checkbox", { name: /consent/i })).not.toBeChecked();
  await user.type(screen.getByLabelText("Email address"), "reader@example.test");
  await user.click(screen.getByRole("checkbox", { name: /consent/i }));
  await user.click(screen.getByRole("button", { name: "Subscribe" }));
  expect(screen.getByRole("status")).toHaveTextContent(/temporarily unavailable/i);
  expect(screen.queryByText(/successfully subscribed/i)).toBeNull();
});
```

Add invalid email, missing consent, loading, provider-test-double success, duplicate, and error cases. Spy on logs/transport and prove the unconfigured path does not emit the email.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- src/newsletter/server.test.ts src/app/api/newsletter/route.test.ts src/components/site/newsletter-form.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement strict contracts and closed default**

```ts
export type NewsletterResult =
  | Readonly<{ status: "SUBSCRIBED" }>
  | Readonly<{ status: "DUPLICATE" }>
  | Readonly<{ status: "INVALID"; field: "email" | "consent" }>
  | Readonly<{ status: "NEWSLETTER_NOT_CONFIGURED" }>
  | Readonly<{ status: "PROVIDER_ERROR" }>;

export interface NewsletterGateway {
  subscribe(input: Readonly<{ email: string; consent: true }>): Promise<"subscribed" | "duplicate">;
}
```

Use strict Zod input parsing, same-origin and route rate-limit conventions, generic provider errors, and no email logging. If either gateway or approved privacy href is absent, return `NEWSLETTER_NOT_CONFIGURED` before any persistence/transport. The form uses an explicit label, browser and server validation, unselected checkbox, linked privacy text, disabled loading button, and `aria-live="polite"` status.

- [ ] **Step 4: Run newsletter and homepage tests**

Run: `npm test -- src/newsletter/server.test.ts src/app/api/newsletter/route.test.ts src/components/site/newsletter-form.test.tsx src/components/site/public-home.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/newsletter src/app/api/newsletter src/components/site/newsletter-form.tsx src/components/site/newsletter-form.test.tsx src/components/site/public-home.tsx src/components/site/public-home.test.tsx
git commit -m "feat(newsletter): add honest provider boundary"
```

## Task 4: Grouped footer, approved links, and social placeholders

**Files:**

- Modify: `src/lib/site-content.ts`
- Modify: `src/content/storefront-content.ts`
- Modify: `src/components/site/site-footer.tsx`
- Create: `src/components/site/site-footer.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: configured approved routes, research restrictions, approved disclaimer, and owner-requested social placeholder URLs
- Produces: legal/support/footer groups and four accessible social icon links

- [ ] **Step 1: Write failing footer tests**

```tsx
it("renders only configured approved links", () => {
  render(<SiteFooter config={footerFixture} />);
  expect(screen.getByRole("navigation", { name: "Legal" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Research Use Only" })).toHaveAttribute("href", "/research-use-policy");
  expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
});

it("renders owner-requested social placeholders accessibly", () => {
  render(<SiteFooter config={{ ...footerFixture, socials: { instagram: "/", tiktok: "/", x: "/", facebook: "/" } }} />);
  expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "TikTok" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "X" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "/");
});
```

Assert each icon link has an accessible platform label. Permit the exact `/` placeholder or an absolute HTTPS URL; reject every other destination. Assert approved FDA/research-use disclaimer renders beneath navigation, while missing approval renders no invented paragraph.

- [ ] **Step 2: Run footer tests and verify failures**

Run: `npm test -- src/components/site/site-footer.test.tsx`

Expected: FAIL because groups/social configuration do not exist.

- [ ] **Step 3: Add placeholder-aware link configuration and responsive groups**

```ts
export type FooterLink = Readonly<{ label: string; href: `/${string}` | null }>;
export type SocialUrls = Readonly<{
  instagram: "/" | `https://${string}`;
  tiktok: "/" | `https://${string}`;
  x: "/" | `https://${string}`;
  facebook: "/" | `https://${string}`;
}>;
```

Initialize all four social URLs as `/`, render them as accessible placeholder links, and list the replacement requirement in the runbook/handoff. Use Lucide icons already installed and current focus/touch-target styles. Preserve existing approved legal/support equivalents; omit missing legal/support routes rather than inventing pages.

- [ ] **Step 4: Run footer and shell tests**

Run: `npm test -- src/components/site/site-footer.test.tsx src/components/site/public-shell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Review and authorized commit**

```powershell
git add src/lib/site-content.ts src/content/storefront-content.ts src/components/site/site-footer.tsx src/components/site/site-footer.test.tsx src/app/globals.css
git commit -m "feat(footer): group approved support and legal links"
```

## Task 5: Owner-facing storefront configuration guide

**Files:**

- Create: `docs/runbooks/storefront-configuration.md`
- Modify: `docs/runbooks/README.md`
- Modify: `.env.example` only for configuration keys actually implemented

**Interfaces:**

- Consumes: completed contracts from commerce, UI, search, and public-content plans
- Produces: one owner-operable source map and launch-blocker checklist

- [ ] **Step 1: Write the guide with exact source locations**

Document, in separate sections:

- product/variant IDs, SKUs, amount/unit, package quantity, default variant, availability, and Stripe mapping;
- integer prices and `pending|active|unavailable` transitions;
- quantity tiers and the code/tests that protect them;
- promotions, enabled state, inclusive/exclusive timestamps, timezone, scope, automatic mode, and WINTER30;
- popularity ranks, release dates, aliases, related IDs, and approved content;
- FAQ, Why Choose, legal/support route, disclaimer, and social URL approval;
- newsletter gateway/privacy requirements and `NEWSLETTER_NOT_CONFIGURED` behavior;
- calculator setting, approved limits/copy, and production-disabled default;
- Stripe account approval, positive verified mappings, tax, shipping, database migration, webhook, and deployment gates.

Include commands for focused validation and state explicitly that editing a display label does not change variant identity, amount, SKU, price, or Stripe mapping.

- [ ] **Step 2: Scan the guide for secrets and false activation claims**

Run: `npm run verify:production-artifacts`

Expected: PASS with no secrets, private source documents, production IDs, or unsupported approval language.

- [ ] **Step 3: Run the public-content phase gate**

Run sequentially:

```powershell
npm test -- src/content/storefront-content.test.ts src/components/site/promotion-bar.test.tsx src/components/site/why-choose-propeptiq.test.tsx src/components/site/faq-section.test.tsx src/newsletter/server.test.ts src/app/api/newsletter/route.test.ts src/components/site/newsletter-form.test.tsx src/components/site/site-footer.test.tsx
npm run lint
npm run typecheck
npm run build
npm run verify:production-artifacts
```

Expected: every executed command passes.

- [ ] **Step 4: Independent content/security review and authorized commit**

Have a reviewer verify every public claim against its source, every missing integration fails honestly, no submitted email is logged in the unconfigured path, social placeholders are exactly `/` and documented for replacement, and legal/support links are real or omitted. Resolve findings and rerun focused checks.

```powershell
git add docs/runbooks/storefront-configuration.md docs/runbooks/README.md .env.example
git commit -m "docs(storefront): add owner configuration guide"
```

## Public-content completion gate

This phase is complete when the exact automatic WINTER30 banner is server-driven and copyable; homepage value/FAQ sections render approved data only; newsletter behavior is honest and non-collecting when unconfigured; the footer groups approved legal/support destinations and renders the four owner-requested `/` social placeholders; disclaimers are not fabricated; the public search index excludes draft content; and the owner guide names every configuration, placeholder, and production approval boundary.
