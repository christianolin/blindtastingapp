-- Every wine has an appellation. "Vin de France" is France's national-tier base
-- appellation; appellations require a home region, so seed a national-tier
-- "Vin de France" region under France to hold it. Idempotent.

do $$
declare
  v_country uuid;
  v_region uuid;
begin
  select id into v_country from countries where name = 'France';
  if v_country is null then
    raise exception 'France country row missing';
  end if;

  insert into regions (country_id, name)
  values (v_country, 'Vin de France')
  on conflict (country_id, name) do nothing;

  select id into v_region from regions where country_id = v_country and name = 'Vin de France';

  insert into appellations (region_id, name)
  values (v_region, 'Vin de France')
  on conflict (region_id, name) do nothing;
end $$;

do $$
begin
  if not exists (
    select 1 from appellations a
    join regions r on r.id = a.region_id
    join countries c on c.id = r.country_id
    where c.name = 'France' and r.name = 'Vin de France' and a.name = 'Vin de France'
  ) then
    raise exception 'final-state: Vin de France appellation missing';
  end if;
end $$;
