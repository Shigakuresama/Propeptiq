import type { Metadata } from "next";

import { AuthEntry } from "@/components/account/auth-entry";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <><ResearchRestrictionBar /><main id="main-content" className="site-container py-16 sm:py-24" tabIndex={-1}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <AuthEntry kind="sign-in" />
    </main></>
  );
}
