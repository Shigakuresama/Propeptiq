import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PROPEPTIQ LABS",
    template: "%s | PROPEPTIQ LABS",
  },
  description:
    "Research-use commerce platform for verified researchers and organizations. Compliance, jurisdiction, payment, and fulfillment controls are enforced before checkout.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
