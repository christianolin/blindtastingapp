"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import {
  BACK_TO_SIGN_IN,
  FORGOT_EMAIL_LABEL,
  FORGOT_PENDING,
  FORGOT_SUBMIT,
  LOGIN_PATH,
  resetSentLine,
} from "@/lib/auth/login-copy";
import { requestPasswordReset, type ForgotFormState } from "../actions";

const LINK_CLASS =
  "inline-flex items-center font-medium text-primary transition-colors hover:text-primary/80 max-md:min-h-11";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState<ForgotFormState, FormData>(
    requestPasswordReset,
    null,
  );

  const backLink = (
    <p className="text-sm text-muted-foreground">
      <Link href={LOGIN_PATH} className={LINK_CLASS}>
        {BACK_TO_SIGN_IN}
      </Link>
    </p>
  );

  if (state && "sent" in state) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm" role="status">
          {resetSentLine(state.sent)}
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{FORGOT_EMAIL_LABEL}</Label>
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
      {state && "error" in state ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="max-md:min-h-11">
        {pending ? (
          <>
            <WineGlassLoader /> {FORGOT_PENDING}
          </>
        ) : (
          FORGOT_SUBMIT
        )}
      </Button>
      {backLink}
    </form>
  );
}
