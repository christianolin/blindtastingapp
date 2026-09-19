import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DELETED_DISPLAY_NAME, deletedEmailFor } from "./delete-account";
import { DB_REFUSALS } from "./delete-copy";

// Pins what a deleted profile looks like in the migration's scrub to the
// TypeScript that renders and tests it (account-deletion spec §5.8), so the
// SQL and the app can never disagree about the name or the placeholder
// address a deleted account is left with.

const MIGRATION_PATH = "supabase/migrations/20260919101300_account_deletion.sql";

describe("20260919101300_account_deletion.sql pins delete-account.ts", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) reads the same text.
  const sql = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

  it("scrubs display_name to DELETED_DISPLAY_NAME", () => {
    expect(sql).toContain("display_name = 'Deleted user'");
    expect(DELETED_DISPLAY_NAME).toBe("Deleted user");
  });

  it("scrubs email to the deletedEmailFor placeholder", () => {
    const expression = "'deleted+' || p_user_id::text || '@blindr.invalid'";
    expect(sql).toContain(expression);
    const asTypeScript = expression
      .replace(" || p_user_id::text || ", "X")
      .replace(/'/g, "");
    expect(deletedEmailFor("X")).toBe(asTypeScript);
  });

  it("raises the refusals the spec's copy names", () => {
    for (const line of DB_REFUSALS) {
      expect(sql).toContain(`'${line}'`);
    }
  });
});
