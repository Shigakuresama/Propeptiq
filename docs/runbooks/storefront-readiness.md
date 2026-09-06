# Storefront readiness — September 6, 2026

## Implemented and preserved

The storefront refinement is based on main `d288dc6`. No production database,
credentials, provider settings, legal text or program economics were changed.
The release repair retired one obsolete Neon preview branch as described below.

- Better Auth: public navigation now reads the real session instead of always showing
  Sign in. Proxy validation forwards renewal cookies; render-only session reads disable
  refresh because RSC rendering cannot reliably deliver renewed cookies. HTTP session
  retrieval performs renewal. Navigation revalidates the client cache after Server Action
  sign-in/logout redirects, which do not emit client auth mutation notifications.
  Sessions explicitly retain the existing seven-day lifetime
  and one-day update interval. Full database validation and secure cookie defaults remain.
- Checkout: the page previously accepted only the synthetic local readiness predicate,
  although the API already supported PostgreSQL/Stripe. It now accepts the existing live
  capability and PostgreSQL prerequisites too. Page-level sign-in redirects preserve
  `/checkout` through the existing safe return destination builder. Agreement, buyer,
  price, mapping, inventory, destination, tax/shipping and provider gates still apply.
- Newsletter: the production adapter checks the existing Resend contact and newsletter
  topic, confirms duplicates, and updates the target topic only after explicit form
  consent. It does not override global unsubscribe. Provider failures never become
  successful subscriptions. API composition failures produce a fixed safe 503 response.
- UI: shared uppercase headings; stronger teal automatic WINTER30 banner; finite teal
  logo accent; newsletter pre-footer; colored social styles for verified destinations;
  distinct feature icons; FAQ disclosures; shared growth navigation and four compact
  homepage program entries. Administrative event identifiers and customer set names
  retain case. Product cards omit redundant checkout warnings and preserve action spacing.
- Commerce/growth: automatic WINTER30 remains server-authoritative and non-stacking
  under existing rules. Existing signed attribution, replay handling, refund/reversal,
  immutable points records and separate affiliate cash/payout records are preserved.

## Configuration still required

### Newsletter

`src/lib/site-content.ts` deliberately has `newsletterConfiguration.enabled: false`,
no approved privacy destination, and no approved privacy href. Supply approved public
privacy content, register its internal path in `newsletterPrivacyDestinations`, project
that path into the configuration, then enable the launch flag. Do not use a fabricated
privacy page or point consent at the research-use policy.

Configure `NEWSLETTER_MODE` to match `DATABASE_MODE`, a dedicated full-access
`NEWSLETTER_RESEND_API_KEY` distinct from transactional `RESEND_API_KEY`, a valid
`NEWSLETTER_RESEND_TOPIC_ID`, operator-approved `NEWSLETTER_RATE_LIMIT_MAX` and
`NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS`, and the independent `RATE_LIMIT_SECRET`.
The database must have the existing shared PostgreSQL rate-limit store schema applied.
Resend is the subscriber source of truth; the database stores abuse-control state.

Read-only Vercel Production variable metadata showed the newsletter key/topic/mode
names installed, but not the two newsletter limit names. Presence does not prove key
scope, topic validity, selected mode or provider access. No contact was sent to Resend.

### Research-use agreement and account activation

No approved versioned agreement text was located. The read-only workspace-configured
database had zero `attestation_versions` rows. This database's identity was not proven
to be the production deployment, so that count is not a production census.

Use the existing guarded administration workflow with approved exact `policy_text`,
positive `version`, matching SHA-256 `content_hash`, and an approved `effective_at`.
Ensure exactly one current effective, non-superseded agreement. Account and checkout
already load this source and persist acceptance of the exact version after explicit
user consent. Do not promote informational research-policy prose into approved legal
agreement text. Verify stale acceptance requires the new version, missing/ambiguous
versions block activation, and blocked buyers remain unable to check out.

### Authentication and commerce

Keep one stable `BETTER_AUTH_SECRET`, correct canonical HTTPS `APP_ORIGIN`, direct
Neon runtime `DATABASE_URL`, matching auth/database/email modes, verified transactional
sender and existing `AUTH_EMAIL_DELIVERY_VERIFIED` evidence. Never rotate a session
secret as an attempted UI fix. The separate password-reset session-revocation approval
remains required before enabling password recovery.

Production variable metadata did not list `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_ACCOUNT_ID`, `STRIPE_SHIPPING_RATE_ID`, or `STRIPE_TAX_CODE`. Supply approved
account/provider configuration and enable the existing commerce/payment creation
capabilities only after approval. Live checkout also requires live tax, shipping and
fulfillment modes, real active sale records and provider mappings, sufficient inventory,
eligible buyers/destinations, and tax/shipping quotes. The workspace database contained
zero `products`; the owner-published browse catalog is not proof of purchasable inventory.

### Growth and social destinations

The workspace database contained zero loyalty, referral and affiliate policy records.
Approve and activate versioned program terms and configurable economics through the
existing administration workflow. No signup bonus, referral rate, cash commission,
attribution window, payout schedule or redemption value was invented. Inactive programs
remain discoverable without displaying imaginary balances or benefits.

