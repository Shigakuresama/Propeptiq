import { render, screen } from "@testing-library/react";
import { FileText, TriangleAlert } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState, Metric, Notice } from "./archive-primitives";

describe("archive presentation primitives", () => {
  it("keeps metrics textual and tabular-ready", () => {
    render(<Metric detail="Published records" label="Catalog" value="56" />);
    expect(screen.getByText("Catalog")).toHaveClass("data-label");
    expect(screen.getByText("56")).toHaveClass("metric-value");
    expect(screen.getByText("Published records")).toBeVisible();
  });

  it("exposes dangerous notices as alerts with visible text", () => {
    render(
      <Notice icon={TriangleAlert} title="Command not completed" tone="danger">
        The server denied this request.
      </Notice>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Command not completed");
    expect(screen.getByRole("alert")).toHaveTextContent("The server denied this request.");
  });

  it("supports a truthful page-level empty state", () => {
    render(
      <EmptyState
        description="No approved records are available."
        eyebrow="Record state"
        headingLevel="h1"
        icon={FileText}
        title="Nothing to display."
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Nothing to display." })).toBeVisible();
    expect(screen.getByText("No approved records are available.")).toBeVisible();
  });
});
