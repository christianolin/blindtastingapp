-- Type designations: "Cru Classé de Graves" (data only).
--
-- Owner, 2026-09-28: "yes add Cru Classé de Graves". The typical-wine audit
-- (20260928120000) left the Pessac-Léognan typical wines without a designation
-- because their label term, the Graves classification's "Cru Classé de Graves",
-- was no type_designations row; "Grand Cru Classé" is the 1855 and Saint-Émilion
-- term. The Graves classification (INAO jury; approved by arrêté of 7 August
-- 1953, revised by arrêté of 16 February 1959) is one unranked tier of châteaux
-- classified for red, dry white or both, all now in Pessac-Léognan AOC (1987).
-- Sources: bordeaux.com/en/classifications/graves, pessac-leognan.com/les-crus-
-- classes-de-graves, en/fr.wikipedia "Classification of Graves wine".
--
-- 1. The row joins the Bordeaux block of Quality Classification right after
--    Premier Grand Cru Classé (14); rows 14..50 move down one. Ids do not change,
--    so every wine_answers / guesses / catalog_wines reference stays valid.
--    Country and region are copied from "Grand Cru Classé", its sibling.
-- 2. The Library's Graves system (wine_designations 'graves-cru-classe') links
--    to it instead of "Grand Cru Classé" (20260829220000), and its description
--    gets the right dates.
-- 3. Both Pessac-Léognan typical wines carry it: the classification covers red
--    and dry white.
--
-- Never re-apply 20260717090000 after this: its `on conflict (name) do update
-- ... sort_order` would put the old 14..50 back and tie two rows.
--
-- The id is fixed so src/lib/wine-identity/__fixtures__/reference-snapshot.json
-- mirrors live. Written against the live state of 2026-09-28: everything changed
-- is asserted before and after, in this transaction. Not safe to run twice, on
-- purpose: the pre-state checks fail and the whole transaction rolls back. No
-- begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

do $pre$
begin
  if not ((select count(*) from type_designations) = 50) then raise exception 'pre-state: expected 50 type designations'; end if;
  if not ((select array_agg(sort_order order by sort_order) from type_designations) = (select array_agg(g order by g) from generate_series(1, 50) g)) then raise exception 'pre-state: sort_order is not exactly 1..50'; end if;
  if exists (select 1 from type_designations where name ilike '%graves%' or id = '13672b46-94a5-4abd-b11d-163a290ec676') then raise exception 'pre-state: a Graves designation (or the fixed id) already exists'; end if;
  if not ((select name from type_designations where sort_order = 12) = 'Grand Cru Classé') then raise exception 'pre-state: Grand Cru Classé is not at 12'; end if;
  if not ((select name from type_designations where sort_order = 13) = 'Premier Grand Cru Classé') then raise exception 'pre-state: Premier Grand Cru Classé is not at 13'; end if;
  if not ((select name from type_designations where sort_order = 14) = 'Cru Bourgeois') then raise exception 'pre-state: Cru Bourgeois is not at 14'; end if;
  if not ((select name from type_designations where sort_order = 50) = 'Feinherb') then raise exception 'pre-state: Feinherb is not at 50'; end if;
  if not ((select count(*) from type_designations td join countries c on c.id = td.country_id join regions r on r.id = td.region_id
            where td.name = 'Grand Cru Classé' and td.category = 'Quality Classification' and c.name = 'France' and r.name = 'Bordeaux') = 1)
    then raise exception 'pre-state: Grand Cru Classé is not one France/Bordeaux Quality Classification row'; end if;
  if not ((select count(*) from wine_archetypes where name = 'A typical Pessac-Léognan red') = 1) then raise exception 'pre-state: expected one "A typical Pessac-Léognan red"'; end if;
  if not ((select count(*) from wine_archetypes where name = 'A typical Pessac-Léognan white') = 1) then raise exception 'pre-state: expected one "A typical Pessac-Léognan white"'; end if;
  if exists (select 1 from wine_archetype_designations d join wine_archetypes a on a.id = d.archetype_id where a.name in ('A typical Pessac-Léognan red', 'A typical Pessac-Léognan white')) then raise exception 'pre-state: a Pessac-Léognan typical wine already carries a designation'; end if;
  if not ((select count(*) from wine_designations wd join type_designations td on td.id = wd.type_designation_id where wd.key = 'graves-cru-classe' and td.name = 'Grand Cru Classé') = 1) then raise exception 'pre-state: graves-cru-classe does not link to Grand Cru Classé'; end if;
  if not ((select description from wine_designations where key = 'graves-cru-classe') = 'The 1959 classification of Pessac-Léognan estates for red and/or white wine — a single flat tier of Crus Classés, with no growth ranking.') then raise exception 'pre-state: graves-cru-classe description is not the one read'; end if;
  if not ((select count(*) from wine_archetypes) = 102) then raise exception 'pre-state: expected 102 archetypes'; end if;
