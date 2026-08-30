import { getNeonAuth } from "@/auth/neon-server";
import { readServerEnv } from "@/env";

type AuthRouteContext = Readonly<{
  params: Promise<Readonly<{ path: string[] }>>;
}>;

type AuthMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

function disabledResponse(): Response {
  return Response.json(
    { error: "Identity service unavailable" },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isPasswordRecoveryPath(path: readonly string[]): boolean {
  const route = `/${path.join("/")}`;
  return (
    route === "/request-password-reset" ||
    route === "/email-otp/request-password-reset" ||
    route === "/email-otp/reset-password" ||
    route === "/email-otp/passcode" ||
    route === "/forget-password/email-otp" ||
    route === "/phone-number/request-password-reset" ||
    route === "/phone-number/reset-password" ||
    route === "/reset-password" ||
    route.startsWith("/reset-password/")
  );
}

function isGenericEmailOtpPath(path: readonly string[]): boolean {
  const route = `/${path.join("/")}`;
  return (
    route === "/email-otp/send-verification-otp" ||
    route === "/email-otp/check-verification-otp"
  );
}

async function isPasswordRecoveryRequest(
  method: AuthMethod,
  path: readonly string[],
  request: Request,
): Promise<boolean> {
  if (isPasswordRecoveryPath(path)) return true;
  if (method !== "POST" || !isGenericEmailOtpPath(path)) return false;

  try {
    const body: unknown = await request.clone().json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return true;
    return (body as Record<string, unknown>).type === "forget-password";
  } catch {
    // These shared endpoints can initiate or validate password-recovery OTPs.
    // If their intent cannot be established, keep recovery fail-closed.
    return true;
  }
}

async function forward(
  method: AuthMethod,
  request: Request,
  context: AuthRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  if (
    (await isPasswordRecoveryRequest(method, path, request)) &&
    readServerEnv().AUTH_PASSWORD_RESET_SESSION_REVOCATION !== "verified"
  ) {
    return disabledResponse();
  }
  const auth = getNeonAuth();
  if (!auth) return disabledResponse();
  return auth.handler()[method](request, context);
}

export function GET(request: Request, context: AuthRouteContext) {
  return forward("GET", request, context);
}

export function POST(request: Request, context: AuthRouteContext) {
  return forward("POST", request, context);
}

export function PUT(request: Request, context: AuthRouteContext) {
  return forward("PUT", request, context);
}

export function DELETE(request: Request, context: AuthRouteContext) {
  return forward("DELETE", request, context);
}

export function PATCH(request: Request, context: AuthRouteContext) {
  return forward("PATCH", request, context);
}
