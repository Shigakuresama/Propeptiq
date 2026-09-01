import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/domain/concentration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/concentration")>();
  return { ...actual, calculateConcentration: vi.fn(actual.calculateConcentration) };
});

import { scanPublicCopy } from "@/domain/content-policy";
import {
  calculateConcentration,
  parseConcentrationDecimal,
  type PublicConcentrationCalculatorConfiguration,
} from "@/domain/concentration";

import {
  LaboratoryConcentrationCalculator,
  laboratoryConcentrationCalculatorStaticCopy,
} from "./laboratory-concentration-calculator";

const calculator: PublicConcentrationCalculatorConfiguration = {
  title: "Synthetic approved calculator title",
  body: "Literal synthetic approved calculator body.",
  limits: { maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 },
};

function renderCalculator() {
  return render(<LaboratoryConcentrationCalculator calculator={calculator} />);
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, vial: string, diluent: string) {
  await user.type(screen.getByRole("textbox", { name: "Vial amount (mg)" }), vial);
  await user.type(screen.getByRole("textbox", { name: "Diluent volume (mL)" }), diluent);
}

describe("LaboratoryConcentrationCalculator", () => {
  beforeEach(() => {
    vi.mocked(calculateConcentration).mockClear();
  });

  it.each([
    ["0.5", 0.5], [".5", 0.5], ["5.", 5], ["05", 5], ["+1", 1], ["-1", -1],
  ] as const)("parses accepted lexical draft %s directly", (raw, value) => {
    expect(parseConcentrationDecimal(raw)).toEqual({ ok: true, value });
  });

  it.each(["", " 1", "1 ", "1e2", "NaN", "Infinity", "1..2", "$1"])(
    "rejects lexical draft %j directly",
    (raw) => {
      expect(parseConcentrationDecimal(raw)).toEqual({ ok: false });
    },
  );

  it("starts empty with literal approved copy and no product-derived or internal metadata", () => {
    renderCalculator();
    expect(screen.getByRole("heading", { name: calculator.title })).toBeVisible();
    expect(screen.getByText(calculator.body)).toBeVisible();
    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveValue("");
    expect(document.body).toHaveTextContent(
      "Mathematical conversions only; no use recommendations are provided.",
    );
    expect(document.body).not.toHaveTextContent(/contentId|approval note|reviewedAt|preview|approved mode/iu);
  });

  it("calculates 10 / 2 and a 0.1 mL sample with exact labelled units and arithmetic", async () => {
    const user = userEvent.setup();
    renderCalculator();
    await fillRequired(user, "10", "2");
    await user.type(screen.getByRole("textbox", { name: "Sample volume (mL, optional)" }), "0.1");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    const results = screen.getByRole("status", { name: "Calculation results" });
    expect(results).toHaveAttribute("aria-live", "polite");
    expect(results).toHaveAttribute("aria-atomic", "true");
    expect(results).toHaveTextContent("Concentration (mg/mL)5 mg/mL");
    expect(results).toHaveTextContent("Concentration (mcg/mL)5,000 mcg/mL");
    expect(results).toHaveTextContent("Sample amount (mg)0.5 mg");
    expect(results).toHaveTextContent("Sample amount (mcg)500 mcg");
    expect(results).toHaveTextContent(
      "10 mg ÷ 2 mL = 5 mg/mL. 5 mg/mL × 1,000 = 5,000 mcg/mL.",
    );
    expect(results).toHaveTextContent(
      "5 mg/mL × 0.1 mL = 0.5 mg. 0.5 mg × 1,000 = 500 mcg.",
    );
  });

  it("calculates without optional sample values and supports keyboard submit", async () => {
    const user = userEvent.setup();
    renderCalculator();
    await fillRequired(user, ".5", "2");
    await user.keyboard("{Enter}");
    const results = screen.getByRole("status", { name: "Calculation results" });
    expect(results).toHaveTextContent("0.25 mg/mL");
    expect(results).toHaveTextContent("250 mcg/mL");
    expect(results).not.toHaveTextContent("Sample amount");
  });

  it("accepts trailing-decimal and leading-plus drafts through the form", async () => {
    const user = userEvent.setup();
    renderCalculator();
    await fillRequired(user, "+10", "5.");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("status", { name: "Calculation results" })).toHaveTextContent("2 mg/mL");
  });

  it("clears submitted results and errors when a draft changes", async () => {
    const user = userEvent.setup();
    renderCalculator();
    await fillRequired(user, "10", "2");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("status", { name: "Calculation results" })).toHaveTextContent("5 mg/mL");

    await user.type(screen.getByRole("textbox", { name: "Vial amount (mg)" }), "0");

    expect(screen.getByRole("status", { name: "Calculation results" })).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it.each([
    ["required blank", "", "2", "", "Vial amount (mg) is required."],
    ["required diluent", "10", "", "", "Diluent volume (mL) is required."],
    ["zero", "0", "2", "", "Vial amount (mg) must be greater than zero."],
    ["negative", "-1", "2", "", "Vial amount (mg) must be greater than zero."],
    ["excessive", "101", "2", "", "Vial amount (mg) must be no greater than 100 mg."],
    ["optional zero", "10", "2", "0", "Sample volume (mL) must be greater than zero."],
  ] as const)("renders linked inline errors for %s", async (_label, vial, diluent, sample, message) => {
    const user = userEvent.setup();
    renderCalculator();
    if (vial) await user.type(screen.getByRole("textbox", { name: "Vial amount (mg)" }), vial);
    if (diluent) await user.type(screen.getByRole("textbox", { name: "Diluent volume (mL)" }), diluent);
    if (sample) await user.type(screen.getByRole("textbox", { name: "Sample volume (mL, optional)" }), sample);
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    const error = screen.getByText(message);
    const field = error.id.startsWith("vial")
      ? screen.getByRole("textbox", { name: "Vial amount (mg)" })
      : error.id.startsWith("diluent")
        ? screen.getByRole("textbox", { name: "Diluent volume (mL)" })
        : screen.getByRole("textbox", { name: "Sample volume (mL, optional)" });
    expect(field).toHaveAttribute("aria-describedby", error.id);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/correct the highlighted field/iu);
  });

  it.each(["1e2", " 10", "10 ", "NaN", "Infinity", "1..2"])(
    "does not invoke domain calculation for invalid lexical draft %j",
    async (draft) => {
      const user = userEvent.setup();
      renderCalculator();
      await user.type(screen.getByRole("textbox", { name: "Vial amount (mg)" }), draft);
      await user.type(screen.getByRole("textbox", { name: "Diluent volume (mL)" }), "2");
      await user.click(screen.getByRole("button", { name: "Calculate" }));
      expect(calculateConcentration).not.toHaveBeenCalled();
      expect(screen.getByText("Enter a plain decimal amount in mg.")).toBeVisible();
    },
  );

  it("keeps all component-owned static copy inside the existing public-content policy", () => {
    expect(
      scanPublicCopy(
        { text: laboratoryConcentrationCalculatorStaticCopy.join("\n"), claims: [] },
        { version: "synthetic-component-copy-policy", activeLotEvidenceIds: [] },
      ),
    ).toMatchObject({ publishable: true, status: "pass", violations: [] });
    expect(laboratoryConcentrationCalculatorStaticCopy.join(" ")).not.toMatch(/reconstitut/iu);
  });
});
