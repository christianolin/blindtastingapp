import { MobileNav } from "@/components/mobile-nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { navWithAdmin } from "@/components/nav-links";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites } from "@/lib/notifications";
import { touchLastSeen } from "@/lib/last-seen";
import { GlobalSearch } from "@/components/global-search";
import { ScanButton } from "@/components/scan/scan-button";

/**
 * The app's top bar — rendered inside the main column, to the right of the
 * persistent AppSidebar. Holds the global search + notifications on desktop, and
 * the MobileNav hamburger drawer below `md` (where the sidebar is hidden). The
 * nav, logo, user chip and sign-out now live in the sidebar. Renders nothing
 * when logged out (those pages redirect to /login anyway).
 */
export async function AppHeader({
  userId: userIdProp,
  displayName: displayNameProp,
  avatarUrl: avatarUrlProp,
}: {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
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
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
      <MobileNav
        userId={userId}
        displayName={name}
        avatarUrl={avatarUrl}
        links={navLinks}
        notifications={<NotificationsBell invites={invites} />}
      />
      <div className="hidden max-w-md flex-1 md:flex">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ScanButton userId={userId} />
        <div className="hidden items-center md:flex">
          <NotificationsBell invites={invites} />
        </div>
      </div>
    </header>
  );
}
