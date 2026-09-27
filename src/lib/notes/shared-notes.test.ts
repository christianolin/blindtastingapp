// The shared-notes loaders with the Supabase client replaced by a recording
// fake: no network, no database. What they ask for is the contract the
// "wset notes read" policy then narrows (sharing-defaults spec §7.2, §7.3).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMyHeldNoteIds, getOthersNotesForWine, getProfileNotes } from "./shared-notes";
import { OTHERS_NOTE_SELECT, PROFILE_NOTE_SELECT } from "./shared-notes-view";

type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(read: Result, rpc: Result = { data: [], error: null }) {
  const calls: unknown[][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.limit = async (...args: unknown[]) => {
    calls.push(["limit", ...args]);
    return read;
  };
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push(["rpc", fn, args]);
      return rpc;
    },
  };
  return { client: client as never, calls };
}

const EMPTY_CONTENT = {
  clarity: null,
  appearance_intensity: null,
  colour_hue: null,
  condition: null,
  nose_intensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  alcohol: null,
  body: null,
  mousse: null,
  flavour_intensity: null,
  finish: null,
  price_category: null,
  readiness: null,
  taster_notes: "",
};

const note = (id: string, over: Record<string, unknown> = {}) => ({
  ...EMPTY_CONTENT,
  id,
  author_id: "u2",
  catalog_wine_id: "w1",
  context_kind: "OPEN",
  tasted_on: "2026-09-20",
  created_at: "2026-09-20T10:00:00+00:00",
  quality_score: 88,
  aromas: [],
  author: { id: "u2", display_name: "Gustav", avatar_url: null },
  catalog_wine: {
    wine_name: "Grand Vin",
    vintage_kind: "YEAR",
    vintage_year: 2015,
    vintage_tawny_years: null,
    image_url: null,
    producer: { name: "Château Margaux" },
    appellation: { name: "Margaux AOC" },
  },
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getOthersNotesForWine", () => {
  it("reads this wine's notes by everyone but the viewer, newest first, 200 rows for at most 50 notes", async () => {
    const { client, calls } = fakeClient({ data: [note("n1")], error: null });
    const result = await getOthersNotesForWine(client, "w1", "me");
    expect(calls).toEqual([
      ["from", "wset_notes"],
      ["select", OTHERS_NOTE_SELECT],
      ["eq", "catalog_wine_id", "w1"],
      ["neq", "author_id", "me"],
      ["order", "tasted_on", { ascending: false }],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
      ["limit", 200],
    ]);
    expect(result?.capped).toBe(false);
    expect(result?.rows.map((r) => [r.id, r.author.name, r.score])).toEqual([["n1", "Gustav", "88 · Very good"]]);
  });

  it("caps after dropping empty rows: 60 newer placeholders do not hide an older note", async () => {
    const placeholders = Array.from({ length: 60 }, (_, i) =>
      note(`empty-${String(i).padStart(2, "0")}`, { quality_score: null, tasted_on: "2026-09-26" }),
    );
    const { client } = fakeClient({ data: [...placeholders, note("n1", { tasted_on: "2026-09-01" })], error: null });
    const result = await getOthersNotesForWine(client, "w1", "me");
    expect(result?.rows.map((r) => r.id)).toEqual(["n1"]);
    expect(result?.capped).toBe(false);
  });

  it("shows 50 notes and says the list was cut when more came back", async () => {
    const notes = Array.from({ length: 51 }, (_, i) => note(`n${String(i).padStart(2, "0")}`));
    const { client } = fakeClient({ data: notes, error: null });
    const result = await getOthersNotesForWine(client, "w1", "me");
    expect(result?.rows).toHaveLength(50);
    expect(result?.capped).toBe(true);
  });

  it("answers null on a failed read, never an empty list", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42P01", message: "boom" } });
    await expect(getOthersNotesForWine(client, "w1", "me")).resolves.toBeNull();
  });
});

describe("getProfileNotes", () => {
  it("reads the person's identified notes and asks which are held only on their own profile", async () => {
    const own = fakeClient({ data: [note("n1"), note("n2")], error: null }, { data: ["n2"], error: null });
    const result = await getProfileNotes(own.client, "u2", { own: true });
    expect(own.calls.slice(0, 4)).toEqual([
      ["from", "wset_notes"],
      ["select", PROFILE_NOTE_SELECT],
      ["eq", "author_id", "u2"],
      ["not", "catalog_wine_id", "is", null],
    ]);
    // Only the rows on screen, in their order (newest first; same day, so id desc).
    expect(own.calls).toContainEqual(["rpc", "wset_my_held_notes", { p_note_ids: ["n2", "n1"] }]);
    expect(result?.rows.map((r) => [r.id, r.held])).toEqual([
      ["n2", true],
      ["n1", false],
    ]);

    const other = fakeClient({ data: [note("n1")], error: null });
    await getProfileNotes(other.client, "u2", { own: false });
    expect(other.calls.some((c) => c[0] === "rpc")).toBe(false);
  });

  it("answers null on a failed read", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    await expect(getProfileNotes(client, "u2", { own: true })).resolves.toBeNull();
  });

  it("does not let empty placeholders crowd out a person's notes, and asks about no placeholder", async () => {
    const placeholders = Array.from({ length: 60 }, (_, i) =>
      note(`empty-${String(i).padStart(2, "0")}`, { quality_score: null, tasted_on: "2026-09-26" }),
    );
    const own = fakeClient({ data: [...placeholders, note("real", { tasted_on: "2026-09-01" })], error: null });
    const result = await getProfileNotes(own.client, "u2", { own: true });
    expect(result?.rows.map((r) => r.id)).toEqual(["real"]);
    expect(result?.capped).toBe(false);
    expect(own.calls).toContainEqual(["rpc", "wset_my_held_notes", { p_note_ids: ["real"] }]);
  });
});

describe("getMyHeldNoteIds", () => {
  it("asks nothing for no ids", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await expect(getMyHeldNoteIds(client, [])).resolves.toEqual(new Set());
    expect(calls).toEqual([]);
  });

  it("tags nothing when the read fails", async () => {
    const { client } = fakeClient({ data: null, error: null }, { data: null, error: { message: "boom" } });
    await expect(getMyHeldNoteIds(client, ["n1"])).resolves.toEqual(new Set());
  });
});
