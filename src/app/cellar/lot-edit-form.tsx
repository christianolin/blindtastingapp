"use client";

// The Edit lot fields (CC-U4, spec §5.5, D6; refinement 4): the client-side
// write `edit-lot-form.tsx` used to do goes through `updateLot`/`deleteLot`
// now — this component only holds the controlled fields and calls them.
// `LotSheet` renders this inside its body when `mode === "edit"` and renders
// the Save/Cancel footer itself, wired to this form's `formId`.
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import { sizeLabel } from "@/lib/cellar/format";
import { deleteLot, updateLot, type LotFields } from "@/app/cellar/lot-actions";

const NAMED_SIZES = [375, 750, 1500, 3000];

export function LotEditForm({
  lotId,
  initial,
  focus,
  formId,
  onSaved,
  onCancel,
  onDeleted,
}: {
  lotId: string;
  initial: LotFields;
  focus?: "drinkFrom" | null;
  /** The id the sheet's own footer submit button targets. */
  formId: string;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  // Cancel is rendered by LotSheet's own footer (spec §5.5's "Footer
  // (rendered by LotSheet when in edit mode..."), calling the very handler
  // passed here as `onCancel` directly — this form never renders a Cancel
  // button of its own, so the prop stays on the signature for parity with
  // `onSaved`/`onDeleted`, unused inside this component.
  void onCancel;
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [bottleSize, setBottleSize] = useState(String(initial.bottleSizeMl));
  const [price, setPrice] = useState(
    initial.pricePerBottle != null ? String(initial.pricePerBottle) : "",
  );
  const [currency, setCurrency] = useState(initial.currency);
  const [purchasedOn, setPurchasedOn] = useState(initial.purchasedOn ?? "");
  const [purchaseSource, setPurchaseSource] = useState(initial.purchaseSource ?? "");
  const [drinkFrom, setDrinkFrom] = useState(
    initial.drinkFrom != null ? String(initial.drinkFrom) : "",
  );
  const [drinkTo, setDrinkTo] = useState(initial.drinkTo != null ? String(initial.drinkTo) : "");
  const [storageLocation, setStorageLocation] = useState(initial.storageLocation ?? "");
  const [lotNote, setLotNote] = useState(initial.lotNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);

  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  const tapState: TwoTapState = armedAt === null ? "idle" : "armed";

  const sizeOptions = NAMED_SIZES.includes(initial.bottleSizeMl)
    ? NAMED_SIZES
    : [...NAMED_SIZES, initial.bottleSizeMl].sort((a, b) => a - b);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fields: LotFields = {
      quantity: Number(quantity),
      bottleSizeMl: Number(bottleSize),
      pricePerBottle: price.trim() === "" ? null : Number(price),
      currency,
      purchasedOn: purchasedOn.trim() === "" ? null : purchasedOn,
      purchaseSource: purchaseSource.trim() === "" ? null : purchaseSource,
      drinkFrom: drinkFrom.trim() === "" ? null : Number(drinkFrom),
      drinkTo: drinkTo.trim() === "" ? null : Number(drinkTo),
      storageLocation: storageLocation.trim() === "" ? null : storageLocation,
      lotNote: lotNote.trim() === "" ? null : lotNote,
    };
    const result = await updateLot(lotId, fields);
    setPending(false);
    if (result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteLot(lotId);
    setPending(false);
    if (result) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
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
            onChange={(e) => setBottleSize(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {sizeOptions.map((ml) => (
              <option key={ml} value={ml}>
                {sizeLabel(ml)}
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
            autoFocus={focus === "drinkFrom"}
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
        <Textarea
          id="lot_note"
          value={lotNote}
          onChange={(e) => setLotNote(e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="max-md:hidden">
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (tapState !== "armed") {
              setArmedAt(Date.now());
              return;
            }
            setArmedAt(null);
            void handleDelete();
          }}
        >
          {tapState === "armed" ? "Tap again to delete" : "Delete lot"}
        </Button>
      </div>
    </form>
  );
}
