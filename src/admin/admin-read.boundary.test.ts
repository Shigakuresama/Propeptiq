import { describe, expect, it } from "vitest";

import {
  ADMIN_READ_RESOURCE_REQUIREMENTS,
  isAdminReadResource,
  requiredAdminReadCapability,
} from "@/admin/admin-read";

describe("Task 5 admin read boundary", () => {
  it("maps every approved resource to its exact persisted capability", () => {
    expect(ADMIN_READ_RESOURCE_REQUIREMENTS).toEqual({
      products: "catalog:publish",
      prices: "catalog:publish",
      "policy-groups": "catalog:publish",
      lots: "catalog:publish",
      coas: "catalog:publish",
      "analytical-claims": "catalog:publish",
      attestations: "catalog:publish",
      "destination-rules": "destination:manage",
      promotions: "promotion:manage",
      buyers: "review:decide",
      "review-requests": "review:decide",
      orders: "order:read:any",
      refunds: "refund:request",
      shipments: "fulfillment:release:consume",
      staff: "staff:manage",
      audit: "staff:manage",
      "loyalty-policies": "growth:manage",
      "referral-policies": "growth:manage",
      "affiliate-policies": "growth:manage",
      "reward-adjustments": "growth:manage",
    });
  });

  it("rejects unknown resource names before a read can be selected", () => {
    expect(isAdminReadResource("products")).toBe(true);
    expect(isAdminReadResource("provider-events")).toBe(false);
    expect(isAdminReadResource("__proto__")).toBe(false);
    expect(requiredAdminReadCapability("refunds")).toBe("refund:request");
    expect(requiredAdminReadCapability("affiliate-policies")).toBe("growth:manage");
    expect(requiredAdminReadCapability("reward-adjustments")).toBe("growth:manage");
  });
});
