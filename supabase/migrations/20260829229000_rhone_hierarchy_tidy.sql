-- Tidy the Vallée du Rhône hierarchy: six peripheral appellations sat directly
-- under the region alongside its two subregions, cluttering navigation. Reparent
-- the southern / Diois peripherals under Rhône méridional, leaving the region
-- with just its two subregions plus the two umbrella appellations (Côtes du
-- Rhône, Côtes du Rhône Villages). canonical_keys are stable ids here (not
-- path-derived), so only primary_parent_id changes — no key churn, and the
-- archetype placements (keyed by place id) are unaffected. Matched by name so a
-- fresh replay reparents the same places regardless of slug spelling.

update wine_places ch
set primary_parent_id = (
  select id from wine_places where canonical_key = 'france.rhone.meridional'
)
where ch.primary_parent_id = (
    select id from wine_places where canonical_key = 'france.rhone'
  )
  and ch.kind = 'APPELLATION'
  and ch.name in (
    'Luberon', 'Ventoux', 'Grignan-les-Adhémar', 'Côtes du Vivarais',
    'Clairette de Die', 'Crémant de Die'
  );

do $$
declare n int;
begin
  select count(*) into n
  from wine_places ch
  join wine_places reg on reg.id = ch.primary_parent_id
  where reg.canonical_key = 'france.rhone' and ch.kind = 'APPELLATION';
  if n <> 2 then
    raise exception 'final-state: expected 2 appellations left under the Rhône region, got %', n;
  end if;
end $$;
