"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ReferenceCombobox, type ReferenceOption } from "@/components/reference-combobox";
import { submitMatchGuess, type GuessFormState } from "./actions";

export function MatchGuessForm({
  tastingId,
  wineId,
  candidates,
  existingGuessedWineId,
}: {
  tastingId: string;
  wineId: string;
  candidates: ReferenceOption[];
  existingGuessedWineId: string | null;
}) {
  const [state, formAction, pending] = useActionState<GuessFormState, FormData>(
    submitMatchGuess,
    null,
  );
  const [guessedWineId, setGuessedWineId] = useState(
    existingGuessedWineId ?? "",
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <input type="hidden" name="wine_id" value={wineId} />

      <ReferenceCombobox
        formFieldName="guessed_wine_id"
        options={candidates}
        value={guessedWineId}
        onValueChange={setGuessedWineId}
        placeholder="Which wine do you think this is?"
        allowClear
      />

      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p className="text-sm text-muted-foreground">Guess saved.</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : existingGuessedWineId
            ? "Update guess"
            : "Submit guess"}
      </Button>
    </form>
  );
}
