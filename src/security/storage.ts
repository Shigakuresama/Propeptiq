export type StorageVerificationMode = "disabled" | "test" | "live";

/** Largest COA object this system will read back or ingest. */
export const maxCoaBytes = 25 * 1024 * 1024;

export type StorageWriter = Readonly<{
  mode: StorageVerificationMode;
  write: (input: Readonly<{
    storageKey: string;
    body: Uint8Array;
    contentType: string;
  }>) => Promise<void>;
}>;

export type StorageVerifier = Readonly<{
  mode: StorageVerificationMode;
  verify: (storageKey: string) => Promise<Readonly<{
    exists: boolean;
    sha256: string | null;
  }>>;
}>;

export async function verifyCoaForPublication(
  verifier: StorageVerifier,
  input: Readonly<{ storageKey: string; expectedSha256: string }>,
): Promise<true> {
  if (verifier.mode === "disabled") {
    throw new Error("Storage verification is disabled");
  }
  if (
    !input.storageKey.trim() ||
    !/^[a-f0-9]{64}$/.test(input.expectedSha256)
  ) {
    throw new Error("COA storage manifest is invalid");
  }
  const object = await verifier.verify(input.storageKey);
  if (!object.exists) throw new Error("COA object does not exist");
  if (object.sha256 !== input.expectedSha256) {
    throw new Error("COA object digest does not match the manifest");
  }
  return true;
}
