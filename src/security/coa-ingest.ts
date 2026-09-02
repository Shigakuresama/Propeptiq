import { createHash } from "node:crypto";

import {
  maxCoaBytes,
  type StorageVerifier,
  type StorageWriter,
} from "./storage";

export type CoaManifestEntry = Readonly<{
  lotId: string;
  storageKey: string;
  evidenceHash: string;
  issuedAt?: string;
}>;

export type CoaIngestResult = Readonly<{
  status: "written" | "already_present";
  sha256: string;
}>;

const sha256Pattern = /^[a-f0-9]{64}$/;

/**
 * Place one manifest-declared COA object into private storage.
 *
 * The manifest asserts a digest; this never takes that assertion on trust. The
 * bytes are hashed here, an existing object is never silently replaced, and the
 * write is confirmed by reading the object back through the same verifier that
 * gates publication. Any disagreement aborts without recording evidence.
 */
export async function ingestCoaObject(
  writer: StorageWriter,
  verifier: StorageVerifier,
  entry: CoaManifestEntry,
  body: Uint8Array,
  contentType = "application/pdf",
): Promise<CoaIngestResult> {
  if (writer.mode === "disabled" || verifier.mode === "disabled") {
    throw new Error("COA ingest is disabled");
  }
  const storageKey = entry.storageKey.trim();
  if (!storageKey) throw new Error("COA storage key is required");

  const declaredHash = entry.evidenceHash.trim().toLowerCase();
  if (!sha256Pattern.test(declaredHash)) {
    throw new Error("COA evidence hash must be lowercase SHA-256");
  }
  if (body.byteLength === 0) throw new Error("COA object is empty");
  if (body.byteLength > maxCoaBytes) throw new Error("COA object is too large");

  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== declaredHash) {
    throw new Error("COA object digest does not match the manifest");
  }

  const existing = await verifier.verify(storageKey);
  if (existing.exists) {
    if (existing.sha256 !== declaredHash) {
      throw new Error(
        "COA storage key already holds different evidence; ingest refused",
      );
    }
    return { status: "already_present", sha256: declaredHash };
  }

  await writer.write({ storageKey, body, contentType });

  const stored = await verifier.verify(storageKey);
  if (!stored.exists || stored.sha256 !== declaredHash) {
    throw new Error("COA object write could not be confirmed");
  }
  return { status: "written", sha256: declaredHash };
}
