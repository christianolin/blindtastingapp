"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InvitePeopleDialog } from "./invite-people-dialog";

// The one entry point (spec D20; plan refinement 13): "Invite someone" on
// `/community` (PageHeader actions) and on the viewer's own `/u/[id]` (beside
// "Edit profile"). It owns the dialog's open state itself, so neither page
// has to lift it — both mount this with only the inviter's own display name.
export function InvitePeopleButton({ inviterName }: { inviterName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 md:pointer-fine:min-h-9"
        onClick={() => setOpen(true)}
      >
        {/* (plan copy) — the entry button, spec §6 / plan copy table */}
        Invite someone
      </Button>
      <InvitePeopleDialog open={open} onOpenChange={setOpen} inviterName={inviterName} />
    </>
  );
}
