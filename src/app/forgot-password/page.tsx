import type { Metadata } from "next";

import { resolveAuthDestination } from "@/auth/routes";
import { AuthPageFrame } from "@/components/account/auth-page-frame";
import { PasswordRecoveryEntry } from "@/components/account/password-recovery-entry";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { follow: false, index: false },
};
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = resolveAuthDestination(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  );

  return (
    <AuthPageFrame kind="sign-in" returnTo={returnTo}>
      <PasswordRecoveryEntry kind="request" returnTo={returnTo} />
    </AuthPageFrame>
  );
}
