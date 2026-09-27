"use server";

// The one client write of the sharing notice (sharing-defaults spec
// 2026-09-27 S14, S15, §7.5): the signed-in person stamps dismissed_at on
// their own sharing_notices row, under the column grant and "sharing notices
// dismiss own". A "use server" module exports async functions only
// (CLAUDE.md); the copy and every rule live in ./notice.ts.
//
// Relative import, not "@/lib/supabase/server": actions.test.ts replaces the
// client with vi.mock.
import { createClient } from "../supabase/server";

/** "Got it" and the settings link on /overview's notice. False when signed
    out or refused; the card stays hidden for the visit either way. */
export async function dismissSharingNotice(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("sharing_notices")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);
  return !error;
}
