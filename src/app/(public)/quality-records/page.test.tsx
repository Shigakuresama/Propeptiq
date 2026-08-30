import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { getPublicCatalogMock } = vi.hoisted(() => ({
  getPublicCatalogMock: vi.fn(),
}));

vi.mock("@/catalog/server", () => ({ getPublicCatalog: getPublicCatalogMock }));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import QualityRecordsPage from "./page";

describe("QualityRecordsPage", () => {
  it("renders a truthful archive empty state without implied pending evidence", async () => {
    getPublicCatalogMock.mockResolvedValue({
      source: "production",
      products: [],
      promotions: [],
      qualityRecords: [],
    });

    render(await QualityRecordsPage());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Released-lot records with approved public evidence.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No public quality records are currently available.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "The empty state does not imply that testing occurred or that a record is pending.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.queryByText("Public record available")).toBeNull();
  });

  it("presents only projected record fields as an indexed document entry", async () => {
    getPublicCatalogMock.mockResolvedValue({
      source: "production",
      products: [],
      promotions: [],
      qualityRecords: [
        {
          id: "coa-alpha",
          productId: "product-alpha",
          productName: "Reference Alpha",
          lotCode: "LOT-ALPHA",
          analyticalMethod: "Reference analytical method",
          issuedAt: "2026-06-30T12:00:00.000Z",
          href: "/quality-records#record-coa-alpha",
        },
      ],
    });

    render(await QualityRecordsPage());

    const archive = screen.getByRole("list", { name: "Public quality record index" });
    expect(within(archive).getByRole("heading", { name: "Reference Alpha" })).toBeVisible();
    expect(within(archive).getByText("LOT-ALPHA")).toBeVisible();
    expect(within(archive).getByText("Reference analytical method")).toBeVisible();
    expect(within(archive).getByText("Public record available")).toBeVisible();
    expect(document.getElementById("record-coa-alpha")).not.toBeNull();
    expect(within(archive).queryByRole("link", { name: /coa|download|document/iu })).toBeNull();
  });
});
