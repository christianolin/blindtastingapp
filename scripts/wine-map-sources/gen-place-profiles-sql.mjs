// The generator's article insert, pure so it can be tested. An article that
// carries grape_varieties / wine_styles (the explorer shows them only when a
// place has no structured grape/style rows) gets those columns; any other
// article renders exactly as the generator always has.
export const sq = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);

export function articleInsertLines(key, a) {
  const facts = a.key_facts.map((f) => sq(f)).join(", ");
  if (a.grape_varieties === undefined && a.wine_styles === undefined) {
    return [
      "insert into public.wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)",
      `select id, ${sq(a.description)}, ${sq(a.climate)}, ${sq(a.soils)}, array[${facts}]::text[], 'PUBLISHED'`,
      `  from public.wine_places where canonical_key = ${sq(key)};`,
    ];
  }
  return [
    "insert into public.wine_place_articles (wine_place_id, description, climate, soils, grape_varieties, wine_styles, key_facts, editorial_status)",
    `select id, ${sq(a.description)}, ${sq(a.climate)}, ${sq(a.soils)}, ${sq(a.grape_varieties ?? null)}, ${sq(a.wine_styles ?? null)}, array[${facts}]::text[], 'PUBLISHED'`,
    `  from public.wine_places where canonical_key = ${sq(key)};`,
  ];
}
