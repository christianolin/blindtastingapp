"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { addFriend, removeFriend } from "@/app/friends/actions";

export function FriendButton({
  friendId,
  isFriend,
}: {
  friendId: string;
  isFriend: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // A refused write used to be invisible: the button simply snapped back to
  // its old label once revalidatePath returned the unchanged row.
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={isFriend ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = isFriend
              ? await removeFriend(friendId)
              : await addFriend(friendId);
            if ("error" in result) setError(result.error);
          })
        }
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
