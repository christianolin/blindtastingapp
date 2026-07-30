-- Cellar import: resolve a name-based row (from a CellarTracker-style CSV) into
-- a lot. import_cellar_lot find-or-creates the reference rows (country/region/
-- appellation/producer/grape) by name, then the catalog identity, then the lot.
-- Required geography/grape fall back so the fully-identified catalog_wines
-- constraints are satisfied. Name matching is case-insensitive and best-effort.
create or replace function import_cellar_lot(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_country_name     text := nullif(btrim(p->>'country'), '');
  v_region_name      text := nullif(btrim(p->>'region'), '');
  v_appellation_name text := nullif(btrim(p->>'appellation'), '');
  v_producer_name    text := nullif(btrim(p->>'producer'), '');
  v_grape_name       text := coalesce(nullif(btrim(p->>'grape'), ''), 'Unknown');
  v_country uuid; v_region uuid; v_appellation uuid; v_producer uuid; v_grape uuid;
  v_wine uuid;
  v_qty int := coalesce((p->>'quantity')::int, 1);
  v_currency text;
  v_lot uuid;
begin
  if v_country_name is null then raise exception 'country is required'; end if;
  if v_producer_name is null then raise exception 'producer is required'; end if;
  v_region_name := coalesce(v_region_name, v_country_name);
  v_appellation_name := coalesce(v_appellation_name, v_region_name);

  select id into v_country from countries
    where lower(btrim(name)) = lower(v_country_name) limit 1;
  if v_country is null then
    insert into countries (name) values (v_country_name) returning id into v_country;
  end if;

  select id into v_region from regions
    where country_id = v_country and lower(btrim(name)) = lower(v_region_name) limit 1;
  if v_region is null then
    insert into regions (country_id, name) values (v_country, v_region_name) returning id into v_region;
  end if;

  select id into v_appellation from appellations
    where region_id = v_region and lower(btrim(name)) = lower(v_appellation_name) limit 1;
  if v_appellation is null then
    insert into appellations (region_id, name) values (v_region, v_appellation_name) returning id into v_appellation;
  end if;

  select id into v_producer from producers
    where lower(btrim(name)) = lower(v_producer_name) limit 1;
  if v_producer is null then
    insert into producers (name) values (v_producer_name) returning id into v_producer;
  end if;

  select id into v_grape from grapes
    where lower(btrim(name)) = lower(v_grape_name) limit 1;
  if v_grape is null then
    insert into grapes (name) values (v_grape_name) returning id into v_grape;
  end if;

  v_wine := find_or_create_catalog_wine(jsonb_build_object(
    'country_id', v_country, 'region_id', v_region, 'appellation_id', v_appellation,
    'primary_grape_id', v_grape, 'producer_id', v_producer,
    'colour', coalesce(nullif(p->>'colour', ''), 'RED'),
    'style', coalesce(nullif(p->>'style', ''), 'STILL'),
    'wine_name', nullif(btrim(p->>'wine_name'), ''),
    'vintage_kind', coalesce(nullif(p->>'vintage_kind', ''), 'NV'),
    'vintage_year', nullif(p->>'vintage_year', '')::int
  ));

  select coalesce(nullif(p->>'currency', ''), preferred_currency, 'DKK')
    into v_currency from profiles where id = auth.uid();

  insert into cellar_lots (
    owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity,
    price_per_bottle, currency, purchased_on, purchase_source, drink_from, drink_to,
    storage_location, lot_note
  ) values (
    auth.uid(), v_wine, coalesce((p->>'bottle_size_ml')::int, 750),
    v_qty, v_qty,
    nullif(p->>'price_per_bottle', '')::numeric, coalesce(v_currency, 'DKK'),
    nullif(p->>'purchased_on', '')::date, nullif(p->>'purchase_source', ''),
    nullif(p->>'drink_from', '')::int, nullif(p->>'drink_to', '')::int,
    nullif(p->>'storage_location', ''), nullif(p->>'lot_note', '')
  ) returning id into v_lot;
  return v_lot;
end $$;
grant execute on function import_cellar_lot(jsonb) to authenticated;

-- Bulk wrapper: import an array of rows, one savepoint per row so a bad row
-- (and any reference rows it created) rolls back without failing the batch.
-- Returns { imported, failed, errors: [{ row, error }] }.
create or replace function import_cellar_lots(rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  v_imported int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i int := 0;
begin
  for r in select value from jsonb_array_elements(rows) loop
    v_i := v_i + 1;
    begin
      perform import_cellar_lot(r);
      v_imported := v_imported + 1;
    exception
      when others then
        v_failed := v_failed + 1;
        if jsonb_array_length(v_errors) < 25 then
          v_errors := v_errors || jsonb_build_object('row', v_i, 'error', SQLERRM);
        end if;
    end;
  end loop;
  return jsonb_build_object('imported', v_imported, 'failed', v_failed, 'errors', v_errors);
end $$;
grant execute on function import_cellar_lots(jsonb) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'import_cellar_lot') then
    raise exception 'final-state: import_cellar_lot missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'import_cellar_lots') then
    raise exception 'final-state: import_cellar_lots missing'; end if;
end $$;
