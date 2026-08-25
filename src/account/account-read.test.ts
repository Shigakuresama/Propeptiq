import { describe, expect, it, vi } from "vitest";

import { loadOwnOrder } from "./account-read";

describe("owner-scoped order reads", () => {
  it("rejects malformed owner or order identifiers before SQL casting", async () => {
    const query = vi.fn();
    await expect(
      loadOwnOrder(
        { query },
        "10000000-0000-4000-8000-000000000001",
        "not-a-uuid",
      ),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
