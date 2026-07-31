import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AddWineProvider } from "@/components/add-wine-context";

// The authenticated app shell: a persistent left sidebar + the page as the main
// column. Rendered once at the root so every signed-in page gets the nav and
// none can be missed. Logged out (login / signup), it renders children bare.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <>{children}</>;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();
  const isManager = profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";

  return (
    <AddWineProvider userId={user.id}>
      <div className="flex min-h-screen">
        <AppSidebar
          isManager={isManager}
          user={{
            id: user.id,
            name: profile?.display_name ?? user.email ?? "",
            avatarUrl: profile?.avatar_url ?? null,
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AddWineProvider>
  );
}
