// How a wine is labelled in the UI.
//  - HOST_PROVIDES: "Wine {position}".
//  - PARTICIPANT_CONTRIBUTED: "{contributor}'s wine", or "{contributor}'s
//    wine #N" when that person brought more than one (numbered in serving
//    order among their own bottles).
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
  const totalByContributor = new Map<string, number>();
  for (const w of wines) {
    if (w.contributor_participant_id) {
      totalByContributor.set(
        w.contributor_participant_id,
        (totalByContributor.get(w.contributor_participant_id) ?? 0) + 1,
      );
    }
  }

  // Ordinal within each contributor's own bottles, assigned in serving order.
  const ordinalByWineId = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const w of [...wines].sort((a, b) => a.position - b.position)) {
    if (w.contributor_participant_id) {
      const n = (seen.get(w.contributor_participant_id) ?? 0) + 1;
      seen.set(w.contributor_participant_id, n);
      ordinalByWineId.set(w.id, n);
    }
  }

  return (wine: WineRow) => {
    if (wineSource === "PARTICIPANT_CONTRIBUTED" && wine.contributor_participant_id) {
      const who =
        nameByParticipantId.get(wine.contributor_participant_id) ?? "Someone";
      const total = totalByContributor.get(wine.contributor_participant_id) ?? 1;
      const n = ordinalByWineId.get(wine.id) ?? 1;
      return total > 1 ? `${who}'s wine #${n}` : `${who}'s wine`;
    }
    return `Wine ${wine.position}`;
  };
}
