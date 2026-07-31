"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TastingAddWineModal } from "./tasting-add-wine-modal";

// Opens the tasting Add-wine popup instead of navigating to the add-wine page.
export function TastingAddWineButton({
  tastingId,
  label,
}: {
  tastingId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <TastingAddWineModal
          tastingId={tastingId}
          label={label}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
