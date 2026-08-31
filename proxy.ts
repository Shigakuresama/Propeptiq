import { NextResponse, type NextRequest } from "next/server";

import { getBetterAuthForEnvironment } from "@/auth/better-auth-server";
import { authRouteWithDestination, SIGN_IN_ROUTE } from "@/auth/routes";
import { parseServerEnv } from "@/config/env-schema";

export default async function proxy(request: NextRequest) {
  const environment = parseServerEnv(process.env);
  const auth = getBetterAuthForEnvironment(environment);
  if (!auth) return;
  const validatedSession = await auth.api.getSession({
    headers: request.headers,
  });
  if (validatedSession?.user) return;

  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(
    new URL(authRouteWithDestination(SIGN_IN_ROUTE, returnTo), request.url),
  );
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/research-sets/:path*",
  ],
};
