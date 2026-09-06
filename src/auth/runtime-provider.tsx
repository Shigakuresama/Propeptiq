import "server-only";

import type { ReactNode } from "react";
import { connection } from "next/server";

import { readServerEnv } from "@/env";
import { SessionNavigationProvider } from "@/auth/session-navigation";

export async function RuntimeAuthProvider({ children }: { children: ReactNode }) {
  await connection();
  const environment = readServerEnv();
  let localSignedIn = false;
  if (environment.LOCAL_TEST_DRIVER === "enabled") {
    const { getRequestIdentity } = await import("@/auth/server");
    localSignedIn = (await getRequestIdentity()).identity !== null;
  }
  return (
    <SessionNavigationProvider
      enabled={environment.AUTH_MODE !== "disabled"}
      localSignedIn={localSignedIn}
    >
      {children}
    </SessionNavigationProvider>
  );
}
