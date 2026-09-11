import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AboutBand } from "@/components/overview/about-band";
import { createClient } from "@/lib/supabase/server";
import { getOverviewData } from "@/lib/overview-data";
import { OverviewBanner } from "./banner";
import { TastingsCard } from "./tastings-card";
import { RatingsCard } from "./ratings-card";
import { CellarCard } from "./cellar-card";

// The logged-in landing page: the live / next-up banner, the three subject
// cards in the redesign's fixed order (Blind tastings → Ratings → Cellar) and
// the photo band down to /about. Everything is fetched once through
// getOverviewData; the only client state on the page is the invitation
// accept/decline optimism and the three modal launchers.
export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, data] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getOverviewData(user.id),
  ]);

  return (
    // The root fills the content column (which is the app's scroll container,
    // as on every other page — the page deliberately does NOT nest a second
    // scroller). On desktop that pins the photo band to the bottom whenever the
    // cards are short and lets the column scroll when they are tall; on phones
    // it bounds the body so the banner and the three cards share one screen,
    // the column scrolling only if a phone is too small to fit them.
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        title="Overview"
      />
      <main className="flex flex-1 flex-col gap-[22px] p-[22px_26px_26px] max-md:min-h-0 max-md:gap-[11px] max-md:p-[11px_14px_14px]">
        <OverviewBanner banner={data.banner} />
        <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-5 max-md:flex max-md:min-h-0 max-md:flex-col max-md:gap-[11px] xl:grid-cols-3">
          <TastingsCard data={data.tastings} />
          <RatingsCard data={data.ratings} />
          <CellarCard data={data.cellar} />
        </div>
      </main>
      <AboutBand className="mt-auto hidden md:block" />
    </div>
  );
}
