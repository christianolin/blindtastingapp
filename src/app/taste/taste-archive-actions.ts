"use server";

// The one Server Action the All tastings page exposes: the client list asks
// for placings when "Show N more" or a chip change reveals finished rows the
// server did not load. It is a thin entry point over `readPlacements`, which
// checks the ids (UUIDs, at most one page), takes the user from the session
// and returns only the caller's own placings. Everything else the page reads
// stays in the server-only taste-archive-data.ts, which is not reachable as a
// POST endpoint.
import { readPlacements } from "./taste-archive-data";
import type { ArchivePlacement } from "./taste-archive-math";

export async function loadPlacements(
  tastingIds: string[],
): Promise<Record<string, ArchivePlacement | null>> {
  return readPlacements(tastingIds);
}
