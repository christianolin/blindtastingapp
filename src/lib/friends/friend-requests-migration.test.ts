import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pins the friend-request migrations (spec
// docs/superpowers/specs/2026-09-24-friend-requests-design.md §2) to what the
// plan reviewed: every function body's md5, the same md5 the migration's own
// post-state asserts against the database (md5 of prosrc with any CR
// stripped), and the "one addition" rule for the three functions recreated
// from earlier migrations. Normalised so a CRLF checkout (Windows autocrlf)
// reads the same text.

const M1 = "supabase/migrations/20260925003000_friend_requests.sql";
const PLATFORM_INVITES = "supabase/migrations/20260918130500_platform_invites.sql";
const ACCOUNT_DELETION = "supabase/migrations/20260919101300_account_deletion.sql";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r/g, "");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");

/** What Postgres stores as prosrc: the text between `as $$` and the closing `$$`. */
function body(sql: string, name: string): string {
  const at = sql.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`));
  if (at < 0) throw new Error(`no function ${name}`);
  const open = sql.indexOf(" as $$", at) + " as $$".length;
  return sql.slice(open, sql.indexOf("$$", open));
}

const FIVE = [
  "send_friend_request",
  "cancel_friend_request",
  "accept_friend_request",
  "decline_friend_request",
  "remove_friend",
] as const;

const PINS: Record<string, string> = {
  send_friend_request: "8efbf4536f08f335934d517ca5007238",
  cancel_friend_request: "55dc3b3361bb035bdd9ad2a95d70e13d",
  accept_friend_request: "8c473e36e07123e4a4ab2ee5b211b454",
  decline_friend_request: "a7bac3015636524f65fd3c27155a3398",
  remove_friend: "1e1a84871e2e2c68ef899b845bc96506",
  accept_platform_invite: "9b3e4a89a84d2eb482c312eba87c4d37",
  scrub_deleted_account: "5a08d60e3af617b6368d3a85cbe05f94",
  refuse_deleted_profile_link: "d78758de09e1e9f49e0d6b5f288650df",
};

describe("20260925003000_friend_requests.sql", () => {
  const sql = read(M1);

  it("has exactly the function bodies the plan pinned", () => {
    const actual = Object.fromEntries(Object.keys(PINS).map((name) => [name, md5(body(sql, name))]));
    expect(actual).toEqual(PINS);
  });

  it("asserts each of those md5s in its own post-state", () => {
    for (const [name, hash] of Object.entries(PINS)) {
      expect(sql).toMatch(
        new RegExp(`\\('public\\.${name}\\([a-z]*\\)', +'[a-z]+', +'[a-z_ ]*', +'${hash}'`),
      );
    }
  });

  it("recreates accept_platform_invite with one addition: the friend_requests delete", () => {
    const before = body(read(PLATFORM_INVITES), "accept_platform_invite");
    expect(md5(before)).toBe("b47d41eab50acac6ca48c213d5503c63");
    const added =
      "  -- Friend requests (20260925003000, D5): the invite settles a pending request either way.\n" +
      "  delete from friend_requests\n" +
      "   where (requester_id = v_uid and recipient_id = v_invite.inviter_id)\n" +
      "      or (requester_id = v_invite.inviter_id and recipient_id = v_uid);\n";
    const now = body(sql, "accept_platform_invite");
    expect(now).toContain(added);
    expect(now.replace(added, "")).toBe(before);
  });

  it("recreates scrub_deleted_account with one addition, before the friendships delete", () => {
    const before = body(read(ACCOUNT_DELETION), "scrub_deleted_account");
    expect(md5(before)).toBe("bad163a7d72fcab774936383dc1b6f2a");
    const added =
      "  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;\n";
    const now = body(sql, "scrub_deleted_account");
    expect(now).toContain(
      added + "  delete from friendships where user_id = p_user_id or friend_id = p_user_id;\n",
    );
    expect(now.replace(added, "")).toBe(before);
  });

  it("widens refuse_deleted_profile_link to the two friend_requests columns and nothing else", () => {
    const before = body(read(ACCOUNT_DELETION), "refuse_deleted_profile_link");
    expect(md5(before)).toBe("288dd03195cd529a7c5bc995cac78035");
    const now = body(sql, "refuse_deleted_profile_link");
    expect(
      now.replace(
        "to_jsonb(new) ->> 'friend_id',\n" +
          "                                  to_jsonb(new) ->> 'requester_id', to_jsonb(new) ->> 'recipient_id')",
        "to_jsonb(new) ->> 'friend_id')",
      ),
    ).toBe(before);
  });

  it("gives the five RPCs to authenticated alone", () => {
    for (const fn of FIVE) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) +from public, anon, service_role;`),
      );
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) +to authenticated;`));
    }
  });

  it("raises the refusals the app shows verbatim", () => {
    for (const line of [
      "not signed in",
      "you cannot be your own friend",
      "that account has been deleted",
      "no request to accept",
    ]) {
      expect(sql).toContain(`'${line}'`);
    }
  });
});
