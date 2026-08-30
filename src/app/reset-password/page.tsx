import type { Metadata } from "next";

import {
  resolveAuthDestination,
  resolvePasswordResetToken,
} from "@/auth/routes";
import { AuthPageFrame } from "@/components/account/auth-page-frame";
import { PasswordRecoveryEntry } from "@/components/account/password-recovery-entry";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { follow: false, index: false },
};
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    returnTo?: string | string[];
    token?: string | string[];
  }>;
}) {
  const parameters = await searchParams;
  const rawReturnTo = parameters.returnTo;
  const returnTo = resolveAuthDestination(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  );
  const rawToken = parameters.token;
  const hasProviderError = parameters.error !== undefined;
  const token = hasProviderError
    ? null
    : resolvePasswordResetToken(
        Array.isArray(rawToken) ? rawToken[0] : rawToken,
      );

  return (
    <AuthPageFrame kind="sign-in" returnTo={returnTo}>
      <PasswordRecoveryEntry kind="reset" returnTo={returnTo} token={token} />
    </AuthPageFrame>
  );
}
