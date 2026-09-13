-- Add-wine v2 (D11, spec §E.4, spec §2.1 row 11): cellar bottles are drawn down at
-- the pour, not when a glass is added. The adder's intent lives in the owner-only
-- `wine_pour_intents` table and never on `wines`: every host and participant reads
-- every `wines` column, so a lot id there would name a hidden glass through a
-- PUBLIC or FRIENDS cellar. Start pours a flight's intents
-- (`draw_down_flight_cellar_lots`); a glass added to a running flight is poured at
-- once (`pour_cellar_lot_into_glass`). Both only ever pour the adder's own lot, and
-- both are idempotent. Needs 20260912102000 (`is_wine_adder`).
-- No begin/commit: the applier wraps the file.

-- The adder's intent to pour their own cellar bottle into a glass. Kept off `wines`, which every
-- host and participant can read (init_schema.sql:370-378): a lot id there would name a hidden
-- glass through a PUBLIC or FRIENDS cellar (20260829243000:21-44).
create table public.wine_pour_intents (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  cellar_lot_id uuid references public.cellar_lots(id) on delete set null,
  consume_on_start boolean not null default false,
  cellar_consumption_id uuid references public.cellar_consumptions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.wine_pour_intents enable row level security;

create policy "wine_pour_intents own select" on public.wine_pour_intents
  for select to authenticated using (owner_id = auth.uid());
create policy "wine_pour_intents own insert" on public.wine_pour_intents
  for insert to authenticated with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_pour_intents own delete" on public.wine_pour_intents
  for delete to authenticated using (owner_id = auth.uid());
-- No update policy: only the two SECURITY DEFINER functions below write cellar_consumption_id.

-- Start: pour every glass whose adder asked, when adding it, to take their bottle out of the cellar.
create or replace function public.draw_down_flight_cellar_lots(p_tasting_id uuid)
returns table (wine_id uuid, glass integer, outcome text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tasting tastings%rowtype;
  r record;
  v_lot cellar_lots%rowtype;
  v_consumption uuid;
begin
  if not is_tasting_host(p_tasting_id) then
    raise exception 'only the host can pour the flight';
  end if;
  select * into v_tasting from tastings where id = p_tasting_id;
  if v_tasting.status = 'DRAFT' then
    raise exception 'start the tasting before pouring';
  end if;

  for r in
    select g.id, g.glass, i.cellar_lot_id, i.owner_id,
           coalesce(p.user_id, v_tasting.host_id) as adder_id
    from (
      select id, (row_number() over (order by position))::int as glass
      from wines
      where tasting_id = p_tasting_id
    ) g
    join wines w on w.id = g.id
    join wine_pour_intents i on i.wine_id = g.id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where i.consume_on_start and i.cellar_consumption_id is null
    order by g.glass
  loop
    select * into v_lot from cellar_lots where id = r.cellar_lot_id for update;
    if not found then
      wine_id := r.id; glass := r.glass; outcome := 'lot-missing'; return next; continue;
    end if;
    -- Only the adder's own bottle is ever poured.
    if r.owner_id <> r.adder_id or v_lot.owner_id <> r.owner_id then
      wine_id := r.id; glass := r.glass; outcome := 'not-adders-lot'; return next; continue;
    end if;
    if v_lot.quantity < 1 then
      wine_id := r.id; glass := r.glass; outcome := 'empty'; return next; continue;
    end if;
    update cellar_lots set quantity = quantity - 1 where id = v_lot.id;
    insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion)
    values (v_lot.owner_id, v_lot.id, v_lot.catalog_wine_id, 1, 'DRANK',
            (now() at time zone 'utc')::date, v_tasting.name)
    returning id into v_consumption;
    update wine_pour_intents set cellar_consumption_id = v_consumption where wine_id = r.id;
    wine_id := r.id; glass := r.glass; outcome := 'drawn'; return next;
  end loop;
end $$;
grant execute on function public.draw_down_flight_cellar_lots(uuid) to authenticated;

-- Running flight: the adder pours their own bottle into a glass they just added.
create or replace function public.pour_cellar_lot_into_glass(p_wine_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_wine wines%rowtype;
  v_tasting tastings%rowtype;
  v_intent wine_pour_intents%rowtype;
  v_lot cellar_lots%rowtype;
  v_id uuid;
begin
  if not is_wine_adder(p_wine_id) then
    raise exception 'only the person who added this glass can pour it';
  end if;
  select * into v_wine from wines where id = p_wine_id;
  select * into v_tasting from tastings where id = v_wine.tasting_id;
  if v_tasting.status = 'DRAFT' then
    raise exception 'a draft flight pours at Start';
  end if;
  select * into v_intent from wine_pour_intents i
   where i.wine_id = p_wine_id and i.owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'no pour intent for this glass';
  end if;
  if v_intent.cellar_consumption_id is not null then
    return v_intent.cellar_consumption_id;
  end if;
  select * into v_lot from cellar_lots where id = v_intent.cellar_lot_id for update;
  if not found or v_lot.owner_id <> auth.uid() then
    raise exception 'not your lot';
  end if;
  if v_lot.quantity < 1 then
    raise exception 'no bottles left in this lot';
  end if;
  update cellar_lots set quantity = quantity - 1 where id = v_lot.id;
  insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion)
  values (auth.uid(), v_lot.id, v_lot.catalog_wine_id, 1, 'DRANK',
          (now() at time zone 'utc')::date, v_tasting.name)
  returning id into v_id;
  update wine_pour_intents i set cellar_consumption_id = v_id where i.wine_id = p_wine_id;
  return v_id;
end $$;
grant execute on function public.pour_cellar_lot_into_glass(uuid) to authenticated;

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version
-- must never exist without the DDL it names. The behavioural half runs inside a
-- synthetic-rollback subtransaction (spec §E.0), so no lot, bottle or consumption
-- it touches survives a dry or a live apply.
do $$
declare
  v_bad text;
  v_sig text;
  v_oid oid;
  v_secdef boolean;
  v_config text[];
  v_profiles uuid[];
  v_a uuid;
  v_b uuid;
  v_cw uuid;
  v_name text := 'synthetic wine_pour_intents check';
  v_tasting uuid;
  v_pa uuid;
  v_pb uuid;
  v_w1 uuid;   -- glass 1 (position 10): A's intent on A's own lot
  v_w2 uuid;   -- glass 2 (position 20): an intent owned by A that points at B's lot
  v_lot_a uuid;
  v_lot_b uuid;
  v_ran boolean := false;
  v_b_intent_refused boolean := false;
  v_a_intents int;
  v_a_intent_updated int;
  v_draft_pour_refused boolean := false;
  v_draft_pour_message text;
  v_first jsonb;
  v_lot_a_first int;
  v_lot_b_first int;
  v_consumptions int;
  v_consumption uuid;
  v_intent_1_consumption uuid;
  v_intent_2_consumption uuid;
  v_second_drawn int;
  v_lot_a_second int;
  v_repour uuid;
  v_lot_a_repour int;
  v_b_sees int;
  v_b_draw_refused boolean := false;
  v_b_draw_message text;
  v_b_pour_refused boolean := false;
  v_b_pour_message text;
begin
  -- 1. wine_pour_intents: the table with row level security on and its six columns.
  if to_regclass('public.wine_pour_intents') is null then
    raise exception 'wine_pour_intents table missing post-migration';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_pour_intents'::regclass) then
    raise exception 'row level security is off on wine_pour_intents post-migration';
  end if;

  with expected (column_name, data_type, not_null) as (
    values
      ('wine_id', 'uuid', true),
      ('owner_id', 'uuid', true),
      ('cellar_lot_id', 'uuid', false),
      ('consume_on_start', 'boolean', true),
      ('cellar_consumption_id', 'uuid', false),
      ('created_at', 'timestamp with time zone', true)
  ),
  live as (
    select a.attname::text as column_name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null
    from pg_attribute a
    where a.attrelid = 'public.wine_pour_intents'::regclass
      and a.attnum > 0
      and not a.attisdropped
  )
  select string_agg(coalesce(e.column_name, l.column_name), ', ') into v_bad
  from expected e
  full join live l on l.column_name = e.column_name
  where e.column_name is null
     or l.column_name is null
     or l.data_type is distinct from e.data_type
     or l.not_null is distinct from e.not_null;
  if v_bad is not null then
    raise exception 'wine_pour_intents columns differ from the six expected post-migration: %', v_bad;
  end if;

  if not exists (
    select 1
    from pg_attribute a
    join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where a.attrelid = 'public.wine_pour_intents'::regclass
      and a.attname = 'consume_on_start'
      and a.attnotnull
      and pg_get_expr(ad.adbin, ad.adrelid) = 'false'
  ) then
    raise exception 'wine_pour_intents.consume_on_start is not "not null default false" post-migration';
  end if;

  -- 2. Keys: one intent per glass; it cascades with the glass and its owner, and a
  --    removed lot or consumption only nulls its link. No check constraint ties
  --    consume_on_start to cellar_lot_id (a lot's on delete set null would break it).
  if not exists (
    select 1
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'public.wine_pour_intents'::regclass
      and k.contype = 'p'
      and cardinality(k.conkey) = 1
      and a.attname = 'wine_id'
  ) then
    raise exception 'wine_pour_intents primary key is not wine_id post-migration';
  end if;

  with expected (column_name, target, deltype) as (
    values
      ('wine_id', 'public.wines'::regclass, 'c'::"char"),
      ('owner_id', 'auth.users'::regclass, 'c'::"char"),
      ('cellar_lot_id', 'public.cellar_lots'::regclass, 'n'::"char"),
      ('cellar_consumption_id', 'public.cellar_consumptions'::regclass, 'n'::"char")
  )
  select string_agg(e.column_name, ', ') into v_bad
  from expected e
  where not exists (
    select 1
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'public.wine_pour_intents'::regclass
      and k.contype = 'f'
      and cardinality(k.conkey) = 1
      and a.attname = e.column_name
      and k.confrelid = e.target
      and k.confdeltype = e.deltype
  );
  if v_bad is not null then
    raise exception 'wine_pour_intents foreign keys missing or with the wrong on-delete action post-migration: %', v_bad;
  end if;

  if exists (
    select 1
    from pg_constraint k
    where k.conrelid = 'public.wine_pour_intents'::regclass
      and k.contype = 'c'
  ) then
    raise exception 'wine_pour_intents carries a check constraint post-migration (a missing lot is reported as lot-missing instead)';
  end if;

  -- 3. Exactly the three owner-only policies, none that can UPDATE (only the two pour
  --    functions write cellar_consumption_id), and no raw subquery on
  --    tasting_participants or wines (CLAUDE.md).
  if exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.wine_pour_intents'::regclass
      and pol.polcmd in ('w', '*')
  ) then
    raise exception 'wine_pour_intents has an UPDATE or ALL policy post-migration';
  end if;

  with expected (policyname, permissive, roles, cmd, qual, with_check) as (
    values
      ('wine_pour_intents own select', 'PERMISSIVE', '{authenticated}', 'SELECT',
        '(owner_id = auth.uid())', null),
      ('wine_pour_intents own insert', 'PERMISSIVE', '{authenticated}', 'INSERT',
        null, '((owner_id = auth.uid()) AND is_wine_adder(wine_id))'),
      ('wine_pour_intents own delete', 'PERMISSIVE', '{authenticated}', 'DELETE',
        '(owner_id = auth.uid())', null)
  ),
  live as (
    select pol.policyname::text as policyname,
           pol.permissive,
           pol.roles::text as roles,
           pol.cmd,
           pol.qual,
           pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'wine_pour_intents'
  )
  select string_agg(coalesce(e.policyname, l.policyname), '; ') into v_bad
  from expected e
  full join live l on l.policyname = e.policyname
  where e.policyname is null
     or l.policyname is null
     or l.permissive is distinct from e.permissive
     or l.roles is distinct from e.roles
     or l.cmd is distinct from e.cmd
     or l.qual is distinct from e.qual
     or l.with_check is distinct from e.with_check;
  if v_bad is not null then
    raise exception 'wine_pour_intents policies differ from the three owner-only policies post-migration: %', v_bad;
  end if;

  select string_agg(pol.policyname::text, '; ') into v_bad
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = 'wine_pour_intents'
    and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ilike any
          (array['%tasting_participants%', '%from wines%']);
  if v_bad is not null then
    raise exception 'wine_pour_intents policies subquery tasting_participants or wines instead of is_wine_adder post-migration: %', v_bad;
  end if;

  -- 4. The intent never lives on wines, which every host and participant reads (D11).
  select string_agg(a.attname::text, ', ') into v_bad
  from pg_attribute a
  where a.attrelid = 'public.wines'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attname in ('cellar_lot_id', 'consume_on_start', 'cellar_consumption_id');
  if v_bad is not null then
    raise exception 'wines carries a pour-intent column post-migration (%): a lot id there names a hidden glass', v_bad;
  end if;

  -- 5. Both functions: SECURITY DEFINER, search_path=public, executable by
  --    authenticated, with their result shapes.
  foreach v_sig in array array[
    'public.draw_down_flight_cellar_lots(uuid)',
    'public.pour_cellar_lot_into_glass(uuid)'
  ] loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception '% missing post-migration', v_sig;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_oid;
    if not v_secdef then
      raise exception '% is not SECURITY DEFINER post-migration', v_sig;
    end if;
    if not ('search_path=public' = any (coalesce(v_config, '{}'::text[]))) then
      raise exception '% does not pin search_path=public post-migration (proconfig: %)', v_sig, v_config;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '% is not executable by authenticated post-migration', v_sig;
    end if;
  end loop;

  if pg_get_function_result(to_regprocedure('public.draw_down_flight_cellar_lots(uuid)')::oid)
     is distinct from 'TABLE(wine_id uuid, glass integer, outcome text)' then
    raise exception 'draw_down_flight_cellar_lots must return (wine_id, glass, outcome) post-migration, returns %',
      pg_get_function_result(to_regprocedure('public.draw_down_flight_cellar_lots(uuid)')::oid);
  end if;
  if pg_get_function_result(to_regprocedure('public.pour_cellar_lot_into_glass(uuid)')::oid) is distinct from 'uuid' then
    raise exception 'pour_cellar_lot_into_glass must return the consumption uuid post-migration';
  end if;

  -- 6. Behavioural (spec §E.0, §E.4). A synthetic host-provides tasting hosted by A,
  --    with B JOINED. One catalog wine; a 2-bottle lot owned by A and a 2-bottle lot
  --    owned by B. Glass 1 carries A's intent on A's lot; glass 2 carries an intent
  --    owned by A that points at B's lot. Both set consume_on_start.
  select array_agg(s.id) into v_profiles
  from (select pr.id from public.profiles pr order by pr.id limit 2) s;
  select cw.id into v_cw from public.catalog_wines cw order by cw.id limit 1;

  if coalesce(array_length(v_profiles, 1), 0) < 2 or v_cw is null then
    raise notice '20260912103000: behavioural assertions skipped (needs two profiles and a catalog wine)';
  else
    v_a := v_profiles[1];
    v_b := v_profiles[2];
    begin
      insert into public.tastings (name, host_id, timing_mode, wine_source, status, reveal_mode)
      values (v_name, v_a, 'LIVE', 'HOST_PROVIDES', 'DRAFT', 'BLIND')
      returning id into v_tasting;
      insert into public.tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_a, 'JOINED', now())
      returning id into v_pa;
      insert into public.tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_b, 'JOINED', now())
      returning id into v_pb;
      insert into public.wines (tasting_id, position) values (v_tasting, 20) returning id into v_w2;
      insert into public.wines (tasting_id, position) values (v_tasting, 10) returning id into v_w1;
      insert into public.cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity)
      values (v_a, v_cw, 2, 2)
      returning id into v_lot_a;
      insert into public.cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity)
      values (v_b, v_cw, 2, 2)
      returning id into v_lot_b;

      -- As B, who did not add the host's glass: no intent may be written for it.
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', v_b::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      begin
        insert into public.wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start)
        values (v_w1, v_b, v_lot_b, true);
      exception
        when insufficient_privilege then
          v_b_intent_refused := true;
      end;

      -- As A, the host and so the adder of both glasses: the intents are one INSERT,
      -- cannot be edited afterwards, and a DRAFT flight pours nothing.
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      insert into public.wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start)
      values (v_w1, v_a, v_lot_a, true),
             (v_w2, v_a, v_lot_b, true);
      get diagnostics v_a_intents = row_count;
      update public.wine_pour_intents i set consume_on_start = false where i.wine_id = v_w1;
      get diagnostics v_a_intent_updated = row_count;
      begin
        perform 1 from public.draw_down_flight_cellar_lots(v_tasting);
      exception
        when raise_exception then
          v_draft_pour_refused := true;
          get stacked diagnostics v_draft_pour_message = message_text;
      end;

      -- Start.
      execute 'reset role';
      update public.tastings set status = 'IN_PROGRESS' where id = v_tasting;

      -- As A: the first draw-down pours only the adder's own lot.
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      select jsonb_object_agg(d.glass::text, jsonb_build_array(d.wine_id, d.outcome))
        into v_first
      from public.draw_down_flight_cellar_lots(v_tasting) d;

      execute 'reset role';
      select l.quantity into v_lot_a_first from public.cellar_lots l where l.id = v_lot_a;
      select l.quantity into v_lot_b_first from public.cellar_lots l where l.id = v_lot_b;
      select count(*) into v_consumptions
      from public.cellar_consumptions c
      where c.lot_id in (v_lot_a, v_lot_b);
      select c.id into v_consumption
      from public.cellar_consumptions c
      where c.lot_id = v_lot_a
        and c.owner_id = v_a
        and c.catalog_wine_id = v_cw
        and c.quantity = 1
        and c.reason = 'DRANK'
        and c.occasion = v_name
        and c.consumed_on = (now() at time zone 'utc')::date;
      select i.cellar_consumption_id into v_intent_1_consumption from public.wine_pour_intents i where i.wine_id = v_w1;
      select i.cellar_consumption_id into v_intent_2_consumption from public.wine_pour_intents i where i.wine_id = v_w2;

      -- As A: a second Start draws nothing twice, and a retried pour of glass 1
      -- returns the consumption it already has.
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      select count(*) filter (where d.outcome = 'drawn') into v_second_drawn
      from public.draw_down_flight_cellar_lots(v_tasting) d;
      select l.quantity into v_lot_a_second from public.cellar_lots l where l.id = v_lot_a;
      v_repour := public.pour_cellar_lot_into_glass(v_w1);
      select l.quantity into v_lot_a_repour from public.cellar_lots l where l.id = v_lot_a;

      -- As B: no intent is visible, and B can pour neither the flight nor A's glass.
      perform set_config('request.jwt.claim.sub', v_b::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      select count(*) into v_b_sees from public.wine_pour_intents i where i.wine_id in (v_w1, v_w2);
      begin
        perform 1 from public.draw_down_flight_cellar_lots(v_tasting);
      exception
        when raise_exception then
          v_b_draw_refused := true;
          get stacked diagnostics v_b_draw_message = message_text;
      end;
      begin
        perform public.pour_cellar_lot_into_glass(v_w1);
      exception
        when raise_exception then
          v_b_pour_refused := true;
          get stacked diagnostics v_b_pour_message = message_text;
      end;

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;

    if not v_ran then
      raise exception '20260912103000: behavioural assertions did not run to completion';
    end if;
    if not v_b_intent_refused then
      raise exception 'wine_pour_intents: a participant wrote a pour intent for a glass they did not add post-migration';
    end if;
    if v_a_intents is distinct from 2 then
      raise exception 'wine_pour_intents: the adder could not record pour intents in one insert post-migration (% rows)', v_a_intents;
    end if;
    if v_a_intent_updated is distinct from 0 then
      raise exception 'wine_pour_intents: an owner edited an intent post-migration (only the pour functions write it)';
    end if;
    if not v_draft_pour_refused or v_draft_pour_message is distinct from 'start the tasting before pouring' then
      raise exception 'draw_down_flight_cellar_lots poured a DRAFT flight post-migration (%)', coalesce(v_draft_pour_message, 'no error');
    end if;
    if v_first is distinct from jsonb_build_object(
         '1', jsonb_build_array(v_w1, 'drawn'),
         '2', jsonb_build_array(v_w2, 'not-adders-lot')) then
      raise exception 'draw_down_flight_cellar_lots: expected glass 1 drawn and glass 2 not-adders-lot, observed %', v_first;
    end if;
    if v_lot_a_first is distinct from 1 or v_lot_b_first is distinct from 2 then
      raise exception 'draw_down_flight_cellar_lots: expected A''s lot at 1 and B''s at 2 bottles, observed % and %',
        v_lot_a_first, v_lot_b_first;
    end if;
    if v_consumptions is distinct from 1 or v_consumption is null then
      raise exception 'draw_down_flight_cellar_lots: expected one DRANK consumption of A''s lot named after the tasting, observed % consumption(s)',
        v_consumptions;
    end if;
    if v_intent_1_consumption is distinct from v_consumption or v_intent_2_consumption is not null then
      raise exception 'draw_down_flight_cellar_lots: the poured intent must store its consumption and the refused one none';
    end if;
    if v_second_drawn is distinct from 0 or v_lot_a_second is distinct from 1 then
      raise exception 'draw_down_flight_cellar_lots is not idempotent: a second Start drew % bottle(s), A''s lot holds %',
        v_second_drawn, v_lot_a_second;
    end if;
    if v_repour is distinct from v_consumption or v_lot_a_repour is distinct from 1 then
      raise exception 'pour_cellar_lot_into_glass is not idempotent: a retried pour returned % and left A''s lot at %',
        v_repour, v_lot_a_repour;
    end if;
    if v_b_sees is distinct from 0 then
      raise exception 'wine_pour_intents: another participant can see % pour intent(s) post-migration', v_b_sees;
    end if;
    if not v_b_draw_refused or v_b_draw_message is distinct from 'only the host can pour the flight' then
      raise exception 'draw_down_flight_cellar_lots did not refuse a participant post-migration (%)', coalesce(v_b_draw_message, 'no error');
    end if;
    if not v_b_pour_refused or v_b_pour_message is distinct from 'only the person who added this glass can pour it' then
      raise exception 'pour_cellar_lot_into_glass did not refuse someone who did not add the glass post-migration (%)',
        coalesce(v_b_pour_message, 'no error');
    end if;
    if exists (select 1 from public.tastings t where t.id = v_tasting)
       or exists (select 1 from public.cellar_lots l where l.id in (v_lot_a, v_lot_b)) then
      raise exception '20260912103000: the synthetic tasting or lots survived their rollback';
    end if;
  end if;
end $$;
