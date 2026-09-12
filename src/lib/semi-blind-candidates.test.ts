import { describe, expect, it } from "vitest";
import {
  buildCandidateCard,
  compareCandidates,
  sortCandidates,
  vintageLabel,
  type CandidateCard,
  type CandidateInput,
} from "./semi-blind-candidates";

function input(over: Partial<CandidateInput> & { key: string }): CandidateInput {
  return {
    producer: null,
    wineName: null,
    vintageKind: "YEAR",
    vintageYear: 2016,
    vintageTawnyYears: null,
    appellation: null,
    grape: null,
    ...over,
  };
}

const keysOf = (cards: readonly CandidateCard[]) => cards.map((c) => c.key);

// Deterministic PRNG, so a failing shuffle can be replayed from its seed.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// SB1's six bottles, listed here in POUR order. The keys are opaque and
// deliberately do not sort in producer order, so a key-first sort would fail.
const SB1_IN_POUR_ORDER: CandidateInput[] = [
  input({ key: "a1", producer: "Vietti", wineName: "Barolo Castiglione", vintageYear: 2017, appellation: "Barolo DOCG", grape: "Nebbiolo" }),
  input({ key: "f9", producer: "Fèlsina", wineName: "Chianti Classico Riserva", vintageYear: 2018, appellation: "Chianti Classico", grape: "Sangiovese" }),
  input({ key: "z3", producer: "Brovia", wineName: "Barolo Villero", vintageYear: 2016, appellation: "Barolo DOCG", grape: "Nebbiolo" }),
  input({ key: "b2", producer: "Produttori del Barbaresco", wineName: "Barbaresco", vintageYear: 2018, appellation: "Barbaresco DOCG", grape: "Nebbiolo" }),
  input({ key: "c8", producer: "Montevertine", wineName: "Le Pergole Torte", vintageYear: 2015, appellation: "Toscana IGT", grape: "Sangiovese" }),
  input({ key: "e5", producer: "Poggio di Sotto", wineName: "Brunello di Montalcino", vintageYear: 2016, appellation: "Brunello", grape: "Sangiovese" }),
];

const SB1_SORTED_PRODUCERS = [
  "Brovia",
  "Fèlsina",
  "Montevertine",
  "Poggio di Sotto",
  "Produttori del Barbaresco",
  "Vietti",
];

describe("vintageLabel", () => {
  it("writes a year as the year", () => {
    expect(vintageLabel({ kind: "YEAR", year: 2016, tawnyYears: null })).toBe("2016");
  });

  it("writes non-vintage as NV", () => {
    expect(vintageLabel({ kind: "NV", year: null, tawnyYears: null })).toBe("NV");
  });

  it("writes a tawny with its age the way the catalog and cellar do", () => {
    expect(vintageLabel({ kind: "TAWNY", year: null, tawnyYears: 20 })).toBe("20yo");
    expect(vintageLabel({ kind: "TAWNY", year: null, tawnyYears: null })).toBe("Tawny");
  });

  it("reads a tawny age that is not a positive number as no age, and sorts it so", () => {
    expect(vintageLabel({ kind: "TAWNY", year: null, tawnyYears: 0 })).toBe("Tawny");
    expect(vintageLabel({ kind: "TAWNY", year: null, tawnyYears: -10 })).toBe("Tawny");
    const zero = buildCandidateCard(
      input({ key: "a", vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 0 }),
    );
    expect(zero.vintage).toEqual({ kind: "TAWNY", year: null, tawnyYears: null });
    expect(zero.vintageLabel).toBe("Tawny");
    // Hand-built, so the sort cannot lean on buildCandidateCard's cleaning.
    const rawZero: CandidateCard = {
      ...zero,
      key: "b",
      vintage: { kind: "TAWNY", year: null, tawnyYears: 0 },
    };
    const aged = buildCandidateCard(
      input({ key: "c", vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 10 }),
    );
    expect(keysOf(sortCandidates([rawZero, zero, aged]))).toEqual(["c", "a", "b"]);
  });

  it("writes nothing when the vintage is not known yet", () => {
    expect(vintageLabel({ kind: null, year: null, tawnyYears: null })).toBe("");
    expect(vintageLabel({ kind: "YEAR", year: null, tawnyYears: null })).toBe("");
  });
});

