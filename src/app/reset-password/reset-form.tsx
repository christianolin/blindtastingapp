"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { resetPassword, type ResetState } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    null,
  );

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          That link is missing its token. Reset links can only be used once, so
          if you have already followed this one you will need a new one.
        </p>
        <Button render={<Link href="/forgot-password" />}>
          Request a new link
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
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
          "Set new password"
        )}
      </Button>
      {/* Signing out everywhere is a security property, not a side effect —
          say so, or it looks like a bug when other devices stop working. */}
      <p className="text-xs text-muted-foreground">
        Changing your password signs you out on every other device.
      </p>
    </form>
  );
}
