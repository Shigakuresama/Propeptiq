import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ pathname: "/sign-in", refetch: vi.fn() }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ useSession: session }) }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
import { SessionNavigationProvider, useSessionNavigation } from "./session-navigation";
import { CartProvider } from "@/cart/cart-provider";
import { SiteHeader } from "@/components/site/site-header";
function Consumer() { return <p>{useSessionNavigation()}</p>; }
describe("server-validated session navigation", () => {
  it.each(["pending", "unavailable", "signed-in", "signed-out"])("renders truthful header access while %s", (state) => {
    session.mockReturnValue({
      data: state === "signed-in" ? { user: { id: "test-user" } } : null,
      isPending: state === "pending",
      error: state === "unavailable" ? new Error("offline") : null,
      refetch: navigation.refetch,
    });
    render(<SessionNavigationProvider enabled><CartProvider><SiteHeader /></CartProvider></SessionNavigationProvider>);
    const label = state === "signed-in" ? "Account" : state === "signed-out" ? "Sign in" : "Account access";
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", state === "signed-out" ? "/sign-in" : "/account");
  });
  it("revalidates after server-action sign-in and sign-out redirects without refetching each render", () => {
    session.mockReturnValue({ data: null, isPending: false, error: null, refetch: navigation.refetch });
    const view = render(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(navigation.refetch).not.toHaveBeenCalled();
    navigation.pathname = "/account";
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(navigation.refetch).toHaveBeenCalledTimes(1);
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(navigation.refetch).toHaveBeenCalledTimes(1);
    navigation.pathname = "/sign-in";
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(navigation.refetch).toHaveBeenCalledTimes(2);
  });

  it("never claims sign-out while a session is pending or unavailable", () => {
    session.mockReturnValue({ data: null, isPending: true, error: null });
    const view = render(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(screen.getByText("pending")).toBeVisible();
    session.mockReturnValue({ data: { user: { id: "test-user" } }, isPending: false, error: null });
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(screen.getByText("signed-in")).toBeVisible();
    session.mockReturnValue({ data: null, isPending: false, error: new Error("offline") });
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(screen.getByText("unavailable")).toBeVisible();
    session.mockReturnValue({ data: null, isPending: false, error: null });
    view.rerender(<SessionNavigationProvider enabled><Consumer /></SessionNavigationProvider>);
    expect(screen.getByText("signed-out")).toBeVisible();
  });
  it("does not contact auth when the adapter is disabled", () => {
    session.mockClear();
    render(<SessionNavigationProvider enabled={false}><Consumer /></SessionNavigationProvider>);
    expect(screen.getByText("signed-out")).toBeVisible();
    expect(session).not.toHaveBeenCalled();
  });
});
