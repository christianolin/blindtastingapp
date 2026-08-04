"use client";

import { ChevronDown, EyeOff, ScanEye, NotebookPen, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTasteLauncher } from "@/components/taste-launcher-context";

// The hero's primary action. Replaces the old four mode tiles: one button that
// opens a menu of every taste flow, reusing the shared launcher popups.
export function StartTastingMenu() {
  const { openTaste } = useTasteLauncher();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="lg" className="h-11 px-5 text-[0.95rem]" />}
      >
        Start tasting
        <ChevronDown className="size-4 opacity-80" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onClick={() => openTaste("blind")}>
          <EyeOff /> Taste Blind
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaste("semi-blind")}>
          <ScanEye /> Taste Semi-Blind
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaste("rate")}>
          <NotebookPen /> Taste &amp; Rate
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Target /> Training Room
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
