import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import {
  DRAFT_KEY_PREFIX,
  clearDraft,
  draftClearedBy,
  draftKey,
  newSessionKey,
  readDraft,
  writeDraft,
} from "./draft";
import type { TrainingDraft } from "./types";

// The device draft (spec D13): one JSON value per user, never on the server.

function fakeStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return { store, get: () => storage };
}

const USER = "11111111-2222-4333-8444-555555555555";

function draft(patch: Partial<TrainingDraft> = {}): TrainingDraft {
  return {
    userId: USER,
    sessionKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
    startedAt: "2026-09-24T18:14:00.000Z",
    note: { ...emptyNoteState(), tannin: "HIGH", noseTermIds: ["t1"] },
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    pickedRegionId: "region-bordeaux",
    pickedGrapeId: null,
    vintage: { kind: "YEAR", year: 2016 },
    ...patch,
  };
}

describe("draftKey", () => {
  it("is blindr-training-draft:<userId>", () => {
    expect(DRAFT_KEY_PREFIX).toBe("blindr-training-draft:");
    expect(draftKey(USER)).toBe(`blindr-training-draft:${USER}`);
  });
});

describe("write, read, clear", () => {
  it("round-trips a draft", () => {
    const s = fakeStorage();
    expect(writeDraft(draft(), s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toEqual(draft());
  });

  it("keeps NV, tawny and no vintage, and no pick", () => {
    const s = fakeStorage();
    for (const vintage of [{ kind: "NV" } as const, { kind: "TAWNY", years: 20 } as const, null]) {
      writeDraft(draft({ vintage, pickedArchetypeId: null }), s.get);
      expect(readDraft(USER, s.get)?.vintage).toEqual(vintage);
      expect(readDraft(USER, s.get)?.pickedArchetypeId).toBeNull();
    }
  });

  it("keeps a pick that stopped at the region, with or without a grape", () => {
    const s = fakeStorage();
    const regionPick = { pickedArchetypeId: null, pickedRegionId: "region-bourgogne", pickedGrapeId: "grape-chardonnay" };
    writeDraft(draft(regionPick), s.get);
    expect(readDraft(USER, s.get)).toEqual(draft(regionPick));
    writeDraft(draft({ ...regionPick, pickedGrapeId: null }), s.get);
    expect(readDraft(USER, s.get)?.pickedGrapeId).toBeNull();
  });

  it("reads a draft saved before the region step with no region and no grape", () => {
    const s = fakeStorage();
    const older: Record<string, unknown> = { ...draft() };
    delete older.pickedRegionId;
    delete older.pickedGrapeId;
    s.get().setItem(draftKey(USER), JSON.stringify(older));
    const read = readDraft(USER, s.get);
    expect(read?.pickedArchetypeId).toBe("arch-margaux");
    expect(read?.pickedRegionId).toBeNull();
    expect(read?.pickedGrapeId).toBeNull();
  });

  it("clears only this user's draft", () => {
    const s = fakeStorage();
    writeDraft(draft(), s.get);
    writeDraft(draft({ userId: "other" }), s.get);
    expect(clearDraft(USER, s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toBeNull();
    expect([...s.store.keys()]).toEqual(["blindr-training-draft:other"]);
  });

  it("reads null when there is no draft or no storage", () => {
    expect(readDraft(USER, fakeStorage().get)).toBeNull();
    expect(readDraft(USER, () => null)).toBeNull();
    expect(readDraft(USER, () => { throw new Error("SecurityError"); })).toBeNull();
    expect(writeDraft(draft(), () => null)).toBe(false);
  });

  it("fills a note saved by an older build from the empty note", () => {
    const s = fakeStorage();
    const old = draft();
    const olderNote: Record<string, unknown> = { ...old.note };
    delete olderNote.mousse;
    delete olderNote.tanninNature;
    s.get().setItem(draftKey(USER), JSON.stringify({ ...old, note: olderNote }));
    const read = readDraft(USER, s.get);
    expect(read?.note.mousse).toBeNull();
    expect(read?.note.tanninNature).toEqual([]);
    expect(read?.note.tannin).toBe("HIGH");
  });

  it("refuses a malformed draft", () => {
    const s = fakeStorage();
    const put = (v: unknown) => s.get().setItem(draftKey(USER), typeof v === "string" ? v : JSON.stringify(v));
    const bad: unknown[] = [
      "not json",
      "",
      "null",
      draft({ userId: "someone-else" }),
      draft({ sessionKey: "not-a-uuid" }),
      draft({ startedAt: "yesterday" }),
      { ...draft(), note: null },
      { ...draft(), note: { ...draft().note, noseTermIds: "t1" } },
      { ...draft(), extras: { bubbles: "yes", fortified: null } },
      { ...draft(), pickedArchetypeId: 42 },
      { ...draft(), pickedRegionId: 7 },
      { ...draft(), pickedGrapeId: { id: "grape-chardonnay" } },
      { ...draft(), vintage: { kind: "YEAR" } },
      { ...draft(), vintage: { kind: "MAGNUM" } },
    ];
    for (const v of bad) {
      put(v);
      expect(readDraft(USER, s.get)).toBeNull();
    }
  });
});

describe("newSessionKey", () => {
  it("mints a v4 uuid, different each time", () => {
    const a = newSessionKey();
    const b = newSessionKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("draftClearedBy (the storage listener)", () => {
  it("is true when another tab removed this user's draft or cleared storage", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: null }, USER)).toBe(true);
    expect(draftClearedBy({ key: draftKey(USER), newValue: "" }, USER)).toBe(true);
    expect(draftClearedBy({ key: null, newValue: null }, USER)).toBe(true);
  });
  it("is false for a write to the draft or another key", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: "{}" }, USER)).toBe(false);
    expect(draftClearedBy({ key: draftKey("other"), newValue: null }, USER)).toBe(false);
    expect(draftClearedBy({ key: "blindr-theme", newValue: null }, USER)).toBe(false);
  });
});
