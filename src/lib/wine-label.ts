// How a wine is labelled in the UI.
//  - HOST_PROVIDES: "Wine {n}", n being the wine's place in list order —
//    sorted by position and counted from 1, never the raw stored position
//    (positions can have gaps or start at 0; every surface numbers by list
//    order).
//  - PARTICIPANT_CONTRIBUTED: "{contributor}'s wine", or "{contributor}'s
//    wine #N" when that person brought more than one (numbered in serving
//    order among their own bottles).
// Pass the tasting's whole wine list: both numbers are ranks within it.
type WineRow = {
  id: string;
  position: number;
  contributor_participant_id: string | null;
};

export function makeWineLabeler(
  wines: WineRow[],
  wineSource: "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED",
  nameByParticipantId: Map<string, string>,
) {
  // One pass in serving order gives each wine its place in the whole list and
  // its ordinal among its contributor's own bottles; the per-contributor count
  // it ends on is that contributor's total.
  const numberByWineId = new Map<string, number>();
  const ordinalByWineId = new Map<string, number>();
  const totalByContributor = new Map<string, number>();
  [...wines]
    .sort((a, b) => a.position - b.position)
    .forEach((w, index) => {
      numberByWineId.set(w.id, index + 1);
      const contributor = w.contributor_participant_id;
      if (contributor) {
        const n = (totalByContributor.get(contributor) ?? 0) + 1;
        totalByContributor.set(contributor, n);
        ordinalByWineId.set(w.id, n);
      }
    });

  return (wine: WineRow) => {
    if (wineSource === "PARTICIPANT_CONTRIBUTED" && wine.contributor_participant_id) {
      const who =
        nameByParticipantId.get(wine.contributor_participant_id) ?? "Someone";
      const total = totalByContributor.get(wine.contributor_participant_id) ?? 1;
      const n = ordinalByWineId.get(wine.id) ?? 1;
      return total > 1 ? `${who}'s wine #${n}` : `${who}'s wine`;
    }
    // A wine that was not in the list has no place in it; its stored position
    // is the only number left.
    return `Wine ${numberByWineId.get(wine.id) ?? wine.position}`;
  };
}
