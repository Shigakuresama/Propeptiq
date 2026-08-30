import type { Metadata } from "next";

import { AuthEntry } from "@/components/account/auth-entry";
import { AuthPageFrame } from "@/components/account/auth-page-frame";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthPageFrame kind="sign-up">
      <AuthEntry kind="sign-up" />
    </AuthPageFrame>
  );
}
