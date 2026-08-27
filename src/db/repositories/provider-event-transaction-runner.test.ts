import { describe, expect, it } from "vitest";

import {
  createProviderEventTransactionRunner,
  type ProviderEventSqlSession,
} from "@/db/repositories/provider-event-repository";

const fenceKey = "-4294967297";
const callbackFailure = new Error("synthetic callback failure");
const lockFailure = new Error("synthetic lock failure");
const beginFailure = new Error("synthetic begin failure");
const commitFailure = new Error("synthetic commit failure");

function harness(failSql?: string, unlockAcknowledged = true) {
  const calls: string[] = [];
  const releases: boolean[] = [];
  const session: ProviderEventSqlSession = {
    async query(sql, parameters = []) {
      calls.push(`${sql.replace(/\s+/gu, " ").trim()}|${parameters.join(",")}`);
      if (sql === failSql) {
        if (sql.startsWith("BEGIN")) throw beginFailure;
        if (sql === "COMMIT") throw commitFailure;
        throw lockFailure;
      }
      return {
        rows: sql.includes("pg_advisory_unlock")
          ? unlockAcknowledged
            ? [{ unlocked: true }]
            : []
          : [],
      };
    },
    release(destroy = false) {
      releases.push(destroy);
      calls.push(`release|${destroy}`);
    },
  };
  return { calls, releases, session };
}

const fenced = Object.freeze({
  isolationLevel: "serializable" as const,
  providerIdentityFenceKeys: [fenceKey],
});

describe("provider event physical-session transaction runner", () => {
  it("locks before BEGIN, uses that session, and unlocks after COMMIT", async () => {
    const fixture = harness();
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async (client) => {
      expect(client).toBe(fixture.session);
      await client.query("SELECT business_work");
      return "committed";
    }, fenced)).resolves.toBe("committed");

    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      "BEGIN ISOLATION LEVEL SERIALIZABLE|",
      "SELECT business_work|",
      "COMMIT|",
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${fenceKey}`,
      "release|false",
    ]);
  });

  it("orders and deduplicates every opaque fence before BEGIN, then unlocks in reverse order", async () => {
    const secondFenceKey = "17";
    const fixture = harness();
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async (client) => {
      await client.query("SELECT business_work");
      return "committed";
    }, {
      isolationLevel: "serializable",
      providerIdentityFenceKeys: [secondFenceKey, fenceKey, secondFenceKey],
    })).resolves.toBe("committed");

    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      `SELECT pg_advisory_lock($1::bigint)|${secondFenceKey}`,
      "BEGIN ISOLATION LEVEL SERIALIZABLE|",
      "SELECT business_work|",
      "COMMIT|",
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${secondFenceKey}`,
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${fenceKey}`,
      "release|false",
    ]);
  });

  it("destroys the session when advisory lock acquisition is uncertain", async () => {
    const fixture = harness("SELECT pg_advisory_lock($1::bigint)");
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async () => "unreachable", fenced)).rejects.toBe(lockFailure);
    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      "release|true",
    ]);
  });

  it("rolls back and unlocks after callback failure", async () => {
    const fixture = harness();
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async () => {
      throw callbackFailure;
    }, fenced)).rejects.toBe(callbackFailure);
    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      "BEGIN ISOLATION LEVEL SERIALIZABLE|",
      "ROLLBACK|",
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${fenceKey}`,
      "release|false",
    ]);
  });

  it("unlocks and destroys the session when transaction start is uncertain", async () => {
    const fixture = harness("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async () => "unreachable", fenced)).rejects.toBe(beginFailure);
    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      "BEGIN ISOLATION LEVEL SERIALIZABLE|",
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${fenceKey}`,
      "release|true",
    ]);
  });

  it("rolls back and unlocks when COMMIT fails", async () => {
    const fixture = harness("COMMIT");
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async (client) => {
      await client.query("SELECT business_work");
      return "not-observable";
    }, fenced)).rejects.toBe(commitFailure);
    expect(fixture.calls).toEqual([
      `SELECT pg_advisory_lock($1::bigint)|${fenceKey}`,
      "BEGIN ISOLATION LEVEL SERIALIZABLE|",
      "SELECT business_work|",
      "COMMIT|",
      "ROLLBACK|",
      `SELECT pg_advisory_unlock($1::bigint) AS unlocked|${fenceKey}`,
      "release|false",
    ]);
  });

  it("destroys the session if the advisory unlock is not acknowledged", async () => {
    const fixture = harness(undefined, false);
    const runner = createProviderEventTransactionRunner(async () => fixture.session);

    await expect(runner(async () => "committed", fenced)).rejects.toThrow(
      "Provider identity fence cleanup failed",
    );
    expect(fixture.releases).toEqual([true]);
  });
});
