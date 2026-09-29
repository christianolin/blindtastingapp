import assert from "node:assert/strict";
import test from "node:test";
import { articleInsertLines } from "./gen-place-profiles-sql.mjs";

const base = { description: "D's text", climate: "C", soils: "S", key_facts: ["a", "b's", "c"] };

test("an article without the two texts renders exactly as before", () => {
  assert.deepEqual(articleInsertLines("germany.ahr", base), [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)",
    "select id, 'D''s text', 'C', 'S', array['a', 'b''s', 'c']::text[], 'PUBLISHED'",
    "  from public.wine_places where canonical_key = 'germany.ahr';",
  ]);
});

test("grape_varieties and wine_styles add their columns", () => {
  assert.deepEqual(articleInsertLines("united-states", { ...base, grape_varieties: "G", wine_styles: "W" }), [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, grape_varieties, wine_styles, key_facts, editorial_status)",
    "select id, 'D''s text', 'C', 'S', 'G', 'W', array['a', 'b''s', 'c']::text[], 'PUBLISHED'",
    "  from public.wine_places where canonical_key = 'united-states';",
  ]);
});
