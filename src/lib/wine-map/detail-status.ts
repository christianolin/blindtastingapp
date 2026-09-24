// The one-line status under the Map detail switch (spec 2026-09-23 §7.1). It
// says in words what the map is doing: which country has subregions, why none
// has, or that All countries is on and costs more. Switching modes always
// changes it at once, so the switch never looks broken at a zoom where the map
// itself would not change. The copy is owner-approved and pinned by
// detail-status.test.ts. Change it there first.

/** The owner's warning for All countries, verbatim. It is shown in the status
    line while All is on, and it is the All option's accessible description. */
export const DETAIL_WARNING = "Uses more resources and can cause lag.";

export type DetailStatus = { text: string; retry: boolean };

/**
 * `focusName` is the focus country as the viewer sees it (local or English).
 * `depthVisible` means the map's scan saw that country's tier >= 2 features
 * on screen. `pastDepthZoom` is true once the map is at or above
 * NEIGHBOUR_MIN_ZOOM (8, `./mount-policy`) — deep enough that "zoom in more"
 * stops being useful advice; Task 23 passes it from the live map zoom.
 * `retry` asks the UI for a Retry button beside the text.
 *
 * Known wording limitation (raised with the owner): the place tree carries no
 * min_zoom, so "not drawn yet" and "none here" would otherwise look the same.
 * Below NEIGHBOUR_MIN_ZOOM an undrawn focus country still gets "Zoom in to see
 * {F}'s subregions." — more zoom may yet reveal them. At or above
 * NEIGHBOUR_MIN_ZOOM, a focus country whose on-screen regions have no tier >= 2
 * places in the catalogue (Baden, Franken, Navarra, Saale-Unstrut and
 * Württemberg today) instead gets "No subregions mapped here for {F} yet.",
 * since by then more zoom will not help (controller ruling R3).
 */
export function detailStatus(input: {
  tree: "loading" | "ready" | "failed";
  detail: "one" | "all";
  fellBack: boolean;
  focusName: string | null;
  depthVisible: boolean;
  otherCountriesInView: boolean;
  pastDepthZoom: boolean;
}): DetailStatus {
  if (input.tree === "loading") return { text: "", retry: false };
  if (input.tree === "failed") {
    return { text: "Subregion detail couldn't load.", retry: true };
  }
  if (input.fellBack) {
    return { text: "Switched to One country after a problem last time.", retry: false };
  }
  if (input.detail === "all") {
    return { text: `Subregions for all countries. ${DETAIL_WARNING}`, retry: false };
  }
  if (!input.focusName) {
    return {
      text: "Zoom in on a country, or tap one below, to see its subregions.",
      retry: false,
    };
  }
  if (!input.depthVisible) {
    if (input.pastDepthZoom) {
      return { text: `No subregions mapped here for ${input.focusName} yet.`, retry: false };
    }
    return { text: `Zoom in to see ${input.focusName}'s subregions.`, retry: false };
  }
  return {
    text: input.otherCountriesInView
      ? `Subregions: ${input.focusName}. Other countries show regions only.`
      : `Subregions: ${input.focusName}.`,
    retry: false,
  };
}
