-- Make the auth tables' deny-all literal.
--
-- 20260829265000 revoked anon and authenticated but left service_role, on the
-- assumption that auth code would reach these tables through the service-role
-- PostgREST client. It does not: the auth layer connects directly to Postgres
-- as `postgres`, which holds its own privileges. service_role access was
-- therefore only an extra way for a leaked key to read every password hash and
-- session-token hash over HTTPS.
--
-- After this, the four tables are reachable only by a direct database
-- connection.
revoke all on auth_credentials, auth_sessions, auth_tokens, auth_rate_limits
  from service_role;

do $$
declare
  v_leaked text;
begin
  select string_agg(distinct table_name || ':' || grantee, ', ')
    into v_leaked
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')
     and grantee in ('anon', 'authenticated', 'service_role');
  if v_leaked is not null then
    raise exception 'auth tables still granted to API roles: %', v_leaked;
  end if;

  -- postgres must retain access or the auth layer cannot read its own tables.
  if (select count(distinct table_name)
        from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')
         and grantee = 'postgres'
         and privilege_type = 'SELECT') <> 4 then
    raise exception 'postgres lost SELECT on an auth table';
  end if;
end;
$$;
