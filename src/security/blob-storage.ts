import "server-only";

import { createHash } from "node:crypto";

import type { ServerEnv } from "@/config/env-schema";

import { maxCoaBytes, type StorageVerifier, type StorageWriter } from "./storage";

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

export function createRuntimeStorageWriter(
  environment: ServerEnv,
): StorageWriter {
  if (environment.STORAGE_MODE === "disabled") {
    return {
      mode: "disabled",
      async write() {
        throw new Error("Storage writes are disabled");
      },
    };
  }
  const token = environment.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Storage writer configuration is incomplete");
  return {
    mode: environment.STORAGE_MODE,
    async write({ storageKey, body, contentType }) {
      const { put } = await import("@vercel/blob");
      await put(storageKey, Buffer.from(body), {
        access: "private",
        contentType,
        // The manifest owns the key, so it must be stored verbatim, and an
        // existing object is never replaced here. ingestCoaObject decides
        // whether a key is safe to write before calling this.
        addRandomSuffix: false,
        allowOverwrite: false,
        token,
      });
    },
  };
}
