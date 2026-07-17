"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FAVORITE_WINE_TYPE_ITEMS } from "@/lib/wine-types";
import { updateProfile, type EditProfileFormState } from "./actions";

export function EditProfileForm({
  displayName,
  bio,
  location,
  phone,
  favoriteWineType,
}: {
  displayName: string;
  bio: string;
  location: string;
  phone: string;
  favoriteWineType: string;
}) {
  const [state, formAction, pending] = useActionState<
    EditProfileFormState,
    FormData
  >(updateProfile, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">Name</Label>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={displayName}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">About you</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={bio}
          rows={4}
          placeholder="Favorite regions, go-to grape, anything you'd like other tasters to know"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location (optional)</Label>
        <Input
          id="location"
          name="location"
          defaultValue={location}
          placeholder="e.g. Copenhagen, Denmark"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="e.g. +45 12 34 56 78"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="favorite_wine_type">Favorite wine type (optional)</Label>
        <Select
          name="favorite_wine_type"
          items={FAVORITE_WINE_TYPE_ITEMS}
          defaultValue={favoriteWineType}
        >
          <SelectTrigger id="favorite_wine_type" className="w-full">
            <SelectValue placeholder="No preference" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FAVORITE_WINE_TYPE_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
