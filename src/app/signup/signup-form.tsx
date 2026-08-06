"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp, type SignUpFormState } from "./actions";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<
    SignUpFormState,
    FormData
  >(signUp, null);

  // No "check your email" branch: signing up now signs you straight in
  // (verify-later), so the action redirects and never returns a success state.
  // The confirmation nudge lives in the app shell's banner instead.
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">Name</Label>
        <Input id="display_name" name="display_name" required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Creating account…
          </>
        ) : (
          "Sign up"
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary transition-colors hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </form>
  );
}