The repository's social links all previously pointed to `/`. They are now unset and
omitted. Supply verified Instagram, TikTok, X and/or Facebook profile URLs in
`footerSocialUrls` in `src/lib/site-content.ts` to render the accessible colored icons.

## Reproducible validation

- `npm run verify:workspace-boundary`, `npm run lint`, `npm run typecheck`, `npm test`.
- `npm run test:integration` for existing schema, financial lifecycle and database tests.
  `src/auth/session-lifecycle.integration.test.ts` exercises actual Better Auth signup,
  email verification, sign-in, persistent retrieval, runtime recreation, cookie renewal,
  wrong-password rejection and logout with disposable SQLite. Email delivery and the
  PostgreSQL-specific runtime are deliberately outside that test's scope.
- `npm run test:e2e -- tests/e2e/storefront-reliability.spec.ts` covers four requested
  widths, full-page Axe, heading casing, FAQ keyboard controls, reduced motion,
  newsletter placement and local-session navigation. Existing account, commerce, growth,
  footer and motion specs exercise their deterministic local drivers; their records are
  labeled synthetic and excluded from the production build.
- Build with `APP_ENV=production`, `APP_ORIGIN=https://propeptiq.com`, all capability
  modes disabled and synthetic drivers disabled; run `npm run build`, then
  `npm run verify:production-artifacts`. This proves a closed production build, not live
  payment/provider acceptance.
- After approved configuration is installed in an isolated provider test environment,
  submit an operator-owned newsletter address, read back its topic subscription, repeat
  for duplicate feedback, and test invalid input/provider outage. Verify normal Better
  Auth cookies through reload, navigation, a new tab/browser session, and logout.
- With approved test catalog/agreement/provider records, run the real cart → sign-in →
  explicit current agreement → server quote → Stripe checkout flow. Tamper with price,
  promotion and attribution fields; verify the server rejects or recomputes them. Replay
  signed events/refunds and confirm one authoritative reward or commission lifecycle.
  Repeat on production only under its operational launch process.

Primary references: [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next),
[session management](https://better-auth.com/docs/concepts/session-management),
[Resend contact retrieval](https://resend.com/docs/api-reference/contacts/get-contact),
[Resend error types](https://resend.com/docs/api-reference/errors),
[topic updates](https://resend.com/docs/api-reference/contacts/update-contact-topics).

## PR review and deployment repair

Vercel failed before building because Neon's ten-branch limit was reached. The
deployment's Provisioning Integrations panel reported "Branch limit reached" for
"Create database branch for deployment". Retired only the obsolete
`preview/feat/propeptiq-growth-release` database branch associated with merged PR #3.
It was neither primary, default nor protected, had no children, reported zero compute
and write counters, and its endpoint was idle. Neither configured database URL
referenced that endpoint. Main, backups and the schema rehearsal branch were preserved.
Redeploying the same commit then provisioned successfully and built to Ready.

Neon preview cleanup follows Vercel deployment retention, so merged PRs can keep
consuming branch slots. Before future releases, check branch capacity and retire only
verified obsolete preview branches, preserving production, backups and active work.
See [Neon's managed integration guide](https://neon.com/docs/guides/vercel-managed-integration).
Do not bypass required provisioning or point previews at the production database.

Three independent read-only reviews found and prompted corrections to research-set
availability, program read-error messaging, checkout navigation, order-reference
case preservation, valid FAQ summary structure, transitions and optional Resend
error status metadata. Pending/error session navigation now explicitly says
"Account access" and continues through the protected account route; only a resolved
session says "Account". Tests cover all four header states. The managed HTTP session
client remains necessary for renewal and revalidation; server layout state alone can
remain stale across navigation.

The requested merchandising warning removal and existing save-to-cart behavior remain;
cart/checkout restrictions and the compact mobile purchase status still communicate
purchase availability. Preview payment gating remains intentionally closed. Duplicate
newsletter feedback follows the requested contract and remains rate limited; the
form records submitter consent, not verified email ownership. Newsletter activation
still requires approved privacy content and operator verification of provider behavior.
No confirmation email or double-opt-in flow is claimed.

## Verification scope

Final local evidence: workspace boundary, lint and TypeScript passed; all 3,607 unit
tests passed; 552 integration tests passed with three isolated-PostgreSQL tests skipped;
177 distinct browser checks passed across the selected suites and focused regression
reruns. The final production build passed and its artifact scan reported zero forbidden
matches. The full repository E2E suite was not run. Browser captures were reviewed at
desktop and phone sizes; the selected suites also cover 768/1024px and narrower reflow.

Earlier browser failures exposed heading wrapping, short-phone fixed-search clearance,
and moving-logo containment regressions; those were fixed and rerun. Stale assertions
for the previous promotion layout, endless logo animation and destination-dropping
redirect were updated. One unrelated HGH gallery navigation timeout passed on retry.

The automated 200% checks use CSS zoom and narrow-width reflow proxies, not a literal
native browser zoom setting. Native browser zoom and live provider acceptance remain
operator checks. Automatic approval review blocked starting a local production-mode
preview without supplying a detailed reason; the optimized production build and
production artifact scan can still be verified independently, and browser inspection
uses the isolated local fixture server.
