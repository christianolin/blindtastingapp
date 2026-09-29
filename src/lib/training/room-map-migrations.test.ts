import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// training-room-map spec §4.1 item 5 and §11: no migration of this spec
// writes wine_places or wine_place_boundaries, so none needs a neighbour-cache
// refresh (CLAUDE.md) and none touches what the tiles are built from. Found by
// name suffix: the versions are re-picked at apply time (spec §4).
const DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const NAMES = [
  "training_archetype_places.sql",
  "training_region_placements.sql",
  "training_room_display_points.sql",
];
const WRITE =
  /\b(insert\s+into|update|delete\s+from|alter\s+table|truncate(\s+table)?|drop\s+table(\s+if\s+exists)?)\s+(public\.)?wine_place(s|_boundaries)\b/i;

const files = readdirSync(DIR).filter((f) => NAMES.some((n) => f.endsWith(`_${n}`)));

describe("the training-room-map migrations", () => {
  it("are all there, once each", () => {
    expect(files.map((f) => f.replace(/^\d{14}_/, "")).sort()).toEqual(NAMES);
  });

  it("the check itself catches a write", () => {
    expect("insert into public.wine_places (id) values (1)").toMatch(WRITE);
    expect("UPDATE wine_place_boundaries set is_current = false").toMatch(WRITE);
    expect("join public.wine_places p on p.id = x.wine_place_id").not.toMatch(WRITE);
  });

  for (const f of files) {
    it(`${f} writes neither wine_places nor wine_place_boundaries`, () => {
      const sql = readFileSync(DIR + f, "utf8").replace(/--[^\n]*/g, "");
      expect(sql).not.toMatch(WRITE);
    });
  }
});
