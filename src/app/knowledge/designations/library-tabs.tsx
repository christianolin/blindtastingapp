"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DesignationsTabs } from "./designations-tabs";
import { GrapeLibrary, type GrapeRow } from "./grape-library";
import { RulesPanel } from "./rules-panel";
import {
  ArchetypeBrowser,
  type ArchetypeCard,
} from "../archetypes/archetype-browser";
import type { DesignationsPageData } from "@/lib/designations/page-data";

const LIB_TABS = [
  { slug: "designations", label: "Designations" },
  { slug: "grapes", label: "Grapes" },
  { slug: "typical", label: "Typical wines" },
  { slug: "rules", label: "Rules" },
];

// The whole Library as one client shell: overarching top tabs that switch
// instantly (no navigation), with Designations carrying its own sub-tabs. All
// sections' data is loaded once by the server page and handed down here.
export function LibraryTabs({
  designations,
  grapes,
  placesByGrape,
  archetypes,
  initialTab,
  initialDesignationTab,
}: {
  designations: DesignationsPageData;
  grapes: GrapeRow[];
  placesByGrape: Record<string, { name: string; key: string }[]>;
  archetypes: ArchetypeCard[];
  initialTab: string;
  initialDesignationTab: string;
}) {
  const valid = LIB_TABS.some((t) => t.slug === initialTab)
    ? initialTab
    : "designations";
  const [active, setActive] = useState(valid);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (active === "designations") params.delete("libtab");
    else params.set("libtab", active);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs}` : window.location.pathname,
    );
  }, [active]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {LIB_TABS.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => setActive(t.slug)}
            aria-current={t.slug === active ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              t.slug === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "designations" ? (
        <DesignationsTabs
          data={designations}
          initialTab={initialDesignationTab}
        />
      ) : active === "grapes" ? (
        <GrapeLibrary grapes={grapes} placesByGrape={placesByGrape} />
      ) : active === "typical" ? (
        <ArchetypeBrowser items={archetypes} />
      ) : (
        <RulesPanel />
      )}
    </div>
  );
}
