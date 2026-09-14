import { describe, expect, it } from "vitest";
import { recordRowModel } from "./record-rows";

const answer = { producer: "Vietti", wineName: "Barolo Castiglione", vintage: "2017", appellation: "Barolo DOCG", region: "Piedmont", grape: "Nebbiolo" };
const base = {
  glass: { number: 3, isRevealed: true, contributor: null, addedWhilePouring: false },
  answer, marks: ["hit", "hit", "miss", "hit", "miss", "near"] as const, points: 16, pickLabel: null,
  mode: "BLIND" as const, viewerRole: "competitor" as const, joinedAfter: false,
};

describe("recordRowModel (S13 rows)", () => {
  it("a never-revealed glass carries no identity, marks or points (rule 1)", () => {
    expect(recordRowModel({ ...base, glass: { ...base.glass, isRevealed: false }, answer: null })).toEqual({ kind: "never-revealed", glass: 3 });
  });
  it("a glass revealed before the viewer joined counts 0", () => {
    expect(recordRowModel({ ...base, joinedAfter: true })).toEqual({ kind: "joined-after", glass: 3, points: 0 });
  });
  it("semi-blind: one mark, 1 / 0, and the pick on a miss", () => {
    expect(recordRowModel({ ...base, mode: "SEMI_BLIND", points: 0, pickLabel: "Brovia, Barolo Villero 2016" }))
      .toMatchObject({ kind: "semi-blind", hit: false, points: 0, pickLabel: "Brovia, Barolo Villero 2016" });
  });
  it("a host-provides host sees identities without marks or points", () => {
    const row = recordRowModel({ ...base, viewerRole: "host-provides-host" });
    expect(row).toMatchObject({ kind: "hosted", glass: 3 });
    expect(row).not.toHaveProperty("marks");
    expect(row).not.toHaveProperty("points");
  });

  // Additional coverage (BT-R3): the happy-path "blind" shape, the identity
  // and meta string formats, provenance, and the "your own bottle" case
  // (RECORD-06 gap (e)) that also routes through the identity-only shape.

  it("blind: full identity, meta, marks and points pass through", () => {
    expect(recordRowModel(base)).toEqual({
      kind: "blind",
      glass: 3,
      identity: "Vietti, Barolo Castiglione 2017",
      meta: "Barolo DOCG · Piedmont · Nebbiolo",
      provenance: null,
      marks: base.marks,
      points: 16,
    });
  });

  it("a nameless wine drops the comma-name half of the identity (D3)", () => {
    const row = recordRowModel({ ...base, answer: { ...answer, wineName: null } });
    expect(row).toMatchObject({ identity: "Vietti 2017" });
  });

  it("a missing appellation just drops its slot in the meta line", () => {
    const row = recordRowModel({ ...base, answer: { ...answer, appellation: null } });
    expect(row).toMatchObject({ meta: "Piedmont · Nebbiolo" });
  });

  it("provenance: a bring-your-own contributor, or added while pouring", () => {
    const brought = recordRowModel({ ...base, glass: { ...base.glass, contributor: "Gustav" } });
    expect(brought).toMatchObject({ provenance: "Gustav brought it" });
    const pouring = recordRowModel({ ...base, glass: { ...base.glass, addedWhilePouring: true } });
    expect(pouring).toMatchObject({ provenance: "added while pouring" });
  });

  it("a competitor's own bottle is identity-only for that one row (RECORD-06 gap e)", () => {
    const row = recordRowModel({ ...base, viewerRole: "spectator" });
    expect(row).toMatchObject({ kind: "hosted", glass: 3 });
    expect(row).not.toHaveProperty("marks");
    expect(row).not.toHaveProperty("points");
  });

  it("a host-provides host of a semi-blind tasting still gets identity-only, not a meaningless hit/miss", () => {
    const row = recordRowModel({ ...base, mode: "SEMI_BLIND", viewerRole: "host-provides-host" });
    expect(row).toMatchObject({ kind: "hosted" });
  });
});
