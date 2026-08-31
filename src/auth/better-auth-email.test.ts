import { describe, expect, it, vi } from "vitest";

import {
  AuthEmailDeliveryError,
  buildPasswordResetEmail,
  buildVerificationCodeEmail,
  createAuthEmailSender,
} from "@/auth/better-auth-email";

describe("Better Auth email delivery", () => {
  it("uses the provider-generated reset URL exactly once", () => {
    const url =
      "https://propeptiq.com/api/auth/reset-password/provider-token-value?callbackURL=%2Fsign-in";
    const message = buildPasswordResetEmail({
      email: "buyer@example.test",
      url,
      expectedOrigin: "https://propeptiq.com",
    });

    expect(message).toMatchObject({
      subject: "Reset your PROPEPTIQ password",
      to: "buyer@example.test",
    });
    expect(message.text.split(url)).toHaveLength(2);
    expect(message.html.split(url)).toHaveLength(2);
    expect(message.text.match(/provider-token-value/g)).toHaveLength(1);
  });

  it("builds a bounded numeric verification-code message", () => {
    const message = buildVerificationCodeEmail({
      email: "buyer@example.test",
      otp: "482913",
      type: "email-verification",
      expiresInSeconds: 600,
    });

    expect(message).toMatchObject({
      subject: "Verify your PROPEPTIQ email",
      to: "buyer@example.test",
    });
    expect(message.text).toContain("482913");
    expect(message.text).toContain("10 minutes");
    expect(message.html).toContain("482913");
  });

  it("rejects malformed codes and unsafe reset links", () => {
    expect(() =>
      buildVerificationCodeEmail({
        email: "buyer@example.test",
        otp: "<script>",
        type: "email-verification",
        expiresInSeconds: 600,
      }),
    ).toThrow(/verification code/i);
    expect(() =>
      buildPasswordResetEmail({
        email: "buyer@example.test",
        url: "javascript:alert(1)",
        expectedOrigin: "https://propeptiq.com",
      }),
    ).toThrow(/reset URL/i);
    expect(() =>
      buildPasswordResetEmail({
        email: "buyer@example.test",
        url: "https://attacker.example/api/auth/reset-password/token",
        expectedOrigin: "https://propeptiq.com",
      }),
    ).toThrow(/reset URL/i);
  });

  it("sends through the configured sender without logging recipient data", async () => {
    const deliver = vi.fn().mockResolvedValue({ error: null });
    const reportFailure = vi.fn();
    const sender = createAuthEmailSender({
      from: "PROPEPTIQ Accounts <accounts@propeptiq.com>",
      deliver,
      reportFailure,
    });
    const message = buildVerificationCodeEmail({
      email: "buyer@example.test",
      otp: "482913",
      type: "email-verification",
      expiresInSeconds: 600,
    });

    await expect(sender(message)).resolves.toBeUndefined();
    expect(deliver).toHaveBeenCalledWith({
      from: "PROPEPTIQ Accounts <accounts@propeptiq.com>",
      ...message,
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("collapses provider failures to a redacted delivery category", async () => {
    const reportFailure = vi.fn();
    const sender = createAuthEmailSender({
      from: "PROPEPTIQ Accounts <accounts@propeptiq.com>",
      deliver: vi.fn().mockResolvedValue({
        error: { message: "provider response included buyer@example.test" },
      }),
      reportFailure,
    });
    const message = buildPasswordResetEmail({
      email: "buyer@example.test",
      url: "https://propeptiq.com/api/auth/reset-password/token",
      expectedOrigin: "https://propeptiq.com",
    });

    await expect(sender(message)).rejects.toBeInstanceOf(
      AuthEmailDeliveryError,
    );
    expect(reportFailure).toHaveBeenCalledWith("provider_rejected");
    expect(JSON.stringify(reportFailure.mock.calls)).not.toContain(
      "buyer@example.test",
    );
  });
});
