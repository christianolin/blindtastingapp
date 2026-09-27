import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The sharing-defaults SQL as the files write it (spec 2026-09-27 §3, §5,
// §10.3; whole-branch review round). The DB suite
// (scripts/sharing-defaults.test.mjs, main session only) proves the
// behaviour against Postgres; these pins keep the files from drifting away
// from it between runs. CRLF is normalised (Windows autocrlf checkout).

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const M1 = read("supabase/migrations/20260927140000_sharing_defaults.sql");
const M2 = read("supabase/migrations/20260927150000_sharing_defaults_flip.sql");
const ROLLBACK_M1 = read("scripts/sharing-defaults/rollback-m1.sql");
const RUN_SQL = read("scripts/sharing-defaults/run-sql.mjs");

/** The body of `create function public.<name>()` up to its `end $$;`. */
function fnBody(sql: string, name: string): string {
  const from = sql.slice(sql.indexOf(`create function public.${name}(`));
  return from.slice(0, from.indexOf("end $$;"));
}

describe("M1: the Rule 1 hold", () => {
  const hold = fnBody(M1, "wset_notes_hold_on_identity");

  it("fires on a move too: an identity the BEFORE resolver fills is outside the SET list", () => {
    expect(M1).toContain(
      "create trigger wset_notes_hold_on_identity\n  after insert or update of catalog_wine_id, tasting_wine_id on public.wset_notes",
    );
    expect(M1).toContain("CREATE TRIGGER wset_notes_hold_on_identity AFTER INSERT OR UPDATE OF catalog_wine_id, tasting_wine_id ");
  });

  it("locks the glasses it holds and re-reads is_revealed, so a racing reveal leaves no hold behind", () => {
    expect(hold.match(/for share of w/g)).toHaveLength(2);
    expect(hold.match(/not w\.is_revealed/g)).toHaveLength(2);
    expect(hold).not.toContain("catalog_wine_unrevealed_glasses_of");
  });

  it("holds for the adder, an ASYNC IMMEDIATE scored guesser, and the owner of a masked pour", () => {
    expect(hold).toContain("case when w.added_by_host then t.host_id = new.author_id else tp.user_id = new.author_id end");
    expect(hold).toContain("t.timing_mode = 'ASYNC' and t.async_reveal_policy = 'IMMEDIATE' and w.reveal_step = 0");
    expect(hold).toContain("gp.status = 'JOINED'");
    expect(hold).toContain("g.scored_at is not null");
    expect(hold).toContain("c.owner_id = new.author_id");
    expect(hold).toContain("from flight_holds h");
    expect(hold).toContain("from wine_pour_intents i");
  });

  it("still treats a move of an identified note as no arrival", () => {
    expect(hold).toContain("if tg_op = 'UPDATE' and old.catalog_wine_id is not null then\n    return null;");
  });
});

describe("M1: the guard on a note's aromas", () => {
  const guard = fnBody(M1, "wset_note_aromas_rule1_guard");

  it("judges every insert, update and delete of an aroma row", () => {
    expect(M1).toContain(
      "create trigger wset_note_aromas_rule1_guard\n  before insert or update or delete on public.wset_note_aromas",
    );
    expect(M1).toContain(
      "CREATE TRIGGER wset_note_aromas_rule1_guard BEFORE INSERT OR DELETE OR UPDATE ON wset_note_aromas ",
    );
  });

  it("applies the note guard's first condition to the parent note, skipping cascades and the scrub", () => {
    expect(guard).toContain("if pg_trigger_depth() > 1 or auth.uid() is null then");
    expect(guard).toContain("n.author_id = auth.uid()");
    expect(guard).toContain("not wset_note_held(n.id)");
    expect(guard).toContain("catalog_wine_unrevealed_glasses_of(n.catalog_wine_id, n.author_id)");
  });

  it("is owner-only", () => {
    expect(M1).toContain(
      "revoke all on function public.wset_note_aromas_rule1_guard() from public, anon, authenticated, service_role;",
    );
  });
});

describe("M1: the cellars already shared, for M2", () => {
  it("records the non-deleted Friends and Everyone cellars in an internal table", () => {
    expect(M1).toContain("create table public.sharing_m1_open_cellars (");
    expect(M1).toContain("alter table public.sharing_m1_open_cellars enable row level security;");
    expect(M1).toContain("revoke all on public.sharing_m1_open_cellars from public, anon, authenticated;");
    expect(M1).toContain("where p.deleted_at is null and p.cellar_visibility <> 'PRIVATE';");
  });
});

describe("M2: the flip", () => {
  it("locks writers out of profiles before the snapshot", () => {
    const lock = M2.indexOf("lock table public.profiles in share row exclusive mode;");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(M2.indexOf("create temp table _sd_flipped"));
  });

  it("flips exactly the snapshot, which leaves out a cellar set to Only me after M1", () => {
    const snapshot = M2.slice(M2.indexOf("create temp table _sd_flipped"), M2.indexOf("drop table if exists pg_temp._sd_noted"));
    expect(snapshot).toContain("not exists (select 1 from public.sharing_m1_open_cellars o where o.user_id = p.id)");
    expect(M2).toContain("update public.profiles\n   set cellar_visibility = 'PUBLIC'\n where id in (select f.id from _sd_flipped f);");
    expect(M2).not.toMatch(/update public\.profiles\s+set cellar_visibility = 'PUBLIC'\s+where deleted_at is null/);
  });
});

describe("rollback M1", () => {
  it("refuses to publish held notes or Friends/Only me notes unless the run says so", () => {
    expect(ROLLBACK_M1).toContain("public.wset_note_held(n.id)");
    expect(ROLLBACK_M1).toContain("p.notes_visibility <> 'PUBLIC'");
    expect(ROLLBACK_M1).toContain("coalesce(current_setting('blindr.rollback_publishes_hidden_notes', true), '') <> 'yes'");
    expect(RUN_SQL).toContain("select set_config('blindr.rollback_publishes_hidden_notes', 'yes', true)");
  });

  it("drops what this round added", () => {
    expect(ROLLBACK_M1).toContain("drop trigger wset_note_aromas_rule1_guard on public.wset_note_aromas;");
    expect(ROLLBACK_M1).toContain("drop function public.wset_note_aromas_rule1_guard();");
    expect(ROLLBACK_M1).toContain("drop table public.sharing_m1_open_cellars;");
  });
});

describe("M1: every body md5 its post-state pins is the body the file creates", () => {
  // prosrc is the text between the dollar quotes; the post-state hashes it
  // with CR stripped, exactly as here.
  const bodies = new Map<string, string>();
  for (const m of M1.matchAll(/create (?:or replace )?function public\.(\w+)\([\s\S]*?\$\$([\s\S]*?)\$\$/g)) {
    bodies.set(m[1], createHash("md5").update(m[2]).digest("hex"));
  }
  const pinned = [
    ...M1.matchAll(
      /\('public\.(\w+)\([^)]*\)', (?:true|false), '[sv]', '\w+', '\w+', (?:true|false),\s+'[^']*', '([0-9a-f]{32})'/g,
    ),
  ].map((m) => [m[1], m[2]] as const);

  it("pins each function this file creates or recreates", () => {
    expect(pinned.map(([name]) => name).sort()).toEqual(
      [...bodies.keys(), "catalog_wine_structure"].sort(),
    );
  });

  it("with the md5 of its body as written", () => {
    for (const [name, md5] of pinned) {
      if (name === "catalog_wine_structure") continue; // only prosecdef flips; the live body is pinned
      expect(bodies.get(name), name).toBe(md5);
    }
  });
});