end $pre$;

update type_designations set sort_order = sort_order + 1 where sort_order >= 14;

insert into type_designations (id, name, category, country_id, region_id, sort_order, is_active, description)
select '13672b46-94a5-4abd-b11d-163a290ec676', 'Cru Classé de Graves', 'Quality Classification', g.country_id, g.region_id, 14, true,
       $d$A wine from a château in the Graves classification (1953, revised 1959): one tier with no ranking, each estate classified for its red, its dry white or both. All lie in what is now Pessac-Léognan; many labels print it as "Grand Cru Classé de Graves".$d$
  from type_designations g where g.name = 'Grand Cru Classé';

update wine_designations
   set type_designation_id = '13672b46-94a5-4abd-b11d-163a290ec676',
       description = $d$The Graves classification of 1953, revised in 1959: châteaux classified for red and/or dry white wine in a single flat tier of Crus Classés, with no growth ranking. All lie within what is now Pessac-Léognan.$d$
 where key = 'graves-cru-classe';

insert into wine_archetype_designations (archetype_id, type_designation_id)
select a.id, '13672b46-94a5-4abd-b11d-163a290ec676'
  from wine_archetypes a where a.name in ('A typical Pessac-Léognan red', 'A typical Pessac-Léognan white');

do $post$
begin
  if not ((select count(*) from type_designations) = 51) then raise exception 'post-state: expected 51 type designations'; end if;
  if not ((select array_agg(sort_order order by sort_order) from type_designations) = (select array_agg(g order by g) from generate_series(1, 51) g)) then raise exception 'post-state: sort_order is not exactly 1..51'; end if;
  if not ((select count(*) from type_designations where name = 'Cru Classé de Graves') = 1) then raise exception 'post-state: Cru Classé de Graves is not unique'; end if;
  if not ((select array_agg(name order by sort_order) from type_designations where sort_order between 12 and 18)
          = array['Grand Cru Classé', 'Premier Grand Cru Classé', 'Cru Classé de Graves', 'Cru Bourgeois', 'Cru Artisan', 'Cru Exceptionnel', 'Gutswein']::text[])
    then raise exception 'post-state: the Bordeaux block is not in order'; end if;
  if not ((select name from type_designations where sort_order = 51) = 'Feinherb') then raise exception 'post-state: Feinherb is not at 51'; end if;
  if not ((select count(*) from type_designations n join type_designations g on g.name = 'Grand Cru Classé'
            where n.id = '13672b46-94a5-4abd-b11d-163a290ec676' and n.name = 'Cru Classé de Graves' and n.category = 'Quality Classification'
              and n.country_id = g.country_id and n.region_id = g.region_id and n.is_active and n.description is not null) = 1)
    then raise exception 'post-state: the new row is not shaped like its siblings'; end if;
  if not ((select td.name from wine_designations wd join type_designations td on td.id = wd.type_designation_id where wd.key = 'graves-cru-classe') = 'Cru Classé de Graves') then raise exception 'post-state: graves-cru-classe link'; end if;
  if not ((select count(*) from wine_designations wd join type_designations td on td.id = wd.type_designation_id
            where wd.key in ('medoc-1855', 'sauternes-1855', 'saint-emilion-grand-cru-classe') and td.name = 'Grand Cru Classé') = 3)
    then raise exception 'post-state: the other Bordeaux systems moved'; end if;
  if not ((select count(*) from wine_designations where type_designation_id is not null) >= 6) then raise exception 'post-state: expected >= 6 linked classification systems'; end if;
  if not ((select coalesce(array_agg(td.name order by td.name), '{}') from wine_archetype_designations d join type_designations td on td.id = d.type_designation_id where d.archetype_id = (select id from wine_archetypes where name = 'A typical Pessac-Léognan red')) = array['Cru Classé de Graves']::text[]) then raise exception 'post-state: A typical Pessac-Léognan red designations'; end if;
  if not ((select coalesce(array_agg(td.name order by td.name), '{}') from wine_archetype_designations d join type_designations td on td.id = d.type_designation_id where d.archetype_id = (select id from wine_archetypes where name = 'A typical Pessac-Léognan white')) = array['Cru Classé de Graves']::text[]) then raise exception 'post-state: A typical Pessac-Léognan white designations'; end if;
  if not ((select coalesce(array_agg(td.name order by td.name), '{}') from wine_archetype_designations d join type_designations td on td.id = d.type_designation_id where d.archetype_id = (select id from wine_archetypes where name = 'A typical Pauillac')) = array['Grand Cru Classé']::text[]) then raise exception 'post-state: A typical Pauillac designations moved'; end if;
  if not ((select count(*) from wine_archetypes) = 102) then raise exception 'post-state: expected 102 archetypes'; end if;
end $post$;
