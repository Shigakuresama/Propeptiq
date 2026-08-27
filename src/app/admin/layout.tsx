import type { ReactNode } from "react";

import { adminGate, adminResources } from "@/admin/access";
import { getRequestIdentity } from "@/auth/server";
import { AdminGateState } from "@/components/admin/admin-gate-state";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const request = await getRequestIdentity();
  const gate = adminGate(request);
  if (!gate.allowed) return <AdminGateState gate={gate} />;
  const capabilities = new Set(request.principal!.capabilities);
  const resources = adminResources.filter((resource) => capabilities.has(resource.capability));
  return <AdminShell resources={resources}>{children}</AdminShell>;
}
