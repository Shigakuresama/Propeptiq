import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PROPEPTIQ LABS — Research Materials Governed by Evidence",
    template: "%s | PROPEPTIQ LABS",
  },
  description:
    "A compliance-first research-materials platform for verified researchers and organizations. For legitimate laboratory and research use only; not for human or veterinary use.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={cn(geist.variable, newsreader.variable)}>
      <body className="min-h-svh bg-canvas font-sans text-ink antialiased">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
