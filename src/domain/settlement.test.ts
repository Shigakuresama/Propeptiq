import { describe, expect, it } from "vitest";

import { settlementWindowClosesAt } from "@/domain/settlement";

describe("settlementWindowClosesAt", () => {
  it("counts business days, skipping the weekend", () => {
    // Monday 2026-08-24 + 5 business days = Monday 2026-08-31.
    expect(
      settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), 5),
    ).toEqual(new Date("2026-08-31T12:00:00.000Z"));
  });

  it("carries a Friday payment over the weekend", () => {
    // Friday 2026-08-28 + 1 business day = Monday 2026-08-31.
    expect(
      settlementWindowClosesAt(new Date("2026-08-28T09:00:00.000Z"), 1),
    ).toEqual(new Date("2026-08-31T09:00:00.000Z"));
  });

  it("treats a Saturday payment as landing on the next business day first", () => {
    // Saturday 2026-08-29 + 1 business day = Monday 2026-08-31.
    expect(
      settlementWindowClosesAt(new Date("2026-08-29T09:00:00.000Z"), 1),
    ).toEqual(new Date("2026-08-31T09:00:00.000Z"));
  });

  it("preserves the time of day so a window never shortens", () => {
    const closes = settlementWindowClosesAt(
      new Date("2026-08-24T23:45:30.000Z"),
      5,
    );
    expect(closes).not.toBeNull();
    expect(closes?.toISOString()).toBe("2026-08-31T23:45:30.000Z");
  });

  it("refuses a zero or negative window rather than releasing immediately", () => {
    expect(settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), 0)).toBeNull();
    expect(settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), -1)).toBeNull();
  });

  it("refuses a non-integer or unsafe window", () => {
    expect(settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), 1.5)).toBeNull();
    expect(
      settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), Number.NaN),
    ).toBeNull();
  });

  it("refuses an invalid payment instant", () => {
    expect(settlementWindowClosesAt(new Date(Number.NaN), 5)).toBeNull();
  });

  it("caps an implausibly long window rather than parking an order forever", () => {
    expect(settlementWindowClosesAt(new Date("2026-08-24T12:00:00.000Z"), 400)).toBeNull();
  });
});
