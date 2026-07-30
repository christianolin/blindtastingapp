"use client";

import { Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  ReferenceCombobox,
  type ReferenceOption,
} from "@/components/reference-combobox";
import { createGrape } from "./actions";

// One row per grape: the grape itself + an optional percentage. The first row is
// the primary grape (required); the rest build the blend. Percentages are
// optional — blind tasting falls back to row order when they're absent.
export type BlendRow = { grapeId: string; percentage: string };

export function GrapeBlendEditor({
  grapes,
  onGrapeCreated,
  value,
  onChange,
}: {
  grapes: ReferenceOption[];
  onGrapeCreated: (o: ReferenceOption) => void;
  value: BlendRow[];
  onChange: (rows: BlendRow[]) => void;
}) {
  const setRow = (i: number, patch: Partial<BlendRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...value, { grapeId: "", percentage: "" }]);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  const sum = value.reduce((s, r) => s + (r.percentage ? Number(r.percentage) : 0), 0);
  const anyPct = value.some((r) => r.percentage.trim() !== "");

  return (
    <div className="flex flex-col gap-2">
      {value.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ReferenceCombobox
              formFieldName={`grape_${i}`}
              options={grapes}
              value={r.grapeId}
              onValueChange={(id) => setRow(i, { grapeId: id })}
              onOptionCreated={onGrapeCreated}
              placeholder={i === 0 ? "Primary grape" : "Grape"}
              createLabel="grape"
              onCreate={createGrape}
            />
          </div>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={r.percentage}
            onChange={(e) => setRow(i, { percentage: e.target.value })}
            placeholder="%"
            className="w-20"
            aria-label={`Grape ${i + 1} percentage`}
          />
          {value.length > 1 ? (
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove grape"
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          ) : (
            <span className="w-4" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex w-fit items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
      >
        <Plus className="size-3.5" /> Add grape
      </button>
      {anyPct && Math.round(sum) !== 100 ? (
        <p className="text-xs text-muted-foreground">
          Percentages total {sum}% (they usually add up to 100%).
        </p>
      ) : null}
    </div>
  );
}
