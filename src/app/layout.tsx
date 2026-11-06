import type { Metadata, Viewport } from "next";
import { Literata, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Literata was designed for long reading on screens, so it carries the entries.
const reading = Literata({
  subsets: ["latin"],
  variable: "--font-reading",
  display: "swap",
});

// A quiet sans for buttons, labels and small print.
const ui = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Journal",
  description: "A private place to write your days down.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f4f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111a1c" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${reading.variable} ${ui.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
