import { describe, expect, it } from "vitest";

import {
  authRouteWithDestination,
  DEFAULT_AUTH_DESTINATION,
  resolvePasswordResetToken,
  resolveAuthDestination,
  SIGN_IN_ROUTE,
} from "./routes";

describe("managed auth return destinations", () => {
  it("preserves only private same-origin application paths", () => {
    expect(resolveAuthDestination("/account/orders/order-1?tab=record")).toBe(
      "/account/orders/order-1?tab=record",
    );
    expect(resolveAuthDestination("/research-sets")).toBe("/research-sets");
    expect(resolveAuthDestination("/admin/catalog")).toBe("/admin/catalog");
  });

  it.each([
    "https://attacker.example/account",
    "//attacker.example/account",
    "/catalog",
    "/sign-in",
    "/account\\@attacker.example",
    " /account",
  ])("fails unsafe return target %s closed to checkout", (target) => {
    expect(resolveAuthDestination(target)).toBe(DEFAULT_AUTH_DESTINATION);
  });

  it("encodes the validated destination into the managed sign-in route", () => {
    expect(authRouteWithDestination(SIGN_IN_ROUTE, "/account/orders?state=open")).toBe(
      "/sign-in/?returnTo=%2Faccount%2Forders%3Fstate%3Dopen",
    );
  });

  it("accepts only bounded URL-safe reset tokens", () => {
    expect(resolvePasswordResetToken("synthetic_reset-token-1234")).toBe(
      "synthetic_reset-token-1234",
    );
    expect(resolvePasswordResetToken("short")).toBeNull();
    expect(resolvePasswordResetToken("token with spaces and punctuation!")).toBeNull();
    expect(resolvePasswordResetToken("a".repeat(513))).toBeNull();
  });
});
