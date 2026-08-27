import "server-only";

import type { ReactNode } from "react";
import { connection } from "next/server";

import { readServerEnv } from "@/env";

export async function RuntimeAuthProvider({ children }: { children: ReactNode }) {
  await connection();
  const environment = readServerEnv();
  if (
    environment.AUTH_MODE === "disabled" ||
    environment.LOCAL_TEST_DRIVER === "enabled"
  ) {
    return children;
  }
  const { ClerkProvider } = await import("@clerk/nextjs");
  return <ClerkProvider>{children}</ClerkProvider>;
}
