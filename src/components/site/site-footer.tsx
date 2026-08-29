import Link from "next/link";

import { BrandLogo } from "@/components/site/brand-mark";
import {
  publicNavigation,
  researchRestrictions,
  siteName,
} from "@/lib/site-content";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-canvas">
      <div className="site-container grid gap-10 py-12 md:grid-cols-[1.2fr_0.8fr] md:py-16">
        <div className="max-w-xl">
          <Link
            href="/"
            aria-label={`${siteName} home`}
            className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
          >
            <BrandLogo className="w-48 sm:w-56" />
          </Link>
          <p className="mt-6 font-heading text-3xl leading-tight text-canvas sm:text-4xl">
            Research materials, governed by evidence.
          </p>
          <p className="mt-5 max-w-[62ch] text-base leading-7 text-canvas/70">
            {researchRestrictions[0]} {researchRestrictions[1]} Catalog names and package
            configurations come from owner-supplied records; cart and checkout facts remain server-authoritative.
          </p>
        </div>

        <nav aria-label="Footer" className="grid content-start gap-1 md:justify-self-end">
          {publicNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm text-canvas/75 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/partners"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm text-canvas/75 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
          >
            Partner Program
          </Link>
          <Link
            href="/cart"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm text-canvas/75 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
          >
            Cart
          </Link>
        </nav>
      </div>
    </footer>
  );
}
