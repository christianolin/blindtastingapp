-- Integrate classifications into the Knowledge glossary: link each ranked
-- classification system to the type-designation term it deep-dives. Expanding
-- "Grand Cru Classé" then reveals the Bordeaux 1855 / Saint-Émilion / Graves
-- château rankings; "Grand Cru" reveals the Burgundy & Alsace grand crus —
-- instead of a separate, disconnected Classifications list. Systems with no
-- members (empty) stay unlinked and simply don't render a deep-dive.

alter table wine_designations
  add column if not exists type_designation_id uuid
    references type_designations(id) on delete set null;

update wine_designations wd
set type_designation_id = td.id
from type_designations td
where td.category = 'Quality Classification' and td.name = 'Grand Cru Classé'
  and wd.key in ('medoc-1855', 'sauternes-1855', 'graves-cru-classe', 'saint-emilion-grand-cru-classe');

update wine_designations wd
set type_designation_id = td.id
from type_designations td
where td.category = 'Quality Classification' and td.name = 'Grand Cru'
  and wd.key in ('burgundy-grand-cru', 'alsace-grand-cru');

do $$
declare
  n int;
begin
  select count(*) into n from wine_designations where type_designation_id is not null;
  if n < 6 then
    raise exception 'final-state: expected >= 6 linked classification systems, got %', n;
  end if;
end $$;
