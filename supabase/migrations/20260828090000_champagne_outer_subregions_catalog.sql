-- Champagne — the two outer sub-regions (Cote de Sezanne + Cote des Bar) + the
-- Vallee de la Marne rename, completing the five Champagne sub-regions.
--
-- These two have no Grand/Premier Cru villages, so their boundaries are
-- commune-unions (IGN Admin Express), staged MANUAL and flipped in
-- 20260828093000: Cote des Bar = the 70 Aube (dept 10) member communes; Cote de
-- Sezanne = a best-knowledge commune set (approximate outline). 'Grande Vallee
-- de la Marne' is renamed to 'Vallee de la Marne' (display name only; the
-- canonical key is immutable and unchanged).
do $$
declare
  v_champ uuid;
  v_n int;
begin
  select id into v_champ from wine_places where canonical_key = 'france.champagne' and publication_status = 'VERIFIED';
  if v_champ is null then raise exception 'france.champagne is not VERIFIED'; end if;
  if exists (select 1 from wine_places where canonical_key = any(array['france.champagne.cote-de-sezanne','france.champagne.cote-des-bar'])) then
    raise exception 'champagne outer sub-regions already exist';
  end if;

  update wine_places set name = 'Vallée de la Marne'
   where canonical_key = 'france.champagne.grande-vallee-de-la-marne';

  insert into wine_places (primary_parent_id, kind, canonical_key, name, slug, display_tier, min_zoom, label_min_zoom, publication_status, is_appellation, sort_order)
  values
    (v_champ,'SUBREGION','france.champagne.cote-de-sezanne','Côte de Sézanne','cote-de-sezanne',2,6,6,'DRAFT',false,4),
    (v_champ,'SUBREGION','france.champagne.cote-des-bar','Côte des Bar','cote-des-bar',2,6,6,'DRAFT',false,5);

  select count(*) into v_n from wine_places where canonical_key like 'france.champagne.%' and kind = 'SUBREGION';
  if v_n <> 5 then raise exception 'expected 5 champagne sub-regions, got %', v_n; end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.champagne.grande-vallee-de-la-marne' and name = 'Vallée de la Marne') then
    raise exception 'Vallee de la Marne rename failed';
  end if;
end;
$$;
