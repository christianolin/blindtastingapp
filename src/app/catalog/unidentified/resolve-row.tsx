"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { resolveUnidentifiedWine, searchCatalogForResolve } from "./actions";

// A curator identifies an unidentified bottle by picking the real catalog wine it
// actually is — resolveUnidentifiedWine repoints its answers/notes and tombstones it.
export function ResolveRow({ unidentifiedId }: { unidentifiedId: string }) {
  const [pick, setPick] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      <SearchableCombobox
        formFieldName="resolve_pick"
        value={pick?.id ?? ""}
        selectedLabel={pick?.label ?? null}
        onValueChange={(id, label) => setPick(id ? { id, label: label ?? "" } : null)}
        search={searchCatalogForResolve}
        placeholder="Search the catalog to identify this bottle…"
      />
      {pick ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await resolveUnidentifiedWine(unidentifiedId, pick.id);
              if ("error" in result) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Resolving…" : `Resolve as "${pick.label}"`}
        </Button>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
