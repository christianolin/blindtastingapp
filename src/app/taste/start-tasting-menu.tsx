"use client";

import { ChevronDown, EyeOff, NotebookPen, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTasteLauncher } from "@/components/taste-launcher-context";
import { makeT } from "@/lib/wset/i18n";
import { ARCHIVE_LANG } from "./taste-archive-math";

const t = makeT(ARCHIVE_LANG);

// The All tastings page's primary action, rendered in-page under the title
// (not in the global header, which keeps the Overview revision's bar): "Start
// a tasting ▾", "Start ▾" on phones, 44px tall at every width. One button
// that opens a menu of every taste flow, reusing the shared launcher popups.
// Blind and semi-blind are a single entry — the create-tasting sheet asks
// which one. The button sits at the header's right edge, so the menu aligns
// to its end and opens back into the page.
export function StartTastingMenu() {
  const { openTaste } = useTasteLauncher();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="lg" className="h-11 shrink-0 px-5 text-[0.95rem] max-md:px-4" />}
      >
        <span className="max-md:hidden">{t("start_a_tasting")}</span>
        <span className="md:hidden">{t("start")}</span>
        <ChevronDown className="size-4 opacity-80" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={() => openTaste("blind")}>
          <EyeOff /> {t("taste_blind")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaste("rate")}>
          <NotebookPen /> {t("taste_and_rate")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Target /> {t("training_room")}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("soon")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
