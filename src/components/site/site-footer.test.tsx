import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site/site-footer";
import type { ControlledContentRecord } from "@/content/storefront-content";
import * as siteContent from "@/lib/site-content";

type ExpectedFooterLink = Readonly<{
  label: string;
  href: string | null;
}>;

type ExpectedFooterGroup = Readonly<{
  label: string;
  links: readonly ExpectedFooterLink[];
}>;

type ExpectedSocialPlatform = "instagram" | "tiktok" | "x" | "facebook";

type ExpectedSocialLink = Readonly<{
  platform: ExpectedSocialPlatform;
  label: "Instagram" | "TikTok" | "X" | "Facebook";
  href: string;
}>;

const footerContent = siteContent as typeof siteContent & {
  footerNavigationGroups?: readonly ExpectedFooterGroup[];
  footerSocialUrls?: Readonly<Record<ExpectedSocialPlatform, string>>;
  projectFooterSocialLinks?: (
    values?: Readonly<Partial<Record<ExpectedSocialPlatform, unknown>>>,
  ) => readonly ExpectedSocialLink[];
};

function controlledRecord(
  overrides: Partial<ControlledContentRecord> = {},
): ControlledContentRecord {
  return {
    id: "fictional-legal-notice",
    kind: "legal_notice",
    status: "approved",
    title: "Fictional laboratory notice",
    body: "Fictional controlled notice body for component verification.",
    sourceReferences: ["fixture-source-token"],
    approvalNote: "fixture-approval-token",
    reviewedAt: "2099-01-02T03:04:05.000Z",
    effectiveAt: "2099-02-03T04:05:06.000Z",
    ...overrides,
  };
}

describe("footer configuration", () => {
  it("keeps the exact route and missing-destination matrix in one immutable group configuration", () => {
    expect(footerContent.footerNavigationGroups).toEqual([
      {
        label: "Shop",
        links: [
          { label: "Catalog", href: "/catalog" },
          { label: "Cart", href: "/cart" },
        ],
      },
      {
        label: "Resources",
        links: [
          { label: "Quality Records", href: "/quality-records" },
          { label: "Rewards", href: "/rewards" },
          { label: "Partner Program", href: "/partners" },
        ],
      },
      {
        label: "Support",
        links: [
          { label: "Order tracking", href: "/account/orders" },
          { label: "FAQ", href: null },
          { label: "Contact or Support", href: null },
          { label: "Shipping information", href: null },
        ],
      },
      {
        label: "Legal",
        links: [
          { label: "Research Use Only", href: "/research-use-policy" },
          { label: "Privacy Policy", href: null },
          { label: "Terms and Conditions", href: null },
          { label: "Shipping and Returns", href: null },
          { label: "Refund Policy", href: null },
          { label: "FDA Disclaimer", href: null },
        ],
      },
    ]);

    const groups = footerContent.footerNavigationGroups;
    expect(Object.isFrozen(groups)).toBe(true);
    for (const group of groups ?? []) {
      expect(Object.isFrozen(group)).toBe(true);
      expect(Object.isFrozen(group.links)).toBe(true);
      for (const link of group.links) expect(Object.isFrozen(link)).toBe(true);
    }
  });

  it("projects the exact owner-authorized social placeholders without mutating input", () => {
    expect(footerContent.footerSocialUrls).toEqual({
      instagram: "/",
      tiktok: "/",
      x: "/",
      facebook: "/",
    });
    expect(Object.isFrozen(footerContent.footerSocialUrls)).toBe(true);

    const project = footerContent.projectFooterSocialLinks;
    expect(project).toEqual(expect.any(Function));
    if (project === undefined) return;

    const input = {
      instagram: "/",
      tiktok: "https://social.example.test/propeptiq",
      x: "https://x.example.test/propeptiq?from=footer#profile",
      facebook: "/",
    } as const;
    const before = { ...input };
    const projected = project(input);

    expect(projected).toEqual([
      { platform: "instagram", label: "Instagram", href: "/" },
      {
        platform: "tiktok",
        label: "TikTok",
        href: "https://social.example.test/propeptiq",
      },
      {
        platform: "x",
        label: "X",
        href: "https://x.example.test/propeptiq?from=footer#profile",
      },
      { platform: "facebook", label: "Facebook", href: "/" },
    ]);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(projected)).toBe(true);
    for (const link of projected) expect(Object.isFrozen(link)).toBe(true);
  });

  it("omits unsafe or malformed social destinations fail closed", () => {
    const project = footerContent.projectFooterSocialLinks;
    expect(project).toEqual(expect.any(Function));
    if (project === undefined) return;

    expect(project({
      instagram: "//social.example.test/propeptiq",
      tiktok: "http://social.example.test/propeptiq",
      x: "https://user:password@social.example.test/propeptiq",
      facebook: "https://social.example.test/profile\u0000",
    })).toEqual([]);
    expect(project({
      instagram: " https://social.example.test/propeptiq",
      tiktok: 17,
      x: null,
      facebook: {},
    })).toEqual([]);
  });

  it("returns a frozen empty projection without mutating a revoked top-level proxy", () => {
    const project = footerContent.projectFooterSocialLinks;
    expect(project).toEqual(expect.any(Function));
    if (project === undefined) return;

    const target = { instagram: "/" };
    const before = { ...target };
    const revocable = Proxy.revocable(target, {});
    revocable.revoke();

    let projected: readonly ExpectedSocialLink[] | undefined;
    expect(() => {
      projected = project(revocable.proxy);
    }).not.toThrow();
    expect(projected).toEqual([]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(target).toEqual(before);
    expect(Object.isFrozen(target)).toBe(false);
  });
});

