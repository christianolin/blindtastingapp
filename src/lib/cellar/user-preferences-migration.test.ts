import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static checks on 20260927110000_user_preferences.sql's own same-transaction
// asserts (cellar-sort spec C3, C4; review round 1). They run for real only in
// the main session's dry run and apply; these catch, before that, the two ways
// the file once could never pass: a boolean handed straight to format() (it
// prints t/f, while the expected strings say true/false), and a function body
// edited without its pinned md5.

const MIGRATION_PATH = "supabase/migrations/20260927110000_user_preferences.sql";

describe("20260927110000_user_preferences.sql's asserts can pass", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) reads the same text; the
  // asserts md5 prosrc with any CR stripped, which is the same bytes.
  const sql = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

  function body(fn: string): string {
    const m = sql.match(new RegExp(`create function public\\.${fn}\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));
    if (!m) throw new Error(`no body for ${fn}`);
    return m[1];
  }

  it("never hands format() a bare boolean: prosecdef and proretset are cast to text", () => {
    const bare = sql.match(/\bp\.(prosecdef|proretset)\b(?!::text)/g) ?? [];
    expect(bare).toEqual([]);
    expect(sql).toContain("'secdef true, config {search_path=public}, execute OWNER'");
    expect(sql.match(/returns trigger \(set false\)/g)).toHaveLength(2);
  });

  it("pins each trigger function's body by the md5 of its own text", () => {
    const pinned = sql.match(/'md5 [0-9a-f]{32}, execute OWNER'/g) ?? [];
    const expected = ["drop_deleted_profile_preferences", "user_preferences_guard"].map(
      (fn) => `'md5 ${createHash("md5").update(body(fn)).digest("hex")}, execute OWNER'`,
    );
    expect(pinned.slice().sort()).toEqual(expected.slice().sort());
  });

  it("the insert guard refuses a deleted profile with the words the DB suite expects, before every insert", () => {
    expect(body("user_preferences_guard")).toContain(
      "raise exception 'this account has been deleted' using errcode = 'insufficient_privilege';",
    );
    expect(sql).toContain(
      "create trigger user_preferences_guard before insert on public.user_preferences\n" +
        "  for each row execute function public.user_preferences_guard();",
    );
    expect(sql).toContain(
      "revoke all on function public.user_preferences_guard() from public, anon, authenticated, service_role;",
    );
  });
});
