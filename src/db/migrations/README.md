# Migration boundary

The generated `0000` migration is a source-only bootstrap for an explicitly
empty database. It replaces, and is incompatible with, the unfinished strict
bootstrap that preceded the lean commerce model.

`npm run db:check` validates the local Drizzle schema history only. It does not
connect to a database and is not evidence that a database has been migrated.

If any database previously applied the discarded strict bootstrap, do not apply
this `0000` to it. That database requires a separately authorized, reviewed
forward reconciliation based on its actual state and data. This repository does
not provide or authorize a live migration command for Task 3.
