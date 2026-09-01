import { describe, expect, it } from "vitest";

import {
  calculateConcentration,
  parseConcentrationDecimal,
  type ConcentrationInput,
  type ConcentrationLimits,
} from "./concentration";

const limits: ConcentrationLimits = {
  maxVialMg: 100,
  maxDiluentMl: 50,
  maxSampleMl: 10,
};

describe("calculateConcentration", () => {
  it("calculates only the bounded concentration and optional sample conversions", () => {
    expect(
      calculateConcentration(
        { vialMg: 10, diluentMl: 2, sampleMl: 0.1 },
        { maxVialMg: 1_000, maxDiluentMl: 1_000, maxSampleMl: 1_000 },
      ),
    ).toEqual({
      ok: true,
      value: {
        mgPerMl: 5,
        mcgPerMl: 5_000,
        sampleMg: 0.5,
        sampleMcg: 500,
      },
    });
  });

  it("omits sample values when the optional sample is not supplied", () => {
    expect(calculateConcentration({ vialMg: 0.5, diluentMl: 2 }, limits)).toEqual({
      ok: true,
      value: { mgPerMl: 0.25, mcgPerMl: 250 },
    });
  });

  it.each([
    [
      "missing",
      { maxVialMg: undefined, maxDiluentMl: 50, maxSampleMl: 10 },
    ],
    ["non-finite", { maxVialMg: 100, maxDiluentMl: Infinity, maxSampleMl: 10 }],
    ["zero", { maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 0 }],
    ["negative", { maxVialMg: -1, maxDiluentMl: 50, maxSampleMl: 10 }],
  ])("fails closed with only invalid_limits for %s limits", (_label, invalid) => {
    expect(
      calculateConcentration(
        { vialMg: NaN, diluentMl: 0, sampleMl: Infinity },
        invalid as ConcentrationLimits,
      ),
    ).toEqual({
      ok: false,
      errors: [{ field: "configuration", code: "invalid_limits" }],
    });
  });

  it("returns one error per invalid input field in stable field order", () => {
    expect(
      calculateConcentration(
        { vialMg: undefined, diluentMl: Infinity, sampleMl: -0.1 } as unknown as ConcentrationInput,
        limits,
      ),
    ).toEqual({
      ok: false,
      errors: [
        { field: "vialMg", code: "required" },
        { field: "diluentMl", code: "not_finite" },
        { field: "sampleMl", code: "not_positive" },
      ],
    });
  });

  it.each([
    ["vialMg", { vialMg: NaN, diluentMl: 1 }, "not_finite"],
    ["vialMg", { vialMg: 0, diluentMl: 1 }, "not_positive"],
    ["vialMg", { vialMg: 101, diluentMl: 1 }, "exceeds_limit"],
    ["diluentMl", { vialMg: 1, diluentMl: -1 }, "not_positive"],
    ["diluentMl", { vialMg: 1, diluentMl: 51 }, "exceeds_limit"],
    ["sampleMl", { vialMg: 1, diluentMl: 1, sampleMl: NaN }, "not_finite"],
    ["sampleMl", { vialMg: 1, diluentMl: 1, sampleMl: 0 }, "not_positive"],
    ["sampleMl", { vialMg: 1, diluentMl: 1, sampleMl: 11 }, "exceeds_limit"],
  ] as const)("returns %s %s for its first applicable invalid condition", (field, input, code) => {
    expect(calculateConcentration(input, limits)).toEqual({
      ok: false,
      errors: [{ field, code }],
    });
  });

  it("fails closed when otherwise valid arithmetic leaves the finite range", () => {
    expect(
      calculateConcentration(
        { vialMg: Number.MAX_VALUE, diluentMl: Number.MIN_VALUE },
        {
          maxVialMg: Number.MAX_VALUE,
          maxDiluentMl: Number.MAX_VALUE,
          maxSampleMl: Number.MAX_VALUE,
        },
      ),
    ).toEqual({
      ok: false,
      errors: [{ field: "configuration", code: "calculation_out_of_range" }],
    });
  });

  it("freezes every returned result object and array without mutating inputs", () => {
    const input = { vialMg: 10, diluentMl: 2, sampleMl: 0.1 };
    const unchangedInput = { ...input };
    const unchangedLimits = { ...limits };
    const success = calculateConcentration(input, limits);
    const failure = calculateConcentration({ vialMg: 0, diluentMl: 0 }, limits);

    expect(input).toEqual(unchangedInput);
    expect(limits).toEqual(unchangedLimits);
    expect(Object.isFrozen(success)).toBe(true);
    expect(success.ok && Object.isFrozen(success.value)).toBe(true);
    expect(Object.isFrozen(failure)).toBe(true);
    expect(!failure.ok && Object.isFrozen(failure.errors)).toBe(true);
    expect(!failure.ok && failure.errors.every(Object.isFrozen)).toBe(true);
  });
});

describe("parseConcentrationDecimal", () => {
  it.each([
    ["0.5", 0.5],
    [".5", 0.5],
    ["5.", 5],
    ["05", 5],
    ["+1.25", 1.25],
    ["-0.5", -0.5],
  ] as const)("accepts the plain decimal grammar for %s", (raw, value) => {
    expect(parseConcentrationDecimal(raw)).toEqual({ ok: true, value });
  });

  it.each([
    "",
    " 1",
    "1 ",
    "1e2",
    "NaN",
    "Infinity",
    "-Infinity",
    "1..2",
    "+",
    ".",
    "$1",
  ])("rejects %j without browser coercion", (raw) => {
    expect(parseConcentrationDecimal(raw)).toEqual({ ok: false });
  });
});
