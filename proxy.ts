import type { NextRequest } from "next/server";

import { getNeonAuthForEnvironment } from "@/auth/neon-server";
import { authRouteWithDestination, SIGN_IN_ROUTE } from "@/auth/routes";
import { parseServerEnv } from "@/config/env-schema";

export default function proxy(request: NextRequest) {
  const environment = parseServerEnv(process.env);
  const auth = getNeonAuthForEnvironment(environment);
  if (!auth) return;
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return auth.middleware({
    loginUrl: authRouteWithDestination(SIGN_IN_ROUTE, returnTo),
  })(request);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/research-sets/:path*",
  ],
};
