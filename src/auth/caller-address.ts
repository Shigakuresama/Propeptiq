import { isIP } from "node:net";

import type { ServerEnv } from "@/config/env-schema";

export function readAuthCallerAddress(
  requestHeaders: Headers,
  environment: ServerEnv["APP_ENV"],
): string | null {
  const rawAddress =
    environment === "local"
      ? requestHeaders.get("x-forwarded-for") ?? "127.0.0.1"
      : requestHeaders.get("x-vercel-forwarded-for");
  const callerAddress = rawAddress?.trim().toLowerCase();
  if (
    !callerAddress ||
    callerAddress.length > 64 ||
    callerAddress.includes(",") ||
    isIP(callerAddress) === 0
  ) {
    return null;
  }
  return callerAddress;
}
