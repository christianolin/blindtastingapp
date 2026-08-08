"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateWineEstimatedPrice } from "./wine-price-actions";

// The wine's shared market estimate, shown with the lot but saved separately —
// the lot form's own Save must not silently write wine-level data. Members see
// it greyed out; contributors and admins can correct it inline.
export function WinePriceField({
  wineId,
  initialPrice,
  canEdit,
}: {
  wineId: string;
  initialPrice: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    initialPrice != null ? String(Math.round(initialPrice)) : "",
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const parsed = value.trim() === "" ? null : Number(value);
  const changed =
    (parsed == null ? null : Math.round(parsed)) !==
    (initialPrice == null ? null : Math.round(initialPrice));

  async function save() {
    if (parsed != null && !Number.isFinite(parsed)) {
      setError("Enter a number in DKK, or clear the field.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      await updateWineEstimatedPrice(wineId, parsed);
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't save the price.");
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Label htmlFor="wine-estimated-price">
        Estimated price (DKK) — wine-level
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="wine-estimated-price"
          type="number"
          min={0}
          step="1"
          value={value}
          disabled={!canEdit}
          onChange={(e) => setValue(e.target.value)}
          placeholder="—"
          className="max-w-40"
        />
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={save}
            disabled={state === "saving" || !changed}
          >
            {state === "saving"
              ? "Saving…"
              : state === "saved"
                ? "Saved ✓"
                : "Save price"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Looked up from current retail listings and market data for this exact
        wine and vintage — left blank when none exist. It values the cellar
        wherever no purchase price is entered, and it&apos;s shared by everyone
        who holds this wine.
        {canEdit ? "" : " Contributors and admins can correct it."}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
