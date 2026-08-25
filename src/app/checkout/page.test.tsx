import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentityMock, getRequestRepositoriesMock, redirectMock } = vi.hoisted(
  () => ({
    getRequestIdentityMock: vi.fn(),
    getRequestRepositoriesMock: vi.fn(),
    redirectMock: vi.fn((destination: string) => {
      throw new Error(`redirect:${destination}`);
    }),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: getRequestIdentityMock,
  getRequestRepositories: getRequestRepositoriesMock,
}));

import CheckoutPage from "./page";

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentityMock.mockResolvedValue({
      environment: { DATABASE_MODE: "disabled" },
      identity: null,
      principal: null,
      localDriver: null,
    });
    getRequestRepositoriesMock.mockReturnValue(null);
  });

  it("redirects signed-out checkout requests to sign-in", async () => {
    await expect(CheckoutPage()).rejects.toThrow("redirect:/sign-in");
    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/sign-in");
  });
});
