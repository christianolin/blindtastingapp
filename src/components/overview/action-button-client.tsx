"use client";

import type { ReactNode } from "react";
import { useTasteLauncher } from "@/components/taste-launcher-context";
import { useAddWine } from "@/components/add-wine-context";
import { actionButtonClass, type ActionVariant } from "./action-button";

export type ActionLaunch = "taste-blind" | "taste-rate" | "cellar";

// A card action that opens one of the shared launcher popups instead of
// navigating — the same popups the sidebar sub-nav opens.
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
  const { openTaste } = useTasteLauncher();
  const { openAddWine } = useAddWine();
  const onClick = () => {
    if (launch === "taste-blind") openTaste("blind");
    else if (launch === "taste-rate") openTaste("rate");
    else openAddWine("cellar");
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={actionButtonClass(variant, className)}
    >
      {children}
    </button>
  );
}
