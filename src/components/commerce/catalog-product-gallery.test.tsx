import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { testCanonicalProduct } from "./storefront-test-fixtures";
import { CatalogProductGallery } from "./catalog-product-gallery";

describe("CatalogProductGallery", () => {
  it("exposes one truthful active visual, six roving scene tabs, and one status", () => {
    const product = testCanonicalProduct();
    const { container } = render(
      <CatalogProductGallery
        discountPercent={30}
        product={product}
        variantLabel="5 mg"
      />,
    );
    const gallery = screen.getByRole("region", {
      name: "Synthetic Product Alpha product illustration gallery",
    });

    expect(within(gallery).getAllByRole("tab")).toHaveLength(6);
    expect(within(gallery).getByRole("tab", { name: "Front" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(gallery).getAllByRole("tabpanel")).toHaveLength(1);
    expect(within(gallery).getAllByRole("img")).toHaveLength(1);
    expect(
      within(gallery).getByRole("img", {
        name: "Front AI-generated catalog illustration for Synthetic Product Alpha",
      }),
    ).toBeVisible();
    expect(within(gallery).getByText("Synthetic Product Alpha")).toBeVisible();
    expect(within(gallery).getByText("5 mg")).toBeVisible();
    expect(within(gallery).getByText("RESEARCH USE ONLY")).toBeVisible();
    expect(within(gallery).getByLabelText("-30%")).toBeVisible();
    expect(
      within(gallery).getByText(
        "AI-generated catalog illustration — not actual product photography.",
      ),
    ).toBeVisible();
    expect(within(gallery).getAllByRole("status")).toHaveLength(1);
    expect(within(gallery).getByRole("status")).toHaveTextContent(
      "View 1 of 6: Front",
    );
    expect(container.querySelectorAll(".catalog-product-visual")).toHaveLength(1);
    expect(container.querySelectorAll('[aria-label="-30%"]')).toHaveLength(1);
    expect(container).not.toHaveTextContent(/pictured vial count/iu);
  });

  it("supports roving keyboard tabs plus focus-retaining previous and next controls", async () => {
    const user = userEvent.setup();
    render(
      <CatalogProductGallery
        product={testCanonicalProduct()}
        variantLabel="5 mg"
      />,
    );
    const gallery = screen.getByRole("region", {
      name: "Synthetic Product Alpha product illustration gallery",
    });
    const front = within(gallery).getByRole("tab", { name: "Front" });
    front.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(gallery).getByRole("tab", { name: "Three-quarter" })).toHaveFocus();
    expect(within(gallery).getByRole("status")).toHaveTextContent(
      "View 2 of 6: Three-quarter",
    );
    await user.keyboard("{End}");
    expect(within(gallery).getByRole("tab", { name: "Ambient studio" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(front).toHaveFocus();
    await user.keyboard("{Home}");
    expect(front).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(within(gallery).getByRole("tab", { name: "Ambient studio" })).toHaveFocus();

    const previous = within(gallery).getByRole("button", {
      name: "Previous product illustration",
    });
    previous.focus();
    await user.click(previous);
    expect(previous).toHaveFocus();
    expect(within(gallery).getByRole("status")).toHaveTextContent(
      "View 5 of 6: Overhead",
    );

    const next = within(gallery).getByRole("button", {
      name: "Next product illustration",
    });
    next.focus();
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(within(gallery).getByRole("status")).toHaveTextContent(
      "View 6 of 6: Ambient studio",
    );
  });

  it("shows the vial-count warning only for the multi-vial scene", async () => {
    const user = userEvent.setup();
    render(<CatalogProductGallery product={testCanonicalProduct()} />);
    const gallery = screen.getByRole("region", {
      name: "Synthetic Product Alpha product illustration gallery",
    });

    expect(within(gallery).queryByText(/pictured vial count/iu)).toBeNull();
    await user.click(within(gallery).getByRole("tab", { name: "Multi-vial study" }));
    expect(
      within(gallery).getByText(/pictured vial count does not indicate package quantity/iu),
    ).toBeVisible();
    await user.click(within(gallery).getByRole("tab", { name: "Copy-space detail" }));
    expect(within(gallery).queryByText(/pictured vial count/iu)).toBeNull();
  });

  it("resets to Front when the product changes without retaining stale labels", async () => {
    const first = testCanonicalProduct();
    const second = testCanonicalProduct([], {
      id: "product-beta",
      slug: "product-beta",
      name: "Synthetic Product Beta",
    });
    const { rerender } = render(<CatalogProductGallery product={first} variantLabel="5 mg" />);
    await userEvent.click(screen.getByRole("tab", { name: "Ambient studio" }));

    rerender(<CatalogProductGallery product={second} variantLabel="10 mg" />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("View 1 of 6: Front"),
    );
    expect(screen.getByText("Synthetic Product Beta")).toBeVisible();
    expect(screen.getByText("10 mg")).toBeVisible();
    expect(screen.queryByText("Synthetic Product Alpha")).toBeNull();
    expect(screen.queryByRole("img", { name: /Ambient studio/iu })).toBeNull();
  });

  it("renders the essential Front scene in server markup and contains no autoplay timer", () => {
    const markup = renderToStaticMarkup(
      createElement(CatalogProductGallery, {
        product: testCanonicalProduct(),
        variantLabel: "5 mg",
      }),
    );
    expect(markup).toContain("View 1 of 6: Front");
    expect(markup).toContain("Front AI-generated catalog illustration");
    expect(markup).toContain(
      "AI-generated catalog illustration — not actual product photography.",
    );
    expect(markup).not.toContain("Multi-vial study AI-generated catalog illustration");

    const source = readFileSync(
      resolve(process.cwd(), "src/components/commerce/catalog-product-gallery.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/setInterval|setTimeout|autoplay/iu);
  });
});
