import type { NextRequest } from "next/server";
import { buildTastingIcs, icsFilename } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";

// "Add to your calendar" (B3): the tasting as an .ics download, for its host
// and JOINED guests only. Everyone else gets the same 404 as a tasting that
// does not exist, so the route never confirms that one does: signed out,
// still INVITED, DECLINED, or a stranger who can read the tasting row because
// one of its wines is revealed. A tasting with no time, or one that has ended
// (CLOSED), has nothing to put in a calendar and 404s too.
// No LOCATION yet: the place has no storage until B12.

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: tasting, error } = await supabase
    .from("tastings")
    .select("id, name, host_id, status, scheduled_at, description")
    .eq("id", id)
    .maybeSingle();
  // A malformed id is a query error; it gets the same answer as a missing row.
  if (error || !tasting) return notFound();
  if (!tasting.scheduled_at || tasting.status === "CLOSED") return notFound();

  if (tasting.host_id !== user.id) {
    const { data: me } = await supabase
      .from("tasting_participants")
      .select("status")
      .eq("tasting_id", tasting.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (me?.status !== "JOINED") return notFound();
  }

  const start = new Date(tasting.scheduled_at);
  if (Number.isNaN(start.getTime())) return notFound();

  // The configured site URL first: a link saved in someone's calendar should
  // outlive a preview deployment. The request's own origin otherwise.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(
    /\/+$/,
    "",
  );

  const body = buildTastingIcs({
    uid: `${tasting.id}@blindr`,
    title: tasting.name,
    description: tasting.description,
    start,
    url: `${base}/tastings/${tasting.id}`,
    now: new Date(),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(tasting.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
