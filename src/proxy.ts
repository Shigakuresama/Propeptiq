import { NextResponse, type NextRequest } from "next/server";

import { getBetterAuthForEnvironment } from "@/auth/better-auth-server";
import { authRouteWithDestination, SIGN_IN_ROUTE } from "@/auth/routes";
import { parseServerEnv } from "@/config/env-schema";

export default async function proxy(request: NextRequest) {
  const environment = parseServerEnv(process.env);
  const auth = getBetterAuthForEnvironment(environment);
  if (!auth) return;
  const { response: validatedSession, headers: sessionHeaders } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const response = validatedSession?.user
    ? NextResponse.next()
    : NextResponse.redirect(
        new URL(authRouteWithDestination(SIGN_IN_ROUTE, returnTo), request.url),
      );
  // Preserve renewal and revocation cookies from the validated server session.
  for (const cookie of sessionHeaders.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/research-sets/:path*",
  ],
};
