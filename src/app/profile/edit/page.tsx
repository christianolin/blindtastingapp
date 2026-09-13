import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { AvatarUploader } from "./avatar-uploader";
import { EditProfileForm } from "./edit-profile-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, avatar_url, location, phone, favorite_wine_type")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        userId={user.id}
        displayName={profile?.display_name ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
      />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle>Edit profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AvatarUploader
              userId={user.id}
              initialAvatarUrl={profile?.avatar_url ?? null}
            />
            <EditProfileForm
              displayName={profile?.display_name ?? ""}
              bio={profile?.bio ?? ""}
              location={profile?.location ?? ""}
              phone={profile?.phone ?? ""}
              favoriteWineType={profile?.favorite_wine_type ?? ""}
            />
          </CardContent>
        </Card>

        {/* Its own card, not a row in the profile form: the theme is a device
            preference kept in this browser, not a column on the profile, and
            putting it inside a form that saves to the server would imply it
            travels with the account. */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
