# Contact form operations

The contact route is fail-closed. It does not deliver mail unless `APP_ORIGIN`,
`DATABASE_MODE`, `EMAIL_MODE`, `RESEND_API_KEY`, `RESEND_FROM`,
`CONTACT_SUPPORT_EMAIL`, `CONTACT_RATE_LIMIT_MAX`,
`CONTACT_RATE_LIMIT_WINDOW_SECONDS`, and `RATE_LIMIT_SECRET` are valid. Database
and email modes must match, and `AUTH_EMAIL_DELIVERY_VERIFIED=verified` must retain
the existing sender-delivery evidence. `CONTACT_SUPPORT_EMAIL` is the only destination; the
runtime never infers it from the sender.

Before activation, apply `src/db/migrations/0032_contact-email-deliveries.sql`
through the repository's separately reviewed database migration process. Verify
the Resend domain and `RESEND_FROM`, then use a controlled non-production recipient
to test one submission. Confirm the API returns `ACCEPTED` only when Resend returns
an email ID and the delivery journal row is `accepted` with that ID. Do not use a
real customer address for a canary.

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
