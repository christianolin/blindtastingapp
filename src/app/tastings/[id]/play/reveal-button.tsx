"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { revealWine, type RevealFormState } from "./actions";

export function RevealButton({
  tastingId,
  wineId,
}: {
  tastingId: string;
  wineId: string;
}) {
  const [state, formAction, pending] = useActionState<RevealFormState, FormData>(
    revealWine,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <input type="hidden" name="wine_id" value={wineId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Revealing…
          </>
        ) : (
          "Reveal"
        )}
      </Button>
      {state?.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
