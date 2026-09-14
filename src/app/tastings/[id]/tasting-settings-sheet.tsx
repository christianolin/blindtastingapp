"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Flag, Play, Trash2, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Eyebrow } from "@/components/overview/eyebrow";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NewTastingForm } from "@/app/tastings/new/new-tasting-form";
import { InviteField } from "@/app/tastings/new/invite-field";
import { JoinLinkRow } from "@/app/tastings/new/join-link-row";
import { localToIso, type SetupValues } from "@/app/tastings/new/setup-copy";
import { updateTastingSetup, type TastingSetupFields } from "@/app/tastings/new/actions";
import {
  deleteTasting,
  finishTasting,
  inviteToTasting,
  reopenTasting,
  setSequentialGuessing,
} from "./actions";
import type { TastingSettings } from "./settings-actions";
import {
  deleteTastingLabel,
  MANAGE_INVITATIONS,
  ONLY_ONCE_EXISTS,
  SETTINGS_FOOTER_DRAFT,
  SETTINGS_FOOTER_STARTED,
  SETTINGS_TITLE,
  settingsEyebrow,
} from "@/lib/lobby-copy";
import { endTastingConfirm } from "@/lib/tasting-lifecycle-copy";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";

const TITLE_CLASS =
  "truncate font-heading text-[20px] font-semibold leading-[1.05] text-foreground md:text-[27px]";

// The Save button's payload: the same field set the create sheet's step 1
// writes, plus description — this sheet, unlike the create one, always has
// somewhere to put it (spec §3.3 items 13–14, S4d).
function fieldsOf(v: SetupValues): TastingSetupFields {
  return {
    name: v.name,
    timingMode: v.timingMode,
    wineSource: v.wineSource,
    revealMode: v.revealMode,
    flow: v.flow,
    leaderboardReveal: v.leaderboardReveal,
    asyncRevealPolicy: v.asyncRevealPolicy,
    scheduledAt: localToIso(v.scheduledLocal),
    description: v.description,
    imageUrl: v.imageUrl,
    place: v.place,
  };
}

/**
 * The Tasting settings sheet (spec §3.3 items 13–14, S4d; ledger B2, B4):
 * everything that used to live behind the header cogwheel's popover (deleted
 * in BT-L2), plus the create sheet's step-1 fields reused in
 * place so editing a live tasting isn't a different form from creating one.
 * A full-screen Dialog below `sm`, centred above it — the same wrapper
 * `new-tasting-sheet.tsx` uses.
 */
