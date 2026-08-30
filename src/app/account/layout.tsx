import type { ReactNode } from "react";

import { getRequestIdentity } from "@/auth/server";
import { AccountShell } from "@/components/account/account-shell";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const request = await getRequestIdentity();
  return (
    <AccountShell
      authEnabled={request.environment.AUTH_MODE !== "disabled"}
      localDriver={request.localDriver !== null}
    >
      {children}
    </AccountShell>
  );
}
