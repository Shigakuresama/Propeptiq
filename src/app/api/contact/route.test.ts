import { describe, expect, it, vi } from "vitest";

const compose = vi.hoisted(() => vi.fn());
vi.mock("@/contact/runtime", () => ({ createProductionContactPostHandler: compose }));

import { POST } from "@/app/api/contact/route";

describe("contact route", () => {
  it("returns a fixed safe response when runtime composition fails", async () => {
    compose.mockImplementationOnce(() => { throw new Error("private configuration"); });
    const response = await POST(new Request("https://store.example.test/api/contact", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  });
});
