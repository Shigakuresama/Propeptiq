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

The `0001` Task 5 migration deliberately aborts before making any change when
the v0 `products` table contains rows. No truthful `material_identity` can be
inferred from the old columns. An operator must reconcile every existing
product with an explicitly reviewed material identity in a separately reviewed
data migration before applying `0001`; deleting rows or substituting a generic
value is not an approved workaround.

The `0002` lineage migration follows the same fail-closed rule for a populated
`refunds` table. An operator must map each legacy refund to the verified source
payment event for the same order before applying it. The existing
`provider_event_id` remains reserved for the later refund-provider response;
it is not reused as source-payment lineage.

Migration `0003` is source-only in this task. It is not authorized to inspect,
apply to, or reconcile an external database. Its first-statement preflight
refuses populated `orders` or `provider_events` because structured addresses,
buyer-scoped attempts, exact quote/expiry facts, and normalized provider events
cannot be reconstructed honestly. A populated commerce chain requires a
separately authorized reconciliation migration.
