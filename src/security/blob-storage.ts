import "server-only";

import { createHash } from "node:crypto";

import type { ServerEnv } from "@/config/env-schema";

import type { StorageVerifier } from "./storage";

const maxCoaBytes = 25 * 1024 * 1024;

export function createRuntimeStorageVerifier(
  environment: ServerEnv,
): StorageVerifier {
  if (environment.STORAGE_MODE === "disabled") {
    return {
      mode: "disabled",
      async verify() {
        return { exists: false, sha256: null };
      },
    };
  }
  const token = environment.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Storage verifier configuration is incomplete");
  return {
    mode: environment.STORAGE_MODE,
    async verify(storageKey) {
      const { get } = await import("@vercel/blob");
      const result = await get(storageKey, {
        access: "private",
        useCache: false,
        token,
      });
      if (!result || result.statusCode !== 200 || result.blob.size > maxCoaBytes) {
        return { exists: false, sha256: null };
      }
      const reader = result.stream.getReader();
      const hash = createHash("sha256");
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxCoaBytes) {
            await reader.cancel();
            return { exists: false, sha256: null };
          }
          hash.update(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      return { exists: true, sha256: hash.digest("hex") };
    },
  };
}
