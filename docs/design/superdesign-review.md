# Superdesign Direction Review

**Status:** **Approved.** Desktop draft version 3 and responsive handoff `responsive-v1` were explicitly approved by the user in the Codex task on 2026-08-24.

## Artifact

- Project: [PROPEPTIQ LABS — Compliance-First Research Platform](https://superdesign.dev/teams/b106707a-9e03-4ac3-a09e-62198818f5b8/projects/14bb848e-b774-4091-8f92-6a9cdf2b47ac)
- Draft: `d5bd0bcf-c086-499d-904c-4eb8581d2bb4`
- Current version: `3`
- Review preview: [Evidence-Led Research Governance](https://p.superdesign.dev/draft/d5bd0bcf-c086-499d-904c-4eb8581d2bb4)
- Repository design system: `design-system/MASTER.md`
- External Superdesign authoring brief: `C:\Users\Sergio\Documents\Peptides\.superdesign\design-system.md`

## Proposed direction

The direction is “clinical archive meets premium industrial design”: off-white canvas, near-black editorial type, restrained moss accents, low-shadow record surfaces, compact pill actions, a dark footer, and generous whitespace. Provn informs the visual restraint only. Amino Club informs proof-record structure only. No brand identity, asset, product, price, claim, category, or promotional device is copied.

The signature pattern is the **Proof Rail**, which connects material identity, analytical method, lot, and COA state. It is an information pattern rather than a decorative chart.

## Truthfulness review completed

Version 1 was rejected because generated copy implied an unapproved registry-verification method, active catalog-review operations, a fictional record ID/version, and an incorrect copyright year. Version 2 removed those details. Version 3 also corrects the account model from institution-only language to verified researcher-or-organization access, enumerates the separate eligibility gates, makes unknown explicitly block checkout, removes unresolved COA-access and support-channel assumptions, keeps the catalog explicitly empty, and states that fulfillment requires verified payment plus current compliance clearance.

The draft remains a visual prototype. Its hash links are not route definitions, and its prose is not automatically approved production copy. During implementation, replace or remove any statement that is not supported by the binding product requirements and an approved business record.

## Approval questions

The user should review three things:

1. Overall visual tone: calm archival/editorial versus a denser technical presentation.
2. Hero balance: large Newsreader statement versus the document-record composition.
3. Proof Rail: whether the identity → method → lot → COA relationship should remain the signature motif.

## Approval record

- Decision: `Approved`
- Approved version: `3`
- Approved by: `User in Codex task`
- Approved at: `2026-08-24T20:54:54-07:00`
- Revision notes: `Desktop v3 and responsive-v1 approved as submitted.`

The approved `responsive-v1` handoff defines the 375px, 768px, 1024px, and 1440px adaptations for implementation. Approval does not open any business, catalog, jurisdiction, payment, or fulfillment launch gate.

## Responsive preflight

The version 3 preview was inspected at a 375 × 812 viewport. Its measured document width matched the viewport (`scrollWidth` 375px), so no horizontal overflow was observed. The hero typography remained readable, but the header exposed only the brand and Account action; it did not provide a mobile navigation menu.

That is a required responsive adaptation after visual approval, not an approved omission. The implementation must provide an accessible, keyboard-operable mobile menu using the locally owned shadcn/Radix primitives, preserve a visible research-use restriction, and be rechecked at 375px, 768px, 1024px, and 1440px with reduced motion and zoom before the UI task can pass.
