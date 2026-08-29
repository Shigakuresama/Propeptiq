import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { getRequestIdentityMock } = vi.hoisted(() => ({
  getRequestIdentityMock: vi.fn().mockResolvedValue({ localDriver: null }),
}));

vi.mock("@/auth/server", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/research-sets",
}));

import ResearchSetsLayout from "./layout";

describe("research sets account layout", () => {
  it("provides the account shell, skip link, responsive navigation, and exactly one main", async () => {
    const markup = renderToStaticMarkup(
      await ResearchSetsLayout({ children: <section><h1>Research sets</h1></section> }),
    );

    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain("Open account navigation");
    expect(markup).toContain('aria-label="Account"');
    expect(markup).toContain("xl:hidden");
    expect(markup).toContain("hidden xl:block");
    expect(markup.match(/<main/gu)).toHaveLength(1);
    expect(markup).toContain("<h1>Research sets</h1>");
  });
});
