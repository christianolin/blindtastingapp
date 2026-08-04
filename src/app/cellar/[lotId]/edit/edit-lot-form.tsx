"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SIZES = [375, 750, 1500, 3000];
const SIZE_LABELS: Record<number, string> = {
  375: "375 ml",
  750: "750 ml",
  1500: "1.5 L",
  3000: "3 L",
};

export type LotInitial = {
  quantity: number;
  bottleSizeMl: number;
  pricePerBottle: number | null;
  currency: string;
  purchasedOn: string | null;
  purchaseSource: string | null;
  drinkFrom: number | null;
  drinkTo: number | null;
  storageLocation: string | null;
  lotNote: string | null;
};

export function EditLotForm({
  lotId,
  initial,
}: {
  lotId: string;
  initial: LotInitial;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [bottleSize, setBottleSize] = useState(initial.bottleSizeMl);
  const [price, setPrice] = useState(
    initial.pricePerBottle != null ? String(initial.pricePerBottle) : "",
  );
  const [currency, setCurrency] = useState(initial.currency);
  const [purchasedOn, setPurchasedOn] = useState(initial.purchasedOn ?? "");
  const [purchaseSource, setPurchaseSource] = useState(
    initial.purchaseSource ?? "",
  );
  const [drinkFrom, setDrinkFrom] = useState(
    initial.drinkFrom != null ? String(initial.drinkFrom) : "",
  );
  const [drinkTo, setDrinkTo] = useState(
    initial.drinkTo != null ? String(initial.drinkTo) : "",
  );
  const [storageLocation, setStorageLocation] = useState(
    initial.storageLocation ?? "",
  );
  const [lotNote, setLotNote] = useState(initial.lotNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 0) {
      setError("Bottles can't be negative.");
      return;
    }
    if (drinkFrom && drinkTo && Number(drinkTo) < Number(drinkFrom)) {
      setError("Drink-to year can't be before drink-from.");
      return;
    }
    setPending(true);
    const { error: e } = await supabase
      .from("cellar_lots")
      .update({
        quantity: qty,
        bottle_size_ml: bottleSize,
        price_per_bottle: price ? Number(price) : null,
        currency: currency || "DKK",
        purchased_on: purchasedOn || null,
        purchase_source: purchaseSource.trim() || null,
        drink_from: drinkFrom ? Number(drinkFrom) : null,
        drink_to: drinkTo ? Number(drinkTo) : null,
        storage_location: storageLocation.trim() || null,
        lot_note: lotNote.trim() || null,
      })
      .eq("id", lotId);
    if (e) {
      setError(e.message);
      setPending(false);
      return;
    }
    router.push("/cellar");
    router.refresh();
  }

  async function remove() {
    setPending(true);
    const { error: e } = await supabase
      .from("cellar_lots")
      .delete()
      .eq("id", lotId);
    if (e) {
      setError(e.message);
      setPending(false);
      return;
    }
    router.push("/cellar");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity">Bottles</Label>
          <Input
            id="quantity"
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bottle_size">Format</Label>
          <select
            id="bottle_size"
            value={bottleSize}
            onChange={(e) => setBottleSize(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {SIZE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Price / bottle</Label>
          <Input
            id="price"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="purchased_on">Purchased</Label>
          <Input
            id="purchased_on"
            type="date"
            className="appearance-none"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="purchase_source">Source</Label>
          <Input
            id="purchase_source"
            value={purchaseSource}
            onChange={(e) => setPurchaseSource(e.target.value)}
            placeholder="Merchant"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="drink_from">Drink from</Label>
          <Input
            id="drink_from"
            type="number"
            min={1900}
            max={2100}
            value={drinkFrom}
            onChange={(e) => setDrinkFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="drink_to">Drink to</Label>
          <Input
            id="drink_to"
            type="number"
            min={1900}
            max={2100}
            value={drinkTo}
            onChange={(e) => setDrinkTo(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="storage_location">Storage location</Label>
        <Input
          id="storage_location"
          value={storageLocation}
          onChange={(e) => setStorageLocation(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lot_note">Private note</Label>
        <Input
          id="lot_note"
          value={lotNote}
          onChange={(e) => setLotNote(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={remove}
          disabled={pending}
          className="text-destructive hover:text-destructive"
        >
          Delete lot
        </Button>
      </div>
    </div>
  );
}
