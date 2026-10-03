"use client";

import { cn } from "@/lib/utils";

export type DosageOption = { id: string; name: string };

/** Provisional copy (owner approves). */
export const DOSAGE_COPY = {
  label: "Dosage",
  none: "Not stated",
  /** Says how the two fields share the work, so nobody looks for Brut under Type designation. */
  hint: "How dry the sparkling wine is. Reserva or Gran Reserva goes under Type designation.",
} as const;

/**
 * A sparkling wine's dosage (20261003101000): "Not stated" plus the seven "Sparkling
 * Dosage" rows, driest first, as 44px segments four by two (the sheet is narrow on
 * every width). Shown only for a sparkling wine; the caller decides that. Pass the options
 * through `dosageChoices` (src/lib/wine-identity/dosage.ts).
 */
export function DosageField({
  options,
  value,
  onChange,
  disabled,
  formFieldName,
}: {
  options: readonly DosageOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** A hidden input for a form that posts (the legacy catalog form does not need one). */
  formFieldName?: string;
}) {
  const segments: { id: string | null; label: string }[] = [
    { id: null, label: DOSAGE_COPY.none },
    ...options.map((o) => ({ id: o.id, label: o.name })),
  ];
  return (
    <>
      {formFieldName ? <input type="hidden" name={formFieldName} value={value ?? ""} /> : null}
      <div
        role="radiogroup"
        aria-label={DOSAGE_COPY.label}
        className="grid grid-cols-4 gap-[4px] rounded-[10px] bg-muted p-[3px]"
      >
        {segments.map((s) => {
          const active = s.id === (value ?? null);
          return (
            <button
              key={s.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(s.id)}
              className={cn(
                "min-h-11 min-w-0 rounded-[8px] px-1 text-[12px] leading-tight transition-colors disabled:cursor-not-allowed",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "font-medium text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-60",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
