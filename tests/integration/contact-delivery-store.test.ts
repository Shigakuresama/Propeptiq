import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPostgresContactDeliveryStore } from "../../src/db/repositories/contact-delivery-store";
import type { RuntimeDatabaseSession } from "../../src/db/runtime";
import { createMigratedPglite } from "./helpers/pglite";

let client: PGlite;
beforeEach(async () => { client = await createMigratedPglite(); });
afterEach(async () => { await client.close(); });

function store() {
  const session: RuntimeDatabaseSession = {
    query: async <T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) =>
      client.query<T>(sql, params ? [...params] : []),
    release: () => {},
  };
  return createPostgresContactDeliveryStore(session);
}
const hash = "a".repeat(64);
const now = new Date("2026-09-06T12:00:00Z");

describe("contact delivery journal through the full migration chain", () => {
  it("retains pending, rejects payload conflicts, and reuses accepted results", async () => {
    const repository = store();
    await client.exec("BEGIN");
    expect(await repository.reserve("contact/first", hash, now)).toBe("reserved");
    await client.exec("COMMIT");
    await client.exec("BEGIN");
    expect(await repository.reserve("contact/first", hash, now)).toBe("pending");
    expect(await repository.reserve("contact/first", "b".repeat(64), now)).toBe("conflict");
    await client.exec("COMMIT");
    expect(await repository.accept("contact/first", hash, "synthetic-provider-id", now)).toBe(true);
    await client.exec("BEGIN");
    expect(await repository.reserve("contact/first", hash, now)).toBe("accepted");
    // A distinct intentional submission may contain identical text.
    expect(await repository.reserve("contact/second", hash, now)).toBe("reserved");
    await client.exec("COMMIT");
    const persisted = await client.query("SELECT status, provider_id FROM contact_email_deliveries WHERE idempotency_key = $1", ["contact/first"]);
    expect(persisted.rows).toEqual([{ status: "accepted", provider_id: "synthetic-provider-id" }]);
  });

  it("releases only the matching pending reservation after definite rejection", async () => {
    const repository = store();
    await client.exec("BEGIN");
    await repository.reserve("contact/retry", hash, now);
    await client.exec("COMMIT");
    await repository.reject("contact/retry", "b".repeat(64));
    await client.exec("BEGIN");
    expect(await repository.reserve("contact/retry", hash, now)).toBe("pending");
    await client.exec("COMMIT");
    await repository.reject("contact/retry", hash);
    await client.exec("BEGIN");
    expect(await repository.reserve("contact/retry", hash, now)).toBe("reserved");
    await client.exec("COMMIT");
  });

  it("rejects accepted journal state without a provider identity", async () => {
    await expect(client.query(
      "INSERT INTO contact_email_deliveries (idempotency_key, request_hash, status, created_at, updated_at) VALUES ($1,$2,'accepted',$3,$3)",
      ["contact/invalid", hash, now.toISOString()],
    )).rejects.toThrow(/contact_email_deliveries_provider_state/);
  });
});