describe("buildCandidateCard", () => {
  it("carries producer, wine name, vintage, appellation and grape", () => {
    const card = buildCandidateCard(SB1_IN_POUR_ORDER[2]);
    expect(card).toEqual({
      key: "z3",
      producer: "Brovia",
      wineName: "Barolo Villero",
      vintage: { kind: "YEAR", year: 2016, tawnyYears: null },
      vintageLabel: "2016",
      appellation: "Barolo DOCG",
      grape: "Nebbiolo",
    });
  });

  it("trims text and turns blank text into null, so a card never shows an empty line", () => {
    const card = buildCandidateCard(
      input({ key: "k", producer: "  Vietti ", wineName: "   ", appellation: "", grape: " Nebbiolo" }),
    );
    expect(card.producer).toBe("Vietti");
    expect(card.wineName).toBeNull();
    expect(card.appellation).toBeNull();
    expect(card.grape).toBe("Nebbiolo");
  });

  it("does not carry a year on an NV or tawny card", () => {
    const nv = buildCandidateCard(input({ key: "k", vintageKind: "NV", vintageYear: 2016 }));
    expect(nv.vintage).toEqual({ kind: "NV", year: null, tawnyYears: null });
    const tawny = buildCandidateCard(
      input({ key: "k", vintageKind: "TAWNY", vintageYear: 2016, vintageTawnyYears: 10 }),
    );
    expect(tawny.vintage).toEqual({ kind: "TAWNY", year: null, tawnyYears: 10 });
    expect(tawny.vintageLabel).toBe("10yo");
  });
});

