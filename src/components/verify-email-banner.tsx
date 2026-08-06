"use client";

import { useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { resendVerification } from "@/app/auth/verify/actions";

// Verify-later policy: the account already works, so this nudges rather than
// blocks. Dismissal is component state on purpose — it comes back on the next
// load, because an unverified address cannot reset its own password.
export function VerifyEmailBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 border-b border-border bg-muted/40 px-6 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Confirm <span className="font-medium text-foreground">{email}</span> so
        you can reset your password and receive tasting invites.
      </p>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        {state === "sent" ? (
          <span className="text-muted-foreground">Sent — check your inbox.</span>
        ) : (
          <button
            type="button"
            disabled={state === "sending"}
            onClick={async () => {
              setState("sending");
              setState((await resendVerification()) ? "sent" : "failed");
            }}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline disabled:opacity-60"
          >
            {state === "sending" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : null}
            {state === "failed" ? "Try again" : "Resend"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
