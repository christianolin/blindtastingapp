"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consumeLot } from "./actions";

const REASONS = ["DRANK", "GIFTED", "LOST", "OTHER"] as const;
const REASON_LABELS: Record<(typeof REASONS)[number], string> = {
  DRANK: "Drank it",
  GIFTED: "Gave it away",
  LOST: "Lost / broken",
  OTHER: "Other",
};

export function DrinkForm({
  lotId,
  available,
  wineId,
}: {
  lotId: string;
  available: number;
  wineId: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [quantity, setQuantity] = useState("1");
  const [consumedOn, setConsumedOn] = useState(today);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("DRANK");
  const [occasion, setOccasion] = useState("");
  const [alsoNote, setAlsoNote] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const qty = Number(quantity);
    if (!qty || qty < 1) {
      setError("How many bottles?");
      return;
    }
    if (qty > available) {
      setError(`Only ${available} in this lot.`);
      return;
    }
    setPending(true);
    try {
      const { id } = await consumeLot({
        lotId,
        quantity: qty,
        consumedOn,
        reason,
        occasion: occasion.trim() || null,
      });
      if (alsoNote && reason === "DRANK") {
        router.push(`/catalog/${wineId}/notes/new?consumption=${id}`);
      } else {
        router.push("/cellar?tab=history");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity">Bottles</Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            max={available}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="consumed_on">When</Label>
          <Input
            id="consumed_on"
            type="date"
            value={consumedOn}
            onChange={(e) => setConsumedOn(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">What happened</Label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="occasion">Occasion (optional)</Label>
        <Input
          id="occasion"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="e.g. anniversary dinner"
        />
      </div>
      {reason === "DRANK" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={alsoNote}
            onChange={(e) => setAlsoNote(e.target.checked)}
            className="size-4"
          />
          Write a tasting note after
        </label>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        <Wine />
        {pending
          ? "Recording…"
          : alsoNote && reason === "DRANK"
            ? "Record & write note"
            : "Record"}
      </Button>
    </div>
  );
}
