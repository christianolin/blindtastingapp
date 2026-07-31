"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { NewTastingForm } from "@/app/tastings/new/new-tasting-form";
import type { RevealMode } from "@/lib/supabase/database.types";

type Friend = { id: string; display_name: string; email: string };

// The blind / semi-blind tasting-creation flow as a popup. Reuses the real
// new-tasting form (which redirects to the new tasting on submit, closing the
// modal). Friends for the invite field are fetched on open.
export function NewTastingModal({
  reveal,
  userId,
  onClose,
}: {
  reveal: RevealMode;
  userId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [friends, setFriends] = useState<Friend[] | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: friendRows } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", userId);
      const ids = (friendRows ?? []).map((f) => f.friend_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids.length > 0 ? ids : [""])
        .order("display_name");
      if (!cancelled) setFriends((data ?? []) as Friend[]);
    })().catch(() => {
      if (!cancelled) setFriends([]);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>
          {reveal === "BLIND" ? "New blind tasting" : "New semi-blind tasting"}
        </DialogTitle>
        {friends === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <NewTastingForm friends={friends} userId={userId} reveal={reveal} />
        )}
      </DialogContent>
    </Dialog>
  );
}
