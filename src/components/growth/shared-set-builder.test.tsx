import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SharedSetBuilder } from "./shared-set-builder";

const products = Object.freeze([
  Object.freeze({ id: "product-a", name: "Reference A", packageForm: "sealed unit" }),
  Object.freeze({ id: "product-b", name: "Reference B", packageForm: "sealed unit" }),
  Object.freeze({ id: "product-c", name: "Reference C", packageForm: "sealed unit" }),
]);

describe("SharedSetBuilder", () => {
  it("serializes only selected product IDs and bounded quantities for create", () => {
    render(
      <SharedSetBuilder
        mode="create"
        products={products}
        idempotencyKey="task-5c-builder-create-0001"
        action={vi.fn()}
      />,
    );

    expect(screen.getByRole("form", { name: "Create research set" })).toBeInTheDocument();
    const serialized = screen.getByTestId("shared-set-items");
    expect(serialized).toHaveValue(JSON.stringify([
      { productId: "product-a", quantity: 1 },
      { productId: "product-b", quantity: 1 },
    ]));
    expect(serialized).not.toHaveValue(expect.stringMatching(/price|discount|inventory|claim/iu));
  });

  it("includes exact code and expected version for update without owner fields", () => {
    const { container } = render(
      <SharedSetBuilder
        mode="update"
        products={products}
        idempotencyKey="task-5c-builder-update-0001"
        action={vi.fn()}
        initialSet={{
          code: "set_Task5CBuilderCode",
          label: "Neutral set",
          updatedAt: "2026-08-28T20:00:00.000Z",
          items: [{ productId: "product-b", quantity: 4 }, { productId: "product-c", quantity: 5 }],
        }}
      />,
    );

    expect(container.querySelector('input[name="code"]')).toHaveValue("set_Task5CBuilderCode");
    expect(container.querySelector('input[name="expectedUpdatedAt"]')).toHaveValue(
      "2026-08-28T20:00:00.000Z",
    );
    expect(container.querySelector('input[name="ownerUserId"]')).toBeNull();
    expect(screen.getByTestId("shared-set-items")).toHaveValue(JSON.stringify([
      { productId: "product-b", quantity: 4 },
      { productId: "product-c", quantity: 5 },
    ]));
  });
});
