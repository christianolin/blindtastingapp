import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ThemeSync } from "@/components/theme-sync";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blindr",
  description: "Run blind wine tastings with VM/DM scoring rules.",
};

export const viewport: Viewport = {
  // Mobile browser chrome. A single colour left the address bar in Bordeaux
  // while the page behind it was near-black.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5C1A2B" },
    { media: "(prefers-color-scheme: dark)", color: "#1B1310" },
  ],
};

// Runs BEFORE the first paint. Without it every dark-mode user gets a flash of
// parchment on every navigation: React only adds the class after hydration, and
// the browser paints well before that.
//
// This duplicates the rule in src/lib/theme.ts, which it has to -- it cannot
// import anything and still beat the paint. Kept to the smallest expression of
// that rule; theme.ts is the source of truth, and the key must match THEME_KEY.
const THEME_SCRIPT = `(function(){try{
var c=localStorage.getItem("blindr-theme");
var t=c==="dark"?"dark":"light";
document.documentElement.classList.toggle("dark",t==="dark");
document.documentElement.style.colorScheme=t;
}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning because THEME_SCRIPT mutates this element's class
    // and style before React hydrates it. Required, not cosmetic: without it
    // React warns on every load for anyone whose theme is not the default.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${cormorantGaramond.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Re-applies the theme after hydration. THEME_SCRIPT wins the first
            paint; React can then overwrite the class attribute it owns on
            <html>, and on some routes it does. See theme-sync.tsx. */}
        <ThemeSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
