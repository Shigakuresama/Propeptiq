# Database integration-test boundary

The default database integration suite applies the generated migration to a
fresh in-memory PGlite database. This proves bootstrap execution and the tested
schema, foreign-key, uniqueness, enum, and row-check behavior without database
credentials.

PGlite is not evidence for real PostgreSQL concurrency, locking, transaction
isolation, or deployment behavior. The guarded external-PostgreSQL lane remains
future Task 6/7 work and requires both an isolated `TEST_DATABASE_URL` and the
explicit test-target confirmation. No shared, preview, or production database
is an acceptable test target.
