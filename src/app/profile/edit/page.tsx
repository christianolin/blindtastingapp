import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { VisibilitySelect } from "@/components/sharing/visibility-select";
import { SHARING_COPY } from "@/lib/sharing/visibility";
import { createClient } from "@/lib/supabase/server";
import { getProfileFavourites, loadFavouriteRegionOptions } from "@/lib/profile-favourites";
import { AvatarUploader } from "./avatar-uploader";
import { EditProfileForm } from "./edit-profile-form";
import { DeleteAccountSection } from "./delete-account-section";
import { ShowTourAgainButton } from "./show-tour-again-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TOUR_COPY } from "@/lib/first-run/tour";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, favourites, regionOptions] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, bio, avatar_url, location, phone, cellar_visibility, notes_visibility")
      .eq("id", user.id)
      .single(),
    getProfileFavourites(supabase, user.id),
    loadFavouriteRegionOptions(supabase),
  ]);

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
              favourites={favourites}
              regionOptions={regionOptions}
            />
          </CardContent>
        </Card>

        {/* Sharing (sharing-defaults spec §7.6, S18): who can see your cellar
            and your tasting notes. Each select saves on its own, like
            /cellar's. Rendered only with the stored values in hand, so it
            never shows a setting the row does not hold. #sharing is the
            Overview notice's and the profile's "Change" target. */}
        {profile ? (
          <Card id={SHARING_COPY.sectionId} className="scroll-mt-20">
            <CardHeader>
              <CardTitle>{SHARING_COPY.cardTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <VisibilitySelect
                userId={user.id}
                column="cellar_visibility"
                current={profile.cellar_visibility}
                label={SHARING_COPY.cellarLabel}
                help={SHARING_COPY.cellarHelp}
              />
              <VisibilitySelect
                userId={user.id}
                column="notes_visibility"
                current={profile.notes_visibility}
                label={SHARING_COPY.notesLabel}
                help={SHARING_COPY.notesHelp}
              />
              <ScrollToHash id={SHARING_COPY.sectionId} />
            </CardContent>
          </Card>
        ) : null}

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

        {/* Its own card, like Appearance: it replays the first-run tour
            (spec 2026-09-25 D2), not a field of the profile form. */}
        <Card>
          <CardHeader>
            <CardTitle>{TOUR_COPY.cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ShowTourAgainButton />
          </CardContent>
        </Card>

        {/* Last, and its own card: it acts on the whole account, not on a
            field of the profile form (account-deletion spec §5.2). */}
        <DeleteAccountSection />
      </div>
    </div>
  );
}
