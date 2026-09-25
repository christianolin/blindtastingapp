// The name is ONE field everywhere (account name step spec, 2026-09-25):
// signup, the invited account's welcome step and Profile & settings each
// collect or edit the one display name. Joining a first and a last field
// produced "Carsten Olin Olin" (a whole invited name pre-filled into the
// first box, plus a last name typed into the second). This walks every
// .ts/.tsx file under src/ and fails on a token of that split coming back.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.join(process.cwd(), "src");
const THIS_FILE = path.join(SRC_DIR, "lib", "auth", "name-split-retired.test.ts");

/** Files the welcome-step task (plan Task 3) converts; it empties this list. */
const STILL_SPLIT: string[] = [
  path.join(SRC_DIR, "app", "auth", "set-password", "actions.ts"),
  path.join(SRC_DIR, "app", "auth", "set-password", "set-password-form.tsx"),
  path.join(SRC_DIR, "lib", "auth", "full-name.ts"),
  path.join(SRC_DIR, "lib", "auth", "full-name.test.ts"),
  path.join(SRC_DIR, "lib", "auth", "password-copy.ts"),
  path.join(SRC_DIR, "lib", "auth", "password-copy.test.ts"),
];

const FORBIDDEN = [
  /first_name/,
  /last_name/,
  /given-name/,
  /family-name/,
  /\bfullName\b/,
  /full-name/,
  /First name/,
  /Last name/,
  /FIRST_NAME/,
  /lastNameLabel/,
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function mentionsSplit(file: string): boolean {
  const content = readFileSync(file, "utf8");
  return FORBIDDEN.some((re) => re.test(content));
}

describe("the name is one field: no first/last split under src/", () => {
  const exempt = new Set([THIS_FILE, ...STILL_SPLIT]);

  it("every file still exempted exists and still holds a token (the list cannot go stale)", () => {
    for (const file of STILL_SPLIT) {
      expect(existsSync(file)).toBe(true);
      expect(mentionsSplit(file)).toBe(true);
    }
  });

  it(
    "no other file names a first/last-name field, the old joiner or its module",
    () => {
      const offenders = walk(SRC_DIR)
        .filter((file) => !exempt.has(file) && mentionsSplit(file))
        .map((file) => path.relative(SRC_DIR, file).split(path.sep).join("/"));
      expect(offenders).toEqual([]);
    },
    // Reading every file under src/ can miss the default 5 s budget under a
    // full-suite parallel run, though the walk takes well under 1 s alone.
    20000,
  );
});
