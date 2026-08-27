# ADR 0001: Application and Interface Stack

- **Date:** 2026-08-24
- **Status:** Accepted for implementation

## Context

The application needs public editorial pages, authenticated B2B workflows, server-enforced policies, webhooks, metadata/OG images, accessibility, and Vercel deployment. The user explicitly requires Next.js App Router, strict TypeScript, Tailwind, and shadcn/ui.

## Decision

Use Next.js 16.3.2 App Router, React 19.2.8, strict TypeScript, Tailwind CSS 4, and shadcn/ui `new-york` components on Radix primitives. Prefer Server Components and server-only modules; use Client Components only for interaction. Use `next/og`/Satori for a brand-level social image and React View Transitions only where they communicate list/detail continuity or hierarchy, with reduced-motion fallbacks.

Use Node.js 24.x for local/CI/Vercel compatibility. Pin exact framework versions in the lockfile and review upgrades intentionally.

## Consequences

- Strong server rendering and typed route/data boundaries.
- shadcn source is owned locally and must be maintained/audited.
- View Transitions are progressive enhancement; unsupported browsers remain functional.
- The Sites/Vinext scaffold/hosting path is not used because it conflicts with the binding Next.js App Router and Vercel environment requirements. Compatible Sites design/preview guidance is retained.

## Alternatives

- Vite/Vinext/Sites hosting: rejected for this application because the required stack and deployment target are Next.js/Vercel.
- Custom component library: rejected due to accessibility/maintenance cost.
- Animation library: deferred; native transitions cover the limited approved motion.
