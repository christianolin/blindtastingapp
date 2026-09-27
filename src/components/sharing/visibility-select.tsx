"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AUDIENCE_OPTIONS,
  isSharingAudience,
  notSavedLine,
  profileWriteSaved,
  type SharingAudience,
} from "@/lib/sharing/visibility";
import { cn } from "@/lib/utils";

export type SharingColumn = "cellar_visibility" | "notes_visibility";

/**
 * One sharing setting — who can see your cellar, or your tasting notes —
 * as Everyone / Friends / Only me (sharing-defaults spec 2026-09-27 S6, S18,
 * §7.6). Writes the signed-in person's own profile row as the viewer, under
 * the column grant and "profiles update own". The select never claims a
 * setting the row does not hold: a refused write, or one that matched no row
 * (a session that is no longer this person's), snaps back to what was stored
 * and says so (the old CellarVisibilityControl rule).
 *
 * `variant="inline"` is /cellar's compact "Visible to [select]" row;
 * `variant="field"` is the Sharing card's labelled field with a help line.
 */
export function VisibilitySelect({
  userId,
  column,
  current,
  label,
  help,
  variant = "field",
}: {
  userId: string;
  column: SharingColumn;
  current: SharingAudience;
  label: string;
  help?: string;
  variant?: "field" | "inline";
}) {
  const [value, setValue] = useState<SharingAudience>(current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectId = useId();
  const helpId = useId();

  async function change(next: SharingAudience) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setFailed(false);
    const supabase = createClient();
    const values = column === "cellar_visibility" ? { cellar_visibility: next } : { notes_visibility: next };
    const result = await supabase.from("profiles").update(values).eq("id", userId).select("id");
    if (!profileWriteSaved(result)) {
      setValue(previous);
      setFailed(true);
    }
    setSaving(false);
  }

  const select = (
    <select
      id={selectId}
      value={value}
      aria-describedby={help ? helpId : undefined}
      onChange={(e) => {
        if (isSharingAudience(e.target.value)) void change(e.target.value);
      }}
      disabled={saving}
      className={cn(
        "min-h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground md:pointer-fine:min-h-9",
        variant === "field" ? "w-full" : undefined,
      )}
    >
      {AUDIENCE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const status = failed ? (
    <span role="status" className="text-xs text-destructive">
      {notSavedLine(value)}
    </span>
  ) : null;

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
        <label htmlFor={selectId}>{label}</label>
        {select}
        {status}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      {select}
      {help ? (
        <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      ) : null}
      {status}
    </div>
  );
}
