# Contact form operations

The contact route is fail-closed. It does not deliver mail unless `APP_ORIGIN`,
`DATABASE_MODE`, `EMAIL_MODE`, `RESEND_API_KEY`, `RESEND_FROM`,
`CONTACT_SUPPORT_EMAIL`, `CONTACT_RATE_LIMIT_MAX`,
`CONTACT_RATE_LIMIT_WINDOW_SECONDS`, and `RATE_LIMIT_SECRET` are valid. Database
and email modes must match, and `AUTH_EMAIL_DELIVERY_VERIFIED=verified` must retain
the existing sender-delivery evidence. `CONTACT_SUPPORT_EMAIL` is the only destination; the
runtime never infers it from the sender.

## Production activation

The authorized receiving inbox is `contact@propeptiq.com`. The initial operational
limit is three requests per caller in each fixed ten-minute window. Set these
three variables in the Vercel **Production** environment:

| Variable | Value |
| --- | --- |
| `CONTACT_SUPPORT_EMAIL` | `contact@propeptiq.com` |
| `CONTACT_RATE_LIMIT_MAX` | `3` |
| `CONTACT_RATE_LIMIT_WINDOW_SECONDS` | `600` |

Keep the existing server-only Resend key, sender, rate secret, and verified sender
attestation. Required live settings are `APP_ORIGIN=https://propeptiq.com`,
`DATABASE_MODE=live`, `EMAIL_MODE=live`, and
`AUTH_EMAIL_DELIVERY_VERIFIED=verified`. A configured key alone does not prove
sender authorization or delivery. Verify the sender's domain and sending
capability in the authenticated Resend account, or retain the existing sender
verification evidence and confirm the controlled delivery below. [Resend domain
status](https://resend.com/docs/api-reference/domains/get-domain)

Vercel sensitive-variable exports may contain `[SENSITIVE]` instead of a usable
value. Do not copy that placeholder back into production. Verify the actual
`DATABASE_URL` target inside the remote production environment without printing
the URL or credentials; an integration's separately named storage URL alone does
not establish the runtime target. A temporary remote build check can compare the
normalized endpoint/database and report booleans for required configuration and
read-only database access. Stage with `--prod --skip-domain`, retain the current
live deployment, and promote only after the following checks pass.
[Vercel sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

## Applying migration 0032

Use the separately reviewed operator process described in
`docs/runbooks/production-cutover.md`; the repository has no general live migration
command. This contact activation requires only
`src/db/migrations/0032_contact-email-deliveries.sql`. It adds one table and one
index and does not alter existing business records.

1. Record the current project, main branch, database, direct migration-owner
   connection target, deployment, and source commit. Confirm the deployed runtime
   targets that same database. Use a read-only transaction to compare **every**
   applied row in `drizzle.__propeptiq_migrations` with `readMigrationFiles` from
   the installed `drizzle-orm/migrator`. The ledger must match source `0000` through
   `0031` exactly, and `0032` must be the sole pending migration. Confirm
   `public.rate_limit_windows` exists and `public.contact_email_deliveries` does
   not. Stop on a mismatch instead of attempting another migration chain.
2. Create and retain a fresh backup branch from that explicit main branch before
   applying DDL. If branch capacity is exhausted, an operator may instead create
   a complete PostgreSQL custom archive using the matching major-version client,
   verified TLS and the reviewed direct connection. Keep that archive outside Git
   and deployment uploads. Verify its catalog with `pg_restore --list`, record its
   checksum and creation time, and state whether a restore rehearsal was run. A
   single-database archive does not include cluster-wide roles or tablespaces.
   [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
   For a branch backup, record its returned ID, parent ID, creation time, and ready state;
   do not rely on an older release backup or a short history-retention window.
   Omit compute endpoints when creating the retained branch. Add a separate
   endpoint only if recovery access is needed. [Neon branch API](https://api-docs.neon.tech/reference/createprojectbranch)
3. With the direct migration-owner connection, begin a transaction and set local
   `search_path=public`, `lock_timeout='5s'`, and `statement_timeout='30s'`. Lock
   `drizzle.__propeptiq_migrations` in `EXCLUSIVE` mode, then repeat the full
   ledger and table-absence checks while holding the lock. Execute the two
   statements returned for `0032` by `readMigrationFiles`, then parameterize an
   insert into `drizzle.__propeptiq_migrations (hash, created_at)` using that
   migration's generated `hash` and `folderMillis`. Commit DDL and ledger
   together. Roll back on any failed check or statement; never hand-edit a hash
   to bypass a mismatch.
4. Read back the appended ledger row and table metadata: six columns, primary
   key, three check constraints, and `contact_email_deliveries_updated_idx` on
   `updated_at`. Verify the deployed runtime role has public-schema usage;
   `SELECT`, `INSERT`, and `UPDATE` on the rate table; and `SELECT`, `INSERT`,
   `UPDATE`, and `DELETE` on the contact table. Check each privilege individually
   or combine with `bool_and`; PostgreSQL's comma-separated privilege argument
   accepts **any** listed privilege. Grant missing contact privileges only to
   the verified runtime role through the reviewed operator process.
   [PostgreSQL privilege checks](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE)

## Delivery and release verification

Use the explicitly authorized inbox above for one controlled contact submission
with synthetic content and a fresh UUID, after the release operator authorizes
the canary. If the owner chooses deployment without a test email, complete the
non-delivering configuration, schema, invalid-input, origin and rate-limit checks,
then record actual delivery as unverified. Do not send a canary in that case.
Do not use customer data. For an authorized canary, confirm the API returns `ACCEPTED`, the
journal row is `accepted` with a provider ID, and the expected message reaches
the inbox or Resend records its delivered status. API acceptance alone is not
proof of inbox delivery. Confirm the From address is the configured sender and
Reply-To is the submitted controlled address. Save only sanitized status evidence.

Retry the unchanged submission UUID once and verify the same accepted journal
entry with no second provider message. Within the same caller's fixed window,
make a third non-delivering invalid-input request, then confirm the fourth request
returns `429` without delivery. Preserve the real Vercel caller-address handling.
Verify a mismatched Origin returns `403`. The staged deployment deliberately
retains the production `APP_ORIGIN`, so its browser form rejects the staged
hostname. A controlled direct API canary may supply the exact production Origin;
do not broaden the allowed origins to make a staged browser pass. Check local
pending, accepted and failure UI states with the existing browser test driver.
After promotion, verify the public contact page uses the release and, with
explicit email authorization, confirm its real browser submission.

## Recovery and retries

If activation fails, remove only `CONTACT_SUPPORT_EMAIL` from the production
configuration and redeploy, or return the production alias to the preceding
deployment. Keep the additive table and its delivery journal after any send;
dropping accepted or pending rows can permit duplicate delivery. A failed
migration transaction rolls back its own DDL and ledger insert. Restore from the
retained backup only for a verified database incident under a reviewed recovery
plan that accounts for auth and business changes made since the backup.

The client creates a submission UUID and reuses it for an unchanged retry. Editing
the form or completing an accepted submission rotates the UUID, so the same message
can be intentionally sent again later. The server binds `contact/<submission UUID>`
to the normalized payload hash in the journal before provider delivery. Reusing a
UUID with changed content is a conflict. An explicit provider rejection clears the
reservation so a retry can proceed. A transport exception leaves the row pending,
because delivery may have happened; later attempts fail closed instead of risking
a duplicate. Reconcile that row against Resend using the idempotency key, then set
the provider ID/status only from verified provider evidence or remove the pending
row only after verifying no delivery was accepted.

Rate limits use the existing PostgreSQL `rate_limit_windows` table. Monitor 429 and
503 counts without logging message bodies, email addresses, provider errors, API
keys, or database credentials.
