export type ConcentrationInput = Readonly<{
  vialMg: number;
  diluentMl: number;
  sampleMl?: number;
}>;

export type ConcentrationLimits = Readonly<{
  maxVialMg: number;
  maxDiluentMl: number;
  maxSampleMl: number;
}>;

export type ConcentrationResult = Readonly<{
  mgPerMl: number;
  mcgPerMl: number;
  sampleMg?: number;
  sampleMcg?: number;
}>;

export type ConcentrationError = Readonly<{
  field: "configuration" | "vialMg" | "diluentMl" | "sampleMl";
  code:
    | "required"
    | "not_finite"
    | "not_positive"
    | "exceeds_limit"
    | "invalid_limits"
    | "calculation_out_of_range";
}>;

export type ConcentrationCalculation =
  | Readonly<{ ok: true; value: ConcentrationResult }>
  | Readonly<{ ok: false; errors: readonly ConcentrationError[] }>;

export type PublicConcentrationCalculatorConfiguration = Readonly<{
  title: string;
  body: string;
  limits: ConcentrationLimits;
}>;

export type ConcentrationDecimalParse =
  | Readonly<{ ok: true; value: number }>
  | Readonly<{ ok: false }>;

const invalidDecimalParse: ConcentrationDecimalParse = Object.freeze({
  ok: false,
});

export function parseConcentrationDecimal(
  raw: string,
): ConcentrationDecimalParse {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(raw)) {
    return invalidDecimalParse;
  }
  const value = Number(raw);
  return Number.isFinite(value)
    ? Object.freeze({ ok: true, value })
    : invalidDecimalParse;
}

function frozenError(
  field: ConcentrationError["field"],
  code: ConcentrationError["code"],
): ConcentrationError {
  return Object.freeze({ field, code });
}

function failure(errors: readonly ConcentrationError[]): ConcentrationCalculation {
  return Object.freeze({ ok: false, errors: Object.freeze([...errors]) });
}

function inputError(
  field: "vialMg" | "diluentMl" | "sampleMl",
  value: unknown,
  maximum: number,
): ConcentrationError | null {
  if (typeof value !== "number") return frozenError(field, "required");
  if (!Number.isFinite(value)) return frozenError(field, "not_finite");
  if (value <= 0) return frozenError(field, "not_positive");
  if (value > maximum) return frozenError(field, "exceeds_limit");
  return null;
}

export function calculateConcentration(
  input: ConcentrationInput,
  limits: ConcentrationLimits,
): ConcentrationCalculation {
  if (
    typeof limits?.maxVialMg !== "number" ||
    !Number.isFinite(limits.maxVialMg) ||
    limits.maxVialMg <= 0 ||
    typeof limits?.maxDiluentMl !== "number" ||
    !Number.isFinite(limits.maxDiluentMl) ||
    limits.maxDiluentMl <= 0 ||
    typeof limits?.maxSampleMl !== "number" ||
    !Number.isFinite(limits.maxSampleMl) ||
    limits.maxSampleMl <= 0
  ) {
    return failure([frozenError("configuration", "invalid_limits")]);
  }

  const errors = [
    inputError("vialMg", input?.vialMg, limits.maxVialMg),
    inputError("diluentMl", input?.diluentMl, limits.maxDiluentMl),
    input?.sampleMl === undefined
      ? null
      : inputError("sampleMl", input.sampleMl, limits.maxSampleMl),
  ].filter((error): error is ConcentrationError => error !== null);
  if (errors.length > 0) return failure(errors);

  const mgPerMl = input.vialMg / input.diluentMl;
  const sampleMg = input.sampleMl === undefined
    ? undefined
    : mgPerMl * input.sampleMl;
  const mcgPerMl = mgPerMl * 1_000;
  const sampleMcg = sampleMg === undefined ? undefined : sampleMg * 1_000;
  if (
    !Number.isFinite(mgPerMl) ||
    !Number.isFinite(mcgPerMl) ||
    (sampleMg !== undefined && !Number.isFinite(sampleMg)) ||
    (sampleMcg !== undefined && !Number.isFinite(sampleMcg))
  ) {
    return failure([
      frozenError("configuration", "calculation_out_of_range"),
    ]);
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      mgPerMl,
      mcgPerMl,
      ...(sampleMg === undefined
        ? {}
        : { sampleMg, sampleMcg: sampleMcg! }),
    }),
  });
}
