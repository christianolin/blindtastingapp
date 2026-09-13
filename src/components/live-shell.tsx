"use client";

// B5 "dark means live" (spec §6.3 item 2). Wraps a running tasting's page
// content in the dark theme and tells nested client components (the popover,
// the phone field-picker sheet) to render dark too — a portalled popup
// breaks out of this div's DOM subtree, so `.dark`'s cascade never reaches
// it on its own; it has to read the flag and add the class itself.

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
      <div className="dark flex flex-1 flex-col bg-background text-foreground">{children}</div>
    </LiveThemeContext.Provider>
  );
}

/** "dark" inside an active LiveShell, else null. */
export function useLiveTheme(): "dark" | null {
  return React.useContext(LiveThemeContext);
}
