import { ArrowLeft, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  authRouteWithDestination,
  SIGN_IN_ROUTE,
  SIGN_UP_ROUTE,
} from "@/auth/routes";
import { DataLabel } from "@/components/design-system/archive-primitives";
import { BrandLogo } from "@/components/site/brand-mark";
import { ResearchRestrictionBar } from "@/components/site/research-restriction-bar";
import { ScienceField } from "@/components/site/science-field";

const accessCopy = {
  "sign-in": {
    eyebrow: "Private account access",
    title: "Return to your research account.",
    description:
      "Continue to checkout or review owner-scoped account and order records after identity verification.",
  },
  "sign-up": {
    eyebrow: "Verified account setup",
    title: "Create your research account.",
    description:
      "Account setup begins here. Research-use facts and the current attestation are completed at checkout.",
  },
} as const;

export function AuthPageFrame({
  children,
  kind,
  returnTo,
}: {
  children: ReactNode;
  kind: keyof typeof accessCopy;
  returnTo: string;
}) {
  const copy = accessCopy[kind];

  return (
    <div className="min-h-svh">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <ResearchRestrictionBar />
      <main
        id="main-content"
        className="site-container site-motion-surface site-motion-surface--quiet py-8 sm:py-12 lg:py-16"
        data-motion-surface="auth"
        tabIndex={-1}
      >
        <div className="grid overflow-hidden rounded-[1.25rem] border border-border bg-surface-record shadow-[var(--shadow-soft)] lg:min-h-[42rem] lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
          <section className="relative isolate flex min-h-[24rem] flex-col overflow-hidden bg-ink p-6 text-canvas sm:p-9 lg:min-h-0 lg:p-12">
            <ScienceField className="auth-science-field" tone="inverse" variant="trace" />
            <Link
              href="/"
              aria-label="PROPEPTIQ LABS home"
              className="relative z-10 inline-flex min-h-11 w-fit items-center rounded-xl border border-canvas/20 px-2 text-canvas no-underline transition-colors hover:border-canvas/45 hover:bg-canvas/5"
            >
              <BrandLogo className="w-28" decorative />
            </Link>

            <div className="relative z-10 my-auto py-10" data-motion-sequence="auth-intro">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-canvas/70">
                {copy.eyebrow}
              </p>
              <p className="mt-5 max-w-[13ch] text-balance font-heading text-4xl leading-[0.98] sm:text-5xl">
                {copy.title}
              </p>
              <p className="mt-5 max-w-[44ch] text-base leading-7 text-canvas/75">
                {copy.description}
              </p>
            </div>

            <ul className="relative z-10 grid gap-3 border-t border-canvas/15 pt-6 text-sm leading-6 text-canvas/75 sm:grid-cols-3 lg:grid-cols-1">
              <li className="flex gap-3">
                <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-canvas" />
                <span>Owner-scoped records remain private.</span>
              </li>
              <li className="flex gap-3">
                <RefreshCw aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-canvas" />
                <span>Your browser-saved cart remains intact.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-canvas" />
                <span>Checkout facts are verified by the server.</span>
              </li>
            </ul>
          </section>

          <section className="flex min-w-0 flex-col p-5 sm:p-8 lg:p-12" aria-label="Account access">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
              <Link
                href="/cart"
                className="record-link inline-flex min-h-11 items-center gap-2"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Return to cart
              </Link>
              <nav className="flex rounded-full border border-border bg-surface-recessed p-1" aria-label="Account access options">
                <Link
                  href={authRouteWithDestination(SIGN_IN_ROUTE, returnTo)}
                  aria-current={kind === "sign-in" ? "page" : undefined}
                  className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold no-underline ${kind === "sign-in" ? "action-primary" : "action-secondary"}`}
                >
                  Sign in
                </Link>
                <Link
                  href={authRouteWithDestination(SIGN_UP_ROUTE, returnTo)}
                  aria-current={kind === "sign-up" ? "page" : undefined}
                  className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold no-underline ${kind === "sign-up" ? "action-primary" : "action-secondary"}`}
                >
                  Create account
                </Link>
              </nav>
            </div>
            <div className="mt-7 flex min-h-0 flex-1 flex-col justify-center">
              <DataLabel>{kind === "sign-in" ? "Identity verification" : "Account enrollment"}</DataLabel>
              <div className="mt-4">{children}</div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
