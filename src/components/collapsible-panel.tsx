"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A button that toggles its children open/closed. Used on the play page so
 * each wine's guess form is behind a per-wine "Guess this wine" button rather
 * than all forms being expanded at once. Children only mount while open, so
 * the heavy comboboxes inside a guess form aren't built until you open it.
 */
export function CollapsiblePanel({
  label,
  variant = "default",
  defaultOpen = false,
  children,
}: {
  label: string;
  variant?: "default" | "outline";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant={open ? "outline" : variant}
        onClick={() => setOpen((o) => !o)}
        className="w-fit gap-1.5"
      >
        {open ? "Close" : label}
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open ? children : null}
    </div>
  );
}