describe("sortCandidates", () => {
  it("lists SB1's bottles alphabetically by producer, not in pour order", () => {
    const sorted = sortCandidates(SB1_IN_POUR_ORDER.map(buildCandidateCard));
    expect(sorted.map((c) => c.producer)).toEqual(SB1_SORTED_PRODUCERS);
  });

  it("folds accents, ligatures and case before comparing producers", () => {
    const sorted = sortCandidates(
      [
        input({ key: "1", producer: "Pieropan" }),
        input({ key: "2", producer: "Ødegaard" }),
        input({ key: "3", producer: "nals Margreid" }),
        input({ key: "4", producer: "Château Palmer" }),
        input({ key: "5", producer: "chateau Latour" }),
        input({ key: "6", producer: "Domaine Leflaive" }),
        input({ key: "7", producer: "de Montille" }),
      ].map(buildCandidateCard),
    );
    expect(sorted.map((c) => c.producer)).toEqual([
      "chateau Latour",
      "Château Palmer",
      "de Montille",
      "Domaine Leflaive",
      "nals Margreid",
      "Ødegaard",
      "Pieropan",
    ]);
  });

  it("breaks a producer tie on the folded wine name", () => {
    const sorted = sortCandidates(
      [
        input({ key: "1", producer: "Vietti", wineName: "Barolo Rocche" }),
        input({ key: "2", producer: "VIETTI", wineName: "barolo castiglione" }),
        input({ key: "3", producer: "Vietti", wineName: "Barbaresco Masseria" }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["3", "2", "1"]);
  });

  it("folds accents in the wine name as well as the producer", () => {
    const sorted = sortCandidates(
      [
        input({ key: "1", producer: "Méo-Camuzet", wineName: "Fixin" }),
        input({ key: "2", producer: "Meo-Camuzet", wineName: "Échézeaux" }),
        input({ key: "3", producer: "MÉO-CAMUZET", wineName: "Corton" }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["3", "2", "1"]);
  });

  it("breaks a producer and name tie on vintage: years ascending, then NV, then tawny by age", () => {
    const same = { producer: "Taylor's", wineName: "Port" };
    const sorted = sortCandidates(
      [
        input({ key: "t20", ...same, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 20 }),
        input({ key: "nv", ...same, vintageKind: "NV", vintageYear: null }),
        input({ key: "y2016", ...same, vintageKind: "YEAR", vintageYear: 2016 }),
        input({ key: "tq", ...same, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: null }),
        input({ key: "y2009", ...same, vintageKind: "YEAR", vintageYear: 2009 }),
        input({ key: "t10", ...same, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 10 }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["y2009", "y2016", "nv", "t10", "t20", "tq"]);
  });

  it("puts a glass whose vintage is still unknown after every known vintage", () => {
    const same = { producer: "Brovia", wineName: "Barolo Villero" };
    const sorted = sortCandidates(
      [
        input({ key: "u2", ...same, vintageKind: null, vintageYear: null }),
        input({ key: "t10", ...same, vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 10 }),
        input({ key: "u1", ...same, vintageKind: "YEAR", vintageYear: null }),
        input({ key: "y2016", ...same, vintageKind: "YEAR", vintageYear: 2016 }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["y2016", "t10", "u1", "u2"]);
  });

  it("puts a missing producer or wine name after the named ones", () => {
    const sorted = sortCandidates(
      [
        input({ key: "1", producer: null, wineName: "Anything" }),
        input({ key: "2", producer: "Vietti", wineName: null }),
        input({ key: "3", producer: "Vietti", wineName: "Barolo Castiglione" }),
        input({ key: "4", producer: "Brovia", wineName: null }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["4", "3", "2", "1"]);
  });

  it("breaks a full tie on the opaque key, by code unit, so every runtime agrees", () => {
    const twin = { producer: "Brovia", wineName: "Barolo Villero", vintageYear: 2016 };
    const sorted = sortCandidates(
      [
        input({ key: "b", ...twin }),
        input({ key: "B", ...twin }),
        input({ key: "a", ...twin }),
      ].map(buildCandidateCard),
    );
    expect(keysOf(sorted)).toEqual(["B", "a", "b"]);
  });

  it("gives the same order for every shuffle of the same cards", () => {
    const cards = [
      ...SB1_IN_POUR_ORDER,
      // Twins that only the key can separate: the case where an unstable or
      // insertion-order tiebreak would leak the pour order.
      input({ key: "q7", producer: null, wineName: null, vintageKind: null, vintageYear: null }),
      input({ key: "q3", producer: null, wineName: null, vintageKind: null, vintageYear: null }),
      input({ key: "m1", producer: "Brovia", wineName: "Barolo Villero", vintageYear: 2016 }),
    ].map(buildCandidateCard);
    const reference = keysOf(sortCandidates(cards));
    const rand = mulberry32(20260912);
    for (let round = 0; round < 250; round++) {
      expect(keysOf(sortCandidates(shuffled(cards, rand)))).toEqual(reference);
    }
    expect(reference).toEqual(["m1", "z3", "f9", "c8", "e5", "b2", "a1", "q3", "q7"]);
  });

  it("never lets pour position influence the order", () => {
    type PouredCard = CandidateCard & { position: number };
    const cards = SB1_IN_POUR_ORDER.map(buildCandidateCard);
    const reference = keysOf(sortCandidates(cards));
    // The fixture's pour order is not alphabetical, so matching it would be a leak.
    expect(reference).not.toEqual(keysOf(cards));

    const rand = mulberry32(42);
    for (let round = 0; round < 100; round++) {
      const positions = shuffled(
        cards.map((_, i) => i + 1),
        rand,
      );
      const poured: PouredCard[] = cards.map((c, i) => ({ ...c, position: positions[i] }));
      // Feed them in pour order, the way a query ordered by position would.
      const inPourOrder = [...poured].sort((a, b) => a.position - b.position);
      const sorted = sortCandidates(inPourOrder);
      expect(keysOf(sorted)).toEqual(reference);
      // Extra fields survive the sort untouched.
      expect(sorted.every((c) => typeof c.position === "number")).toBe(true);
    }
  });

  it("compares two cards the same whatever positions they carry", () => {
    const [a, b] = SB1_IN_POUR_ORDER.slice(0, 2).map(buildCandidateCard);
    const first = compareCandidates({ ...a, position: 1 } as CandidateCard, { ...b, position: 2 } as CandidateCard);
    const swapped = compareCandidates({ ...a, position: 2 } as CandidateCard, { ...b, position: 1 } as CandidateCard);
    expect(Math.sign(first)).toBe(Math.sign(swapped));
    expect(first).not.toBe(0);
  });

  it("is a consistent total order: antisymmetric, and zero only for the same key", () => {
    const cards = [
      ...SB1_IN_POUR_ORDER,
      input({ key: "x", producer: "Brovia", wineName: "Barolo Villero", vintageYear: 2016 }),
      input({ key: "nv", producer: "Brovia", wineName: "Barolo Villero", vintageKind: "NV", vintageYear: null }),
    ].map(buildCandidateCard);
    for (const a of cards) {
      for (const b of cards) {
        const ab = Math.sign(compareCandidates(a, b));
        const ba = Math.sign(compareCandidates(b, a));
        expect(ab).toBe(ba === 0 ? 0 : -ba);
        expect(ab === 0).toBe(a.key === b.key);
      }
    }
  });

  it("returns a new array and leaves the input alone", () => {
    const cards = SB1_IN_POUR_ORDER.map(buildCandidateCard);
    const before = keysOf(cards);
    const sorted = sortCandidates(cards);
    expect(sorted).not.toBe(cards);
    expect(keysOf(cards)).toEqual(before);
  });
});
