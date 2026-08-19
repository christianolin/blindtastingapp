-- Add Erbamat (Franciacorta's native white); other Lombardy grapes already exist.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select 'Erbamat', 'WHITE', 'green-gold', 'A late-ripening, high-acid native white of Brescia, permitted in Franciacorta to add freshness.', 'Lombardy (Franciacorta)'
where not exists (select 1 from grapes g where g.name = 'Erbamat');
do $$ begin if not exists (select 1 from grapes where name='Erbamat') then raise exception 'Erbamat missing'; end if; end $$;
commit;