export function TastingSettingsSheet({
  tastingId,
  open,
  onOpenChange,
  settings,
}: {
  tastingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TastingSettings;
}) {
  const router = useRouter();
  const formId = useId();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setUserId(data.user?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [setup, setSetup] = useState<SetupValues>(settings.setup);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [innerView, setInnerView] = useState<"main" | "invitations">("main");

  const notStarted = settings.status === "DRAFT";

  async function handleSave() {
    setError(null);
    if (!setup.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (photoUploading) {
      setError("Wait for the cover photo to finish uploading.");
      return;
    }
    setSaving(true);
    try {
      const r = await updateTastingSetup(tastingId, fieldsOf(setup));
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Optimistic, like every other guess/toggle control under AutoRefresh
  // (CLAUDE.md controlled-input rule) — setSequentialGuessing has no
  // useActionState result to reconcile against, so the click flips the
  // local value straight away and the server call rides along in a
  // transition.
  const [sequentialGuessing, setSequentialGuessingLocal] = useState(
    settings.sequentialGuessing,
  );
  const [pacingPending, startPacingTransition] = useTransition();
  function togglePacing() {
    const next = !sequentialGuessing;
    setSequentialGuessingLocal(next);
    const fd = new FormData();
    fd.set("tasting_id", tastingId);
    fd.set("enabled", String(next));
    startPacingTransition(async () => {
      await setSequentialGuessing(fd);
      router.refresh();
    });
  }
  // Guided pacing applies to any non-OPEN LIVE tasting (B6, setup-copy.ts's
  // flowApplies) — blind and semi-blind alike.
  const showPacingToggle =
    !notStarted && setup.timingMode === "LIVE" && setup.revealMode !== "OPEN";

  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteToTasting,
    null,
  );
  const [finishState, finishAction, finishPending] = useActionState(
    finishTasting,
    null,
  );
  const [reopenState, reopenAction, reopenPending] = useActionState(
    reopenTasting,
    null,
  );

  // The inline two-tap that replaces window.confirm for Delete (XCUT-37;
  // shared with the console's Reveal everything, BT-H2).
  const [deleteArmedAt, setDeleteArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (deleteArmedAt === null) return;
    const id = setTimeout(() => setDeleteArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [deleteArmedAt]);
  const deleteTapState: TwoTapState = deleteArmedAt === null ? "idle" : "armed";

  function close() {
    onOpenChange(false);
    setInnerView("main");
  }

  const header = (
    <header className="flex shrink-0 items-center gap-3 border-b border-border p-[8px_16px_12px] md:gap-[14px] md:p-[20px_24px_16px]">
      {innerView === "invitations" ? (
        <button
          type="button"
          aria-label="Back"
          onClick={() => setInnerView("main")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:size-9"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:hidden"
        >
          <X className="size-5" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <Eyebrow size="md" className="truncate">
          {innerView === "invitations" ? SETTINGS_TITLE : settingsEyebrow(settings.status)}
        </Eyebrow>
        <DialogTitle className={TITLE_CLASS}>
          {innerView === "invitations" ? MANAGE_INVITATIONS : SETTINGS_TITLE}
        </DialogTitle>
      </div>
      {innerView === "main" ? (
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="ml-1 hidden size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:flex"
        >
          <X className="size-5" />
        </button>
      ) : null}
    </header>
  );

  const mainBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[14px_16px] md:p-[18px_24px]">
      <p className="mb-4 text-[12.5px] leading-[1.5] text-muted-foreground">
        {notStarted ? SETTINGS_FOOTER_DRAFT : SETTINGS_FOOTER_STARTED}
      </p>
      {userId === null ? (
        <div className="flex justify-center p-8">
          <WineGlassLoader />
        </div>
      ) : (
        <NewTastingForm
          value={setup}
          onChange={(update) => {
            setSetup(update);
            setSaved(false);
          }}
          onSubmit={() => void handleSave()}
          formId={formId}
          userId={userId}
          onPhotoUploadingChange={setPhotoUploading}
          wineCount={settings.wineCount}
          mode="settings"
          status={settings.status}
        />
      )}

      {showPacingToggle ? (
        <div className="mt-4 flex flex-col gap-2 rounded-[10px] border border-border bg-background p-[12px_13px] md:rounded-[11px] md:p-[13px_15px]">
          <span className="text-[12.5px] font-semibold md:text-[13px]">
            One wine at a time — {sequentialGuessing ? "Guided" : "Free"}
          </span>
          <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
            {sequentialGuessing
              ? "Guided — everyone tastes the same wine together; revealing it opens the next."
              : "Free — participants can guess any wine in any order."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={pacingPending}
            onClick={togglePacing}
          >
            {sequentialGuessing ? "Switch to Free" : "Switch to Guided"}
          </Button>
        </div>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-3 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
          {ONLY_ONCE_EXISTS}
        </p>
        <div className="flex flex-col gap-2">
          {settings.status !== "CLOSED" ? (
            <button
              type="button"
              onClick={() => setInnerView("invitations")}
              className="flex min-h-11 items-center gap-2 rounded-[9px] border border-border bg-card px-[13px] py-[10px] text-left text-[13px] font-semibold text-foreground transition-colors hover:border-gold md:pointer-fine:min-h-0"
            >
              <UserPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {MANAGE_INVITATIONS}
            </button>
          ) : null}

          {settings.status === "IN_PROGRESS" ? (
            <form
              action={finishAction}
              onSubmit={(e) => {
                if (!window.confirm(endTastingConfirm(settings.unrevealedGlasses))) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="tasting_id" value={tastingId} />
              <Button
                type="submit"
                variant="outline"
                disabled={finishPending}
                className="w-full justify-start gap-1.5"
              >
                {finishPending ? (
                  <>
                    <WineGlassLoader /> Ending…
                  </>
                ) : (
                  <>
                    <Flag className="size-4" /> End tasting
                  </>
                )}
              </Button>
              {finishState && "error" in finishState ? (
                <p className="mt-1 text-sm text-destructive">{finishState.error}</p>
              ) : null}
            </form>
          ) : null}

          {settings.status === "CLOSED" ? (
            <form action={reopenAction}>
              <input type="hidden" name="tasting_id" value={tastingId} />
              <Button
                type="submit"
                variant="outline"
                disabled={reopenPending}
                className="w-full justify-start gap-1.5"
              >
                {reopenPending ? (
                  <>
                    <WineGlassLoader /> Reopening…
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> Reopen tasting
                  </>
                )}
              </Button>
              {reopenState && "error" in reopenState ? (
                <p className="mt-1 text-sm text-destructive">{reopenState.error}</p>
              ) : null}
            </form>
          ) : null}

          <form
            action={deleteTasting}
            onSubmit={(e) => {
              if (deleteTapState !== "armed") {
                e.preventDefault();
                setDeleteArmedAt(Date.now());
                return;
              }
              setDeleteArmedAt(null);
            }}
          >
            <input type="hidden" name="tasting_id" value={tastingId} />
            <Button type="submit" variant="destructive" className="w-full justify-start gap-1.5">
              <Trash2 className="size-4" /> {deleteTastingLabel(deleteTapState)}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );

  const invitationsBody = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[14px_16px] md:p-[18px_24px]">
      <form action={inviteAction} className="flex flex-col gap-3">
        <input type="hidden" name="tasting_id" value={tastingId} />
        <InviteField friends={settings.friends} />
        <Button type="submit" variant="outline" disabled={invitePending} className="w-fit">
          {invitePending ? "Sending…" : "Send invites"}
        </Button>
        {inviteState && "error" in inviteState ? (
          <p className="text-sm text-destructive">{inviteState.error}</p>
        ) : null}
        {inviteState && "success" in inviteState ? (
          <p className="text-sm text-chart-3">{inviteState.success}</p>
        ) : null}
      </form>
      <div className="mt-4">
        <JoinLinkRow tastingId={tastingId} active={innerView === "invitations"} />
      </div>
    </div>
  );

  const errorLine = error ? (
    <p role="alert" className="shrink-0 px-4 pt-3 text-[12.5px] text-miss md:px-6">
      {error}
    </p>
  ) : null;

  const footer =
    innerView === "main" ? (
      <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] md:flex-row md:items-center md:justify-end md:gap-3 md:p-[16px_24px]">
        {saved && !saving ? (
          <span role="status" className="text-[12px] text-chart-3">
            Saved.
          </span>
        ) : null}
        <button
          type="submit"
          form={formId}
          disabled={saving || photoUploading || userId === null}
          className="flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-primary p-[15px] text-[16px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-primary-hover disabled:opacity-60 md:pointer-fine:min-h-0 md:rounded-[9px] md:p-[12px_20px] md:text-[14.5px]"
        >
          {saving ? (
            <>
              <WineGlassLoader /> Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
      </footer>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:max-w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border-strong",
          "bg-card text-foreground",
        )}
      >
        {header}
        {innerView === "main" ? mainBody : invitationsBody}
        {innerView === "main" ? errorLine : null}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
