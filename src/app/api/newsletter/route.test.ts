import { describe, expect, it, vi } from "vitest";

const runtimeComposition = vi.hoisted(() => vi.fn());

vi.mock("@/newsletter/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/newsletter/runtime")>();
  return {
    ...actual,
    createProductionNewsletterPostHandler() {
      runtimeComposition();
      return actual.createProductionNewsletterPostHandler();
    },
  };
});

import * as newsletterRoute from "./route";

describe("production newsletter route", () => {
  it("returns a fixed safe response when runtime composition fails", async () => {
    runtimeComposition.mockImplementationOnce(() => { throw new Error("private-provider-configuration"); });
    const response = await newsletterRoute.POST(new Request("https://store.example.test/api/newsletter", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "NEWSLETTER_NOT_CONFIGURED" });
    runtimeComposition.mockClear();
  });

  it("exports POST only and remains closed before reading any request body", async () => {
    expect(Object.keys(newsletterRoute)).toEqual(["POST"]);
    const request = new Request("https://store.example.test/api/newsletter", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example.test",
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({
        email: "production-closed@example.test",
        consent: true,
      }),
    });

    const response = await newsletterRoute.POST(request);
    expect(runtimeComposition).toHaveBeenCalledTimes(1);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "NEWSLETTER_NOT_CONFIGURED",
    });
    expect(request.bodyUsed).toBe(false);
  });

  it("returns the same fixed closed response without Origin, content type, or body", async () => {
    const request = new Request("https://store.example.test/api/newsletter", {
      method: "POST",
    });

    const response = await newsletterRoute.POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "NEWSLETTER_NOT_CONFIGURED",
    });
    expect(request.bodyUsed).toBe(false);
  });
});
