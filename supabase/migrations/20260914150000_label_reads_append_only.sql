-- label_reads becomes append-only: the scan quota is counted from it.
--
-- 20260912100100 created the table with three owner-only policies -- select,
-- insert and delete -- and a comment saying "a read is a record and is never
-- edited", which is why it deliberately has no UPDATE policy. The delete policy
-- contradicts that: a record you can erase is not a record.
--
-- It matters now because readLabelPhoto counts these rows to cap label-scan
-- spend (src/lib/label-scan/quota.ts). /signup is open -- linked from /login,
-- no invite and no allowlist -- so the quota is what stands between a fresh
-- account and unbounded model spend at about a cent a call. With the delete
-- policy in place any authenticated caller could reset that counter with one
-- REST call:
--
--   DELETE /rest/v1/label_reads?user_id=eq.<own id>
--
-- ...and carry on scanning. The app itself never deletes a label_reads row --
-- nothing in src/ issues one -- so dropping the policy removes no behaviour.
-- Rows still disappear with the account: user_id references auth.users on
-- delete cascade, which RLS does not gate.
--
-- No begin/commit: the applier owns the transaction.

drop policy if exists "label_reads own delete" on public.label_reads;

-- Same-transaction assertions.
do $$
declare
  v_cmds text;
begin
  -- Row level security is still on -- dropping a policy must never be the thing
  -- that makes a table readable.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.label_reads'::regclass) then
    raise exception 'row level security is off on label_reads post-migration';
  end if;

  -- Exactly SELECT and INSERT survive: no DELETE, and still no UPDATE.
  select string_agg(cmd, ',' order by cmd) into v_cmds
  from pg_policies where schemaname = 'public' and tablename = 'label_reads';
  if v_cmds is distinct from 'INSERT,SELECT' then
    raise exception 'label_reads policies are "%" post-migration, expected "INSERT,SELECT"', coalesce(v_cmds, '(none)');
  end if;

  -- Both survivors are still owner-only, so this did not widen anything.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'label_reads'
      and coalesce(qual, with_check) not like '%auth.uid()%'
  ) then
    raise exception 'a label_reads policy is no longer owner-only post-migration';
  end if;

  -- The quota's index is what makes the count cheap; losing it would turn every
  -- scan into a table scan.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'label_reads'
      and indexname = 'label_reads_user_created_idx'
  ) then
    raise exception 'label_reads_user_created_idx is missing post-migration';
  end if;

  -- The cascade from auth.users is how a deleted account still loses its rows.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.label_reads'::regclass
      and contype = 'f' and confdeltype = 'c'
  ) then
    raise exception 'label_reads lost its on-delete-cascade to auth.users post-migration';
  end if;
end $$;
