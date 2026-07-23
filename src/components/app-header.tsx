import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlindrLockup } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { AppNav, NAV_LINKS } from "@/components/app-nav";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites } from "@/lib/notifications";
import { signOut } from "@/app/actions";

/**
 * The app's persistent top bar — shown on every authenticated page. Callers
 * that already have the user/profile in hand can pass them to skip a refetch;
 * everywhere else just renders `<AppHeader />` and lets it fetch. Renders
 * nothing when logged out (those pages redirect to /login anyway).
 *
 * Desktop shows the nav inline; below `md` it collapses into MobileNav's
 * hamburger drawer so navigation is always reachable, never "use the browser
 * back button."
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

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
      <Link href="/dashboard" className="flex items-center">
        <BlindrLockup size={30} gap={8} />
      </Link>

      <nav className="hidden items-center gap-4 text-sm md:flex">
        <AppNav />
        <Link
          href={`/u/${userId}`}
          className="flex items-center gap-2 hover:underline"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="size-6 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {name}
        </Link>
        <NotificationsBell invites={invites} />
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </nav>

      <MobileNav
        userId={userId}
        displayName={name}
        avatarUrl={avatarUrl}
        links={NAV_LINKS}
        notifications={<NotificationsBell invites={invites} />}
      />
    </header>
  );
}
