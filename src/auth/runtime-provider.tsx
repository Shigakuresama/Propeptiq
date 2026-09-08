import "server-only";

import type { ReactNode } from "react";
import { connection } from "next/server";

import { readServerEnv } from "@/env";
import { isSandboxCheckoutEnvironmentConfigured } from "@/config/sandbox-configuration";
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
      {isSandboxCheckoutEnvironmentConfigured(environment) && <div role="note" className="border-b border-ink/20 bg-canvas px-4 py-3 text-center text-sm">Sandbox — test payments and synthetic inventory only. No orders will ship. Sign in with the provisioned test account.</div>}
      {children}
    </SessionNavigationProvider>
  );
}
