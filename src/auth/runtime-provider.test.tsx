import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  readServerEnv: vi.fn(() => ({ AUTH_MODE: "disabled" })),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/env", () => ({ readServerEnv: mocks.readServerEnv }));

import { RuntimeAuthProvider } from "./runtime-provider";

describe("RuntimeAuthProvider", () => {
  it("validates request-time configuration without requiring a client provider", async () => {
    render(
      await RuntimeAuthProvider({
        children: <p>Provider-neutral content</p>,
      }),
    );

    expect(screen.getByText("Provider-neutral content")).toBeInTheDocument();
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.readServerEnv).toHaveBeenCalledOnce();
  });
});
