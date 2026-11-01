import type { Metadata, Viewport } from "next";
import { Archivo, Newsreader } from "next/font/google";
import "./globals.css";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { siteUrl } from "@/lib/slug";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "ghostwritten: how much of GitHub is written by AI agents", template: "%s | ghostwritten" },
  description:
    "Exact per-repo counts of commits that carry an AI agent's signature. Leaderboards, README badges and a shareable card for any GitHub user.",
  openGraph: { siteName: "ghostwritten", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f13" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <Masthead />
        <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
