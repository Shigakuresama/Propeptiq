import { describe, expect, it } from "vitest";

import { resolveTestDatabase } from "./helpers/database";

describe("database integration target guard", () => {
  it("requires an explicit URL and isolated-test confirmation", () => {
    expect(() => resolveTestDatabase({})).toThrow(/TEST_DATABASE_URL/);
    expect(() =>
      resolveTestDatabase({
        TEST_DATABASE_URL:
          "postgresql://synthetic_user:synthetic_password@localhost:55432/propeptiq_test",
      }),
    ).toThrow(/TEST_DATABASE_CONFIRMATION/);
  });

  it.each([
    "postgresql://synthetic_user:synthetic_password@prod.example.invalid/propeptiq_test",
    "postgresql://synthetic_user:synthetic_password@test.example.invalid/propeptiq_live",
    "postgresql://synthetic_user:synthetic_password@main.example.invalid/propeptiq_test",
  ])("rejects a production-looking target without leaking credentials", (url) => {
    let message = "";
    try {
      resolveTestDatabase({
        TEST_DATABASE_URL: url,
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/production|isolated|test target/i);
    expect(message).not.toContain("synthetic_password");
  });

  it("returns only a sanitized description for a confirmed target", () => {
    const target = resolveTestDatabase({
      TEST_DATABASE_URL:
        "postgresql://synthetic_user:synthetic_password@localhost:55432/propeptiq_test",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    });

    expect(target).toEqual({
      mode: "postgres",
      url: expect.stringContaining("synthetic_password"),
      isolated: true,
      description: "postgres://localhost:55432/propeptiq_test",
    });
    expect(target.description).not.toContain("synthetic_password");
  });
});
