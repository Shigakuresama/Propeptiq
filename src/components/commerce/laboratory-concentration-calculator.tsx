"use client";

import { useState, type FormEvent } from "react";

import {
  calculateConcentration,
  parseConcentrationDecimal,
  type ConcentrationError,
  type ConcentrationInput,
  type ConcentrationResult,
  type PublicConcentrationCalculatorConfiguration,
} from "@/domain/concentration";

export const laboratoryConcentrationCalculatorStaticCopy = Object.freeze([
  "Vial amount (mg)",
  "Diluent volume (mL)",
  "Sample volume (mL, optional)",
  "Calculate",
  "Mathematical conversions only; no use recommendations are provided.",
  "Correct the highlighted field before calculating.",
  "Calculation results",
  "Enter a plain decimal amount.",
  "The value must be greater than zero.",
  "The value exceeds the approved limit.",
]);

type Field = "vialMg" | "diluentMl" | "sampleMl";
type Drafts = Readonly<Record<Field, string>>;

const fieldLabels: Readonly<Record<Field, string>> = Object.freeze({
  vialMg: "Vial amount (mg)",
  diluentMl: "Diluent volume (mL)",
  sampleMl: "Sample volume (mL)",
});

const fieldUnits: Readonly<Record<Field, "mg" | "mL">> = Object.freeze({
  vialMg: "mg",
  diluentMl: "mL",
  sampleMl: "mL",
});

function errorId(field: Field): string {
  return `${field}-error`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 12,
    useGrouping: true,
  }).format(value);
}

function errorMessage(
  error: ConcentrationError,
  calculator: PublicConcentrationCalculatorConfiguration,
): string {
  if (error.field === "configuration") {
    return "The calculation could not be completed with the approved limits.";
  }
  const label = fieldLabels[error.field];
  if (error.code === "required") return `${label} is required.`;
  if (error.code === "not_finite") {
    return `Enter a plain decimal amount in ${fieldUnits[error.field]}.`;
  }
  if (error.code === "not_positive") {
    return `${label} must be greater than zero.`;
  }
  const maximum = error.field === "vialMg"
    ? calculator.limits.maxVialMg
    : error.field === "diluentMl"
      ? calculator.limits.maxDiluentMl
      : calculator.limits.maxSampleMl;
  return `${label} must be no greater than ${formatNumber(maximum)} ${fieldUnits[error.field]}.`;
}

function ResultValue({ label, value, unit }: Readonly<{ label: string; value: number; unit: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-sm font-medium text-muted-ink">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{formatNumber(value)} {unit}</dd>
    </div>
  );
}

