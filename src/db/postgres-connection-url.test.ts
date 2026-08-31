import { describe, expect, it } from "vitest";

import { preparePostgresConnectionUrl } from "./postgres-connection-url";

describe("PostgreSQL connection URL preparation", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "pins ambiguous sslmode=%s to verify-full",
    (sslMode) => {
      expect(
        preparePostgresConnectionUrl(
          `postgresql://role:password@ep-example.aws.neon.tech/neondb?sslmode=${sslMode}&channel_binding=require`,
        ),
      ).toBe(
        "postgresql://role:password@ep-example.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
      );
    },
  );

  it("preserves an already explicit verify-full URL", () => {
    const input =
      "postgresql://role:password@ep-example.aws.neon.tech/neondb?sslmode=verify-full";

    expect(preparePostgresConnectionUrl(input)).toBe(input);
  });

  it("rejects transaction-pooled URLs when a persistent session is required", () => {
    expect(() =>
      preparePostgresConnectionUrl(
        "postgresql://role:password@ep-example-pooler.aws.neon.tech/neondb?sslmode=require",
        { requirePersistentSession: true },
      ),
    ).toThrow(/direct Neon database URL/i);
  });
});
