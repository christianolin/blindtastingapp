// Pins supabase/migrations/20260919141700_profile_favourites.sql (spec §3) to
// the TypeScript that renders and uses it, in the pattern of
// account-deletion-migration.test.ts, so the SQL and the app can never
// disagree about the limit, the refusal strings or the RPC's name/arguments.
//
// This worktree's task reserves supabase/migrations/ for a separate SQL
// agent ("Do not edit supabase/migrations ... the SQL agent owns them"), so
// the migration file itself is not written here. Until it lands, every case
// below is skipped rather than failed — a missing file is not a defect in
// this app-side build, and failing loudly here would only duplicate what the
// SQL agent's own pass already needs to prove. Once the file exists, these
// cases run for real and should stay green without edits (the strings below
// already match profile-favourites.ts's exported constants character for
// character, per spec §7).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAVOURITES_DB_REFUSALS,
  FAVOURITES_LIMIT,
  NONE_REGION_NAME,
} from "./profile-favourites";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260919141700_profile_favourites.sql",
);
const migrationExists = existsSync(MIGRATION_PATH);

describe.skipIf(!migrationExists)(
  "20260919141700_profile_favourites.sql pins profile-favourites.ts",
  () => {
    // Normalised so a CRLF checkout (Windows autocrlf) reads the same text.
    const sql = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

    it("the 10-limit appears in both position checks, both guards and both RPC cardinality checks", () => {
      expect(
        sql.split(`check (position between 1 and ${FAVOURITES_LIMIT})`).length - 1,
      ).toBe(2);
      expect(sql.split(`>= ${FAVOURITES_LIMIT} then`).length - 1).toBe(2);
      expect(sql).toContain(`cardinality(p_region_ids) > ${FAVOURITES_LIMIT}`);
      expect(sql).toContain(`cardinality(p_producer_ids) > ${FAVOURITES_LIMIT}`);
    });

    it("the None sentinel string matches", () => {
      expect(sql).toContain(`r.name = '${NONE_REGION_NAME}'`);
    });

    it("every FAVOURITES_DB_REFUSALS line, and the reused account-deletion refusal, appear verbatim", () => {
      for (const line of FAVOURITES_DB_REFUSALS) {
        expect(sql).toContain(`'${line}'`);
      }
      expect(sql).toContain("'this account has been deleted'");
    });

    it("the RPC name and argument names match setProfileFavourites", () => {
      expect(sql).toContain(
        "create function public.set_profile_favourites(p_region_ids uuid[], p_producer_ids uuid[])",
      );
    });

    it("never recreates scrub_deleted_account (D5) and never drops a column (D1)", () => {
      expect(sql).not.toMatch(/create (or replace )?function public\.scrub_deleted_account/);
      expect(sql).not.toMatch(/drop column/i);
    });
  },
);
