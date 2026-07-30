"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CellarVisibility } from "@/lib/supabase/database.types";

const OPTIONS: { value: CellarVisibility; label: string }[] = [
  { value: "PRIVATE", label: "Private" },
  { value: "FRIENDS", label: "Friends" },
  { value: "PUBLIC", label: "Public" },
];

// Owner-only control on /cellar to set who may view the cellar. Writes straight
// to the caller's own profile row (RLS: id = auth.uid()).
export function CellarVisibilityControl({
  userId,
  current,
}: {
  userId: string;
  current: CellarVisibility;
}) {
  const supabase = createClient();
  const [value, setValue] = useState<CellarVisibility>(current);
  const [saving, setSaving] = useState(false);

  async function change(v: CellarVisibility) {
    setValue(v);
    setSaving(true);
    await supabase.from("profiles").update({ cellar_visibility: v }).eq("id", userId);
    setSaving(false);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Visible to
      <select
        value={value}
        onChange={(e) => change(e.target.value as CellarVisibility)}
        disabled={saving}
        className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
