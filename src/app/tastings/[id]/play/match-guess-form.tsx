"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox, type ReferenceOption } from "@/components/reference-combobox";
import { submitAllMatchGuesses, type GuessFormState } from "./actions";

export type MatchGlass = {
  wineId: string;
  position: number;
  existingGuessedWineId: string | null;
};

// One combined form for every still-hidden glass in a semi-blind tasting —
// you match all of them before you can submit, rather than one at a time.
// Partial submission doesn't make sense here: unlike blind guessing (where
// each category is scored independently and a partial guess is still
// meaningful), a half-finished matching pass just means some glasses have
// no guess row at all yet, and there's no reason to force a network
// round-trip per glass when the whole point is picking a candidate for each.
export function MatchGuessForm({
  tastingId,
  glasses,
  candidates,
}: {
  tastingId: string;
  glasses: MatchGlass[];
  candidates: ReferenceOption[];
}) {
  const [state, formAction, pending] = useActionState<GuessFormState, FormData>(
    submitAllMatchGuesses,
    null,
  );
  const [guesses, setGuesses] = useState<Record<string, string>>(() =>
    Object.fromEntries(glasses.map((g) => [g.wineId, g.existingGuessedWineId ?? ""])),
  );

  const allMatched = glasses.every((g) => guesses[g.wineId]);
  const anyExisting = glasses.some((g) => g.existingGuessedWineId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match the glasses</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="tasting_id" value={tastingId} />
          <input
            type="hidden"
            name="guesses"
            value={JSON.stringify(guesses)}
          />

          {glasses.map((g) => (
            <div key={g.wineId} className="flex flex-col gap-2">
              <Label>Wine {g.position}</Label>
              <ReferenceCombobox
                formFieldName={`__display_${g.wineId}`}
                options={candidates}
                value={guesses[g.wineId] ?? ""}
                onValueChange={(id) =>
                  setGuesses((prev) => ({ ...prev, [g.wineId]: id }))
                }
                placeholder="Which wine do you think this is?"
                allowClear
              />
            </div>
          ))}

          {state && "error" in state ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state && "success" in state ? (
            <p className="text-sm text-muted-foreground">Guesses saved.</p>
          ) : null}

          <Button type="submit" disabled={pending || !allMatched}>
            {pending
              ? "Saving…"
              : !allMatched
                ? "Match every glass to submit"
                : anyExisting
                  ? "Update guesses"
                  : "Submit guesses"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
