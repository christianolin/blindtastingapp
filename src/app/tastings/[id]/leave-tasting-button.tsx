"use client";

import { useState, useTransition } from "react";
import { LEAVE_TASTING } from "@/lib/invitation-copy";
import { leaveTasting } from "./guest-actions";

/**
 * The bottom-of-page "Leave the tasting" control (S6; ledger B3). Calls
 * `leaveTasting` directly — no `window.confirm` (refinement 7 allows it only
 * for End tasting and the ASYNC+IMMEDIATE lock; Leave is neither) — and
 * shows a refusal inline. A success revalidates the page from inside the
 * action: the caller's row flips to DECLINED, `routeTastingView` sends the
 * next render to the read-only lobby (`LobbyView`) instead of this one, so
 * this component just stops being part of the tree — no local "done" state
 * to manage.
 */
export function LeaveTastingButton({ tastingId }: { tastingId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await leaveTasting(tastingId);
            if (result?.error) setError(result.error);
          })
        }
        className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline disabled:opacity-60"
      >
        {pending ? "Leaving…" : LEAVE_TASTING}
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
