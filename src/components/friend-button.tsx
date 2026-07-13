"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addFriend, removeFriend } from "@/app/friends/actions";

export function FriendButton({
  friendId,
  isFriend,
}: {
  friendId: string;
  isFriend: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={isFriend ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (isFriend) {
            await removeFriend(friendId);
          } else {
            await addFriend(friendId);
          }
        })
      }
    >
      {isFriend ? "Remove friend" : "Add friend"}
    </Button>
  );
}
