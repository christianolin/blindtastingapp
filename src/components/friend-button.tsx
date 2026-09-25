"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { removeFriend, sendFriendRequest } from "@/app/friends/actions";
import { TWO_TAP_WINDOW_MS } from "@/lib/console-copy";
import { friendButtonLabel } from "@/lib/community/community-math";
import { cn } from "@/lib/utils";

// The two-tap "Friends" state (spec §2.6 / profile-view-redesign R1): a quiet
// "Friends" state armed by a first tap into a two-tap remove, matching the
// app's other inline two-tap confirms (console-copy.ts's
// twoTapState/TWO_TAP_WINDOW_MS). `variant="row"` is the community list's
// sizing; `variant="header"` (profile-view-redesign R1) is the same button
// at the other header buttons' size, used on `/u/[id]`. Both share the same
// addFriend/removeFriend actions, so a refusal, "Adding…"/"Removing…" and the
// revalidatePath refresh behave identically either way. The original
// single-tap default variant is retired — every mount now uses the two-tap
// state.
export function FriendButton({
  friendId,
  isFriend,
  variant = "row",
  className,
}: {
  friendId: string;
  isFriend: boolean;
  variant?: "row" | "header";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  // A refused write used to be invisible: the button simply snapped back to
  // its old label once revalidatePath returned the unchanged row.
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

  function doAdd() {
    setError(null);
    startTransition(async () => {
      const result = await sendFriendRequest(friendId);
      if ("error" in result) setError(result.error);
    });
  }
  function doRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeFriend(friendId);
      if ("error" in result) setError(result.error);
    });
  }

  const label = friendButtonLabel({ relationship: isFriend ? "friends" : "none", pending, armed });
  function handleClick() {
    if (!isFriend) {
      doAdd();
      return;
    }
    // R1: the first tap only arms the button; the second tap, inside
    // TWO_TAP_WINDOW_MS, removes.
    if (!armed) {
      setArmedAt(Date.now());
      return;
    }
    setArmedAt(null);
    doRemove();
  }

  const wrapperClass =
    variant === "row" ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1 md:items-end";
  const buttonClass =
    variant === "row" ? "min-h-11 gap-1.5 md:pointer-fine:min-h-8" : "min-h-11 gap-1.5 md:pointer-fine:min-h-9";

  return (
    <div className={wrapperClass}>
      <Button
        type="button"
        size={variant === "row" ? "sm" : "default"}
        variant={!isFriend ? "default" : armed ? "destructive" : "outline"}
        disabled={pending}
        className={cn(buttonClass, className)}
        onClick={handleClick}
      >
        {pending ? (
          <WineGlassLoader />
        ) : isFriend && !armed ? (
          <Check />
        ) : null}
        {label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
