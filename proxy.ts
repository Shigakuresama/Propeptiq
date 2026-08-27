import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { parseServerEnv } from "@/config/env-schema";

const realClerkProxy = clerkMiddleware();

export default function proxy(request: NextRequest, event: Parameters<typeof realClerkProxy>[1]) {
  const environment = parseServerEnv(process.env);
  if (
    environment.AUTH_MODE === "disabled" ||
    environment.LOCAL_TEST_DRIVER === "enabled"
  ) {
    return;
  }
  return realClerkProxy(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
