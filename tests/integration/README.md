# Database integration-test boundary

The default database integration suite applies the generated migration to a
fresh in-memory PGlite database. This proves bootstrap execution and the tested
schema, foreign-key, uniqueness, enum, and row-check behavior without database
credentials.

PGlite is not evidence for real PostgreSQL concurrency, locking, transaction
isolation, or deployment behavior. The guarded PostgreSQL lane contains three
files and twenty tests: five checkout-contention tests, five provider-event
contention tests, and ten refund/fulfillment contention tests. It is available
as `npm run test:postgres:checkout` and is excluded from both normal unit and
PGlite integration suites.

The contention lane requires a separately prepared, fully migrated, disposable
PostgreSQL database plus both a narrowly test-scoped `TEST_DATABASE_URL` and
exact `TEST_DATABASE_CONFIRMATION=isolated-test-database`. Its guard rejects
shared/main/live/production-looking targets before creating a pool. The lane
uses deterministic synthetic UUID fixtures and deletes only those exact rows;
it never drops or resets a schema. No shared, preview, or production database
is an acceptable target.
