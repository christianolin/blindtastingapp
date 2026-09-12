"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { EditWineModal } from "./edit-wine-modal";
import { refreshWineProfile } from "./refresh-profile-action";

type Usage = {
  holders: number;
  bottles: number;
  lot_count: number;
  note_count: number;
  appearance_count: number;
  consumption_count: number;
};

// Curator/creator controls on the wine hub: edit (popup, reusing the wine form)
// and a guarded delete — enabled only when the wine is truly unreferenced. The
// SECURITY DEFINER delete_catalog_wine enforces the same rule server-side.
export function WineAdminControls({
  wineId,
  userId,
  usage,
}: {
  wineId: string;
  userId: string;
  usage: Usage;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deletable =
    usage.lot_count === 0 &&
    usage.note_count === 0 &&
    usage.appearance_count === 0 &&
    usage.consumption_count === 0;
  const blockReason =
    usage.lot_count > 0
      ? `In ${usage.holders} ${usage.holders === 1 ? "cellar" : "cellars"} — can't delete`
      : usage.note_count > 0
        ? "Has tasting notes — can't delete"
        : usage.appearance_count > 0
          ? "Used in blind tastings — can't delete"
          : usage.consumption_count > 0
            ? "Has drink history — can't delete"
            : null;

  async function onRefreshProfile() {
    setRefreshing(true);
    setError(null);
    const res = await refreshWineProfile(wineId);
    setRefreshing(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("delete_catalog_wine", {
      p_id: wineId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setPending(false);
      return;
    }
    router.push("/catalog");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="size-4" /> Edit
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={refreshing}
        title="Re-read the label photo and refresh the wine profile (identity is left alone)"
        onClick={onRefreshProfile}
      >
        <Sparkles className="size-4" />
        {refreshing ? "Reading…" : "Re-read profile"}
      </Button>
      <Button
        variant={deletable ? "destructive" : "outline"}
        size="sm"
        disabled={!deletable}
        title={blockReason ?? undefined}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" /> Delete
      </Button>

      {/* The delete dialog shows its own copy of `error`, but a re-read failure
          happens with no dialog open — without this it would be silent. */}
      {error && !confirming ? (
        <p className="w-full text-sm text-destructive">{error}</p>
      ) : null}

      {editing ? (
        <EditWineModal
          wineId={wineId}
          userId={userId}
          onClose={() => setEditing(false)}
        />
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Delete this wine?</DialogTitle>
          <DialogDescription>
            This removes the wine from the catalog for everyone. It can&apos;t be
            undone.
          </DialogDescription>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete wine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