describe("SiteFooter", () => {
  it("renders one grouped Footer navigation with only configured destinations", () => {
    render(<SiteFooter />);

    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    const footerNavigation = screen.getByRole("navigation", { name: "Footer" });
    expect(screen.getAllByRole("navigation", { name: "Footer" })).toHaveLength(1);
    expect(
      within(footerNavigation).getAllByRole("heading", { level: 2 }).map((heading) =>
        heading.textContent),
    ).toEqual(["Shop", "Resources", "Support", "Legal"]);
    expect(
      within(footerNavigation).getAllByRole("link").map((link) => ({
        label: link.textContent,
        href: link.getAttribute("href"),
      })),
    ).toEqual([
      { label: "Catalog", href: "/catalog" },
      { label: "Cart", href: "/cart" },
      { label: "Quality Records", href: "/quality-records" },
      { label: "Rewards", href: "/rewards" },
      { label: "Partner Program", href: "/partners" },
      { label: "Order tracking", href: "/account/orders" },
      { label: "Research Use Only", href: "/research-use-policy" },
    ]);

    for (const missingLabel of [
      "FAQ",
      "Contact or Support",
      "Shipping information",
      "Privacy Policy",
      "Terms and Conditions",
      "Shipping and Returns",
      "Refund Policy",
      "FDA Disclaimer",
    ]) {
      expect(within(footerNavigation).queryByRole("link", { name: missingLabel })).toBeNull();
    }
    expect(
      within(footerNavigation).queryByRole("link", { name: "Terms and Conditions" }),
    ).toBeNull();
    expect(
      within(footerNavigation).queryByRole("link", { name: "Partner terms" }),
    ).toBeNull();
    expect(
      within(footerNavigation).queryByRole("link", { name: "Rewards terms" }),
    ).toBeNull();
    expect(
      within(footerNavigation).queryByRole("link", { name: /terms/iu }),
    ).toBeNull();
  });

  it("omits an injected group whose destinations are all unavailable", () => {
    render(
      <SiteFooter
        navigationGroups={[
          {
            label: "Unavailable fixture group",
            links: [{ label: "Unavailable fixture link", href: null }],
          },
          {
            label: "Available fixture group",
            links: [{ label: "Available fixture link", href: "/catalog" }],
          },
        ]}
      />,
    );

    const footerNavigation = screen.getByRole("navigation", { name: "Footer" });
    expect(
      within(footerNavigation).queryByRole("heading", { name: "Unavailable fixture group" }),
    ).toBeNull();
    expect(
      within(footerNavigation).getByRole("heading", { name: "Available fixture group" }),
    ).toBeInTheDocument();
  });

  it("renders the four owner-authorized social placeholders as accessible icon links", () => {
    render(<SiteFooter />);

    const socialRegion = screen.getByRole("region", { name: "Social media" });
    expect(within(socialRegion).queryByRole("navigation")).toBeNull();
    for (const label of ["Instagram", "TikTok", "X", "Facebook"] as const) {
      const link = within(socialRegion).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", "/");
      expect(link).not.toHaveAttribute("target");
      expect(link).toHaveClass("min-h-11", "min-w-11", "focus-visible:ring-2");
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("renders approved legal notices below navigation while excluding all non-approved content and metadata", () => {
    const records = [
      controlledRecord(),
      controlledRecord({
        id: "draft-legal-notice",
        status: "draft",
        title: "Draft fixture notice",
        body: "Draft fixture body",
      }),
      controlledRecord({
        id: "retired-legal-notice",
        status: "retired",
        title: "Retired fixture notice",
        body: "Retired fixture body",
      }),
      controlledRecord({
        id: "approved-faq-fixture",
        kind: "faq",
        title: "Unrelated fixture FAQ",
        body: "Unrelated fixture FAQ body",
      }),
    ] as Array<ControlledContentRecord & Record<string, unknown>>;
    records[0]!.stripePriceId = "price_fixture_must_not_render";
    records[0]!.providerMetadata = "provider_fixture_must_not_render";

    render(<SiteFooter legalNotices={records} />);

    const footerNavigation = screen.getByRole("navigation", { name: "Footer" });
    const noticeRegion = screen.getByRole("region", {
      name: "Research use and legal notices",
    });
    expect(
      footerNavigation.compareDocumentPosition(noticeRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(noticeRegion).getByText("Fictional laboratory notice")).toBeInTheDocument();
    expect(
      within(noticeRegion).getByText(
        "Fictional controlled notice body for component verification.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Draft fixture notice")).toBeNull();
    expect(screen.queryByText("Retired fixture notice")).toBeNull();
    expect(screen.queryByText("Unrelated fixture FAQ")).toBeNull();

    const renderedText = noticeRegion.textContent ?? "";
    for (const forbidden of [
      "fixture-source-token",
      "fixture-approval-token",
      "2099-01-02T03:04:05.000Z",
      "2099-02-03T04:05:06.000Z",
      "price_fixture_must_not_render",
      "provider_fixture_must_not_render",
    ]) {
      expect(renderedText).not.toContain(forbidden);
    }
  });

  it("keeps each existing research restriction exactly once in the dedicated notice region", () => {
    render(<SiteFooter />);

    const noticeRegion = screen.getByRole("region", {
      name: "Research use and legal notices",
    });
    for (const restriction of siteContent.researchRestrictions) {
      expect(screen.getAllByText(restriction)).toHaveLength(1);
      expect(within(noticeRegion).getByText(restriction)).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        /Catalog names and package configurations come from owner-supplied records; cart and checkout facts remain server-authoritative\./u,
      ),
    ).toHaveClass("text-base");
    expect(screen.queryByText(/FDA disclaimer/iu)).toBeNull();
    expect(screen.queryByText(/FDA-approved|attorney-approved|regulator-approved/iu)).toBeNull();
  });

  it("uses responsive layout, contrast, focus, and touch-target classes without adding motion", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    const footerNavigation = screen.getByRole("navigation", { name: "Footer" });
    expect(footer).toHaveClass("bg-ink", "text-canvas");
    expect(footerNavigation).toHaveClass("grid", "sm:grid-cols-2", "lg:grid-cols-4");

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("focus-visible:outline-none", "focus-visible:ring-2");
      if (link.getAttribute("aria-label")?.endsWith(" home")) continue;
      expect(link).toHaveClass("min-h-11", "min-w-11");
    }
    expect(footer.querySelector("[class*='animate-']")).toBeNull();
  });
});
