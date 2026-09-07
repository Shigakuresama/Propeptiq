import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PromotionBar } from "./promotion-bar";

const winter30 = Object.freeze({
  id: "winter30" as const,
  displayName: "Winter Sale" as const,
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

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe("PromotionBar", () => {
  it("renders nothing and no spacing when there is no safe promotion", () => {
    const { container } = render(<PromotionBar promotion={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a compact sale heading with only the code boxed and an accessible icon copy action", () => {
    const { container } = render(<PromotionBar promotion={winter30} />);

    expect(
      screen.getByText("WINTER SALE: 30% OFF SITEWIDE"),
    ).toBeVisible();
    expect(screen.getByText("WINTER30")).toHaveClass("promotion-code-pill");
    expect(screen.getByText("APPLIED AUTOMATICALLY").closest(".promotion-code-pill")).toBeNull();
    expect(container.querySelector(".promotion-banner__molecules")).toHaveAttribute("aria-hidden", "true");
    expect(container).not.toHaveTextContent("USE CODE");
    const banner = screen.getByRole("complementary", { name: "Promotion" });
    expect(banner).toHaveClass(
      "bg-promotion",
      "text-promotion-foreground",
      "promotion-banner",
    );
    expect(banner).not.toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "Copy promotion code WINTER30" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "Copy promotion code WINTER30" }))
      .toHaveClass("min-h-11", "min-w-11", "px-2");
  });

  it("derives all campaign text and clipboard data from its safe promotion prop", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const safeProp = {
      id: "winter30" as const,
      displayName: "Synthetic Preview Sale",
      code: "TEST25",
      percentage: 25,
    };

    render(<PromotionBar promotion={safeProp} />);
    const copy = screen.getByRole("button", {
      name: `Copy promotion code ${safeProp.code}`,
    });
    expect(
      screen.getByText(
        `${safeProp.displayName.toUpperCase()}: ${safeProp.percentage}% OFF SITEWIDE`,
      ),
    ).toBeVisible();
    expect(copy.querySelector("svg")).toHaveClass("lucide-copy");

    await user.click(copy);

    expect(writeText).toHaveBeenCalledWith(safeProp.code);
    expect(screen.getByRole("status")).toHaveTextContent(
      `${safeProp.code} copied`,
    );
    expect(copy.querySelector("svg")).toHaveClass("lucide-check");
    expect(copy).toHaveAccessibleName(`Copied promotion code ${safeProp.code}`);
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
    expect(statuses[0]).not.toHaveClass("sr-only");
    expect(statuses[0]).toBeVisible();
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
    expect(button).toHaveAccessibleName("Copied promotion code WINTER30");
    expect(button).toHaveFocus();
  });

  it("shows pending feedback immediately and confirms visibly only after the clipboard succeeds", async () => {
    const pending = deferred<void>();
    setClipboard({ writeText: vi.fn(() => pending.promise) });
    render(<PromotionBar promotion={winter30} />);
    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    const status = screen.getByRole("status");
    expect(button).toHaveTextContent("");
    fireEvent.click(button);
    expect(status).toBeVisible();
    expect(status).toHaveTextContent("Copying WINTER30…");
    expect(status).not.toHaveTextContent("WINTER30 copied");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toHaveClass("lucide-copy");

    await act(async () => { pending.resolve(); await pending.promise; });
    expect(status).toBeVisible();
    expect(status).toHaveTextContent("WINTER30 copied");
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
    expect(screen.getByText("APPLIED AUTOMATICALLY")).toBeVisible();
  });

  it("keeps clipboard failure safe and retryable without exposing the exception", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error("private clipboard exception"))
      .mockResolvedValueOnce(undefined);
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);

    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    await user.click(button);

    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 could not be copied.");
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByRole("status")).not.toHaveTextContent("WINTER30 copied");
    expect(screen.getByRole("status")).not.toHaveTextContent("private clipboard exception");
    expect(button.querySelector("svg")).toHaveClass("lucide-copy");
    expect(button).toHaveFocus();

    await user.click(button);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
  });

  it("shows the same honest error when Clipboard API support is absent", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<PromotionBar promotion={winter30} />);

    await user.click(screen.getByRole("button", { name: "Copy promotion code WINTER30" }));

    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 could not be copied.");
    expect(screen.getByRole("status")).not.toHaveTextContent("WINTER30 copied");
    expect(screen.getByRole("button", { name: "Copy promotion code WINTER30" }).querySelector("svg")).toHaveClass("lucide-copy");
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
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
    expect(button).toHaveFocus();
  });

  it("keeps the latest clipboard failure when an older attempt resolves afterward", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const writeText = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);
    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    button.focus();

    fireEvent.click(button);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.reject(new Error("latest clipboard failure"));
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 could not be copied.");

    await act(async () => {
      first.resolve();
      await Promise.resolve();
    });
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("WINTER30 could not be copied.");
    expect(statuses[0]).toHaveAttribute("aria-live", "polite");
    expect(statuses[0]).toHaveAttribute("aria-atomic", "true");
    expect(button.querySelector("svg")).toHaveClass("lucide-copy");
    expect(button).toHaveFocus();
  });

  it("keeps the latest clipboard success when an older attempt rejects afterward", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const writeText = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    setClipboard({ writeText });
    render(<PromotionBar promotion={winter30} />);
    const button = screen.getByRole("button", { name: "Copy promotion code WINTER30" });
    button.focus();

    fireEvent.click(button);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
    expect(button.querySelector("svg")).toHaveClass("lucide-check");

    await act(async () => {
      first.reject(new Error("stale clipboard failure"));
      await Promise.resolve();
    });
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
      expect(button.querySelector("svg")).toHaveClass("lucide-check");
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole("status")).toHaveTextContent("WINTER30 copied");
      expect(button.querySelector("svg")).toHaveClass("lucide-check");
    } finally {
      vi.useRealTimers();
    }
  });

  it("configures and bridges promotion colors with at least 4.5 to 1 contrast", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const promotion = css.match(/--promotion:\s*(#[0-9a-f]{6});/iu)?.[1];
    const foreground = css.match(/--promotion-foreground:\s*(#[0-9a-f]{6});/iu)?.[1];

    expect(promotion).toBe("#105d59");
    expect(foreground).toBe("#ffffff");
    expect(css).toMatch(/--color-promotion:\s*var\(--promotion\);/u);
    expect(css).toMatch(/--color-promotion-foreground:\s*var\(--promotion-foreground\);/u);
    expect(contrastRatio(promotion!, foreground!)).toBeGreaterThanOrEqual(4.5);
  });
});
