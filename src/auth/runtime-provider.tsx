import "server-only";

import type { ReactNode } from "react";
import { connection } from "next/server";

import { readServerEnv } from "@/env";

export async function RuntimeAuthProvider({ children }: { children: ReactNode }) {
  await connection();
  // Validate deployment configuration at the same boundary as the previous
  // provider wrapper. Better Auth uses server actions and HTTP-only
  // cookies, so no client-side context provider is required here.
  readServerEnv();
  return children;
}
