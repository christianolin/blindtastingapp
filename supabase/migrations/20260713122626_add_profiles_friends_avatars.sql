-- Profiles: avatar + bio, and an open directory (any authenticated user can
-- already read all profiles per the existing "profiles read" policy).
alter table profiles add column avatar_url text;
alter table profiles add column bio text;

-- Friendships: one-way "add to my list", no accept/request flow. A user only
-- ever sees/manages rows where they are user_id — this is not a mutual graph.
create table friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table friendships enable row level security;

create policy "friendships read own" on friendships for select to authenticated
  using (user_id = auth.uid());
create policy "friendships insert own" on friendships for insert to authenticated
  with check (user_id = auth.uid());
create policy "friendships delete own" on friendships for delete to authenticated
  using (user_id = auth.uid());

-- Avatar storage: public read (avatars are shown across the app), upload
-- restricted to a per-user folder (avatars/<user_id>/...).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar public read" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatar own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
