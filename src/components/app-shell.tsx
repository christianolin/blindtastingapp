import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AddWineProvider } from "@/components/add-wine-context";
import { TasteLauncherProvider } from "@/components/taste-launcher-context";
import { TourProvider } from "@/components/first-run/tour-provider";
import { isProfileBare, tourSeenFromProfile } from "@/lib/first-run/tour";

// The authenticated app shell: a persistent left sidebar + the page as the main
// column. Rendered once at the root so every signed-in page gets the nav and
// none can be missed. Logged out (login / signup), it renders children bare.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <>{children}</>;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role, location, tour_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  // A failed read blanks the sidebar and hides the tour; say so in the server
  // log (code and message only) so a schema mismatch after a deploy — e.g. the
  // tour_seen_at migration not yet applied — is diagnosable from Vercel's logs.
  if (profileError) {
    console.error("[app-shell] profile read failed", profileError.code, profileError.message);
  }
  const isManager = profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";
  // First-run tour (spec 2026-09-25 D1, D5, D6): the flag rides on this one
  // profile read — no extra request. A failed read counts as seen, so an
  // error never shows the tour again to someone who dismissed it.
  const tourSeen = tourSeenFromProfile(profile);
  const profileBare = isProfileBare({
    avatarUrl: profile?.avatar_url ?? null,
    location: profile?.location ?? null,
  });

  return (
    <AddWineProvider userId={user.id}>
      <TasteLauncherProvider userId={user.id}>
        {/* Around the whole shell: /profile/edit's "Show the tour again"
            reaches it through useTourReplay(). */}
        <TourProvider tourSeen={tourSeen} profileBare={profileBare}>
          {/* The window never scrolls: the content column is the scroll
              container. That's the only arrangement iPad Safari can't defeat —
              both sticky and fixed sidebars drifted with its collapsing
              browser chrome. */}
          <div className="flex h-dvh overflow-hidden">
            <AppSidebar
              isManager={isManager}
              user={{
                id: user.id,
                name: profile?.display_name ?? user.email ?? "",
                avatarUrl: profile?.avatar_url ?? null,
              }}
            />
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </div>
        </TourProvider>
      </TasteLauncherProvider>
    </AddWineProvider>
  );
}
