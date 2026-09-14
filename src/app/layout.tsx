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
  // Mobile browser chrome: the light colour only, the Bordeaux of the menu
  // rail. Blindr is light unless a user picks Dark (owner, 2026-09-14), and the
  // old pair keyed on prefers-color-scheme tinted the address bar near-black on
  // any dark OS while the page stayed parchment. The server cannot see the
  // stored choice, and the rail is this colour in every theme, so one value
  // suits both.
  themeColor: "#5C1A2B",
};

// Runs BEFORE the first paint. Without it everyone who picked Dark (or Match
// system on a dark OS) gets a flash of parchment on every navigation: React
// only adds the class after hydration, and the browser paints well before that.
//
// This duplicates the rule in src/lib/theme.ts, which it has to -- it cannot
// import anything and still beat the paint. Kept to the smallest expression of
// that rule; theme.ts is the source of truth, and the key must match THEME_KEY.
// theme.test.ts runs this script against theme.ts for every stored value.
//
// The rule, owner 2026-09-14 ("Light unless chosen"): "dark" renders dark,
// "system" asks prefers-color-scheme, and everything else -- nothing stored,
// "light", a corrupted value, storage that throws -- stays light.
const THEME_SCRIPT = `(function(){try{
var c=localStorage.getItem("blindr-theme");
var t=(c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light";
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
