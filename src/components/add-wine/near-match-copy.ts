// "Already in the catalog?" copy (catalog dedupe, owner 2026-10-03). Provisional:
// the owner approves user-facing copy. Destination-dependent words (the "use this
// wine" button) live in the matrix (`nearMatchUse`); everything here is the same
// for every destination. Pure: vitest loads it.
export const nearMatchCopy = {
  title: "Already in the catalog?",
  lead: "These look close. Use one if it is your bottle, so the catalog keeps one entry per wine.",
  winesEyebrow: "In the catalog",
  didYouMean: (name: string) => `Did you mean ${name}?`,
  producerMeta: (regionName: string | null, wineCount: number) =>
    [regionName, `${wineCount} ${wineCount === 1 ? "wine" : "wines"} in the catalog`].filter(Boolean).join(" · "),
  differs: (differences: readonly string[]) => `Differs: ${differences.join(" · ")}`,
  addAsVintage: (vintage: string) => `Add it as ${vintage}`,
  /** The use button on a row in another vintage: using it says the bottle IS that vintage. */
  useOtherVintage: (vintage: string) => `Mine is the ${vintage}`,
  /** After "Did you mean …?": the form shows the swapped producer for a check before anything is saved. */
  producerSwapped: (name: string) => `Producer set to ${name}. Check the wine, then save.`,
  addNew: "Add as a new wine",
  addNewHint: "Only if none of these is your bottle.",
  back: "Back",
} as const;
