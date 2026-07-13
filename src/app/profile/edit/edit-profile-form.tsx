"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProfile, type EditProfileFormState } from "./actions";

export function EditProfileForm({
  displayName,
  bio,
}: {
  displayName: string;
  bio: string;
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
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
