"use client";

import type { ReactNode } from "react";
import { useTasteLauncher } from "@/components/taste-launcher-context";
import { useAddWine } from "@/components/add-wine-context";
import { actionButtonClass, type ActionVariant } from "./action-button";

export type ActionLaunch = "taste-blind" | "taste-rate" | "cellar";

/**
 * Opens one of the shared launcher popups — the same popups the sidebar
 * sub-nav opens. The card actions below and the Overview's phone tile row
 * (src/app/overview/quick-actions.tsx) both launch through this one path.
 */
export function useActionLauncher(): (launch: ActionLaunch) => void {
  const { openTaste } = useTasteLauncher();
  const { openAddWine } = useAddWine();
  return (launch) => {
    if (launch === "taste-blind") openTaste("blind");
    else if (launch === "taste-rate") openTaste("rate");
    else openAddWine("cellar");
  };
}

// A card action that opens one of the shared launcher popups instead of
// navigating.
export function ActionButtonClient({
  launch,
  variant,
  children,
  className,
}: {
  launch: ActionLaunch;
  variant: ActionVariant;
  children: ReactNode;
  className?: string;
}) {
  const open = useActionLauncher();
  return (
    <button
      type="button"
      onClick={() => open(launch)}
      className={actionButtonClass(variant, className)}
    >
      {children}
    </button>
  );
}
