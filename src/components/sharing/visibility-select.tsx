"use client";

import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AUDIENCE_OPTIONS,
  initialWrites,
  isSharingAudience,
  notSavedLine,
  profileWriteSaved,
  writeAnswered,
  writeStarted,
  type SelectWrites,
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
 * (a session that is no longer this person's), snaps back to what the row
 * last confirmed and says so (the old CellarVisibilityControl rule).
 *
 * It stays enabled while it saves: disabling the focused select would drop
 * keyboard focus to the page after every change (an arrow key on a closed
 * select saves at once on Windows), so it says aria-busy instead, and
 * writeAnswered lets only the settled outcome of every write in flight touch
 * the screen. The "Not saved" line is a live region that is always in the
 * page (one that appears together with its text is often not announced),
 * visually hidden while empty, and it describes the select.
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
  const writes = useRef<SelectWrites>(initialWrites(current));
  const selectId = useId();
  const helpId = useId();
  const statusId = useId();

  async function change(next: SharingAudience) {
    setValue(next);
    setFailed(false);
    setSaving(true);
    const started = writeStarted(writes.current);
    writes.current = started.writes;
    let saved = false;
    try {
      const supabase = createClient();
      const values = column === "cellar_visibility" ? { cellar_visibility: next } : { notes_visibility: next };
      saved = profileWriteSaved(await supabase.from("profiles").update(values).eq("id", userId).select("id"));
    } catch {
      saved = false;
    }
    const answered = writeAnswered(writes.current, started.seq, next, saved);
    writes.current = answered.writes;
    if (answered.settled) {
      setValue(answered.settled.value);
      setFailed(answered.settled.failed);
      setSaving(false);
    }
  }

  const select = (
    <select
      id={selectId}
      value={value}
      aria-describedby={help ? `${helpId} ${statusId}` : statusId}
      aria-busy={saving}
      onChange={(e) => {
        if (isSharingAudience(e.target.value)) void change(e.target.value);
      }}
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
  const status = (
    <span id={statusId} role="status" className={cn("text-xs text-destructive", failed ? undefined : "sr-only")}>
      {failed ? notSavedLine(value) : ""}
    </span>
  );

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
