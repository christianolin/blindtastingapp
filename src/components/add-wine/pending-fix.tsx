"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { parseVintageYear } from "./scan-copy";
import type { PendingFix } from "./types";

/**
 * 7d "Fix": the inline strip under a pending row — a year input and an NV
 * button — that completes a scan whose vintage could not be read.
 *
 * Always mounted (collapsed with `max-h-0`, never `display:none`) so the row's
 * Fix tap can call `inputRef.current.focus()` synchronously — the same
 * keep-mounted rule the comboboxes follow: a phone only pops its keyboard
 * when focus() runs inside the trusted tap, and an unmounted input has
 * nothing to focus at that instant.
 */
export function PendingFixStrip({
  open,
  inputRef,
  onFix,
  disabled = false,
  tone = "dark",
}: {
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onFix: (fix: PendingFix) => void;
  disabled?: boolean;
  /** "dark" sits on the camera view's console surface; "light" on the
      desktop sheet's parchment. */
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitYear = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const parsed = parseVintageYear(year, new Date().getFullYear());
    if (parsed == null) {
      setError("Type a four-digit year, or mark it NV");
      return;
    }
    setError(null);
    onFix({ vintageKind: "YEAR", vintageYear: parsed });
  };

  return (
    <form
      onSubmit={submitYear}
      aria-hidden={!open}
      className={cn(
        "flex flex-col gap-[6px] overflow-hidden transition-[max-height,opacity] duration-150",
        open ? "max-h-[120px] pt-[8px] opacity-100" : "max-h-0 opacity-0",
      )}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={year}
          onChange={(e) => {
            setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
            if (error) setError(null);
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="Vintage"
          aria-label="Vintage year"
          tabIndex={open ? 0 : -1}
          disabled={disabled}
          className={cn(
            "h-11 w-[96px] rounded-[8px] border px-3 text-base outline-none disabled:opacity-60",
            dark
              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-console-ink focus-visible:border-gold-light"
              : "border-border bg-white text-foreground placeholder:text-placeholder focus-visible:border-gold-deep",
          )}
        />
        <button
          type="submit"
          tabIndex={open ? 0 : -1}
          disabled={disabled}
          className={cn(
            "h-11 rounded-[8px] px-4 text-[12.5px] font-bold disabled:opacity-60",
            dark
              ? "bg-gold-light text-console hover:bg-gold"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          Add
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          disabled={disabled}
          onClick={() => {
            setError(null);
            onFix({ vintageKind: "NV", vintageYear: null });
          }}
          className={cn(
            "h-11 rounded-[8px] border px-3 text-[12.5px] font-semibold disabled:opacity-60",
            dark
              ? "border-primary-foreground/30 text-primary-foreground hover:border-gold-light"
              : "border-border text-foreground hover:border-gold-deep",
          )}
        >
          NV
        </button>
      </div>
      {error ? (
        <p role="alert" className={cn("text-[11.5px]", dark ? "text-miss" : "text-rose")}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
