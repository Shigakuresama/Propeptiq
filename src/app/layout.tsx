import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import { CartProvider } from "@/cart/cart-provider";
import { RuntimeAuthProvider } from "@/auth/runtime-provider";
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
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: {
    default: "PROPEPTIQ LABS — Research-Use Catalog",
    template: "%s | PROPEPTIQ LABS",
  },
  description:
    "A public research-use catalog and anonymous cart. For legitimate laboratory and research use only; not for human or veterinary use.",
  openGraph: {
    type: "website",
    siteName: "PROPEPTIQ LABS",
    title: "PROPEPTIQ LABS — Research-Use Catalog",
    description:
      "For legitimate laboratory and research use only. Not for human or veterinary use.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn(geist.variable, newsreader.variable)}
    >
      <body className="min-h-svh bg-canvas font-sans text-ink antialiased">
        <RuntimeAuthProvider>
          <CartProvider>{children}</CartProvider>
        </RuntimeAuthProvider>
      </body>
    </html>
  );
}
