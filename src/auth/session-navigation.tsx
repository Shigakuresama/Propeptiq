"use client";

import { createAuthClient } from "better-auth/react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const authClient = createAuthClient();
type NavigationSession = "signed-in" | "signed-out" | "pending" | "unavailable";
const SessionNavigationContext = createContext<NavigationSession>("signed-out");

function ManagedSessionNavigation({ children }: { children: ReactNode }) {
  // Better Auth refreshes through HTTP (where Set-Cookie can reach the browser),
  // refetches on focus and synchronizes session changes across tabs.
  const { data, isPending, error, refetch } = authClient.useSession();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    // Sign-in/out use Server Actions, which do not notify the client auth atom.
    // Revalidate after their redirects and normal navigation through the HTTP API.
    void refetch();
  }, [pathname, refetch]);
  const state: NavigationSession = error ? "unavailable"
    : isPending ? "pending"
      : data?.user ? "signed-in" : "signed-out";
  return <SessionNavigationContext value={state}>{children}</SessionNavigationContext>;
}

export function SessionNavigationProvider({
  children, enabled, localSignedIn = false,
}: { children: ReactNode; enabled: boolean; localSignedIn?: boolean }) {
  if (enabled) return <ManagedSessionNavigation>{children}</ManagedSessionNavigation>;
  return (
    <SessionNavigationContext value={localSignedIn ? "signed-in" : "signed-out"}>
      {children}
    </SessionNavigationContext>
  );
}

export function useSessionNavigation() {
  return useContext(SessionNavigationContext);
}
