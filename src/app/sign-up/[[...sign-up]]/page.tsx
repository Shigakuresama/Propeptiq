import type { Metadata } from "next";

import { AuthEntry } from "@/components/account/auth-entry";
import { AuthPageFrame } from "@/components/account/auth-page-frame";
import { resolveAuthDestination } from "@/auth/routes";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = resolveAuthDestination(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  );
  return (
    <AuthPageFrame kind="sign-up" returnTo={returnTo}>
      <AuthEntry kind="sign-up" returnTo={returnTo} />
    </AuthPageFrame>
  );
}
