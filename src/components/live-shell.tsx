"use client";

// B5 "dark means live" (spec §6.3 item 2). Wraps a running tasting's page
// content in the dark theme and tells nested client components (the popover,
// the phone field-picker sheet) to render dark too — a portalled popup
// breaks out of this div's DOM subtree, so `.dark`'s cascade never reaches
// it on its own; it has to read the flag and add the class itself.
//
// data-live marks a LIVE surface, which the `dark` class alone cannot: <html>
// carries that class too whenever the app theme is dark. globals.css keys the
// spec 6.3 bordeaux primary off the pair, so live screens keep it under a light
// and a dark root alike (owner, 2026-09-14). Anything that adds `dark` because
// of this context adds data-live with it; theme-contrast.test.ts checks.

import * as React from "react";

const LiveThemeContext = React.createContext<"dark" | null>(null);

export function LiveShell({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!active) return <>{children}</>;
  return (
    <LiveThemeContext.Provider value="dark">
      <div data-live="" className="dark flex flex-1 flex-col bg-background text-foreground">
        {children}
      </div>
    </LiveThemeContext.Provider>
  );
}

/** "dark" inside an active LiveShell, else null. */
export function useLiveTheme(): "dark" | null {
  return React.useContext(LiveThemeContext);
}
