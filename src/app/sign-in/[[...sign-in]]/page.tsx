import type { Metadata } from "next";

import { AuthEntry } from "@/components/account/auth-entry";
import { AuthPageFrame } from "@/components/account/auth-page-frame";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthPageFrame kind="sign-in">
      <AuthEntry kind="sign-in" />
    </AuthPageFrame>
  );
}
