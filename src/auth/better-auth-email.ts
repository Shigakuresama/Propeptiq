export type AuthEmailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html: string;
}>;

type VerificationCodeType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

type AuthEmailPayload = AuthEmailMessage & Readonly<{ from: string }>;

export class AuthEmailDeliveryError extends Error {
  constructor() {
    super("Authentication email delivery failed");
    this.name = "AuthEmailDeliveryError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertResetUrl(value: string, expectedOrigin: string): URL {
  let url: URL;
  let allowedOrigin: string;
  try {
    url = new URL(value);
    allowedOrigin = new URL(expectedOrigin).origin;
  } catch {
    throw new Error("Password reset URL is invalid");
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Password reset URL must use HTTPS");
  }
  if (
    url.origin !== allowedOrigin ||
    !url.pathname.startsWith("/api/auth/reset-password/")
  ) {
    throw new Error("Password reset URL is outside the configured Auth origin");
  }
  return url;
}

export function buildPasswordResetEmail(input: Readonly<{
  email: string;
  url: string;
  expectedOrigin: string;
}>): AuthEmailMessage {
  const url = assertResetUrl(input.url, input.expectedOrigin).toString();
  const safeUrl = escapeHtml(url);

  return Object.freeze({
    to: input.email,
    subject: "Reset your PROPEPTIQ password",
    text: [
      "A password reset was requested for your PROPEPTIQ account.",
      "",
      `Reset your password: ${url}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>A password reset was requested for your PROPEPTIQ account.</p>",
      `<p><a href="${safeUrl}">Reset your password</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
}

const verificationSubjects: Readonly<Record<VerificationCodeType, string>> = {
  "email-verification": "Verify your PROPEPTIQ email",
  "sign-in": "Your PROPEPTIQ sign-in code",
  "forget-password": "Your PROPEPTIQ password reset code",
  "change-email": "Confirm your PROPEPTIQ email change",
};

export function buildVerificationCodeEmail(input: Readonly<{
  email: string;
  otp: string;
  type: VerificationCodeType;
  expiresInSeconds: number;
}>): AuthEmailMessage {
  if (!/^\d{6}$/u.test(input.otp)) {
    throw new Error("Authentication verification code is invalid");
  }
  if (
    !Number.isSafeInteger(input.expiresInSeconds) ||
    input.expiresInSeconds <= 0
  ) {
    throw new Error("Authentication verification-code expiry is invalid");
  }

  const minutes = Math.max(1, Math.ceil(input.expiresInSeconds / 60));
  const duration = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const subject = verificationSubjects[input.type];

  return Object.freeze({
    to: input.email,
    subject,
    text: [
      `Your PROPEPTIQ verification code is ${input.otp}.`,
      `It expires in ${duration}.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Your PROPEPTIQ verification code is:</p>",
      `<p><strong>${input.otp}</strong></p>`,
      `<p>It expires in ${duration}.</p>`,
      "<p>If you did not request this code, you can ignore this email.</p>",
    ].join(""),
  });
}

export function createAuthEmailSender(input: Readonly<{
  from: string;
  deliver: (
    payload: AuthEmailPayload,
  ) => Promise<Readonly<{ error?: unknown | null }>>;
  reportFailure?: (
    category: "provider_rejected" | "transport_failed",
  ) => void;
}>): (message: AuthEmailMessage) => Promise<void> {
  const reportFailure =
    input.reportFailure ??
    ((category: "provider_rejected" | "transport_failed") => {
      console.error("Authentication email delivery failed", { category });
    });

  return async (message) => {
    try {
      const result = await input.deliver({ from: input.from, ...message });
      if (result.error) {
        reportFailure("provider_rejected");
        throw new AuthEmailDeliveryError();
      }
    } catch (error) {
      if (error instanceof AuthEmailDeliveryError) {
        throw error;
      }
      reportFailure("transport_failed");
      throw new AuthEmailDeliveryError();
    }
  };
}
