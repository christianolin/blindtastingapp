"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { addFriend, removeFriend } from "@/app/friends/actions";
import { TWO_TAP_WINDOW_MS } from "@/lib/console-copy";
import { friendButtonLabel } from "@/lib/community/community-math";
import { cn } from "@/lib/utils";

// `variant="profile"` (the default) is the original single-tap button used on
// `/u/[id]`. `variant="row"` is the community list's version (spec §2.6):
// a quiet "Friends" state armed by a first tap into a two-tap remove (R2),
// matching the app's other inline two-tap confirms (console-copy.ts's
// twoTapState/TWO_TAP_WINDOW_MS). Both variants share the same addFriend/
// removeFriend actions, so a refusal, "Adding…"/"Removing…" and the
// revalidatePath refresh behave identically either way.
export function FriendButton({
  friendId,
  isFriend,
  variant = "profile",
  className,
}: {
  friendId: string;
  isFriend: boolean;
  variant?: "profile" | "row";
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
      const result = await addFriend(friendId);
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

  if (variant === "row") {
    const label = friendButtonLabel({ isFriend, pending, armed });
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          variant={!isFriend ? "default" : armed ? "destructive" : "outline"}
          disabled={pending}
          className={cn("min-h-11 gap-1.5 md:pointer-fine:min-h-8", className)}
          onClick={() => {
            if (!isFriend) {
              doAdd();
              return;
            }
            // R2: the first tap only arms the button; the second tap, inside
            // TWO_TAP_WINDOW_MS, removes.
            if (!armed) {
              setArmedAt(Date.now());
              return;
            }
            setArmedAt(null);
            doRemove();
          }}
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

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={isFriend ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() => (isFriend ? doRemove() : doAdd())}
      >
        {pending ? (
          <>
            <WineGlassLoader /> {isFriend ? "Removing…" : "Adding…"}
          </>
        ) : isFriend ? (
          "Remove friend"
        ) : (
          "Add friend"
        )}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
