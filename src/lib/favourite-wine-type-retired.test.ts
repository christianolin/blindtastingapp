// Favourite wine type is retired from the app (profile-favourites spec D1):
// the settings field, its write, the participants-card info line and
// src/lib/wine-types.ts's export all go, except src/app/u/[id]/page.tsx
// (another build is redesigning that page — CLAUDE.md/the task's worktree
// rules) and src/lib/wine-types.ts itself, which that page still imports.
// This walks every .ts/.tsx file under src/ and fails on a leftover
// reference outside the exemption list, so the removal can never half-land
// silently. The main session empties PENDING_MAIN_SESSION at merge, once it
// has edited src/app/u/[id]/page.tsx per the spec (§5.8) and deleted
// src/lib/wine-types.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.join(process.cwd(), "src");
const THIS_FILE = path.join(SRC_DIR, "lib", "favourite-wine-type-retired.test.ts");
// Spec §5.6/§5.7 also wants favorite_wine_type dropped from database.types.ts's
// Insert and Update (kept only in Row, with a retirement comment), leaving
// exactly one match. This worktree's task explicitly reserves
// database.types.ts for a separate SQL/typing pass ("Do not edit ...
// database.types.ts — the SQL agent owns them"), so that one edit is out of
// scope here and is exempted rather than asserted on. Whoever lands it should
// tighten this file to assert exactly one match, the way
// favourite-wine-type-retired's own §7 spec describes.
const DATABASE_TYPES_FILE = path.join(SRC_DIR, "lib", "supabase", "database.types.ts");

/** Still pending the main session's merge edit to src/app/u/[id]/page.tsx
 *  (§5.8) — that page keeps importing src/lib/wine-types.ts until then. */
const PENDING_MAIN_SESSION = [
  path.join(SRC_DIR, "app", "u", "[id]", "page.tsx"),
  path.join(SRC_DIR, "lib", "wine-types.ts"),
];

const FORBIDDEN = [/favorite_wine_type/, /favoriteWineType/, /FAVORITE_WINE_TYPE/, /@\/lib\/wine-types/];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("favourite wine type is retired from the app (D1)", () => {
  const allFiles = walk(SRC_DIR);
  const exempt = new Set([THIS_FILE, DATABASE_TYPES_FILE, ...PENDING_MAIN_SESSION]);
  const checked = allFiles.filter((f) => !exempt.has(f));

  it("PENDING_MAIN_SESSION cannot go stale: every exempted file still exists and still contains a token", () => {
    for (const file of PENDING_MAIN_SESSION) {
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, "utf8");
      expect(FORBIDDEN.some((re) => re.test(content))).toBe(true);
    }
  });

  it(
    "no other file under src/ mentions favorite_wine_type, favoriteWineType, FAVORITE_WINE_TYPE or @/lib/wine-types",
    () => {
      const offenders: string[] = [];
      for (const file of checked) {
        const content = readFileSync(file, "utf8");
        if (FORBIDDEN.some((re) => re.test(content))) {
          offenders.push(path.relative(SRC_DIR, file));
        }
      }
      expect(offenders).toEqual([]);
    },
    // Reading every file under src/ is heavier than a typical pure-logic
    // test; the default 5s budget can be missed under a full-suite parallel
    // run's CPU contention even though the walk itself takes well under 1s
    // in isolation.
    20000,
  );

  // Not asserted here: this worktree's task reserves database.types.ts for a
  // separate SQL/typing pass (see the comment on DATABASE_TYPES_FILE above),
  // so removing favorite_wine_type from Insert/Update is out of scope. This
  // check just confirms the file the spec names is where it's expected to be.
  it("database.types.ts (out of scope here) still names favorite_wine_type at least once", () => {
    const content = readFileSync(DATABASE_TYPES_FILE, "utf8");
    expect(content).toMatch(/favorite_wine_type/);
  });
});
