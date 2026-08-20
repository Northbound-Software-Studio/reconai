import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted variable fonts (via @fontsource) so the build never depends on a
// network fetch to Google Fonts.
const fraunces = localFont({
  src: "./fonts/fraunces.woff2",
  variable: "--font-display",
  weight: "100 900",
  display: "swap",
});

const hanken = localFont({
  src: "./fonts/hanken.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReconAI — Invoice reconciliation agent",
  description:
    "Upload an invoice and an AI agent extracts every line item, reconciles it against your purchase order, checks the math, and flags every mismatch before you approve payment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
