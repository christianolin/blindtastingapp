"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/app/friends/actions";
import { TWO_TAP_WINDOW_MS } from "@/lib/console-copy";
import { friendButtonLabel } from "@/lib/community/community-math";
import type { Relationship } from "@/lib/friends/relationship";
import type { FriendResult } from "@/lib/friends/types";
import { cn } from "@/lib/utils";

type Control = "single" | "accept" | "decline";

// The friend control for one other person (friend-requests spec §3.3), driven
// by one Relationship value:
// - none: "Add friend" (primary) sends a request;
// - requested: "Requested" (outline, Clock); a first tap arms "Tap again to
//   cancel" for TWO_TAP_WINDOW_MS, the second cancels;
// - incoming: "Accept" (primary) and "Decline" (quiet), both always shown;
// - friends: "Friends" (outline, Check); the same two-tap removes, for both.
// `variant="row"` is the Community table and cards (and the bell);
// `variant="header"` is /u/[id]'s header size. Every action revalidates the
// page, which brings the next relationship back as a prop; `onDone` runs
// after a success for a caller with its own list (the bell drops the row).
// A refusal is shown verbatim under the control.
export function FriendButton({
  personId,
  relationship,
  variant = "row",
  className,
  onDone,
}: {
  personId: string;
  relationship: Relationship;
  variant?: "row" | "header";
  className?: string;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Control | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);

  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  // The timeout above already clears armedAt once the window elapses, so
  // "armed" needs no impure clock read during render.
  const armed = armedAt !== null;

  function run(control: Control, action: () => Promise<FriendResult>) {
    setError(null);
    setBusy(control);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
      else onDone?.();
    });
  }

  const wrapperClass =
    variant === "row" ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1 md:items-end";
  const buttonClass =
    variant === "row" ? "min-h-11 gap-1.5 md:pointer-fine:min-h-8" : "min-h-11 gap-1.5 md:pointer-fine:min-h-9";
  const size = variant === "row" ? "sm" : "default";
  const errorLine = error ? <p className="text-sm text-destructive">{error}</p> : null;

  if (relationship === "incoming") {
    const accepting = pending && busy === "accept";
    const declining = pending && busy === "decline";
    return (
      <div className={wrapperClass}>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size={size}
            variant="default"
            disabled={pending}
            className={cn(buttonClass, className)}
            onClick={() => run("accept", () => acceptFriendRequest(personId))}
          >
            {accepting ? <WineGlassLoader /> : null}
            {friendButtonLabel({ relationship, control: "accept", pending: accepting, armed: false })}
          </Button>
          <Button
            type="button"
            size={size}
            variant="ghost"
            disabled={pending}
            className={cn(buttonClass, className)}
            onClick={() => run("decline", () => declineFriendRequest(personId))}
          >
            {declining ? <WineGlassLoader /> : null}
            {friendButtonLabel({ relationship, control: "decline", pending: declining, armed: false })}
          </Button>
        </div>
        {errorLine}
      </div>
    );
  }

  function handleClick() {
    if (relationship === "none") {
      run("single", () => sendFriendRequest(personId));
      return;
    }
    // Requested and Friends: the first tap only arms; the second, inside
    // TWO_TAP_WINDOW_MS, cancels or removes.
    if (!armed) {
      setArmedAt(Date.now());
      return;
    }
    setArmedAt(null);
    run("single", () =>
      relationship === "requested" ? cancelFriendRequest(personId) : removeFriend(personId),
    );
  }

  const icon = pending ? (
    <WineGlassLoader />
  ) : armed ? null : relationship === "friends" ? (
    <Check />
  ) : relationship === "requested" ? (
    <Clock />
  ) : null;

  return (
    <div className={wrapperClass}>
      <Button
        type="button"
        size={size}
        variant={relationship === "none" ? "default" : armed ? "destructive" : "outline"}
        disabled={pending}
        className={cn(buttonClass, className)}
        onClick={handleClick}
      >
        {icon}
        {friendButtonLabel({ relationship, pending, armed })}
      </Button>
      {errorLine}
    </div>
  );
}
