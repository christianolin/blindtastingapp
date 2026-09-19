"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  passwordCopy,
  passwordNext,
  type PasswordMode,
} from "@/lib/auth/password-copy";
import { setPassword, type SetPasswordFormState } from "./actions";

// 44px on a phone, the regular control height with a mouse or trackpad.
const TAP = "min-h-11 md:pointer-fine:min-h-8";

export function SetPasswordForm({
  mode,
  next,
  email,
  suggestedName,
}: {
  mode: PasswordMode;
  next: string;
  email: string;
  suggestedName: string;
}) {
  const copy = passwordCopy(mode);
  const [state, formAction, pending] = useActionState<
    SetPasswordFormState,
    FormData
  >(setPassword, null);
  // The suggested name (from the invite, or the email's local part) prefills
  // the first-name field; the last name starts empty and stays optional.
  const [name, setName] = useState(suggestedName);
  const [lastName, setLastName] = useState("");
  const [password, setPasswordValue] = useState("");

  const error = state && "error" in state ? state.error : null;
  const done = state && "done" in state ? state.done : null;
  // Saved: leave with a full browser navigation, not an in-app one. `next` can
  // be a route handler (/invite/<code>/accept) that deletes a cookie and
  // redirects; only the browser itself follows that 307 and applies its
  // cookie (see SetPasswordFormState). `replace`, so Back does not return to
  // a form that already did its job. The action already checked `done`; this
  // runs it through the same rule again rather than trusting the response.
  useEffect(() => {
    if (done !== null) window.location.replace(passwordNext(done));
  }, [done]);
  const busy = pending || done !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      {/* Not submitted: tells a password manager which account the new
          password belongs to, so it saves it against the right email. */}
      <input
        type="email"
        autoComplete="username"
        value={email}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="hidden"
      />
      {copy.nameLabel ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="first_name">{copy.nameLabel}</Label>
            <Input
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className={TAP}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="last_name">{copy.lastNameLabel}</Label>
            <Input
              id="last_name"
              name="last_name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={TAP}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{copy.passwordLabel}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          required
          minLength={6}
          autoFocus={!copy.nameLabel}
          aria-describedby="password-hint"
          className={TAP}
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {copy.hint}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className={TAP}>
        {busy ? (
          <>
            <WineGlassLoader /> {copy.pending}
          </>
        ) : (
          copy.submit
        )}
      </Button>
    </form>
  );
}
