"use client";

import { useSyncExternalStore, useTransition } from "react";
import { actionButtonClass } from "@/components/overview/action-button";
import { CANT_MAKE_IT, I_AM_IN } from "@/lib/invitation-copy";
import { invitationDayPhrase } from "@/lib/relative-day";
import { respondToInvite } from "./actions";

const noopSubscribe = () => () => {};

/**
 * The invitation page's "in 2 days" next to its date card (S5): local-
 * calendar arithmetic against `new Date()`, so it can only ever run on the
 * client — grouped into this file rather than a new one because
 * invitation-view.tsx (its only caller) is an async Server Component and
 * this task's OWNS names no other client-boundary file to put it in. Renders
 * nothing until hydrated, the same neutral-first-paint shape as LocalDateTime
 * itself.
 */
export function InvitationDayPhrase({ iso }: { iso: string }) {
  const phrase = useSyncExternalStore(
    noopSubscribe,
    () => invitationDayPhrase(new Date(iso), new Date()),
    () => null,
  );
  return phrase ? <>{phrase}</> : null;
}

/**
 * The invitation's footer (S5, S5b): "I am in" primary, "Can't make it"
 * beneath it — no calendar action, there is nothing to add until you have
 * said yes (that lives on the guest lobby, S6). Both call the existing
 * `respondToInvite` server action directly; a decline needs no confirmation
 * (B3) and an accept simply re-renders the page into the guest lobby once
 * `revalidatePath` lands, through `routeTastingView`'s own status check —
 * this component does not navigate itself.
 */
export function InvitationActionsBar({ tastingId }: { tastingId: string }) {
  const [pending, startTransition] = useTransition();

  function respond(response: "accept" | "decline") {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      fd.set("response", response);
      await respondToInvite(fd);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => respond("accept")}
        className={actionButtonClass("primary", "disabled:opacity-60")}
      >
        {I_AM_IN}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => respond("decline")}
        className="flex min-h-11 w-full items-center justify-center rounded-[10px] px-4 py-[13px] text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 max-md:rounded-[9px] max-md:py-[11px]"
      >
        {CANT_MAKE_IT}
      </button>
    </div>
  );
}
