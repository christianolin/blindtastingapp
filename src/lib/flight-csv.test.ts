import { describe, expect, it } from "vitest";
import { exportAllowed, flightCsvRows, glassesNeedingNotes, type CsvAnswer, type CsvGlass } from "./flight-csv";

const answer: CsvAnswer = {
  producer: "Vietti", wineName: "Barolo Castiglione", vintage: "2017", country: "Italy", region: "Piedmont",
  appellation: "Barolo DOCG", primaryGrape: "Nebbiolo", secondaryGrape: null, typeDesignation: null,
};
const glasses: CsvGlass[] = [
  { glass: 1, wineId: "w1", isRevealed: true, broughtBy: "Gustav", viewerPoints: 18 },
  { glass: 2, wineId: "w2", isRevealed: false, broughtBy: "Maja", viewerPoints: null },
];
const answers = new Map([["w1", answer], ["w2", answer]]);
const byoCompetitor = { role: "competitor", wineSource: "PARTICIPANT_CONTRIBUTED" } as const;

describe("flight CSV (S13; rule 1)", () => {
  it("a never-revealed glass is only its number and 'no', even when the loader holds its answer", () => {
    const rows = flightCsvRows({ glasses, answersByWineId: answers, viewer: byoCompetitor });
    expect(rows[2]).toEqual([2, "no", "", "", "", "", "", "", "", "", "", "", ""]);
    expect(rows[1].slice(0, 3)).toEqual([1, "yes", "Vietti"]);
  });
  it("'brought by' only in bring-your-own; 'your points' only for someone who competed", () => {
    expect(flightCsvRows({ glasses, answersByWineId: answers, viewer: byoCompetitor })[0].slice(-2)).toEqual(["brought by", "your points"]);
    const hosted = flightCsvRows({ glasses, answersByWineId: answers, viewer: { role: "host-provides-host", wineSource: "HOST_PROVIDES" } });
    expect(hosted[0]).not.toContain("brought by");
    expect(hosted[0]).not.toContain("your points");
  });
  it("exports only a CLOSED tasting, to its host or a JOINED participant", () => {
    expect(exportAllowed({ status: "CLOSED", viewerRole: "competitor" })).toBe(true);
    expect(exportAllowed({ status: "CLOSED", viewerRole: "host-provides-host" })).toBe(true);
    expect(exportAllowed({ status: "IN_PROGRESS", viewerRole: "host" })).toBe(false);
    expect(exportAllowed({ status: "CLOSED", viewerRole: "other" })).toBe(false);
  });
  it("Save all saves only glasses without a note, so a second tap saves nothing", () => {
    expect(glassesNeedingNotes(["w1", "w2", "w3"], new Set(["w2"]))).toEqual(["w1", "w3"]);
    expect(glassesNeedingNotes(["w1", "w3"], new Set(["w1", "w3"]))).toEqual([]);
  });
});
