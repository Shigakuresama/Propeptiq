import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PromotionBar } from "./promotion-bar";

const winter30 = Object.freeze({
  id: "winter30" as const,
  code: "WINTER30" as const,
  percentage: 30 as const,
});

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/gu)!.map((channel) => {
    const encoded = Number.parseInt(channel, 16) / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("PromotionBar", () => {
  it("renders nothing and no spacing when there is no safe promotion", () => {
    const { container } = render(<PromotionBar promotion={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders exact campaign copy, decorative snowflake semantics, and narrow-layout-safe classes", () => {
    const { container } = render(<PromotionBar promotion={winter30} />);

    expect(
      screen.getByText("WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30"),
    ).toBeVisible();
    const snowflake = container.querySelector('[aria-hidden="true"]');
    expect(snowflake).toHaveTextContent("❄");
    const banner = screen.getByRole("complementary", { name: "Promotion" });
    expect(banner).toHaveClass(
      "bg-promotion",
      "text-promotion-foreground",
      "flex",
      "flex-wrap",
      "items-center",
      "justify-center",
      "px-4",
      "leading-6",
    );
    expect(screen.getByRole("button", { name: "Copy promotion code WINTER30" }))
      .toHaveClass("min-h-11", "px-4");
  });

  it("copies only WINTER30, preserves focus, and announces one polite atomic success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);

    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    await user.click(button);

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("WINTER30");
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute("aria-live", "polite");
    expect(statuses[0]).toHaveAttribute("aria-atomic", "true");
    expect(statuses[0]).toHaveTextContent("WINTER30 copied");
    expect(statuses[0]).toBeVisible();
    expect(button).toHaveFocus();
  });

  it("shows an honest visible error when clipboard access rejects", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);

    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    await user.click(button);

    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 could not be copied.");
    expect(screen.getByRole("status")).not.toHaveTextContent("WINTER30 copied");
    expect(button).toHaveFocus();
  });

  it("shows the same honest error when Clipboard API support is absent", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<PromotionBar promotion={winter30} />);

    await user.click(screen.getByRole("button", { name: "Copy promotion code WINTER30" }));

    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 could not be copied.");
    expect(screen.getByRole("status")).not.toHaveTextContent("WINTER30 copied");
  });

  it("supports keyboard activation while retaining focus on the copy button", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);

    await user.tab();
    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(writeText).toHaveBeenCalledWith("WINTER30");
    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
    expect(button).toHaveFocus();
  });

  it("does not auto-dismiss the visible copy status with a timer", async () => {
    vi.useFakeTimers();
    try {
      setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
      render(<PromotionBar promotion={winter30} />);
      const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });

      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
    } finally {
      vi.useRealTimers();
    }
  });

  it("configures and bridges promotion colors with at least 4.5 to 1 contrast", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const promotion = css.match(/--promotion:\s*(#[0-9a-f]{6});/iu)?.[1];
    const foreground = css.match(/--promotion-foreground:\s*(#[0-9a-f]{6});/iu)?.[1];

    expect(promotion).toBe("#075985");
    expect(foreground).toBe("#ffffff");
    expect(css).toMatch(/--color-promotion:\s*var\(--promotion\);/u);
    expect(css).toMatch(/--color-promotion-foreground:\s*var\(--promotion-foreground\);/u);
    expect(contrastRatio(promotion!, foreground!)).toBeGreaterThanOrEqual(4.5);
  });
});
