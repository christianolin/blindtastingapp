"use server";

// First-run tour writes (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D2). Both write profiles.tour_seen_at as the signed-in person: the column is
// in the client UPDATE grant (20260925010000) and "profiles update own" is the
// row gate, so no RPC is needed. A "use server" module exports async functions
// only (CLAUDE.md) — the copy and every rule live in ./tour.ts.
//
// Relative import, not "@/lib/supabase/server": actions.test.ts replaces the
// client with vi.mock, and vitest here has no "@/" alias.
import { createClient } from "../supabase/server";

/** Skip tour, Done, Later, Set up my profile, the X and Escape. False when
    signed out or refused; the caller keeps the tour closed for the visit
    either way, so a failure only means it may show again on a later visit. */
export async function markTourSeen(): Promise<boolean> {
  return writeTourSeenAt(new Date().toISOString());
}

/** "Show the tour again" on /profile/edit: null means show it again. */
export async function resetTour(): Promise<boolean> {
  return writeTourSeenAt(null);
}

async function writeTourSeenAt(value: string | null): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ tour_seen_at: value })
    .eq("id", user.id);
  return !error;
}
