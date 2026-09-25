# Account name step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signup and the invited account's welcome step each ask for ONE name field ("Your name"), normalised and validated on the server, with a readable pre-fill on the welcome step — so "Carsten Olin Olin" can never be produced again.

**Architecture:** A new pure module `src/lib/auth/name.ts` owns the one name rule (`normalizeName`, `checkName`, `suggestNameFromEmail`, `NAME_MAX`, the copy). `src/lib/auth/password-copy.ts` gains the welcome step's pre-fill (`setupNameSuggestion`) and the action's name read (`passwordFormName`); both server actions call these pure functions, so every rule is unit-tested even though the actions themselves cannot load under vitest. `src/lib/auth/full-name.ts` (the two-part joiner) is deleted once its last importer is gone, and a guard test fails on any first/last-name token coming back under `src/`. One production deploy, no migration.

**Tech Stack:** Next.js 16.2 App Router (server actions, `useActionState`), React 19.2, TypeScript (strict), Supabase Auth (`auth.signUp`, `auth.updateUser`), vitest 3 (node environment, no `@/` alias), Tailwind, shadcn/ui on @base-ui/react.

**Spec:** `docs/superpowers/specs/2026-09-25-account-name-step-design.md`

## Global Constraints

- Work only in the worktree `C:\Users\Public\repos\blindtastingapp-signup`, branch `account-setup` (base: `origin/master` 2ddc479 plus the spec commit 0178f99). Start EVERY shell command with `cd /c/Users/Public/repos/blindtastingapp-signup && ...` (the shell's cwd resets after each call). Never touch `C:\Users\Public\repos\blindtastingapp` — the owner's checkout, with `master` checked out and an uncommitted `package.json` the owner owns — and never check out or update the local `master` branch.
- Commit with the repository identity: prefix every `git commit` with `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com` and end every message with a last `-m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"` (use the model name your own session's attribution reminder gives, if it names a different one). Never `git add -A` or `git add .`; add exactly the files the task names. Never push — only Task 6 (main session) pushes.
- Line endings: the working copy is CRLF (`core.autocrlf=true`). Snippets below are shown with LF. Make every change to an EXISTING file with the Edit tool (it matches either ending); never with `sed`, `awk` or a script doing byte-exact replacement. New files may be written with the Write tool. Never rewrite `src/components/invite/invite-people-dialog.tsx` whole: its line 46 (`const FOOTER_TOKEN = "…";`) holds the Private Use Area character U+E000, which a whole-file rewrite can silently drop.
- A `"use server"` file exports only async functions. Add NO new export of any kind (no function, const, type or re-export) to `src/app/signup/actions.ts` or `src/app/auth/set-password/actions.ts`. Their existing `export type SignUpFormState` / `export type SetPasswordFormState` declarations predate this plan and work in production; leave them exactly as they are. Every helper lives in a plain module (`src/lib/auth/name.ts`, `src/lib/auth/password-copy.ts`).
- Pure modules under `src/lib/auth/` import each other with RELATIVE paths (`./name`), never `@/…` — vitest has no `@/` alias. (A type-only `import type` is erased and is fine.)
- Copy, verbatim from spec §4 (straight apostrophes, U+0027): **"Your name"** · **"How you'll appear to other tasters."** · **"Please enter your name."** · **"Please use a shorter name (80 characters at most)."** · invite dialog helper **"They'll confirm it when they join."** Render copy in JSX only through a constant inside `{…}`, never as JSX text (eslint's `react/no-unescaped-entities` rejects a bare `'`).
- The name field, both forms: `name="name"`, `id="name"`, `autoComplete="name"`, `maxLength={NAME_MAX}` (80), `required`, helper line `id="name-hint"` wired with `aria-describedby="name-hint"`. `/profile/edit`'s single "Name" field is NOT changed.
- Unchanged (spec D6): `/auth/callback`, `/auth/confirm-hash`, `/auth/confirm`, the password gate, `passwordUpdateData(mode, displayName)`'s shape, the `password_set` flag written in the SAME `supabase.auth.updateUser({ password, data })` call as the password (never split into a second call), the form's `window.location.replace(passwordNext(done))` exit, reset mode showing no name field, `sameSiteNext`/`passwordNext`/`safeNext`, `src/lib/email/sender.ts`, the tasting invite actions, `handle_new_user()`, the email templates and `docs/email/*`, `database.types.ts`, `supabase/migrations/`. Auth metadata written at signup is `{ display_name }` only; nothing writes `first_name`/`last_name` any more.
- Tests: one file `npx vitest run <path>`; all `npx vitest run` (178 files / 3654 tests pass at base). Types: `npx tsc --noEmit`. Lint: `npx eslint <files>`. No dev server, no browser, no `next build` in Tasks 1-5; Task 6 (main session) runs those.
- Production is live (blindrapp.vercel.app, daily users): a push to `master` is a production deploy. Only Task 6 pushes, after its gates.

## Review Focus

- **The bug's own path: a full name already in the pre-fill** (the inviter typed "Carsten Olin", or an account whose metadata already holds its saved name opens `/auth/set-password` directly). Expected: one field shows "Carsten Olin"; saving it unchanged stores "Carsten Olin", never a doubled surname. Pinned in Task 3 (`setupNameSuggestion` → `passwordFormName` → `passwordUpdateData` round trip) and by the guard test from Task 2, which Task 3 tightens so no second name field can come back.
- **A form rendered by the previous deploy** (two name fields under other names, none called `name`) posting to the new action. Expected: refused with "Please enter your name." BEFORE anything is written — no password saved without a name, no profile write; a reload shows the new form. Pinned in Task 1 (`checkName("")`) and Task 3 (`passwordFormName("setup", "")`, plus the action calling it before `getUser`/`updateUser`).
- **Whitespace-only, padded or over-long names, including a pre-fill over 80 characters** (the input's `maxLength` does not cut a value React sets). Expected: spaces-only refused; padding trimmed before the length check; 80 characters accepted and 81 refused with the NAME_TOO_LONG line, counted in code points (an emoji or accented letter is one); the pre-fill is never silently shortened. Pinned in Task 1 (`checkName`) and Task 3 (`setupNameSuggestion` with an 81-character name).
- **A metadata name that is missing, blank or not a string** (tasting invites send no name; a legacy or crafted metadata value). Expected: the email suggestion, never blank for a real address, never "[object Object]". Pinned in Task 3.
- **Email local parts beyond the spec's three examples** — uppercase, leading/trailing/repeated separators, non-ASCII letters, plus addressing, digits only, empty. Expected: readable where possible; the raw local part when nothing is left; empty only when the local part itself is. Pinned in Task 1.

---

## File Structure

Created:
- `src/lib/auth/name.ts` — the one name rule and its copy. Pure, no imports.
- `src/lib/auth/name.test.ts` — its tests (replaces `full-name.test.ts`).
- `src/lib/auth/name-split-retired.test.ts` — guard: walks `src/`, fails on any first/last-name token.

Modified:
- `src/app/signup/actions.ts`, `src/app/signup/signup-form.tsx` — one field.
- `src/lib/auth/password-copy.ts`, `src/lib/auth/password-copy.test.ts` — `nameHint` replaces `lastNameLabel`; `setupNameSuggestion`, `passwordFormName`.
- `src/app/auth/set-password/page.tsx`, `set-password-form.tsx`, `actions.ts` — one field, the pre-fill, the server check.
- `src/lib/invites/copy.ts`, `src/lib/invites/copy.test.ts`, `src/components/invite/invite-people-dialog.tsx` — the D5 helper line.
- `CLAUDE.md` — one bullet.

Deleted (Task 3, once nothing imports them): `src/lib/auth/full-name.ts`, `src/lib/auth/full-name.test.ts`.

## Interface Contracts (shared across tasks)

```ts
// src/lib/auth/name.ts (Task 1)
export const NAME_MAX = 80;
export const NAME_LABEL = "Your name";
export const NAME_HINT = "How you'll appear to other tasters.";
export const NAME_REQUIRED = "Please enter your name.";
export const NAME_TOO_LONG = "Please use a shorter name (80 characters at most).";
export function normalizeName(raw: string): string;
export function checkName(raw: string): { name: string } | { error: string };
export function suggestNameFromEmail(email: string): string;

// src/lib/auth/password-copy.ts (Task 3)
export type PasswordCopy = {
  title: string; lead: string;
  nameLabel: string | null;   // "Your name" in setup, null in reset
  nameHint: string | null;    // NAME_HINT in setup, null in reset (replaces lastNameLabel)
  passwordLabel: string; hint: string; submit: string; pending: string; expired: string;
};
export function setupNameSuggestion(metadataName: unknown, email: string | null | undefined): string;
export function passwordFormName(mode: PasswordMode, raw: string): { name: string } | { error: string };
// unchanged: passwordUpdateData(mode: PasswordMode, displayName: string): Record<string, unknown>

// src/lib/invites/copy.ts (Task 4)
export const INVITEE_NAME_HINT = "They'll confirm it when they join.";
```

---

### Task 1: The name rule (`src/lib/auth/name.ts`)

**Files:**
- Create: `src/lib/auth/name.ts`
- Create: `src/lib/auth/name.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NAME_MAX`, `NAME_LABEL`, `NAME_HINT`, `NAME_REQUIRED`, `NAME_TOO_LONG`, `normalizeName(raw: string): string`, `checkName(raw: string): { name: string } | { error: string }`, `suggestNameFromEmail(email: string): string` — exactly as in Interface Contracts. Tasks 2 and 3 import them.

Do NOT delete or edit `src/lib/auth/full-name.ts` in this task — two server actions still import it; Task 3 deletes it once they no longer do. Both new files must not contain any of these strings, because Task 2 adds a guard test that scans every file under `src/` for them: `first_name`, `last_name`, `given-name`, `family-name`, `fullName`, `full-name`, `First name`, `Last name`, `FIRST_NAME`, `lastNameLabel`. The content below is already clean — copy it exactly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NAME_HINT,
  NAME_LABEL,
  NAME_MAX,
  NAME_REQUIRED,
  NAME_TOO_LONG,
  checkName,
  normalizeName,
  suggestNameFromEmail,
} from "./name";

describe("name copy (spec §4, verbatim)", () => {
  it("label, helper, refusals and the limit", () => {
    expect(NAME_LABEL).toBe("Your name");
    expect(NAME_HINT).toBe("How you'll appear to other tasters.");
    expect(NAME_REQUIRED).toBe("Please enter your name.");
    expect(NAME_TOO_LONG).toBe("Please use a shorter name (80 characters at most).");
    expect(NAME_MAX).toBe(80);
  });
});

describe("normalizeName", () => {
  it("trims both ends", () => {
    expect(normalizeName("  Carsten Olin  ")).toBe("Carsten Olin");
  });

  it("collapses every run of inner whitespace to one space", () => {
    expect(normalizeName("Anna   Marie\tde \n la  Cruz")).toBe("Anna Marie de la Cruz");
  });

  it("is empty for an empty or blank name", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(" \t\n ")).toBe("");
  });

  it("returns a full name as itself: nothing is joined or added", () => {
    expect(normalizeName("Carsten Olin")).toBe("Carsten Olin");
  });
});

describe("checkName (the server's rule)", () => {
  it("returns the normalised name", () => {
    expect(checkName("  Carsten   Olin ")).toEqual({ name: "Carsten Olin" });
  });

  it("refuses an empty or blank name", () => {
    expect(checkName("")).toEqual({ error: "Please enter your name." });
    expect(checkName("   ")).toEqual({ error: "Please enter your name." });
  });

  it("accepts 80 characters and refuses 81", () => {
    expect(checkName("a".repeat(80))).toEqual({ name: "a".repeat(80) });
    expect(checkName("a".repeat(81))).toEqual({
      error: "Please use a shorter name (80 characters at most).",
    });
  });

  it("measures the length after normalising, so padding never counts", () => {
    expect(checkName(`   ${"a".repeat(80)}   `)).toEqual({ name: "a".repeat(80) });
  });

  it("counts characters, not UTF-16 units: 80 emoji fit, 81 accented letters do not", () => {
    const glasses = "\u{1F377}".repeat(80);
    expect(checkName(glasses)).toEqual({ name: glasses });
    expect(checkName("\u00e9".repeat(81))).toEqual({ error: NAME_TOO_LONG });
  });
});

describe("suggestNameFromEmail", () => {
  it("splits on dots and title-cases each part", () => {
    expect(suggestNameFromEmail("carsten.olin@example.com")).toBe("Carsten Olin");
  });

  it("title-cases a one-part local part", () => {
    expect(suggestNameFromEmail("cdo@example.com")).toBe("Cdo");
  });

  it("splits on underscores and digits, dropping the digits", () => {
    expect(suggestNameFromEmail("jens_h2@example.com")).toBe("Jens H");
  });

  it("splits on hyphens", () => {
    expect(suggestNameFromEmail("anna-maria@example.com")).toBe("Anna Maria");
  });

  it("ignores leading, trailing and repeated separators", () => {
    expect(suggestNameFromEmail(".carsten..olin_@example.com")).toBe("Carsten Olin");
  });

  it("lower-cases the rest of each part", () => {
    expect(suggestNameFromEmail("CDO@example.com")).toBe("Cdo");
    expect(suggestNameFromEmail("CARSTEN.OLIN@example.com")).toBe("Carsten Olin");
  });

  it("keeps letters outside ASCII", () => {
    expect(suggestNameFromEmail("s\u00f8ren.\u00f8rsted@example.dk")).toBe("S\u00f8ren \u00d8rsted");
  });

  it("keeps any other character inside its part (plus addressing is not a separator)", () => {
    expect(suggestNameFromEmail("carsten+blindr@example.com")).toBe("Carsten+blindr");
  });

  it("falls back to the raw local part when nothing is left to title-case", () => {
    expect(suggestNameFromEmail("2024@example.com")).toBe("2024");
    expect(suggestNameFromEmail("__@example.com")).toBe("__");
  });

  it("is empty only when the local part itself is", () => {
    expect(suggestNameFromEmail("")).toBe("");
    expect(suggestNameFromEmail("@example.com")).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/name.test.ts`
Expected: FAIL — the suite cannot load `./name` ("Failed to load url ./name … Does the file exist?"); 0 tests run.

- [ ] **Step 3: Write the module**

Create `src/lib/auth/name.ts`:

```ts
// The one name a person goes by everywhere (profiles.display_name). Signup
// and the invited account's welcome step (/auth/set-password, setup mode)
// each ask for it in ONE field; Profile & settings edits the same value.
// There are no separate parts on purpose: from 2026-09-19 both forms asked
// for two and joined them, and a welcome step that pre-filled a whole
// invited name into the first box saved "Carsten Olin Olin"
// (docs/superpowers/specs/2026-09-25-account-name-step-design.md).
// Pure module with no imports at all, so vitest can load it and
// password-copy.ts can reuse it.

/** The longest name anyone can save, in characters (Unicode code points). */
export const NAME_MAX = 80;

// Owner copy (spec §4), verbatim.
export const NAME_LABEL = "Your name";
export const NAME_HINT = "How you'll appear to other tasters.";
export const NAME_REQUIRED = "Please enter your name.";
export const NAME_TOO_LONG = "Please use a shorter name (80 characters at most).";

/** Trims both ends and collapses every run of whitespace to one space. Never joins, adds or drops a word. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The server's rule for a submitted name (spec D2): normalised, then refused
 * when empty or longer than NAME_MAX. The length is counted in code points
 * after normalising, so an emoji or an accented letter is one character and
 * surrounding spaces never count.
 */
export function checkName(raw: string): { name: string } | { error: string } {
  const name = normalizeName(raw);
  if (!name) return { error: NAME_REQUIRED };
  if (Array.from(name).length > NAME_MAX) return { error: NAME_TOO_LONG };
  return { name };
}

function titleCase(part: string): string {
  const [head = "", ...rest] = Array.from(part);
  return head.toUpperCase() + rest.join("").toLowerCase();
}

/**
 * A readable name suggested from an email address (spec D3): the local part
 * split on ".", "_", "-" and digits, each part title-cased, joined with
 * spaces: "carsten.olin" gives "Carsten Olin", "cdo" gives "Cdo", "jens_h2"
 * gives "Jens H". Any other character stays inside its part. When nothing is
 * left (a local part of only digits or separators) it is the raw local part,
 * so it is empty only when the local part itself is.
 */
export function suggestNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  const pretty = local
    .split(/[._0-9-]+/)
    .filter(Boolean)
    .map(titleCase)
    .join(" ");
  return pretty || local;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/name.test.ts && npx tsc --noEmit && npx eslint src/lib/auth/name.ts src/lib/auth/name.test.ts`
Expected: 20 tests PASS; tsc and eslint print nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git add src/lib/auth/name.ts src/lib/auth/name.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(auth): one name rule: normalizeName, checkName, suggestNameFromEmail" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Signup asks for one name

**Files:**
- Create: `src/lib/auth/name-split-retired.test.ts`
- Modify: `src/app/signup/actions.ts:5`, `:15-20`, `:33-39`
- Modify: `src/app/signup/signup-form.tsx:8`, `:28-43`

**Interfaces:**
- Consumes (Task 1): `checkName`, `NAME_LABEL`, `NAME_HINT`, `NAME_MAX` from `@/lib/auth/name`.
- Produces: the guard test `src/lib/auth/name-split-retired.test.ts` with a `STILL_SPLIT` exemption list that Task 3 empties. The signup form posts `name` (not the two old fields); the action writes auth metadata `{ display_name }` only. `SignUpFormState` is unchanged.

- [ ] **Step 1: Write the failing guard test**

Create `src/lib/auth/name-split-retired.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/name-split-retired.test.ts`
Expected: FAIL — the second test's `offenders` is `["app/signup/actions.ts", "app/signup/signup-form.tsx"]`; the first test passes. (If `offenders` lists anything else, that file carries a token nobody knew about: stop and report it.)

- [ ] **Step 3: Change the signup action**

In `src/app/signup/actions.ts` make three edits with the Edit tool.

Replace
```ts
import { FIRST_NAME_REQUIRED, fullName } from "@/lib/auth/full-name";
```
with
```ts
import { checkName } from "@/lib/auth/name";
```

Replace
```ts
  // First name is required, last name optional; the two become the one name
  // shown everywhere (profiles.display_name, via handle_new_user).
  const firstName = String(formData.get("first_name") ?? "");
  const lastName = String(formData.get("last_name") ?? "");
  const displayName = fullName(firstName, lastName);
  if (!fullName(firstName, "")) return { error: FIRST_NAME_REQUIRED };
```
with
```ts
  // One field, "Your name" (src/lib/auth/name.ts): normalised, never joined
  // from parts, and refused when empty or over NAME_MAX. It becomes the one
  // name shown everywhere (profiles.display_name, via handle_new_user).
  const checked = checkName(String(formData.get("name") ?? ""));
  if ("error" in checked) return { error: checked.error };
```

Replace
```ts
      // The parts ride along in the auth metadata too, so a later feature can
      // use the last name on its own without asking again.
      data: {
        display_name: displayName,
        first_name: fullName(firstName, ""),
        last_name: fullName(lastName, "") || null,
      },
```
with
```ts
      // display_name only: handle_new_user copies it into the profile, and the
      // "Confirm signup" email template greets {{ .Data.display_name }}.
      data: { display_name: checked.name },
```

Leave `"use server"`, `export type SignUpFormState`, the `next`/`callback` lines, `emailRedirectTo` and the error/success returns exactly as they are.

- [ ] **Step 4: Change the signup form**

In `src/app/signup/signup-form.tsx` make two edits with the Edit tool.

Replace
```tsx
import { Label } from "@/components/ui/label";
```
with
```tsx
import { Label } from "@/components/ui/label";
import { NAME_HINT, NAME_LABEL, NAME_MAX } from "@/lib/auth/name";
```

Replace
```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            name="first_name"
            autoComplete="given-name"
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="last_name">Last name (optional)</Label>
          <Input id="last_name" name="last_name" autoComplete="family-name" />
        </div>
      </div>
```
with
```tsx
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{NAME_LABEL}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          maxLength={NAME_MAX}
          required
          autoFocus
          aria-describedby="name-hint"
        />
        <p id="name-hint" className="text-xs text-muted-foreground">
          {NAME_HINT}
        </p>
      </div>
```

The Email and Password fields, the error line, the button and the "Sign in" link stay exactly as they are.

- [ ] **Step 5: Run the guard, types and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/name-split-retired.test.ts src/lib/auth/name.test.ts && npx tsc --noEmit && npx eslint src/app/signup/actions.ts src/app/signup/signup-form.tsx src/lib/auth/name-split-retired.test.ts`
Expected: both files PASS (2 + 20 tests); tsc and eslint print nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git add src/lib/auth/name-split-retired.test.ts src/app/signup/actions.ts src/app/signup/signup-form.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(signup): one Your name field instead of first + last" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The welcome step asks for one name, pre-filled with a readable suggestion

This is the one larger task: `PasswordCopy`'s type, the form that reads it and the action that reads the form's field must change in the same commit, or the branch stops type-checking (or the form posts a field the action does not read).

**Files:**
- Modify: `src/lib/auth/password-copy.ts:9-10` (imports), `:42-55` (type), `:60-83` (copy table), `:104-111` (append after `passwordUpdateData`)
- Modify: `src/lib/auth/password-copy.test.ts:1-10` (imports), `:80-108` (copy tests), end of file (new tests)
- Modify: `src/app/auth/set-password/page.tsx:10-15`, `:43-46`
- Modify: `src/app/auth/set-password/set-password-form.tsx:7`, `:34-38`, `:68-95`
- Modify: `src/app/auth/set-password/actions.ts:3-10`, `:35-38`
- Modify: `src/lib/auth/name-split-retired.test.ts` (empty `STILL_SPLIT`, add one test)
- Delete: `src/lib/auth/full-name.ts`, `src/lib/auth/full-name.test.ts`

**Interfaces:**
- Consumes (Task 1): `NAME_LABEL`, `NAME_HINT`, `NAME_MAX`, `checkName`, `normalizeName`, `suggestNameFromEmail`. (Task 2): the guard test and its `STILL_SPLIT` list.
- Produces: `PasswordCopy.nameHint: string | null` (replaces `lastNameLabel`); `setupNameSuggestion(metadataName: unknown, email: string | null | undefined): string`; `passwordFormName(mode: PasswordMode, raw: string): { name: string } | { error: string }`. `passwordUpdateData(mode, displayName)` is unchanged. The welcome-step form posts `name`.

- [ ] **Step 1: Write the failing password-copy tests**

In `src/lib/auth/password-copy.test.ts` make four edits with the Edit tool.

Replace
```ts
import {
  PASSWORD_DEFAULT_NEXT,
  passwordCopy,
  passwordMode,
  passwordNext,
  passwordUpdateData,
  signedOutRedirect,
} from "./password-copy";
```
with
```ts
import {
  PASSWORD_DEFAULT_NEXT,
  passwordCopy,
  passwordFormName,
  passwordMode,
  passwordNext,
  passwordUpdateData,
  setupNameSuggestion,
  signedOutRedirect,
} from "./password-copy";
```

Replace (setup-mode copy)
```ts
      nameLabel: "First name",
      lastNameLabel: "Last name (optional)",
```
with
```ts
      nameLabel: "Your name",
      nameHint: "How you'll appear to other tasters.",
```

Replace (reset-mode copy)
```ts
      nameLabel: null,
      lastNameLabel: null,
```
with
```ts
      nameLabel: null,
      nameHint: null,
```

Append at the very end of the file (after the closing `});` of `describe("set-password metadata write", …)`):

```ts

describe("setup name pre-fill (spec D3)", () => {
  it("uses the name the inviter typed, normalised", () => {
    expect(setupNameSuggestion("Carsten", "carsten.olin@example.com")).toBe("Carsten");
    expect(setupNameSuggestion("  Carsten   Olin ", "x@example.com")).toBe("Carsten Olin");
  });

  it("pre-fills a full name as itself, with nothing added", () => {
    // 2026-09-19: a whole name pre-filled into the first of two boxes, plus a
    // surname in the second, was saved as "Carsten Olin Olin".
    expect(setupNameSuggestion("Carsten Olin", "carsten.olin@example.com")).toBe("Carsten Olin");
  });

  it("falls back to a readable email local part when no name was typed", () => {
    expect(setupNameSuggestion(undefined, "carsten.olin@example.com")).toBe("Carsten Olin");
    expect(setupNameSuggestion(undefined, "jens_h2@example.com")).toBe("Jens H");
  });

  it("treats a blank or non-string metadata name as no name", () => {
    for (const unusable of ["", "   ", null, 42, {}, ["Carsten"]]) {
      expect(setupNameSuggestion(unusable, "cdo@example.com")).toBe("Cdo");
    }
  });

  it("is empty only with neither a name nor an email", () => {
    expect(setupNameSuggestion(undefined, undefined)).toBe("");
    expect(setupNameSuggestion(undefined, null)).toBe("");
  });

  it("never shortens a suggestion over the limit; the save refuses it instead", () => {
    const long = "a".repeat(81);
    expect(setupNameSuggestion(long, "x@example.com")).toBe(long);
    expect(passwordFormName("setup", long)).toEqual({
      error: "Please use a shorter name (80 characters at most).",
    });
  });
});

describe("set-password name field (the action's rule)", () => {
  it("setup mode saves the normalised name", () => {
    expect(passwordFormName("setup", "  Carsten   Olin ")).toEqual({ name: "Carsten Olin" });
  });

  it("setup mode refuses a blank name, and a form that sent no name field at all", () => {
    // The action reads a missing field as "": a form rendered by the previous
    // deploy posts its two old fields and none called "name".
    expect(passwordFormName("setup", "")).toEqual({ error: "Please enter your name." });
    expect(passwordFormName("setup", "   ")).toEqual({ error: "Please enter your name." });
  });

  it("reset mode never has a name, whatever the form sent", () => {
    expect(passwordFormName("reset", "")).toEqual({ name: "" });
    expect(passwordFormName("reset", "Mallory")).toEqual({ name: "" });
  });

  it("a pre-filled full name saved unchanged is written once, with the flag, in one data object", () => {
    const named = passwordFormName(
      "setup",
      setupNameSuggestion("Carsten Olin", "carsten.olin@example.com"),
    );
    expect(named).toEqual({ name: "Carsten Olin" });
    if ("name" in named) {
      expect(passwordUpdateData("setup", named.name)).toEqual({
        password_set: true,
        display_name: "Carsten Olin",
      });
    }
  });
});
```

- [ ] **Step 2: Tighten the guard test**

In `src/lib/auth/name-split-retired.test.ts` make two edits with the Edit tool.

Replace
```ts
/** Files the welcome-step task (plan Task 3) converts; it empties this list. */
const STILL_SPLIT: string[] = [
  path.join(SRC_DIR, "app", "auth", "set-password", "actions.ts"),
  path.join(SRC_DIR, "app", "auth", "set-password", "set-password-form.tsx"),
  path.join(SRC_DIR, "lib", "auth", "full-name.ts"),
  path.join(SRC_DIR, "lib", "auth", "full-name.test.ts"),
  path.join(SRC_DIR, "lib", "auth", "password-copy.ts"),
  path.join(SRC_DIR, "lib", "auth", "password-copy.test.ts"),
];
```
with
```ts
/** Files still allowed a token. Emptied by the welcome-step task (plan
 *  Task 3); an entry here must be a deliberate, commented decision. */
const STILL_SPLIT: string[] = [];
```

Replace
```ts
  it("every file still exempted exists and still holds a token (the list cannot go stale)", () => {
```
with
```ts
  it("the old joiner module is gone and nothing is exempt any more", () => {
    expect(existsSync(path.join(SRC_DIR, "lib", "auth", "full-name.ts"))).toBe(false);
    expect(existsSync(path.join(SRC_DIR, "lib", "auth", "full-name.test.ts"))).toBe(false);
    expect(STILL_SPLIT).toEqual([]);
  });

  it("every file still exempted exists and still holds a token (the list cannot go stale)", () => {
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/password-copy.test.ts src/lib/auth/name-split-retired.test.ts`
Expected: FAIL.
- `password-copy.test.ts`: the two "set-password copy (verbatim)" tests fail (received `lastNameLabel`, `nameLabel: "First name"`); the new tests fail with `TypeError: setupNameSuggestion is not a function` / `passwordFormName is not a function`; the older mode/next/signed-out/metadata tests still pass.
- `name-split-retired.test.ts`: "the old joiner module is gone" fails (`full-name.ts` exists); the offenders test lists `app/auth/set-password/actions.ts`, `app/auth/set-password/set-password-form.tsx`, `lib/auth/full-name.test.ts`, `lib/auth/full-name.ts`, `lib/auth/password-copy.ts` (order may differ; `password-copy.test.ts` is already clean).

- [ ] **Step 4: Change `password-copy.ts`**

In `src/lib/auth/password-copy.ts` make five edits with the Edit tool.

Replace
```ts
import { sameSiteNext } from "./login-copy";
import { PASSWORD_SET_FLAG, SET_PASSWORD_PATH } from "./paths";
```
with
```ts
import { sameSiteNext } from "./login-copy";
import { NAME_HINT, NAME_LABEL, checkName, normalizeName, suggestNameFromEmail } from "./name";
import { PASSWORD_SET_FLAG, SET_PASSWORD_PATH } from "./paths";
```

Replace
```ts
  /** null in reset mode: the name field is not shown. */
  nameLabel: string | null;
  /** The optional last-name field beside it; null when there is no name step. */
  lastNameLabel: string | null;
```
with
```ts
  /** null in reset mode: the name field is not shown. */
  nameLabel: string | null;
  /** The helper line under the name field; null when there is no name field. */
  nameHint: string | null;
```

Replace
```ts
    nameLabel: "First name",
    lastNameLabel: "Last name (optional)",
```
with
```ts
    nameLabel: NAME_LABEL,
    nameHint: NAME_HINT,
```

Replace
```ts
    nameLabel: null,
    lastNameLabel: null,
```
with
```ts
    nameLabel: null,
    nameHint: null,
```

Replace (the end of `passwordUpdateData`, the last lines of the file)
```ts
  if (mode === "setup" && displayName.trim()) data.display_name = displayName;
  return data;
}
```
with
```ts
  if (mode === "setup" && displayName.trim()) data.display_name = displayName;
  return data;
}

/**
 * Setup mode's pre-fill (spec D3): the name the inviter typed
 * (`user_metadata.display_name`, normalised) when it holds one, else a
 * readable version of the email's local part (suggestNameFromEmail). Only a
 * suggestion: the person edits it freely and nothing is saved until "Save
 * and continue". Never shortened: a name over NAME_MAX is refused by the
 * save, not cut.
 */
export function setupNameSuggestion(
  metadataName: unknown,
  email: string | null | undefined,
): string {
  if (typeof metadataName === "string") {
    const name = normalizeName(metadataName);
    if (name) return name;
  }
  return suggestNameFromEmail(email ?? "");
}

/**
 * The action's read of the name field. Setup mode runs checkName: the name is
 * normalised, and refused when empty (a missing field reads as empty) or over
 * NAME_MAX. Reset mode has no name field and never writes one, whatever the
 * form sent.
 */
export function passwordFormName(
  mode: PasswordMode,
  raw: string,
): { name: string } | { error: string } {
  if (mode === "reset") return { name: "" };
  return checkName(raw);
}
```

Do not touch `passwordMode`, `passwordNext`, `passwordCopy`, `signedOutRedirect`, `passwordUpdateData` or the other copy strings (`"Saving…"` uses U+2026 — leave that line alone).

- [ ] **Step 5: Run the password-copy tests and watch them pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth/password-copy.test.ts`
Expected: PASS (every test in the file). `npx tsc --noEmit` would still fail at `set-password-form.tsx` (`copy.lastNameLabel`) — fixed in Step 7.

- [ ] **Step 6: The page's pre-fill**

In `src/app/auth/set-password/page.tsx` make two edits with the Edit tool.

Replace
```ts
import {
  passwordCopy,
  passwordMode,
  passwordNext,
  signedOutRedirect,
} from "@/lib/auth/password-copy";
```
with
```ts
import {
  passwordCopy,
  passwordMode,
  passwordNext,
  setupNameSuggestion,
  signedOutRedirect,
} from "@/lib/auth/password-copy";
```

Replace
```ts
  const suggestedName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "";
```
with
```ts
  // Setup mode's pre-fill (spec D3): the name the inviter typed, else a
  // readable version of the email's local part. Only a suggestion.
  const suggestedName = setupNameSuggestion(user.user_metadata?.display_name, user.email);
```

- [ ] **Step 7: The form's one field**

In `src/app/auth/set-password/set-password-form.tsx` make three edits with the Edit tool.

Replace
```tsx
import { Label } from "@/components/ui/label";
```
with
```tsx
import { Label } from "@/components/ui/label";
import { NAME_MAX } from "@/lib/auth/name";
```

Replace
```tsx
  // The suggested name (from the invite, or the email's local part) prefills
  // the first-name field; the last name starts empty and stays optional.
  const [name, setName] = useState(suggestedName);
  const [lastName, setLastName] = useState("");
  const [password, setPasswordValue] = useState("");
```
with
```tsx
  // One name field, pre-filled with setupNameSuggestion's suggestion (the
  // name the inviter typed, else a readable version of the email's local
  // part). The person edits it freely; nothing is saved until they submit.
  const [name, setName] = useState(suggestedName);
  const [password, setPasswordValue] = useState("");
```

Replace
```tsx
      {copy.nameLabel ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="first_name">{copy.nameLabel}</Label>
            <Input
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className={TAP}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="last_name">{copy.lastNameLabel}</Label>
            <Input
              id="last_name"
              name="last_name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={TAP}
            />
          </div>
        </div>
      ) : null}
```
with
```tsx
      {copy.nameLabel ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{copy.nameLabel}</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            aria-describedby="name-hint"
            className={TAP}
          />
          <p id="name-hint" className="text-xs text-muted-foreground">
            {copy.nameHint}
          </p>
        </div>
      ) : null}
```

Leave the hidden `mode`/`next`/username inputs, the password field (its `autoFocus={!copy.nameLabel}` stays), the error line, the button and — above all — the `useEffect` with `window.location.replace(passwordNext(done))` exactly as they are.

- [ ] **Step 8: The action's server check**

In `src/app/auth/set-password/actions.ts` make two edits with the Edit tool.

Replace
```ts
import { fullName } from "@/lib/auth/full-name";
import { createClient } from "@/lib/supabase/server";
import {
  passwordCopy,
  passwordMode,
  passwordNext,
  passwordUpdateData,
} from "@/lib/auth/password-copy";
```
with
```ts
import { createClient } from "@/lib/supabase/server";
import {
  passwordCopy,
  passwordFormName,
  passwordMode,
  passwordNext,
  passwordUpdateData,
} from "@/lib/auth/password-copy";
```

Replace
```ts
  // Setup mode asks for a first name (required by the form) and an optional
  // last name; together they become the one name shown everywhere.
  const displayName =
    mode === "setup" ? fullName(field(formData, "first_name"), field(formData, "last_name")) : "";
```
with
```ts
  // Setup mode asks for one name, "Your name" (src/lib/auth/name.ts): it is
  // normalised, and refused when empty (a missing field reads as empty) or
  // over NAME_MAX, before anything is written, so a refused name never
  // leaves a password saved without it. Reset mode has no name field and
  // never writes one, whatever the form sent.
  const named = passwordFormName(mode, field(formData, "name"));
  if ("error" in named) return { error: named.error };
  const displayName = named.name;
```

Everything after it stays as it is: `getUser()`, the ONE `supabase.auth.updateUser({ password, data: passwordUpdateData(mode, displayName) })` call (the `password_set` flag rides in it — never split it), the `if (displayName)` profile update with its `console.error`, and `return { done: next }`. No new export; `export type SetPasswordFormState` is untouched.

- [ ] **Step 9: Delete the old joiner**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && git grep -n "full-name" -- src; git rm src/lib/auth/full-name.ts src/lib/auth/full-name.test.ts`
Expected: the `git grep` prints only lines of `src/lib/auth/full-name.test.ts` and `src/lib/auth/name-split-retired.test.ts` (no module imports `@/lib/auth/full-name` any more); `git rm` prints `rm 'src/lib/auth/full-name.test.ts'` and `rm 'src/lib/auth/full-name.ts'`.

- [ ] **Step 10: Run everything this task touches**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/auth && npx tsc --noEmit && npx eslint src/lib/auth/password-copy.ts src/lib/auth/password-copy.test.ts src/lib/auth/name-split-retired.test.ts src/app/auth/set-password/page.tsx src/app/auth/set-password/set-password-form.tsx src/app/auth/set-password/actions.ts`
Expected: every file under `src/lib/auth` PASSES (including `name-split-retired.test.ts` with 3 tests, `name.test.ts`, `password-copy.test.ts`, `password-gate.test.ts`, `paths.test.ts`); tsc and eslint print nothing.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git add src/lib/auth/password-copy.ts src/lib/auth/password-copy.test.ts src/lib/auth/name-split-retired.test.ts src/app/auth/set-password/page.tsx src/app/auth/set-password/set-password-form.tsx src/app/auth/set-password/actions.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "fix(auth): the welcome step asks for one name, pre-filled with a readable suggestion" -m "The first/last split joined a whole pre-filled invited name with a typed surname (Carsten Olin Olin). One field now, normalised and checked on the server before the password is saved; the old joiner module is gone." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(The `git rm` in Step 9 already staged both deletions; `git show --stat HEAD` lists 8 files: 6 modified, 2 deleted.)

---

### Task 4: The invite dialog says the invitee confirms their own name

**Files:**
- Modify: `src/lib/invites/copy.ts:14` (add a constant after `OPEN_IN_MAIL_APP`)
- Modify: `src/lib/invites/copy.test.ts:2` (import), end of file (one test)
- Modify: `src/components/invite/invite-people-dialog.tsx:11`, `:72-73`, `:122-131`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `INVITEE_NAME_HINT = "They'll confirm it when they join."` in `src/lib/invites/copy.ts`.

The dialog's "Their name (optional)" field keeps its label, its value and what it feeds (the email salutation and the welcome-step pre-fill, through `sendPlatformInvite`/`sender.ts`, spec D5) — only a helper line is added.

- [ ] **Step 1: Write the failing test**

In `src/lib/invites/copy.test.ts` make two edits with the Edit tool.

Replace
```ts
import { ABOUT_LINES, EYEBROW, addFriendLabel, footerLine, inviteState, invitedTitle, stateCopy } from "./copy";
```
with
```ts
import { ABOUT_LINES, EYEBROW, INVITEE_NAME_HINT, addFriendLabel, footerLine, inviteState, invitedTitle, stateCopy } from "./copy";
```

Append at the very end of the file:

```ts

describe("invitee name hint (account name step spec D5, §4)", () => {
  it("owner copy, verbatim", () => {
    expect(INVITEE_NAME_HINT).toBe("They'll confirm it when they join.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/invites/copy.test.ts`
Expected: FAIL — the new test: `expected undefined to be 'They'll confirm it when they join.'`; the five existing tests pass.

- [ ] **Step 3: Add the constant**

In `src/lib/invites/copy.ts`, with the Edit tool, replace
```ts
export const OPEN_IN_MAIL_APP = "Open in my mail app";
```
with
```ts
export const OPEN_IN_MAIL_APP = "Open in my mail app";

// Under the invite dialog's "Their name (optional)" field (account name step
// spec D5, §4): the typed name only suggests; the invitee confirms their own
// name on the welcome step.
export const INVITEE_NAME_HINT = "They'll confirm it when they join.";
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run src/lib/invites/copy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Show it in the dialog**

In `src/components/invite/invite-people-dialog.tsx` make three edits with the Edit tool (never rewrite the file — see Global Constraints, line 46).

Replace
```tsx
import { COPY_LINK, footerLine, OPEN_IN_MAIL_APP, SEND_BY_EMAIL, SHARE } from "@/lib/invites/copy";
```
with
```tsx
import { COPY_LINK, footerLine, INVITEE_NAME_HINT, OPEN_IN_MAIL_APP, SEND_BY_EMAIL, SHARE } from "@/lib/invites/copy";
```

Replace
```tsx
  const nameId = useId();
  const emailId = useId();
```
with
```tsx
  const nameId = useId();
  const nameHintId = useId();
  const emailId = useId();
```

Replace
```tsx
              <Label htmlFor={nameId}>{NAME_LABEL}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="min-h-11 md:pointer-fine:min-h-8"
              />
            </div>
```
with
```tsx
              <Label htmlFor={nameId}>{NAME_LABEL}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                aria-describedby={nameHintId}
                className="min-h-11 md:pointer-fine:min-h-8"
              />
              {/* The typed name only suggests (account name step spec D5):
                  the invitee confirms their own on the welcome step. */}
              <p id={nameHintId} className="text-xs text-muted-foreground">
                {INVITEE_NAME_HINT}
              </p>
            </div>
```

- [ ] **Step 6: Types, lint and the PUA character**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx tsc --noEmit && npx eslint src/lib/invites/copy.ts src/lib/invites/copy.test.ts src/components/invite/invite-people-dialog.tsx && grep -c $'\xee\x80\x80' src/components/invite/invite-people-dialog.tsx`
Expected: tsc and eslint print nothing; the `grep -c` prints `1` (the U+E000 in `FOOTER_TOKEN` survived).

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git add src/lib/invites/copy.ts src/lib/invites/copy.test.ts src/components/invite/invite-people-dialog.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(invite): the invitee name field says they will confirm it" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Old-label sweep and CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:106-109` (insert one bullet between "The password step." and "Forgot password.")

**Interfaces:**
- Consumes: the names from Tasks 1-4 (`normalizeName`, `checkName`, `NAME_MAX`, `suggestNameFromEmail`, `setupNameSuggestion`, `passwordFormName`, `name-split-retired.test.ts`, `INVITEE_NAME_HINT`).
- Produces: documentation only.

- [ ] **Step 1: Sweep for any pin of the old labels**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && git grep -n -E "first_name|last_name|given-name|family-name|fullName|full-name|First name|Last name|FIRST_NAME|lastNameLabel" -- src scripts docs/email`
Expected: only lines of `src/lib/auth/name-split-retired.test.ts` (its own `FORBIDDEN` list and path joins). Any other hit is a test or file still pinning the split: fix it in this task (change the pin to the one-field copy from spec §4) and add that file to this task's commit. Then run `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run` — Expected: 179 files / 3683 tests, all passing, 0 failures (178 / 3654 at base; minus `full-name.test.ts`'s 5, plus `name.test.ts`'s 20, `name-split-retired.test.ts`'s 3, 10 new in `password-copy.test.ts` and 1 in `copy.test.ts`).

- [ ] **Step 2: Add the CLAUDE.md bullet**

In `CLAUDE.md` (section "Auth link handling"), with the Edit tool, replace
```md
  `updateUser({ password, data })` call that sets the password, so the gate
  never fires again for that account.
- **Forgot password.** `/login/forgot` → `requestPasswordReset`
```
with
```md
  `updateUser({ password, data })` call that sets the password, so the gate
  never fires again for that account.
- **One name, one field** (2026-09-25, spec
  `docs/superpowers/specs/2026-09-25-account-name-step-design.md`). Signup
  (`src/app/signup/`) and the invited account's welcome step
  (`/auth/set-password`, setup mode) each ask for ONE required field, "Your
  name" (`name="name"`, `autoComplete="name"`, `maxLength` 80, helper "How
  you'll appear to other tasters."); `/profile/edit` keeps its one "Name"
  field. `src/lib/auth/name.ts` is the only rule: `normalizeName` trims and
  collapses whitespace and never joins parts, and `checkName` refuses, on
  the server, an empty result and one over `NAME_MAX` (80 code points).
  Signup writes auth metadata `{ display_name }` only — no
  `first_name`/`last_name` (the dashboard email templates read
  `.Data.display_name`). The welcome step pre-fills `setupNameSuggestion`
  (`src/lib/auth/password-copy.ts`): the inviter's typed name
  (`user_metadata.display_name`, normalised) when there is one, else
  `suggestNameFromEmail` (`carsten.olin` → "Carsten Olin", `jens_h2` →
  "Jens H"); a suggestion nothing saves until "Save and continue", and its
  action (`passwordFormName`) refuses a bad name before `updateUser`, so no
  password is ever saved without one. The invite dialog's "Their name
  (optional)" only suggests ("They'll confirm it when they join.",
  `INVITEE_NAME_HINT`). Why: from commit 4995d6a (2026-09-19) both forms
  asked for First name + Last name (optional) and joined them, and the
  welcome step pre-filled the whole invited name into the first box, so a
  platform invitee was saved as "Carsten Olin Olin" (profile 42eec649…,
  corrected by hand 2026-09-24). Never split the name into parts again, and
  never pre-fill a name into a box that is joined with another;
  `src/lib/auth/name-split-retired.test.ts` fails on any
  `first_name`/`last_name`/`given-name`/`family-name`/`fullName` token
  coming back under `src/`.
- **Forgot password.** `/login/forgot` → `requestPasswordReset`
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: one name field everywhere in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Gates, production deploy and live smoke (main session only)

Run by the main session only (git push + Browser pane), never by an implementer subagent.

**Files:**
- Create (gitignored, never committed): `.superpowers/account-name/mint-demo-link.mjs`

- [ ] **Step 1: Owner copy approval**

Spec §2 D1/D5 and §4 mark the five strings "owner approval needed": "Your name" · "How you'll appear to other tasters." · "Please enter your name." · "Please use a shorter name (80 characters at most)." · "They'll confirm it when they join." If the conversation does not already hold the owner's approval of these, ask now, quoting them, and do not push until they approve (a changed string goes back through the owning task's test and code).

- [ ] **Step 2: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && npx vitest run && npx tsc --noEmit && npx eslint src/lib/auth/name.ts src/lib/auth/name.test.ts src/lib/auth/name-split-retired.test.ts src/lib/auth/password-copy.ts src/lib/auth/password-copy.test.ts src/app/signup/actions.ts src/app/signup/signup-form.tsx src/app/auth/set-password/page.tsx src/app/auth/set-password/set-password-form.tsx src/app/auth/set-password/actions.ts src/lib/invites/copy.ts src/lib/invites/copy.test.ts src/components/invite/invite-people-dialog.tsx && npm run build`
Expected: vitest 179 files / 3683 tests, 0 failures; tsc and eslint silent; `next build` completes with no error (the route list includes `/signup` and `/auth/set-password`).

- [ ] **Step 3: What ships**

Run: `cd /c/Users/Public/repos/blindtastingapp-signup && git fetch origin && git diff --stat origin/master...HEAD`
Expected: exactly these 18 paths — `CLAUDE.md`, `docs/superpowers/plans/2026-09-25-account-name-step.md`, `docs/superpowers/specs/2026-09-25-account-name-step-design.md`, `src/app/auth/set-password/{actions.ts,page.tsx,set-password-form.tsx}`, `src/app/signup/{actions.ts,signup-form.tsx}`, `src/components/invite/invite-people-dialog.tsx`, `src/lib/auth/{full-name.ts,full-name.test.ts}` (deleted), `src/lib/auth/{name.ts,name.test.ts,name-split-retired.test.ts,password-copy.ts,password-copy.test.ts}`, `src/lib/invites/{copy.ts,copy.test.ts}`. Nothing under `supabase/`, no `database.types.ts`, no `sender.ts`, no tasting action, no `profile/edit`, no `docs/email`.

- [ ] **Step 4: Deploy**

Never touch `C:\Users\Public\repos\blindtastingapp` (the owner's checkout has `master` checked out); the deploy is a push of this worktree's branch head to `origin/master`:
```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git fetch origin && git rev-parse origin/master && git merge-base --is-ancestor origin/master HEAD && echo fast-forward-ok
```
Expected: a hash — record it as BASE for Step 9 — then `fast-forward-ok`. If `fast-forward-ok` does not print, `origin/master` has moved (another worktree pushed): run `git rebase origin/master`; if it conflicts, `git rebase --abort` and ask the owner; if it applies cleanly, record the new `origin/master` hash as BASE and repeat Step 2 before continuing. Then:
```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git push origin HEAD:master
```
A plain push, never `--force`. Wait until Vercel shows the production deployment of that commit as Ready: `gh api "repos/christianolin/blindtastingapp/deployments?sha=$(git -C C:/Users/Public/repos/blindtastingapp-signup rev-parse HEAD)" --jq '.[0].id'`, then `gh api "repos/christianolin/blindtastingapp/deployments/<that id>/statuses" --jq '.[0].state'` reads `success` (or `gh api "repos/christianolin/blindtastingapp/commits/$(git -C C:/Users/Public/repos/blindtastingapp-signup rev-parse HEAD)/status" --jq .state` prints `success`).

- [ ] **Step 5: Live smoke — `/signup`**

Open `https://blindrapp.vercel.app/signup` in the Browser pane (it renders whether or not the pane is signed in). Run in the page:
```js
(() => {
  const input = document.querySelector('input[name="name"]');
  return {
    nameInputs: document.querySelectorAll('input[name="name"]').length,
    oldFields: document.querySelectorAll('input[name="first_name"], input[name="last_name"]').length,
    autocomplete: input?.getAttribute("autocomplete"),
    maxlength: input?.getAttribute("maxlength"),
    required: input?.required,
    label: document.querySelector('label[for="name"]')?.textContent,
    hint: document.getElementById("name-hint")?.textContent,
    lastNameText: document.body.innerText.includes("Last name"),
  };
})()
```
Expected: `{ nameInputs: 1, oldFields: 0, autocomplete: "name", maxlength: "80", required: true, label: "Your name", hint: "How you'll appear to other tasters.", lastNameText: false }`; the Email and Password fields and "Sign up" are unchanged; no console error. Do NOT submit the form (it would create a real account and send an email).

- [ ] **Step 6: Live smoke — the welcome step as a demo account**

Spec §5: an invite to a fresh `.invalid` address cannot be delivered, so the pre-fill rule is verified by the unit tests and the form render by a signed-in demo account opening `/auth/set-password` directly (setup mode). Create `.superpowers/account-name/mint-demo-link.mjs` (gitignored; never commit it; it prints live session tokens — use its output only in the Browser pane):
```js
// Mints a session for a seeded demo account the way seed-demo-people.mjs
// does (admin magic link + verifyOtp; no password) and prints a
// /auth/confirm-hash link that signs the Browser pane in and lands on the
// welcome step. Run: node --env-file=.env.local .superpowers/account-name/mint-demo-link.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const email = "demo.isabelle@blindr.invalid";

const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
const { data, error: verifyError } = await anon.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (verifyError) throw verifyError;
console.log("metadata display_name:", JSON.stringify(data.user?.user_metadata?.display_name ?? null));
const { access_token, refresh_token } = data.session;
console.log(
  `https://blindrapp.vercel.app/auth/confirm-hash?next=%2Fauth%2Fset-password#access_token=${access_token}&refresh_token=${refresh_token}`,
);
```
Run: `cd /c/Users/Public/repos/blindtastingapp-signup && node --env-file=.env.local .superpowers/account-name/mint-demo-link.mjs`
Open the printed link in the Browser pane. Expected: "Confirming your invite…", then "Welcome to Blindr" with ONE field labelled "Your name", pre-filled with the printed metadata name normalised (the seed's "Isabelle Moreau"), or "Demo Isabelle" if the script printed `null`; the helper "How you'll appear to other tasters." under it; no "Last name" text anywhere; then "Choose a password" and "Save and continue". Run Step 5's snippet here too, expecting `nameInputs: 1, oldFields: 0, autocomplete: "name", maxlength: "80", label: "Your name", lastNameText: false`. Do NOT press "Save and continue" — it would set a password on a demo account (the seed never gives them one).

- [ ] **Step 7: Live smoke — the invite dialog**

Still as the demo account, open `https://blindrapp.vercel.app/community` and tap "Invite someone". Expected: under "Their name (optional)" the line "They'll confirm it when they join."; "Their email (optional)" and "Make a link" unchanged. Do NOT press "Make a link" (it writes a `platform_invites` row). Close the dialog with Escape. Check the console: no new errors.

- [ ] **Step 8: Clean up**

Sign the Browser pane out of the demo account (profile menu → Sign out) so it is not left signed in as Isabelle. Leave `.superpowers/account-name/` in place (gitignored).

- [ ] **Step 9: On any failure — roll back in one commit**

With BASE the `origin/master` hash recorded in Step 4:
```bash
cd /c/Users/Public/repos/blindtastingapp-signup && git revert --no-commit BASE..HEAD && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "revert: account name step" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin HEAD:master
```
(Replace `BASE` with the recorded hash.) Wait for that deployment as in Step 4, confirm `/signup` shows the old two fields again, then report what failed to the owner.
