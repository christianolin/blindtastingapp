-- region_grapes (20260914131500) lists only one colour's grapes for a handful of
-- regions that clearly grow both — surfaced by an owner report: a scanned L.A.
-- Cetto Brut (Mexico, Baja California, sparkling white) came back with no grape,
-- because Baja California's only curated rows are Cabernet Sauvignon and
-- Tempranillo (both red), so the add-wine by-hand form's new "Common in {region}"
-- grape chips (src/components/add-wine/by-hand-form.tsx) had nothing white to
-- offer. This adds the missing colour's established grapes, ACCESSORY, to that
-- region and a small number of other regions in the same table with the same
-- one-colour-only gap for a region that is clearly known for both:
--   - Mexico / Baja California: white grapes alongside its reds (L.A. Cetto and
--     others make Chenin Blanc and sparkling wine there).
--   - Italy / Piemonte: Moscato (Moscato d'Asti / Asti Spumante) alongside its
--     reds (Nebbiolo, Barbera, Dolcetto).
--   - Italy / Lombardia: Chardonnay, the Franciacorta sparkling base, alongside
--     its reds (Nebbiolo, Pinot Nero).
--   - New Zealand / Hawke's Bay: Chardonnay alongside its Bordeaux-blend and
--     Syrah reds — one of the country's few regions well known for both.
--   - United States / Washington: Riesling — Washington is one of the largest US
--     Riesling producers — alongside its Cabernet Sauvignon/Merlot/Syrah reds.
--   - Canada / British Columbia: Riesling alongside its Pinot Noir/Merlot reds —
--     the Okanagan Valley is known for both.
-- Every added grape (Chardonnay, Chenin Blanc, Sauvignon Blanc, Moscato,
-- Riesling) is already present in public.grapes and already used by
-- 20260914131500's own pairs, so no new grape rows are needed here. Curated
-- from the assistant's own wine knowledge only (no Anthropic API, no web
-- search, AGENTS.md's cost rules) — accuracy over breadth, so plenty of other
-- single-colour rows in region_grapes are left as they are: they are correctly
-- single-colour regions (Bordeaux-red Ribera del Duero, all-white Mosel, and so
-- on), not gaps.
--
-- Same conventions as 20260914131500: exact-name joins on country + region +
-- grape, on conflict do nothing, and a fail-closed assert that the inserted
-- row count equals the staged VALUES count.
--
-- No begin/commit: the applier wraps the file in one transaction.

do $$
declare
  v_values_count constant int := 8;
  v_inserted_count int;
begin
  create temporary table _region_grapes_both_colours_pairs (
    country_name text not null,
    region_name text not null,
    grape_name text not null,
    role text not null
  ) on commit drop;

  insert into _region_grapes_both_colours_pairs (country_name, region_name, grape_name, role) values
    ('Mexico', 'Baja California', 'Chardonnay', 'ACCESSORY'),
    ('Mexico', 'Baja California', 'Chenin Blanc', 'ACCESSORY'),
    ('Mexico', 'Baja California', 'Sauvignon Blanc', 'ACCESSORY'),
    ('Italy', 'Piemonte', 'Moscato', 'ACCESSORY'),
    ('Italy', 'Lombardia', 'Chardonnay', 'ACCESSORY'),
    ('New Zealand', 'Hawke''s Bay', 'Chardonnay', 'ACCESSORY'),
    ('United States', 'Washington', 'Riesling', 'ACCESSORY'),
    ('Canada', 'British Columbia', 'Riesling', 'ACCESSORY');

  if (select count(*) from _region_grapes_both_colours_pairs) <> v_values_count then
    raise exception '20260915120000: staged % pairs, expected % (duplicate VALUES row?)',
      (select count(*) from _region_grapes_both_colours_pairs), v_values_count;
  end if;

  insert into public.region_grapes (region_id, grape_id, role)
  select r.id, g.id, p.role
  from _region_grapes_both_colours_pairs p
  join public.countries c on c.name = p.country_name
  join public.regions r on r.country_id = c.id and r.name = p.region_name
  join public.grapes g on g.name = p.grape_name
  on conflict (region_id, grape_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> v_values_count then
    raise exception '20260915120000: inserted % of % curated region_grapes pairs — % did not match a country+region+grape by exact name (or were already present)',
      v_inserted_count, v_values_count, v_values_count - v_inserted_count;
  end if;
end $$;
