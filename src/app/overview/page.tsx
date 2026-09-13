import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AboutBand } from "@/components/overview/about-band";
import { Eyebrow } from "@/components/overview/eyebrow";
import { createClient } from "@/lib/supabase/server";
import { getOverviewInvitation } from "@/lib/invitation-data";
import { OVERVIEW_EYEBROW } from "@/lib/invitation-copy";
import { getOverviewData } from "@/lib/overview-data";
import { OverviewBanner } from "./banner";
import { OverviewInvitationCard } from "./invitation-card";
import { TastingsCard } from "./tastings-card";
import { RatingsCard } from "./ratings-card";
import { CellarCard } from "./cellar-card";
import { QuickActions } from "./quick-actions";

// The logged-in landing page: the live / next-up banner, the three subject
// cards in the redesign's fixed order (Blind tastings → Ratings → Cellar) and
// the photo band down to /about. On phones a row of three action tiles sits
// between the banner and the cards and stands in for the cards' own actions.
// Everything is fetched once through getOverviewData; the only client state
// on the page is the invitation accept/decline optimism and the modal
// launchers.
export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, data, invitation] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getOverviewData(user.id),
    // The soonest pending invitation, for the laptop card above the banner
    // (spec §4.3 item 3) — fetched here, never inside overview-data.ts
    // (getOverviewData's own file), per this task's Does bullet.
    getOverviewInvitation(),
  ]);

  return (
    // The root fills the content column (which is the app's scroll container,
    // as on every other page — the page deliberately does NOT nest a second
    // scroller). On desktop that pins the photo band to the bottom whenever the
    // cards are short and lets the column scroll when they are tall. Phones
    // are not squeezed onto one screen: the banner, the tile row and the
    // cards keep their natural heights and the column scrolls (phone layout
    // revision, 2026-09-12); the photo band is hidden below md.
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        title="Overview"
      />
      <main className="flex flex-1 flex-col gap-[22px] p-[22px_26px_26px] max-md:gap-[11px] max-md:p-[11px_14px_14px]">
        {/* The invitation card (S5b): laptop only — the Blind tastings card
            below keeps its own invitation rows for phones and for any other
            pending invitation this one doesn't cover (Does bullet, last
            line). */}
        {invitation ? (
          <div className="hidden flex-col gap-2 md:flex">
            <Eyebrow size="md">{OVERVIEW_EYEBROW}</Eyebrow>
            <OverviewInvitationCard invitation={invitation} />
          </div>
        ) : null}
        <OverviewBanner banner={data.banner} />
        {/* The banner kind only decides whether the Taste-blind tile may be
            gold: with nothing scheduled the banner is already a gold "Start a
            tasting" opening the same sheet. */}
        <QuickActions bannerKind={data.banner.kind} />
        <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-5 max-md:flex max-md:flex-col max-md:gap-[11px] xl:grid-cols-3">
          <TastingsCard data={data.tastings} />
          <RatingsCard data={data.ratings} />
          <CellarCard data={data.cellar} />
        </div>
      </main>
      <AboutBand className="mt-auto hidden md:block" />
    </div>
  );
}
