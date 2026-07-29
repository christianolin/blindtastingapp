-- Backfill: link every historical wine_answers row to a catalog wine, then make
-- the link mandatory. Each answer resolves to an existing catalog wine matching
-- its identity tuple, or a new one created with the tasting host as author.
-- Deduped: identical identity tuples collapse to one catalog wine. Idempotent —
-- the loop is skipped once no unlinked answers remain, and SET NOT NULL is a
-- no-op when already enforced.

do $$
declare
  r record;
  v_id uuid;
begin
  if not exists (select 1 from wine_answers where catalog_wine_id is null) then
    return;
  end if;

  for r in
    select wa.wine_id, wa.country_id, wa.region_id, wa.appellation_id,
           wa.primary_grape_id, wa.secondary_grape_id, wa.producer_id,
           wa.type_designation_id, wa.vintage_kind, wa.vintage_year,
           wa.vintage_tawny_years, t.host_id
    from wine_answers wa
    join wines w on w.id = wa.wine_id
    join tastings t on t.id = w.tasting_id
    where wa.catalog_wine_id is null
  loop
    select c.id into v_id
    from catalog_wines c
    where c.merged_into is null
      and c.country_id          is not distinct from r.country_id
      and c.region_id           is not distinct from r.region_id
      and c.appellation_id      is not distinct from r.appellation_id
      and c.primary_grape_id    is not distinct from r.primary_grape_id
      and c.secondary_grape_id  is not distinct from r.secondary_grape_id
      and c.producer_id         is not distinct from r.producer_id
      and c.type_designation_id is not distinct from r.type_designation_id
      and c.vintage_kind        is not distinct from r.vintage_kind
      and c.vintage_year        is not distinct from r.vintage_year
      and c.vintage_tawny_years is not distinct from r.vintage_tawny_years
    order by c.created_at
    limit 1;

    if v_id is null then
      insert into catalog_wines (
        country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
        producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
        created_by
      ) values (
        r.country_id, r.region_id, r.appellation_id, r.primary_grape_id, r.secondary_grape_id,
        r.producer_id, r.type_designation_id, r.vintage_kind, r.vintage_year, r.vintage_tawny_years,
        r.host_id
      ) returning id into v_id;
    end if;

    update wine_answers set catalog_wine_id = v_id where wine_id = r.wine_id;
  end loop;
end $$;

alter table wine_answers alter column catalog_wine_id set not null;

-- Final-state asserts.
do $$
declare v_null int;
begin
  select count(*) into v_null from wine_answers where catalog_wine_id is null;
  if v_null <> 0 then
    raise exception 'final-state: % wine_answers still have no catalog link', v_null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wine_answers'
      and column_name = 'catalog_wine_id' and is_nullable = 'YES'
  ) then raise exception 'final-state: wine_answers.catalog_wine_id must be NOT NULL'; end if;
end $$;
