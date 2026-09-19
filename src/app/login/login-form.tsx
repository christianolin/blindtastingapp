"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/paths";
import { FORGOT_PASSWORD_LINK, LINK_FAILED_LINE, SEND_A_NEW_ONE } from "@/lib/auth/login-copy";
import { signIn, type AuthFormState } from "./actions";

const LINK_CLASS =
  "inline-flex items-center font-medium text-primary transition-colors hover:text-primary/80 max-md:min-h-11";

export function LoginForm({
  next = null,
  linkFailed = false,
}: {
  next?: string | null;
  linkFailed?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {linkFailed ? (
        <div className="flex flex-col items-start gap-1 text-sm" role="alert">
          <p className="text-destructive">{LINK_FAILED_LINE}</p>
          <Link href={FORGOT_PASSWORD_PATH} className={LINK_CLASS}>
            {SEND_A_NEW_ONE}
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-md:min-h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">Password</Label>
          <Link href={FORGOT_PASSWORD_PATH} className={`${LINK_CLASS} text-sm`}>
            {FORGOT_PASSWORD_LINK}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="max-md:min-h-11"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="max-md:min-h-11">
        {pending ? (
          <>
            <WineGlassLoader /> Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
      <p className="text-sm text-muted-foreground">
        No account yet?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className={LINK_CLASS}
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
