"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BIO_PLACEHOLDER, type FavouriteRegion, type ProfileFavourites } from "@/lib/profile-favourites";
import { FavouritesFields } from "./favourites-fields";
import { updateProfile, type EditProfileFormState } from "./actions";

export function EditProfileForm({
  displayName,
  bio,
  location,
  phone,
  favourites,
  regionOptions,
}: {
  displayName: string;
  bio: string;
  location: string;
  phone: string;
  /** null when the read failed — the favourites fields then show a load
   *  notice and post nothing (D11). */
  favourites: ProfileFavourites | null;
  regionOptions: FavouriteRegion[] | null;
}) {
  const [state, formAction, pending] = useActionState<
    EditProfileFormState,
    FormData
  >(updateProfile, null);

  // Controlled, not defaultValue: React resets uncontrolled fields after a
  // form action even when it returns an error. With the two writes in
  // updateProfile (favourites, then the profile row), a favourites refusal
  // after a successful profile write — or the reverse — would otherwise show
  // stale values that the next Save would write back.
  const [nameValue, setNameValue] = useState(displayName);
  const [bioValue, setBioValue] = useState(bio);
  const [locationValue, setLocationValue] = useState(location);
  const [phoneValue, setPhoneValue] = useState(phone);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">Name</Label>
        <Input
          id="display_name"
          name="display_name"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">About you</Label>
        <Textarea
          id="bio"
          name="bio"
          value={bioValue}
          onChange={(e) => setBioValue(e.target.value)}
          rows={4}
          placeholder={BIO_PLACEHOLDER}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location (optional)</Label>
        <Input
          id="location"
          name="location"
          value={locationValue}
          onChange={(e) => setLocationValue(e.target.value)}
          placeholder="e.g. Copenhagen, Denmark"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value)}
          placeholder="e.g. +45 12 34 56 78"
        />
      </div>
      <FavouritesFields favourites={favourites} regionOptions={regionOptions} />
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Saving…
          </>
        ) : (
          "Save"
        )}
      </Button>
    </form>
  );
}
