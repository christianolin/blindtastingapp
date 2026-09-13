import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { MobileNav } from "@/components/mobile-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/notifications-bell";
import { navWithAdmin } from "@/components/nav-links";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites } from "@/lib/notifications";
import { touchLastSeen } from "@/lib/last-seen";
import { GlobalSearch } from "@/components/global-search";
import { ScanButton } from "@/components/scan/scan-button";

// The bordered icon-button look from the redesign's top bar: 1px border on
// the raised parchment, radius 8, a 19px icon, gold border + white fill on
// hover. The svg selector repeats the Button base's own so twMerge lets the
// 19px override its 16px default. Below md a ::before pseudo-element extends
// the 32px box to a 44px tap target without changing how it looks.
const ICON_BUTTON =
  "relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] md:before:hidden rounded-[8px] border border-border bg-card transition-colors hover:border-gold hover:bg-white [&_svg:not([class*='size-'])]:size-[19px]";

/**
 * The app's top bar — rendered inside the main column, to the right of the
 * persistent AppSidebar. Holds the global search (desktop only), the "Your
 * numbers" link, the label scanner and the notifications bell at every width,
 * and the MobileNav hamburger drawer below `md` (where the sidebar is hidden).
 * From `md` up Your numbers is the labelled gold pill; on phones it is an
 * icon-only button styled like scan and bell (phone layout revision,
 * 2026-09-12), so the bar reads burger · title … numbers · scan · bell, the
 * bell at the far right as in the handoff. `title` is the page name shown next
 * to the burger on phones (the sidebar carries it on desktop).
 * Renders nothing when logged out (those pages redirect to /login anyway).
 */
export async function AppHeader({
  userId: userIdProp,
  displayName: displayNameProp,
  avatarUrl: avatarUrlProp,
  title,
}: {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
  title?: string;
}) {
  const supabase = await createClient();

  let userId = userIdProp;
  let displayName = displayNameProp;
  let avatarUrl = avatarUrlProp ?? null;

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    displayName = profile?.display_name ?? user.email ?? "";
    avatarUrl = profile?.avatar_url ?? null;
  }

  const name = displayName ?? "";
  const invites = await getPendingInvites();
  const { data: roleRow } = await supabase
    .from("profiles")
    .select("role, last_seen_at")
    .eq("id", userId)
    .maybeSingle();
  await touchLastSeen(supabase, userId, roleRow?.last_seen_at ?? null);
  const canManage =
    roleRow?.role === "ADMIN" || roleRow?.role === "CONTRIBUTOR";
  const navLinks = navWithAdmin(canManage);

  return (
    // No backdrop-blur: the handoff draws the bar as plain 90% parchment, and a
    // blurred sticky strip has to re-sample the content scrolling beneath it on
    // every frame — measurably janky over the Overview's photo band.
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 sm:px-6">
      <MobileNav
        userId={userId}
        displayName={name}
        avatarUrl={avatarUrl}
        links={navLinks}
      />
      {title ? (
        <span className="font-heading text-xl font-semibold leading-none md:hidden">
          {title}
        </span>
      ) : null}
      <div className="hidden max-w-[380px] flex-1 md:flex">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {/* Phones: icon-only, in exactly the scan and bell buttons' classes.
            buttonVariants on the Link, not `<Button render={<Link/>}>`: a
            non-native Base UI button stamps role="button" on the anchor, and
            this is a link, not a button. */}
        <Link
          href="/profile/numbers"
          aria-label="Your numbers"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            ICON_BUTTON,
            "md:hidden",
          )}
        >
          <ChartColumn aria-hidden />
        </Link>
        {/* md and up: the labelled gold-bordered pill. */}
        <Link
          href="/profile/numbers"
          className="hidden h-8 items-center gap-1.5 rounded-[8px] border border-gold bg-card px-[13px] text-[12.5px] font-semibold text-primary transition-colors hover:bg-white md:inline-flex"
        >
          <ChartColumn className="size-3.5" strokeWidth={2.25} />
          <span>Your numbers</span>
        </Link>
        <ScanButton className={ICON_BUTTON} />
        <NotificationsBell invites={invites} className={ICON_BUTTON} />
      </div>
    </header>
  );
}
