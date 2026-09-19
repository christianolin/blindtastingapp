// Pins supabase/migrations/20260919214700_label_lookups.sql (owner fix C, spec
// docs/superpowers/specs/2026-09-19-scan-region-appellation.md §7) to the rules
// the app relies on: it adds exactly one owner-only table, and never touches a
// deployed function or the label_reads table that the scan quota, the photo
// attach (attach_catalog_wine_photo step 10) and the replay fixtures read.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPELLATION_LOOKUP_LIST_CAP } from "./label-scan/appellation-lookup-schema";

const MIGRATION = path.join(process.cwd(), "supabase/migrations/20260919214700_label_lookups.sql");

describe("20260919214700_label_lookups.sql", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) reads the same text.
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  // Comments and string literals out of the way, so only executable SQL is matched.
  const code = sql.replace(/--[^\n]*/g, "");

  it("creates exactly one table, label_lookups, and nothing else by name", () => {
    expect(code.match(/create table/gi)).toHaveLength(1);
    expect(code).toMatch(/create table public\.label_lookups \(/);
    expect(code).not.toMatch(/create (or replace )?(function|view|trigger|type)/i);
  });

  it("never recreates scrub_deleted_account or attach_catalog_wine_photo, and never alters label_reads", () => {
    expect(code).not.toMatch(/(create|alter|drop)[^;]*function[^;(]*scrub_deleted_account/i);
    expect(code).not.toMatch(/(create|alter|drop)[^;]*function[^;(]*attach_catalog_wine_photo/i);
    expect(code).not.toMatch(/alter table[^;]*label_reads\b/i);
    expect(code).not.toMatch(/drop (table|policy|index)[^;]*label_reads\b/i);
    expect(code).not.toMatch(/(create|drop) policy[^;]* on public\.label_reads\b/i);
    expect(code).not.toMatch(/(grant|revoke)[^;]* on (table )?public\.label_reads\b/i);
  });

  it("one follow-up per read, removed with it (ON DELETE CASCADE), so the account scrub needs no change", () => {
    expect(code).toContain("label_read_id uuid not null unique references public.label_reads(id) on delete cascade");
    expect(code).toContain("user_id uuid not null references auth.users(id) on delete cascade");
  });

  it("the candidate bound is the gate's list cap, and the outcomes are labelLookupRow's four", () => {
    expect(code).toContain(`check (candidates between 1 and ${APPELLATION_LOOKUP_LIST_CAP})`);
    expect(code).toContain("check (outcome in ('answer', 'no-answer', 'discarded', 'not-read'))");
    expect(code).toContain("check (char_length(answer) <= 200)");
  });

  it("owner-only and append-only: select and insert policies, no update or delete, and authenticated's grant is exactly those two", () => {
    expect(code.match(/create policy/gi)).toHaveLength(2);
    expect(code).toContain('create policy "label_lookups own select" on public.label_lookups');
    expect(code).toContain('create policy "label_lookups own insert" on public.label_lookups');
    expect(code).not.toMatch(/for (update|delete|all)\b/i);
    expect(code).toContain("revoke all on table public.label_lookups from public, anon, authenticated;");
    expect(code).toContain("grant select, insert on table public.label_lookups to authenticated;");
  });
});