export function LaboratoryConcentrationCalculator({
  calculator,
}: Readonly<{
  calculator: PublicConcentrationCalculatorConfiguration;
}>) {
  const [drafts, setDrafts] = useState<Drafts>({
    vialMg: "",
    diluentMl: "",
    sampleMl: "",
  });
  const [errors, setErrors] = useState<readonly ConcentrationError[]>([]);
  const [result, setResult] = useState<ConcentrationResult | null>(null);

  function update(field: Field, value: string) {
    setDrafts((current) => ({ ...current, [field]: value }));
    setErrors([]);
    setResult(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lexicalErrors: ConcentrationError[] = [];
    const parsed: Partial<Record<Field, number>> = {};
    for (const field of ["vialMg", "diluentMl", "sampleMl"] as const) {
      const raw = drafts[field];
      if (raw === "") {
        if (field !== "sampleMl") {
          lexicalErrors.push(Object.freeze({ field, code: "required" }));
        }
        continue;
      }
      const lexical = parseConcentrationDecimal(raw);
      if (!lexical.ok) {
        lexicalErrors.push(Object.freeze({ field, code: "not_finite" }));
      } else {
        parsed[field] = lexical.value;
      }
    }
    if (lexicalErrors.length > 0) {
      setErrors(Object.freeze(lexicalErrors));
      setResult(null);
      return;
    }

    const input: ConcentrationInput = {
      vialMg: parsed.vialMg!,
      diluentMl: parsed.diluentMl!,
      ...(parsed.sampleMl === undefined ? {} : { sampleMl: parsed.sampleMl }),
    };
    const calculation = calculateConcentration(input, calculator.limits);
    if (!calculation.ok) {
      setErrors(calculation.errors);
      setResult(null);
      return;
    }
    setErrors([]);
    setResult(calculation.value);
  }

  const errorsByField = new Map(
    errors
      .filter((error): error is ConcentrationError & Readonly<{ field: Field }> =>
        error.field !== "configuration")
      .map((error) => [error.field, error] as const),
  );
  const hasConfigurationError = errors.some(
    (error) => error.field === "configuration",
  );

  return (
    <section
      aria-labelledby="laboratory-concentration-calculator-title"
      className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-7"
    >
      <h2
        className="font-heading text-2xl text-ink"
        id="laboratory-concentration-calculator-title"
      >
        {calculator.title}
      </h2>
      <p className="mt-3 whitespace-pre-wrap leading-7 text-muted-ink">{calculator.body}</p>
      <p className="info-record mt-4 text-sm">
        Mathematical conversions only; no use recommendations are provided.
      </p>

      <form className="mt-6 space-y-5" noValidate onSubmit={submit}>
        {([
          ["vialMg", "Vial amount (mg)"],
          ["diluentMl", "Diluent volume (mL)"],
          ["sampleMl", "Sample volume (mL, optional)"],
        ] as const).map(([field, label]) => {
          const error = errorsByField.get(field);
          return (
            <div key={field}>
              <label className="block text-sm font-semibold text-ink" htmlFor={field}>
                {label}
              </label>
              <input
                aria-describedby={error ? errorId(field) : undefined}
                aria-invalid={error ? "true" : "false"}
                autoComplete="off"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-page px-4 py-3 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                id={field}
                inputMode="decimal"
                onChange={(event) => update(field, event.currentTarget.value)}
                type="text"
                value={drafts[field]}
              />
              {error ? (
                <p className="mt-2 text-sm text-danger" id={errorId(field)}>
                  {errorMessage(error, calculator)}
                </p>
              ) : null}
            </div>
          );
        })}

        <button
          className="min-h-12 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          type="submit"
        >
          Calculate
        </button>
      </form>

      <p aria-live="assertive" className="mt-4 text-sm text-danger" role="alert">
        {errors.length > 0
          ? hasConfigurationError
            ? errorMessage(errors[0]!, calculator)
            : "Correct the highlighted field before calculating."
          : ""}
      </p>

      <div
        aria-atomic="true"
        aria-label="Calculation results"
        aria-live="polite"
        className="mt-6"
        role="status"
      >
        {result ? (
          <>
            <dl className="rounded-xl border border-border px-4">
              <ResultValue label="Concentration (mg/mL)" unit="mg/mL" value={result.mgPerMl} />
              <ResultValue label="Concentration (mcg/mL)" unit="mcg/mL" value={result.mcgPerMl} />
              {result.sampleMg === undefined || result.sampleMcg === undefined ? null : (
                <>
                  <ResultValue label="Sample amount (mg)" unit="mg" value={result.sampleMg} />
                  <ResultValue label="Sample amount (mcg)" unit="mcg" value={result.sampleMcg} />
                </>
              )}
            </dl>
            <p className="mt-4 text-sm leading-6 text-muted-ink">
              {formatNumber(Number(drafts.vialMg))} mg ÷ {formatNumber(Number(drafts.diluentMl))} mL = {formatNumber(result.mgPerMl)} mg/mL. {formatNumber(result.mgPerMl)} mg/mL × 1,000 = {formatNumber(result.mcgPerMl)} mcg/mL.
            </p>
            {result.sampleMg === undefined || result.sampleMcg === undefined ? null : (
              <p className="mt-2 text-sm leading-6 text-muted-ink">
                {formatNumber(result.mgPerMl)} mg/mL × {formatNumber(Number(drafts.sampleMl))} mL = {formatNumber(result.sampleMg)} mg. {formatNumber(result.sampleMg)} mg × 1,000 = {formatNumber(result.sampleMcg)} mcg.
              </p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
