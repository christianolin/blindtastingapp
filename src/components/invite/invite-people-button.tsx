"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvitePeopleDialog } from "./invite-people-dialog";

// The one entry point (spec D20; plan refinement 13): "Invite someone" on
// `/community` (PageHeader actions), the `/community` Friends empty state,
// and on the viewer's own `/u/[id]` (beside "Edit profile"). It owns the
// dialog's open state itself, so no page has to lift it — every mount passes
// only the inviter's own display name.
//
// `emphasis="primary"` (the community redesign, spec D1) is the header
// action's bordeaux styling, matching /cellar's "Add a bottle". The default
// `"outline"` is unchanged from before that redesign — `/u/[id]` keeps it.
export function InvitePeopleButton({
  inviterName,
  emphasis = "outline",
}: {
  inviterName: string;
  emphasis?: "outline" | "primary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={emphasis === "primary" ? "default" : "outline"}
        className={
          emphasis === "primary"
            ? "min-h-11 gap-1.5 px-4 md:pointer-fine:min-h-9"
            : "min-h-11 md:pointer-fine:min-h-9"
        }
        onClick={() => setOpen(true)}
      >
        {emphasis === "primary" ? <UserPlus className="size-4" /> : null}
        {/* (plan copy) — the entry button, spec §6 / plan copy table */}
        Invite someone
      </Button>
      <InvitePeopleDialog open={open} onOpenChange={setOpen} inviterName={inviterName} />
    </>
  );
}
