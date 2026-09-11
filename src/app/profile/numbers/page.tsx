import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { AboutBand } from "@/components/overview/about-band";
import { Eyebrow } from "@/components/overview/eyebrow";
import { RangeControl } from "@/components/overview/range-control";
import { createClient } from "@/lib/supabase/server";
import { getYourNumbers } from "@/lib/your-numbers";
import { parseNumbersRange } from "@/lib/your-numbers-types";
import { CellarSection } from "./cellar-section";
import { RatingsSection } from "./ratings-section";
import { TastingsSection } from "./tastings-section";

// "since March 2024" — the month and year the profile was created. Month
// granularity, so it is formatted on the server in UTC: a viewer's timezone
// could only move it across a month boundary, and a fixed zone keeps the
// server and client text identical (no hydration mismatch).
function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Your numbers (/profile/numbers): personal stats across blind tastings,
 * ratings and the cellar for the chosen range (?range=all|year|90d). Not a nav
 * pillar — reached from the "Your numbers" pill in the top bar and the profile
 * block in the sidebar.
 */
export default async function YourNumbersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range = parseNumbersRange(rawRange);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, numbers] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getYourNumbers(user.id, range),
  ]);
  const displayName =
    profile?.display_name ?? user.email ?? numbers.displayName;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* No `title` here: on phones the page's own header row below (back
          arrow + eyebrow + h1) is the only place "Your numbers" appears, as
          drawn — passing it to AppHeader would stack the title twice. */}
      <AppHeader
        userId={user.id}
        displayName={displayName}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <main className="flex flex-1 flex-col">
        {/* Page header: breadcrumb eyebrow over the h1, the range control on
            the right. On phones a back arrow leads and the header holds only
            that plus the title block; the control becomes the first item of
            the body beneath the rule (see below). */}
        <header className="flex items-center gap-[14px] border-b border-border p-[18px_30px_16px] max-md:gap-3 max-md:p-[8px_16px_12px]">
          <Link
            href="/overview"
            aria-label="Back to Overview"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex min-w-0 flex-col gap-1 max-md:flex-1">
            <Eyebrow size="md" className="flex flex-wrap items-center gap-[7px]">
              <Link
                href={`/u/${user.id}`}
                className="font-semibold text-primary transition-colors hover:text-gold-deep"
              >
                {displayName}
              </Link>
              <span className="text-placeholder-soft" aria-hidden>
                /
              </span>
              <span>Your numbers</span>
              <span className="text-placeholder-soft" aria-hidden>
                ·
              </span>
              <span>since {sinceLabel(numbers.since)}</span>
            </Eyebrow>
            <h1 className="font-heading text-[32px] leading-[1.03] font-semibold max-md:text-[21px]">
              Your numbers
            </h1>
          </div>
          <div className="ml-auto max-md:hidden">
            <RangeControl value={range} />
          </div>
        </header>

        {/* Phone-only twin of the range control: the first body item under
            the header rule with the mockup's 14px top / 16px side padding
            (the section below supplies the 14px gap beneath it). */}
        <div className="p-[14px_16px_0] md:hidden">
          <RangeControl value={range} />
        </div>

        <TastingsSection data={numbers.tastings} />
        <RatingsSection data={numbers.ratings} range={range} />
        <CellarSection data={numbers.cellar} range={range} />

        <AboutBand className="mt-auto" />
      </main>
    </div>
  );
}
