import { MobileNav } from "@/components/mobile-nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { navWithAdmin } from "@/components/nav-links";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites } from "@/lib/notifications";
import { touchLastSeen } from "@/lib/last-seen";
import { GlobalSearch } from "@/components/global-search";
import { ScanButton } from "@/components/scan/scan-button";
import { ActiveTastingBanner } from "@/components/active-tasting-banner";
import { readActiveTastings } from "@/lib/active-tasting/read";
import { EMPTY_SNAPSHOT } from "@/lib/active-tasting/select";

// The bordered icon-button look from the redesign's top bar: 1px border on
// the raised parchment, radius 8, a 19px icon, gold border + white fill on
// hover. The svg selector repeats the Button base's own so twMerge lets the
// 19px override its 16px default. Below md a ::before pseudo-element extends
// the 32px box to a 44px tap target without changing how it looks.
const ICON_BUTTON =
  "relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] md:before:hidden rounded-[8px] border border-border bg-card transition-colors hover:border-gold hover:bg-surface-raised [&_svg:not([class*='size-'])]:size-[19px]";

/**
 * The app's top bar — rendered inside the main column, to the right of the
 * persistent AppSidebar. Holds the global search (desktop only), the label
 * scanner and the notifications bell at every width, and the MobileNav
 * hamburger drawer below `md` (where the sidebar is hidden). Your numbers is
 * not here: the sidebar and the drawer always list it under the profile row.
 * The bar reads burger · title … scan · bell, the bell at the far right as in
 * the handoff. `title` is the page name shown next
 * to the burger on phones (the sidebar carries it on desktop).
 * Directly under the bar sits the active-tasting strip (ActiveTastingBanner:
 * the tasting you are in right now and a button back to it, hidden on that
 * tasting's own pages) — every caller already places AppHeader first in a
 * flex column, so it lands full width with no caller edits.
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
  // In parallel, so the strip costs no extra latency. A failed read renders
  // the epoch-stamped empty snapshot, which any later poll replaces (D13).
  const [invites, active] = await Promise.all([
    getPendingInvites(),
    readActiveTastings(userId),
  ]);
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
    <>
      {/* No backdrop-blur: the handoff draws the bar as plain 90% parchment, and a
          blurred sticky strip has to re-sample the content scrolling beneath it on
          every frame — measurably janky over the Overview's photo band. */}
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
          <ScanButton className={ICON_BUTTON} />
          <NotificationsBell invites={invites} className={ICON_BUTTON} />
        </div>
      </header>
      {/* Scrolls with the page, not sticky — the bar stays the only sticky
          strip (D9). */}
      <ActiveTastingBanner initial={active ?? EMPTY_SNAPSHOT} />
    </>
  );
}
