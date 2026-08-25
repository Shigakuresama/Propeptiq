import type { ReactNode } from "react";

import { getRequestIdentity } from "@/auth/server";
import { AccountShell } from "@/components/account/account-shell";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const request = await getRequestIdentity();
  return <AccountShell localDriver={request.localDriver !== null}>{children}</AccountShell>;
}
