import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { BlindrMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/tasting-request-cache";
import { makeT } from "@/lib/wset/i18n";
import { InvitationsBand } from "./invitations-band";
import { StartTastingMenu } from "./start-tasting-menu";
import { TastingsTabs } from "./tastings-tabs";
import { getTasteArchive, readPlacements } from "./taste-archive-data";
import {
  ARCHIVE_LANG,
  archiveCounts,
  firstPagePlacementIds,
  hasLivePoll,
  invitationsOf,
  parseFilter,
  statsLine,
} from "./taste-archive-math";

const t = makeT(ARCHIVE_LANG);

// All tastings — the Taste parent's landing page (ledger R5, T1/T1b): every
// tasting you have been part of, with what you scored. The header stats and
// the Start-a-tasting menu, the invitation band, then one list under
// non-exclusive filter chips. The marketing hero and explainer cards that
// used to open this page live on /about; the logged-in landing page is
// /overview.
export default async function TastePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: profile }, archive, { tab }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getTasteArchive(),
    searchParams,
  ]);

  const filter = parseFilter(Array.isArray(tab) ? tab[0] : tab);
  const invitations = invitationsOf(archive.tastings);
  const counts = archiveCounts(archive.tastings);

  // The page polls only while a live tasting I have joined is in progress:
  // its "glass N of M" moves without me. Everything else changes only when I
  // act, and acting revalidates /taste.
  const livePoll = hasLivePoll(archive.tastings);

  // Placings for the first visible page of the chip the URL names (one
  // leaderboard read per row); the client list loads further pages as "Show N
  // more" or another chip reveals them. While the page polls, the server
  // leaves even the first page to the client: a finished tasting's placing
  // cannot change, and the client keeps what it loaded across every refresh,
  // instead of the server re-reading a page of leaderboards every 15 seconds.
  const initialPlacements = livePoll
    ? {}
    : await readPlacements(firstPagePlacementIds(archive.tastings, filter));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {livePoll ? <AutoRefresh intervalMs={15000} /> : null}
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        title={t("all_tastings")}
      />
      <main className="flex w-full flex-1 flex-col gap-3 p-[14px] md:gap-5 md:p-8">
        {/* The page header. On phones the top bar already names the page, so
            the h1 is visually hidden there and the stats line shares a row
            with "Start ▾"; from md up it is the pillar pages' Cormorant h1
            with the menu on the right. */}
        <header className="flex items-start justify-between gap-3 max-md:items-center">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight max-md:sr-only">
              {t("all_tastings")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground max-md:mt-0 max-md:text-[12.5px] max-md:leading-snug">
              {statsLine(t, archive.stats)}
            </p>
          </div>
          <StartTastingMenu />
        </header>

        {archive.tastings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
            <BlindrMark size={48} />
            <div>
              <p className="font-heading text-xl font-medium">{t("no_tastings_yet")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("no_tastings_hint")}</p>
            </div>
          </div>
        ) : (
          <>
            <InvitationsBand invitations={invitations} />
            <TastingsTabs
              tastings={archive.tastings}
              counts={counts}
              invitationCount={invitations.length}
              initialPlacements={initialPlacements}
            />
          </>
        )}
      </main>
    </div>
  );
}
