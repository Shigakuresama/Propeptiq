import { describe, expect, it } from "vitest";

import * as newsletterRoute from "./route";

describe("production newsletter route", () => {
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
