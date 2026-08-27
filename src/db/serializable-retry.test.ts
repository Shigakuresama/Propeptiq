import { describe, expect, it, vi } from "vitest";

import { runSerializableWithRetry } from "@/db/serializable-retry";

function postgresError(code: string): Error & { code: string } {
  return Object.assign(new Error(`synthetic PostgreSQL ${code}`), { code });
}

describe("serializable transaction retry", () => {
  it.each(["40001", "40P01"])(
    "retries SQLSTATE %s with at most three total callback attempts",
    async (code) => {
      const callback = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(postgresError(code))
        .mockRejectedValueOnce(postgresError(code))
        .mockResolvedValue("committed");
      const sleep = vi.fn(async () => undefined);

      await expect(
        runSerializableWithRetry(callback, { sleep }),
      ).resolves.toBe("committed");
      expect(callback).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    },
  );

  it("rethrows after the third retryable failure", async () => {
    const callback = vi.fn(async () => {
      throw postgresError("40001");
    });
    await expect(
      runSerializableWithRetry(callback, { sleep: async () => undefined }),
    ).rejects.toMatchObject({ code: "40001" });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it.each(["55P03", "23505", "DOMAIN"])(
    "never retries non-approved code %s",
    async (code) => {
      const callback = vi.fn(async () => {
        throw postgresError(code);
      });
      const sleep = vi.fn(async () => undefined);
      await expect(runSerializableWithRetry(callback, { sleep })).rejects.toThrow(
        code,
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );
});
