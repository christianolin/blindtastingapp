-- Make the hash-only invariant structural, and harden the grant guard.
--
-- 20260829265000 asserted in a comment that session and email tokens are stored
-- only as sha256 hashes. Nothing enforced it: both columns are bare text and
-- would accept a raw token, which is exactly the bug that would turn a database
-- leak into live sessions and usable reset links. A CHECK makes it impossible
-- rather than merely absent.
--
-- Also worth recording for whoever adds the next auth table: Supabase's
-- pg_default_acl grants anon, authenticated AND service_role full privileges on
-- every new table created in `public`. The REVOKE statements in 265000/265001
-- are therefore load-bearing, not defensive tidying — a new auth table without
-- its own REVOKE ships readable by anon over HTTPS.
alter table auth_sessions
  add constraint auth_sessions_token_hash_is_sha256
  check (token_hash ~ '^[0-9a-f]{64}$');

alter table auth_tokens
  add constraint auth_tokens_token_hash_is_sha256
  check (token_hash ~ '^[0-9a-f]{64}$');

do $$
begin
  -- The CHECKs must actually reject a non-hash. Prove it rather than trusting
  -- that the constraint exists.
  begin
    insert into auth_sessions (user_id, token_hash, expires_at)
    values ((select id from profiles limit 1), 'plaintext-token', now() + interval '1 day');
    raise exception 'auth_sessions accepted a non-sha256 token_hash';
  exception when check_violation then
    null;
  end;

  begin
    insert into auth_tokens (user_id, purpose, token_hash, expires_at)
    values ((select id from profiles limit 1), 'EMAIL_VERIFY', 'plaintext-token', now() + interval '1 day');
    raise exception 'auth_tokens accepted a non-sha256 token_hash';
  exception when check_violation then
    null;
  end;

  -- Effective privilege, not grant rows: has_table_privilege resolves PUBLIC
  -- grants and role membership, which information_schema.role_table_grants
  -- does not. Both would pass today; only this one keeps passing for the right
  -- reason if someone later grants to PUBLIC.
  if exists (
    select 1
      from unnest(array['auth_credentials','auth_sessions','auth_tokens','auth_rate_limits']) t,
           unnest(array['anon','authenticated','service_role']) r
     where has_table_privilege(r, 'public.' || t, 'SELECT')
        or has_table_privilege(r, 'public.' || t, 'INSERT')
        or has_table_privilege(r, 'public.' || t, 'UPDATE')
        or has_table_privilege(r, 'public.' || t, 'DELETE')
  ) then
    raise exception 'an API role holds effective privilege on an auth table';
  end if;

  -- postgres must keep full DML or the auth layer cannot write its own tables.
  if exists (
    select 1
      from unnest(array['auth_credentials','auth_sessions','auth_tokens','auth_rate_limits']) t,
           unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
     where not has_table_privilege('postgres', 'public.' || t, p)
  ) then
    raise exception 'postgres lost a DML privilege on an auth table';
  end if;
end;
$$;
