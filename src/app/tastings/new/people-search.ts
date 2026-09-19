"use server";

import { createClient } from "@/lib/supabase/server";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { escapeIlike } from "@/lib/ilike";
import { friendContextLine } from "./setup-copy";

export type PersonSearchResult = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
};

/**
 * Create step 3's "Name or email" field (spec §2.3 item 10): typed text with
 * no "@" searches every profile by display name — profiles are readable by
 * any signed-in user already (CLAUDE.md's open-directory philosophy), so no
 * new RLS is needed. `escapeIlike` keeps a name carrying a literal "%" or
 * "_" from acting as a wildcard. The caller and anyone already on the invite
 * list are excluded; up to 8 matches come back, ordered by name.
 */
export async function searchPeople(
  query: string,
  excludeIds: string[],
): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const exclude = [...new Set([user.id, ...excludeIds])];
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .ilike("display_name", `%${escapeIlike(trimmed)}%`)
    .not("id", "in", `(${exclude.join(",")})`)
    // A deleted account is never someone to invite; its "Deleted user" name
    // would otherwise match "del" (account-deletion spec §5.5).
    .is("deleted_at", null)
    .order("display_name")
    .limit(8);
  return data ?? [];
}

/**
 * Step 3's per-friend context line (CREATE-48): one `getBulkProfileSummaries`
 * call for the whole friend list, formatted through the pure
 * `friendContextLine` (`setup-copy.ts`) so the wording rule lives in one
 * tested place instead of being duplicated here.
 */
export async function getFriendContextLines(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const summaries = await getBulkProfileSummaries(ids);
  const lines: Record<string, string> = {};
  for (const id of ids) {
    lines[id] = friendContextLine(summaries.get(id));
  }
  return lines;
}
