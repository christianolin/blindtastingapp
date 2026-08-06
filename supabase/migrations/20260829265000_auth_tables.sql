-- Own-authentication tables (Phase 1).
--
-- These live in `public` because that is where PostgREST looks, but they carry
-- RLS with NO policies: anon and authenticated get nothing, by construction.
-- Only the service role and direct pg connections (our auth code) touch them.
--
-- Session tokens and email tokens are stored as sha256 hashes, never in the
-- clear, so a database leak yields no live sessions and no usable reset links.
create table auth_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  password_changed_at timestamptz not null default now(),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index auth_credentials_email_key
  on auth_credentials (lower(email));

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip inet
);
create index auth_sessions_live_idx
  on auth_sessions (user_id) where revoked_at is null;

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  email text,
  purpose text not null
    check (purpose in ('EMAIL_VERIFY', 'PASSWORD_RESET', 'INVITE')),
  token_hash text not null unique,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  -- An INVITE may precede the user existing, so it carries an email instead.
  check (user_id is not null or email is not null)
);
create index auth_tokens_lookup_idx
  on auth_tokens (purpose, expires_at) where consumed_at is null;

create table auth_rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table auth_credentials enable row level security;
alter table auth_sessions enable row level security;
alter table auth_tokens enable row level security;
alter table auth_rate_limits enable row level security;

-- Belt and braces: RLS already denies, but do not even grant the table.
revoke all on auth_credentials, auth_sessions, auth_tokens, auth_rate_limits
  from anon, authenticated;

do $$
begin
  if (select count(*) from pg_tables
       where schemaname = 'public'
         and tablename in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')
         and rowsecurity) <> 4 then
    raise exception 'all four auth tables must have RLS enabled';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename in ('auth_credentials','auth_sessions','auth_tokens','auth_rate_limits')) <> 0 then
    raise exception 'auth tables must carry no policies';
  end if;
end;
$$;
