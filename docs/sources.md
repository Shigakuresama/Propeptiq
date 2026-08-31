# Primary Source Register

**Checked:** 2026-08-30. Vendor and regulatory sources are time-sensitive and must be rechecked before production activation.

## Payments and peptide eligibility

- Stripe, “Prohibited and Restricted Businesses List — FAQs”: https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs
  - Confirms that research-purpose peptides require preventive measures to keep them inaccessible to nonresearch purchasers.
  - Confirms that account activation review ultimately determines supportability and that some peptide/pharmaceutical cases require preapproval.
- Stripe, “Prohibited and Restricted Businesses”: https://stripe.com/legal/restricted-businesses
- Stripe Checkout fulfillment: https://docs.stripe.com/checkout/fulfillment
- Stripe webhook signatures: https://docs.stripe.com/webhooks/signature
- Stripe idempotent requests: https://docs.stripe.com/api/idempotent_requests

## Regulatory intent and claims

- FDA warning letter to USApeptide.com, 2025-02-26: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025
- FDA warning letter to Xcel Research LLC, 2024-12-10: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/xcel-research-llc-694608-12102024
  - Both are primary-source examples that “research use only” wording did not overcome surrounding evidence of intended human use.
- FTC Health Products Compliance Guidance: https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance

These sources do not establish that any PROPEPTIQ SKU is legal in any jurisdiction. Product-specific counsel review remains a launch gate.

## Identity and authorization

- Better Auth 1.6 Next.js integration and server-action cookies: https://better-auth.com/docs/1.6/integrations/next
- Better Auth email/password and reset-session revocation: https://better-auth.com/docs/1.6/authentication/email-password
- Better Auth email OTP: https://better-auth.com/docs/1.6/plugins/email-otp
- Better Auth session management: https://better-auth.com/docs/1.6/concepts/session-management
- Better Auth PostgreSQL and non-default `search_path`: https://better-auth.com/docs/1.6/adapters/postgresql
- Better Auth 1.7 guided migration requirements: https://better-auth.com/docs/1.6/guides/1-7-upgrade-guide
- Neon branchable Auth data in the branch-local `neon_auth` schema: https://neon.com/docs/changelog/2025-12-12
- Managed Neon Auth Next.js server SDK, retained for the bounded rollback window: https://neon.com/docs/auth/reference/nextjs-server

## Database, storage, delivery, and observability

- Neon serverless driver: https://neon.com/docs/serverless/serverless-driver
- Neon direct connections for persistent `search_path` and PgBouncer limits: https://neon.com/docs/connect/connection-pooling
- Neon unsupported startup parameters on pooled connections: https://neon.com/docs/connect/connection-errors
- Neon branching/backups overview: https://neon.com/docs/introduction/branching
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- Vercel Blob security/private storage: https://vercel.com/docs/vercel-blob/security
- Vercel Private Blob general-availability update (the official page retains its original public-beta URL slug): https://vercel.com/changelog/private-storage-for-vercel-blob-now-available-in-public-beta
- Vercel Firewall rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Observability: https://vercel.com/docs/observability
- Vercel tracing/OpenTelemetry: https://vercel.com/docs/tracing
- Resend with Next.js: https://resend.com/nextjs

## Reference sites

- https://provnrx.com/
- https://www.aminoclub.com/

Reference sites are competitive/design observations only. They are not legal authority or evidence for PROPEPTIQ products, pricing, purity, laboratories, certifications, inventory, or claims.
