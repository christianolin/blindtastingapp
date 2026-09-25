-- friend_requests lockdown: the one-way friendships rows become pending
-- requests, and no client writes friendships directly any more.
--
-- Spec: docs/superpowers/specs/2026-09-24-friend-requests-design.md (§2.2,
-- §2.4, D2, D8). Plan: docs/superpowers/plans/2026-09-24-friend-requests.md,
-- Task 2. Migration 2 of 2 (the M9b half of D8).
--
-- APPLY ONLY AFTER the app deploy whose commit is titled
-- "feat(friends): every friend button goes through the request RPCs" is live
-- on production. That deploy is the first one that never writes friendships
-- directly (sendFriendRequest, cancelFriendRequest, acceptFriendRequest,
-- declineFriendRequest and removeFriend call the RPCs of 20260925003000). An
-- older deploy still inserts and deletes friendships rows through the two
-- policies this file drops, and its "Add friend" would fail here. Nothing in
-- the database can see which app is deployed: that check is the operator's.
--
-- Written against the state 20260925003000 leaves (pinned below). On live
-- 2026-09-24 friendships held 44 rows: 14 mutual pairs (28 rows) and 16
-- one-way rows. The count is read again inside this transaction; the
-- constant 16 is not assumed.
--
-- What this migration does, in one transaction:
-- 1. Pre-state: friend_requests and the five RPCs exist, by body; friendships
--    still has its three own policies and its client INSERT/DELETE grants.
-- 2. Locks friend_requests, then friendships, SHARE ROW EXCLUSIVE: every
--    writer waits until this commits (readers do not), in the same table
--    order every writer uses, so no write lands between the move and the
--    revokes.
-- 3. Data move (D2): each friendships row (a, b) with no row (b, a) becomes
--    friend_requests (requester a, recipient b, its created_at), ON CONFLICT
--    DO NOTHING (b may already have a request pending from a, sent after the
--    app deploy), skipping any row where either profile is deleted; then
--    every one of those one-way rows is deleted. Asserts: rows deleted =
--    one-way rows counted at the start; every moved row whose two profiles
--    are live now has its pending request; friend_requests count = count
--    before + rows inserted. (The spec's "friend_requests count = moved
--    count" holds only if no request was sent between the app deploy and
--    this file; this is the same check without that assumption.)
-- 4. Lockdown (spec §2.2): drops "friendships insert own" and "friendships
--    delete own"; revokes INSERT, UPDATE and DELETE on friendships from anon
--    and authenticated. SELECT and "friendships read own" stay. Constraint
--    names are not touched (20260918130500's asserts pin them).
-- 5. Post-state: no friendships row lacks its reverse; the policies and the
--    grants are as step 4 leaves them; the trigger, the constraints and
--    can_view_cellar are unchanged.
--
-- Nothing here touches can_view_cellar, shared_cellar_lots,
-- catalog_wine_photos or tasting_participants. From here a FRIENDS cellar is
-- readable only by an accepted friend: every friendships row has its pair.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 1. Pre-state.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  if to_regclass('public.friend_requests') is null then
    raise exception 'friend_requests does not exist: apply 20260925003000 first';
  end if;
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.send_friend_request(uuid)',    '8efbf4536f08f335934d517ca5007238'),
    ('public.cancel_friend_request(uuid)',  '55dc3b3361bb035bdd9ad2a95d70e13d'),
    ('public.accept_friend_request(uuid)',  '8c473e36e07123e4a4ab2ee5b211b454'),
    ('public.decline_friend_request(uuid)', 'a7bac3015636524f65fd3c27155a3398'),
    ('public.remove_friend(uuid)',          '1e1a84871e2e2c68ef899b845bc96506'),
    ('public.accept_platform_invite(text)', '9b3e4a89a84d2eb482c312eba87c4d37'),
    ('public.scrub_deleted_account(uuid)',  '5a08d60e3af617b6368d3a85cbe05f94'),
    ('public.can_view_cellar(uuid)',        '3af2e51e338dc43cc48b58f061049ec2')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the ones 20260925003000 installs: %', v_text;
  end if;
  select string_agg(p.polname::text, ', ' order by p.polname::text collate "C") into v_text
  from pg_policy p
  where p.polrelid = 'public.friendships'::regclass;
  if v_text is distinct from 'friendships delete own, friendships insert own, friendships read own' then
    raise exception 'friendships policies are %, expected the three own policies', v_text;
  end if;
  if not has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or not has_table_privilege('authenticated', 'public.friendships', 'DELETE') then
    raise exception 'authenticated no longer holds INSERT/DELETE on friendships: re-read live before applying';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Writers wait; readers do not. The same table order every writer uses.
-- ---------------------------------------------------------------------------
lock table public.friend_requests, public.friendships in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 3. The data move (D2).
-- ---------------------------------------------------------------------------
do $$
declare
  v_before int;
  v_one_way int;
  v_inserted int;
  v_deleted int;
  v_missing int;
  v_after int;
begin
  select count(*) into v_before from friend_requests;
  create temporary table friendships_one_way on commit drop as
    select f.id, f.user_id, f.friend_id, f.created_at
      from friendships f
     where not exists (select 1 from friendships r
                        where r.user_id = f.friend_id and r.friend_id = f.user_id);
  select count(*) into v_one_way from friendships_one_way;

  insert into friend_requests (requester_id, recipient_id, created_at)
  select o.user_id, o.friend_id, o.created_at
    from friendships_one_way o
   where not exists (select 1 from profiles p
                      where p.id in (o.user_id, o.friend_id) and p.deleted_at is not null)
  on conflict (requester_id, recipient_id) do nothing;
  get diagnostics v_inserted = row_count;

  delete from friendships f using friendships_one_way o where f.id = o.id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_one_way then
    raise exception 'deleted % one-way friendships rows, but % were one-way at the start', v_deleted, v_one_way;
  end if;
  select count(*) into v_missing
    from friendships_one_way o
   where not exists (select 1 from profiles p
                      where p.id in (o.user_id, o.friend_id) and p.deleted_at is not null)
     and not exists (select 1 from friend_requests r
                      where r.requester_id = o.user_id and r.recipient_id = o.friend_id);
  if v_missing <> 0 then
    raise exception '% one-way friendships rows did not become a pending request', v_missing;
  end if;
  select count(*) into v_after from friend_requests;
  if v_after <> v_before + v_inserted then
    raise exception 'friend_requests holds % rows, expected % before + % moved', v_after, v_before, v_inserted;
  end if;
  raise notice 'friend requests: % one-way friendships rows moved, % new pending requests, % requests before, % after',
    v_one_way, v_inserted, v_before, v_after;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lockdown (spec §2.2).
-- ---------------------------------------------------------------------------
drop policy "friendships insert own" on public.friendships;
drop policy "friendships delete own" on public.friendships;
revoke insert, update, delete on table public.friendships from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_orphans int;
begin
  -- 1. The pair invariant.
  select count(*) into v_orphans
    from friendships f
   where not exists (select 1 from friendships r where r.user_id = f.friend_id and r.friend_id = f.user_id);
  if v_orphans <> 0 then
    raise exception '% friendships rows have no reverse row', v_orphans;
  end if;

  -- 2. Exactly the read policy is left.
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.friendships'::regclass;
  if v_text is distinct from 'friendships read own r permissive {authenticated} (user_id = auth.uid()) -' then
    raise exception 'friendships policies are %, expected "friendships read own" alone', v_text;
  end if;

  -- 3. No client role writes friendships; authenticated still reads it;
  --    service_role keeps the defaults.
  if has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     or has_table_privilege('authenticated', 'public.friendships', 'UPDATE')
     or has_table_privilege('authenticated', 'public.friendships', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.friendships', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.friendships', 'UPDATE')
     or has_table_privilege('anon', 'public.friendships', 'INSERT')
     or has_table_privilege('anon', 'public.friendships', 'UPDATE')
     or has_table_privilege('anon', 'public.friendships', 'DELETE')
     or has_any_column_privilege('anon', 'public.friendships', 'INSERT')
     or has_any_column_privilege('anon', 'public.friendships', 'UPDATE') then
    raise exception 'a client role can still write friendships';
  end if;
  if not has_table_privilege('authenticated', 'public.friendships', 'SELECT') then
    raise exception 'authenticated lost SELECT on friendships';
  end if;
  if not has_table_privilege('service_role', 'public.friendships', 'INSERT')
     or not has_table_privilege('service_role', 'public.friendships', 'DELETE') then
    raise exception 'service_role lost its default privileges on friendships';
  end if;

  -- 4. Unchanged: the trigger, the constraint set, can_view_cellar.
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.friendships'::regclass and not t.tgisinternal;
  if v_text is distinct from 'friendships_refuse_deleted_profile 7 refuse_deleted_profile_link()' then
    raise exception 'friendships triggers changed: %', v_text;
  end if;
  select string_agg(k.conname::text, ', ' order by k.conname::text collate "C") into v_text
  from pg_constraint k
  where k.conrelid = 'public.friendships'::regclass;
  if v_text is distinct from
       'friendships_check, friendships_friend_id_fkey, friendships_pkey, friendships_user_id_fkey, friendships_user_id_friend_id_key' then
    raise exception 'friendships constraints changed: %', v_text;
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
       where p.oid = to_regprocedure('public.can_view_cellar(uuid)')) is distinct from '3af2e51e338dc43cc48b58f061049ec2' then
    raise exception 'can_view_cellar changed; spec §2.2 keeps it';
  end if;

  raise notice 'friendships lockdown: % rows (% pairs), % pending requests',
    (select count(*) from friendships), (select count(*) / 2 from friendships), (select count(*) from friend_requests);
end $$;
