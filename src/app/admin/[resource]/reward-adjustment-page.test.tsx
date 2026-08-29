import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  notFound: vi.fn(() => { throw new Error("not-found"); }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
}));
vi.mock("@/components/admin/resource-command-panel", () => ({
  ResourceCommandPanel: () => null,
}));
vi.mock("@/components/admin/admin-resource-records", () => ({
  AdminResourceRecords: () => null,
}));

import AdminResourcePage from "./page";

describe("reward adjustment admin route command notice", () => {
  beforeEach(() => {
    mocks.getRequestIdentity.mockReturnValue({
      identity: {
        clerkUserId: "clerk-admin",
        primaryEmail: "admin@example.test",
        emailVerifiedAt: "2026-08-28T18:00:00.000Z",
        mfaConfigured: true,
        secondFactorCompleted: true,
      },
      principal: {
        actorId: "8c1a3000-0000-4000-8000-000000000001",
        clerkUserId: "clerk-admin",
        buyerStatus: "active",
        capabilities: ["growth:manage"],
        mfaSatisfied: true,
      },
      localDriver: null,
      environment: {},
    });
    mocks.getRequestRepositories.mockReturnValue({
      readAdminSnapshot: vi.fn().mockResolvedValue({
        resource: "reward-adjustments",
        limit: 100,
        truncated: false,
        items: [],
      }),
    });
  });

  it("uses the existing focused error notice after a denied command redirect", async () => {
    render(await AdminResourcePage({
      params: Promise.resolve({ resource: "reward-adjustments" }),
      searchParams: Promise.resolve({ result: "denied" }),
    }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/denied by identity, mfa, capability, or domain policy/i);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("keeps saved redirects explicitly non-authoritative until the database read-back", async () => {
    render(await AdminResourcePage({
      params: Promise.resolve({ resource: "reward-adjustments" }),
      searchParams: Promise.resolve({ result: "saved" }),
    }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/editable url status is not authoritative/i);
    expect(status).not.toHaveAttribute("tabindex");
  });
});
