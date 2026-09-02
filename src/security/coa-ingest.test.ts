import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ingestCoaObject } from "./coa-ingest";
import type { StorageVerifier, StorageWriter } from "./storage";

const bytes = (value: string) => new TextEncoder().encode(value);
const sha256 = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

type StoreState = Map<string, Uint8Array>;

function harness(initial: StoreState = new Map()) {
  const store = initial;
  const writes: string[] = [];
  const writer: StorageWriter = {
    mode: "test",
    async write({ storageKey, body }) {
      writes.push(storageKey);
      store.set(storageKey, body);
    },
  };
  const verifier: StorageVerifier = {
    mode: "test",
    async verify(storageKey) {
      const found = store.get(storageKey);
      return found
        ? { exists: true, sha256: sha256(found) }
        : { exists: false, sha256: null };
    },
  };
  return { store, writes, writer, verifier };
}

const body = bytes("certificate-of-analysis-pdf-bytes");
const entry = {
  lotId: "11111111-1111-4111-8111-111111111111",
  storageKey: "coa/lot-a.pdf",
  evidenceHash: sha256(body),
} as const;

describe("ingestCoaObject", () => {
  it("writes the object and confirms the stored digest", async () => {
    const { store, writes, writer, verifier } = harness();

    const result = await ingestCoaObject(writer, verifier, entry, body);

    expect(result).toEqual({ status: "written", sha256: entry.evidenceHash });
    expect(writes).toEqual(["coa/lot-a.pdf"]);
    expect(sha256(store.get("coa/lot-a.pdf")!)).toBe(entry.evidenceHash);
  });

  it("refuses bytes whose digest does not match the manifest", async () => {
    const { writes, writer, verifier } = harness();

    await expect(
      ingestCoaObject(writer, verifier, entry, bytes("different-bytes")),
    ).rejects.toThrow(/digest does not match the manifest/i);
    expect(writes).toEqual([]);
  });

  it("is idempotent when the stored object already matches", async () => {
    const { writes, writer, verifier } = harness(
      new Map([["coa/lot-a.pdf", body]]),
    );

    const result = await ingestCoaObject(writer, verifier, entry, body);

    expect(result).toEqual({ status: "already_present", sha256: entry.evidenceHash });
    expect(writes).toEqual([]);
  });

  it("refuses to overwrite a different object at the same key", async () => {
    const { writes, writer, verifier } = harness(
      new Map([["coa/lot-a.pdf", bytes("previously-published-evidence")]]),
    );

    await expect(ingestCoaObject(writer, verifier, entry, body)).rejects.toThrow(
      /already holds different evidence/i,
    );
    expect(writes).toEqual([]);
  });

  it("refuses a non-sha256 manifest hash", async () => {
    const { writer, verifier } = harness();

    await expect(
      ingestCoaObject(writer, verifier, { ...entry, evidenceHash: "ABC" }, body),
    ).rejects.toThrow(/lowercase SHA-256/i);
  });

  it("refuses a blank storage key", async () => {
    const { writer, verifier } = harness();

    await expect(
      ingestCoaObject(writer, verifier, { ...entry, storageKey: "   " }, body),
    ).rejects.toThrow(/storage key/i);
  });

  it("refuses to ingest when storage is disabled", async () => {
    const { verifier } = harness();
    const disabled: StorageWriter = {
      mode: "disabled",
      async write() {
        throw new Error("must not be called");
      },
    };

    await expect(
      ingestCoaObject(disabled, verifier, entry, body),
    ).rejects.toThrow(/disabled/i);
  });

  it("refuses an empty object", async () => {
    const { writer, verifier } = harness();

    await expect(
      ingestCoaObject(writer, verifier, { ...entry, evidenceHash: sha256(bytes("")) }, bytes("")),
    ).rejects.toThrow(/empty/i);
  });

  it("fails closed when the read-back disagrees with the write", async () => {
    const { writer } = harness();
    const lyingVerifier: StorageVerifier = {
      mode: "test",
      async verify() {
        return { exists: false, sha256: null };
      },
    };

    await expect(
      ingestCoaObject(writer, lyingVerifier, entry, body),
    ).rejects.toThrow(/could not be confirmed/i);
  });
});
