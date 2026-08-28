import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadOwnerSharedSetWorkspaceMock } = vi.hoisted(() => ({
  loadOwnerSharedSetWorkspaceMock: vi.fn(),
}));

vi.mock("@/growth/shared-set-server", () => ({
  loadOwnerSharedSetWorkspace: loadOwnerSharedSetWorkspaceMock,
}));

import ResearchSetsPage from "./page";

describe("owner research sets page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders private create, update, and deactivate controls from bounded owner/current-product reads", async () => {
    loadOwnerSharedSetWorkspaceMock.mockResolvedValue({
      status: "available",
      products: [
        { id: "product-a", name: "Reference A", packageForm: "sealed unit" },
        { id: "product-b", name: "Reference B", packageForm: "sealed unit" },
      ],
      sets: [{
        code: "set_Task5COwnerCode01",
        label: "Owner neutral set",
        active: true,
        itemCount: 2,
        updatedAt: "2026-08-28T20:00:00.000Z",
        items: [{ productId: "product-a", quantity: 1 }, { productId: "product-b", quantity: 2 }],
      }],
    });

    const markup = renderToStaticMarkup(await ResearchSetsPage());

    expect(markup).toContain("Create research set");
    expect(markup).toContain("Update Owner neutral set");
    expect(markup).toContain("Deactivate Owner neutral set");
    expect(markup).toContain("/sets/set_Task5COwnerCode01");
    expect(markup).not.toMatch(/price|discount|inventory|ownerUserId|email/iu);
  });

  it("fails closed without an authenticated active buyer workspace", async () => {
    loadOwnerSharedSetWorkspaceMock.mockResolvedValue({ status: "unavailable" });

    const markup = renderToStaticMarkup(await ResearchSetsPage());

    expect(markup).toContain("Research sets unavailable");
    expect(markup).not.toContain("Create research set");
  });
});
