import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/site/brand-mark";
import {
  publicNavigation,
  researchRestrictions,
  siteName,
} from "@/lib/site-content";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-canvas">
      <div className="site-container py-14 md:py-20">
        <div className="grid gap-14 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] xl:gap-20">
          <div className="max-w-2xl">
          <Link
            href="/"
            aria-label={`${siteName} home`}
            className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
          >
            <BrandLogo className="w-48 sm:w-56" />
          </Link>
          <p className="mt-6 font-heading text-3xl leading-tight text-canvas sm:text-4xl">
            Research materials,<br />documented with clarity.
          </p>
          <p className="mt-5 max-w-[62ch] text-base leading-7 text-canvas/70">
            {researchRestrictions[0]} {researchRestrictions[1]} Catalog names and package
            configurations come from owner-supplied records; cart and checkout facts remain server-authoritative.
          </p>
          </div>

          <nav aria-label="Footer" className="grid content-start gap-10 sm:grid-cols-2">
            <div>
              <p className="data-label data-label-inverse px-2">Explore</p>
              <div className="mt-3 grid gap-1">
                {publicNavigation.slice(0, 2).map((item) => (
                  <FooterLink href={item.href} key={item.href}>{item.label}</FooterLink>
                ))}
                <FooterLink href="/cart">Cart</FooterLink>
              </div>
            </div>
            <div>
              <p className="data-label data-label-inverse px-2">Documentation</p>
              <div className="mt-3 grid gap-1">
                {publicNavigation.slice(2).map((item) => (
                  <FooterLink href={item.href} key={item.href}>{item.label}</FooterLink>
                ))}
                <FooterLink href="/partners">Partner Program</FooterLink>
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-canvas/15 pt-6 text-base text-canvas/60 sm:flex-row sm:items-center sm:justify-between">
          <p>PROPEPTIQ LABS</p>
          <p>Evidence-bound research catalog.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as never}
      className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-base text-canvas/75 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
    >
      {children}
    </Link>
  );
}
