// The reference sets US-1 asserts before and after (spec §6.3). One source for
// the read-only builder, the rendered SQL and the rehearsal, so they cannot
// drift. $1 = region ids (uuid[]), $2 = appellation ids (uuid[]); one jsonb
// column "refs". History payloads (label_reads, catalog_wine_edits) are not
// references: they keep old ids on purpose.
const agg = (fields, order) => `coalesce(jsonb_agg(jsonb_build_object(${fields}) order by ${order}), '[]'::jsonb) as refs`;
const FK3 = "'id', id, 'region_id', region_id, 'appellation_id', appellation_id";

export const REF_QUERIES = [
  ["catalog_wines", `select ${agg(FK3, "id")} from catalog_wines where region_id = any ($1) or appellation_id = any ($2)`],
  ["catalog_wines_unidentified", `select ${agg(FK3, "id")} from catalog_wines_unidentified where region_id = any ($1) or appellation_id = any ($2)`],
  ["wine_answers", `select ${agg("'wine_id', wine_id, 'region_id', region_id, 'appellation_id', appellation_id", "wine_id")} from wine_answers where region_id = any ($1) or appellation_id = any ($2)`],
  ["guesses", `select ${agg(`${FK3}, 'total_points', total_points`, "id")} from guesses where region_id = any ($1) or appellation_id = any ($2)`],
  ["wine_archetypes", `select ${agg(FK3, "id")} from wine_archetypes where region_id = any ($1) or appellation_id = any ($2)`],
  ["label_lookups", `select ${agg(FK3, "id")} from label_lookups where region_id = any ($1) or appellation_id = any ($2)`],
  ["profile_favourite_regions", `select ${agg("'profile_id', profile_id, 'region_id', region_id", "profile_id, region_id")} from profile_favourite_regions where region_id = any ($1)`],
  ["training_attempts", `select ${agg("'id', id, 'picked_region_id', picked_region_id", "id")} from training_attempts where picked_region_id = any ($1)`],
  ["type_designations", `select ${agg("'id', id, 'region_id', region_id", "id")} from type_designations where region_id = any ($1)`],
  ["wine_identity_drafts", `select ${agg("'wine_id', wine_id, 'region_id', draft ->> 'regionId', 'appellation_id', draft ->> 'appellationId'", "wine_id")} from wine_identity_drafts where draft ->> 'regionId' = any ($1::text[]) or draft ->> 'appellationId' = any ($2::text[])`],
];

export const REF_SORT = {
  catalog_wines: ["id"], catalog_wines_unidentified: ["id"], wine_answers: ["wine_id"], guesses: ["id"],
  wine_archetypes: ["id"], label_lookups: ["id"], profile_favourite_regions: ["profile_id", "region_id"],
  training_attempts: ["id"], type_designations: ["id"], wine_identity_drafts: ["wine_id"],
};

export function plpgsqlRefArray() {
  for (const [, q] of REF_QUERIES) if (q.includes("$q$")) throw new Error("a reference query contains $q$");
  return `array[\n${REF_QUERIES.map(([t, q]) => `    '${t}', $q$${q}$q$`).join(",\n")}\n  ]`;
}
