"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { requestReset, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    requestReset,
    null,
  );

  // The same confirmation whether or not the address exists — the action is
  // deliberately silent about that, and the UI must not undo it.
  if (state && "sent" in state) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          If that address has a confirmed account, a reset link is on its way.
          It expires in an hour.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        We&apos;ll email you a link to choose a new password.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoFocus />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:text-primary/80"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
