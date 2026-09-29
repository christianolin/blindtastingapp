// The read-only archetype sheet's view of a training-room candidate, and the
// lineage line for an archetype read straight from its reference ids (the
// Library cards, the map's archetype sheet). Training-room spec §4.6, D11.
//
// Pure: relative runtime imports only (vitest has no `@/` alias), so the
// room's client detail sheet and a server page can both use it. pool.ts is
// server-only, which is why this lives here and not there.
import type { ArchetypeView } from "@/components/wset/archetype-sheet";
import { justTheRegionOption } from "../../components/add-wine/self-named-appellation";
import { lineageLine } from "./copy";
import type { Named, TrainingCandidate } from "./types";

/** The reference names a lineage line is made of. */
export type LineageParts = {
  country: Named;
  region: Named;
  appellation: Named;
  primaryGrape: Named;
  secondaryGrape: Named | null;
};

/** The region's own self-named appellation ("Bourgogne AOC" for Bourgogne):
    the lineage then leaves the appellation out (spec §4.6). */
export function isRegionalAppellation(region: Named, appellation: Named): boolean {
  return justTheRegionOption(region, [appellation]) !== null;
}

/**
 * The lineage line from reference names. It goes through copy.ts's
 * lineageLine on purpose: lineageLine reads only the place, grape names and
 * `isRegional`, so the rest of this shell is inert, and the two can never
 * format a lineage differently.
 */
export function lineageForParts(p: LineageParts): string {
  return lineageLine({
    id: "",
    name: "",
    description: null,
    colour: "RED",
    style: "STILL",
    country: p.country,
    region: p.region,
    appellation: { ...p.appellation, isRegional: isRegionalAppellation(p.region, p.appellation) },
    primaryGrape: p.primaryGrape,
    secondaryGrape: p.secondaryGrape,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    mapRegion: null,
    mapPoint: null,
    qualityLow: null,
    qualityHigh: null,
  });
}

/** The ArchetypeSheet view of a pool candidate; its place line is the lineage. */
export function candidateToArchetypeView(c: TrainingCandidate): ArchetypeView {
  const lineage = lineageLine(c);
  return {
    name: c.name,
    colour: c.colour,
    style: c.style,
    placeName: lineage,
    lineage,
    grapes: [c.primaryGrape.name, c.secondaryGrape?.name]
      .filter((g): g is string => Boolean(g))
      .join(" · "),
    description: c.description,
    qualityLow: c.qualityLow,
    qualityHigh: c.qualityHigh,
    sat: c.sat,
    aromas: c.aromas.filter((x) => x.kind === "NOSE").map((x) => x.term),
    flavours: c.aromas.filter((x) => x.kind === "PALATE").map((x) => x.term),
  };
}
