"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RevealMode } from "@/lib/supabase/database.types";
import { NewTastingForm } from "@/app/tastings/new/new-tasting-form";
import { FlightStep } from "@/app/tastings/new/flight-step";
import { InviteStep, type Friend } from "@/app/tastings/new/invite-step";
import {
  createTasting,
  getNameSuggestionContext,
  listFlight,
  updateTastingSetup,
  type FlightSnapshot,
  type TastingSetupFields,
} from "@/app/tastings/new/actions";
import {
  buildSetupFormData,
  defaultSetup,
  localToIso,
  type SetupValues,
} from "@/app/tastings/new/setup-copy";
import { inviteToTasting, startTasting } from "@/app/tastings/[id]/actions";

type Step = 1 | 2 | 3;

const TITLE_CLASS =
  "truncate font-heading text-[20px] font-semibold leading-[1.05] text-foreground md:text-[27px]";

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

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
    // Always sent: null clears a photo removed after the row was created.
    imageUrl: v.imageUrl,
  };
}

/**
 * The create-tasting sheet (spec Part 2; handoff 6a–6d): one sheet, three
 * steps — Setup → Wines → Invite & start — with a persistent footer so the
 * host can stop after step 1. The tasting row is created at the end of step
 * 1 (createTasting returns the id, no redirect); steps 2 and 3 work on that
 * draft in place. Rendered by TasteLauncherProvider as a base-ui Dialog —
 * full-screen on phones, 640px (step 1) / 760px (steps 2–3) centred on
 * desktop — or, with `inline`, as the body of the /tastings/new page.
 */
export function NewTastingSheet({
  userId,
  defaultReveal,
  inline = false,
  onClose,
  initialFriends,
  regionSuggestion,
}: {
  userId: string;
  /** The launcher's mode is a default, not a lock — the tiles switch it. */
  defaultReveal: RevealMode;
  inline?: boolean;
  /** Absent in inline mode: closing navigates to /taste instead. */
  onClose?: () => void;
  /** SSR-fetched friends (the page); otherwise fetched on open. */
  initialFriends?: Friend[];
  /** The "{Region} #{n}" name chip: SSR-computed (the page, `null` meaning
      "none — don't fetch"); undefined (the launcher) fetches it on open. */
  regionSuggestion?: { region: string; n: number } | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const formId = useId();

  const [step, setStep] = useState<Step>(1);
  const [tastingId, setTastingId] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupValues>(() =>
    defaultSetup(defaultReveal === "SEMI_BLIND" ? "SEMI_BLIND" : "BLIND"),
  );
  const [saving, setSaving] = useState(false);
  // Step 1's cover photo is still uploading: saving now would create the row
  // without it, and the URL would land after step 1 had already been left.
  const [photoUploading, setPhotoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[] | "loading">(initialFriends ?? "loading");
  const [snapshot, setSnapshot] = useState<FlightSnapshot | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [showEmailField, setShowEmailField] = useState(false);
  const emailFormRef = useRef<HTMLFormElement | null>(null);
  const [suggestion, setSuggestion] = useState<{ region: string; n: number } | null>(
    regionSuggestion ?? null,
  );

  // The name chip's region, when the caller didn't compute it (the launcher
  // path). The chips render at once with the fallback and upgrade when this
  // resolves — same lazy pattern as the friends below.
  useEffect(() => {
    if (regionSuggestion !== undefined) return;
    let cancelled = false;
    getNameSuggestionContext()
      .then((r) => {
        if (!cancelled && r) setSuggestion(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [regionSuggestion]);

  // Friends for the step-3 chips — the same two reads the old modal did.
  useEffect(() => {
    if (initialFriends) return;
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
  }, [supabase, userId, initialFriends]);

  const refreshFlight = useCallback(
    (id: string) => {
      listFlight(id)
        .then((r) => {
          if ("error" in r) {
            setError(r.error);
            return;
          }
          // A transient load failure clears itself on the next good read.
          setError(null);
          setSnapshot(r);
        })
        .catch(() => setError("Couldn't load the flight."));
      router.refresh();
    },
    [router],
  );

  const close = useCallback(() => {
    if (onClose) onClose();
    else router.push("/taste");
  }, [onClose, router]);

  // Every step change drops the previous step's error — an invite failure
  // must not follow the host back to Setup.
  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  // Step 1 → the row: create on the first save, update on any later one
  // (going back to Setup and switching the mode keeps the wines).
  async function persistSetup(): Promise<string | null> {
    setError(null);
    if (!setup.name.trim()) {
      setError("Name is required.");
      return null;
    }
    if (photoUploading) {
      setError("Wait for the cover photo to finish uploading.");
      return null;
    }
    setSaving(true);
    try {
      if (!tastingId) {
        const r = await createTasting(null, buildSetupFormData(setup));
        if (!r) {
          setError("Could not create the tasting.");
          return null;
        }
        if ("error" in r) {
          setError(r.error);
          return null;
        }
        setTastingId(r.id);
        return r.id;
      }
      const r = await updateTastingSetup(tastingId, fieldsOf(setup));
      if ("error" in r) {
        setError(r.error);
        return null;
      }
      return tastingId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the tasting.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAsDraftFromSetup() {
    const id = await persistSetup();
    if (!id) return;
    close();
    router.push(`/tastings/${id}`);
  }

  async function goToWines() {
    const id = await persistSetup();
    if (!id) return;
    go(2);
    refreshFlight(id);
  }

  // Step 3: friend chips + the typed InviteField addresses, deduped.
  function collectEmails(): string[] {
    const typed = emailFormRef.current
      ? String(new FormData(emailFormRef.current).get("emails") ?? "")
      : "";
    return [
      ...new Set(
        [...selectedEmails, ...typed.split(/[\n,]/)]
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  async function sendInvites(id: string): Promise<boolean> {
    const emails = collectEmails();
    if (emails.length === 0) return true;
    const fd = new FormData();
    fd.set("tasting_id", id);
    fd.set("emails", emails.join("\n"));
    const r = await inviteToTasting(null, fd);
    if (r && "error" in r) {
      // "Nobody new" just means every chip was already a participant.
      if (!r.error.startsWith("Nobody new")) {
        setError(r.error);
        return false;
      }
      return true;
    }
    if (r && "success" in r) setFeedback(r.success);
    return true;
  }

  async function saveAsDraftFromInvite() {
    if (!tastingId) return;
    setError(null);
    setSaving(true);
    try {
      if (!(await sendInvites(tastingId))) return;
      close();
      router.push(`/tastings/${tastingId}`);
    } finally {
      setSaving(false);
    }
  }

  async function start() {
    if (!tastingId) return;
    setError(null);
    setSaving(true);
    try {
      if (!(await sendInvites(tastingId))) return;
      const fd = new FormData();
      fd.set("tasting_id", tastingId);
      const r = await startTasting(null, fd);
      if (r && "error" in r) {
        setError(r.error);
        return;
      }
      close();
      // The host of a live blind tasting lands on the host console.
      const toConsole = setup.timingMode === "LIVE" && setup.revealMode !== "SEMI_BLIND";
      router.push(toConsole ? `/tastings/${tastingId}/host` : `/tastings/${tastingId}`);
    } finally {
      setSaving(false);
    }
  }

  const wineCount = snapshot?.wines.length ?? 0;
  const modeWord = setup.revealMode === "SEMI_BLIND" ? "semi-blind" : "blind";
  const eyebrow =
    step === 1
      ? "Step 1 of 3 · setup"
      : step === 2
        ? `Step 2 of 3 · ${setup.name.trim() || "New tasting"} · ${modeWord}`
        : "Step 3 of 3";
  const title = step === 1 ? "New tasting" : step === 2 ? "The flight" : "Who is tasting?";

  const header = (
    <header className="flex shrink-0 items-center gap-3 border-b border-border p-[8px_16px_12px] md:gap-[14px] md:p-[20px_24px_16px]">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:hidden"
      >
        <X className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <Eyebrow size="md" className="truncate">
          {eyebrow}
        </Eyebrow>
        {inline ? (
          <h1 className={TITLE_CLASS}>{title}</h1>
        ) : (
          <DialogTitle className={TITLE_CLASS}>{title}</DialogTitle>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[5px] md:gap-[7px]" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1 w-[18px] rounded-full md:w-[26px]",
              n <= step ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="ml-1 hidden size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:flex"
      >
        <X className="size-5" />
      </button>
    </header>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-[14px_16px] md:p-[18px_24px]">
      {step === 1 ? (
        <NewTastingForm
          value={setup}
          onChange={setSetup}
          onSubmit={() => void goToWines()}
          formId={formId}
          userId={userId}
          onPhotoUploadingChange={setPhotoUploading}
          autoFocusName={isDesktop}
          regionSuggestion={suggestion}
        />
      ) : step === 2 && tastingId ? (
        <FlightStep
          tastingId={tastingId}
          tastingName={setup.name.trim()}
          revealMode={setup.revealMode}
          wineSource={setup.wineSource}
          snapshot={snapshot}
          onChanged={() => refreshFlight(tastingId)}
          isDesktop={isDesktop}
        />
      ) : tastingId ? (
        <InviteStep
          tastingId={tastingId}
          friends={friends}
          selectedEmails={selectedEmails}
          onToggleFriend={(email) => {
            const e = email.toLowerCase();
            setSelectedEmails((list) =>
              list.includes(e) ? list.filter((x) => x !== e) : [...list, e],
            );
          }}
          showEmailField={showEmailField}
          onShowEmailField={() => setShowEmailField(true)}
          emailFormRef={emailFormRef}
          setup={setup}
          scheduledIso={localToIso(setup.scheduledLocal)}
          wineCount={wineCount}
          feedback={feedback}
        />
      ) : null}
    </div>
  );

  // One error line for every step, pinned above the footer so it is visible
  // whatever the body's scroll position (the buttons that raise it live in
  // the footer).
  const errorLine = error ? (
    <p role="alert" className="shrink-0 px-4 pt-3 text-[12.5px] text-miss md:px-6">
      {error}
    </p>
  ) : null;

  const pendingLabel = (label: string) =>
    saving ? (
      <>
        <WineGlassLoader /> {label}
      </>
    ) : (
      label
    );

  const footer = (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-3 md:p-[16px_24px]">
      {step === 1 ? (
        <>
          <span className="text-[12.5px] text-muted-foreground max-md:hidden">
            You can add wines and invite people after saving.
          </span>
          <span className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center md:gap-[9px]">
            {/* Held while the cover photo uploads. A disabled default button
                also blocks Enter-to-submit, so the name field can't jump
                ahead of the upload either. */}
            <TextButton
              className="max-md:order-2"
              disabled={saving || photoUploading}
              onClick={() => void saveAsDraftFromSetup()}
            >
              Save as draft
            </TextButton>
            <PrimaryButton
              type="submit"
              form={formId}
              disabled={saving || photoUploading}
              className="max-md:order-1"
            >
              {pendingLabel("Add the wines →")}
            </PrimaryButton>
          </span>
        </>
      ) : step === 2 ? (
        <>
          <span className="max-w-[42ch] text-[12.5px] leading-[1.5] text-muted-foreground">
            <strong className="font-semibold">One glass is enough to start.</strong> Wines can be
            added while the tasting is running — the flight grows as you open bottles.
          </span>
          <span className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center md:gap-[9px]">
            <LinkButton className="max-md:order-2" onClick={() => go(1)}>
              ← Setup
            </LinkButton>
            <PrimaryButton className="max-md:order-1" onClick={() => go(3)}>
              Invite people →
            </PrimaryButton>
          </span>
        </>
      ) : (
        <>
          <LinkButton className="max-md:order-3" onClick={() => go(2)}>
            ← Wines
          </LinkButton>
          <span className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center md:gap-[9px]">
            <TextButton className="max-md:order-2" disabled={saving} onClick={() => void saveAsDraftFromInvite()}>
              Save as draft
            </TextButton>
            <span className="flex flex-col items-center gap-1 max-md:order-1">
              <GoldButton disabled={saving || wineCount < 1} onClick={() => void start()}>
                {pendingLabel("Start the tasting")}
              </GoldButton>
              {wineCount < 1 ? (
                <span className="text-[11.5px] text-muted-foreground">Add one glass to start</span>
              ) : null}
            </span>
          </span>
        </>
      )}
    </footer>
  );

  if (inline) {
    return (
      <section
        aria-label="New tasting"
        className="flex w-full flex-col overflow-hidden rounded-2xl border border-border-strong bg-card shadow-[0_18px_40px_-24px_rgba(42,33,30,.4)]"
      >
        {header}
        {body}
        {errorLine}
        {footer}
      </section>
    );
  }

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape while the add-wine sheet (a sibling dialog opened from step
        // 2) is on top belongs to that sheet, not this one.
        if (
          details.reason === "escape-key" &&
          document.querySelectorAll('[data-slot="dialog-content"]').length > 1
        ) {
          return;
        }
        close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border-strong",
          step === 1 ? "sm:max-w-[640px]" : "sm:max-w-[760px]",
          "bg-card text-foreground",
        )}
      >
        {header}
        {body}
        {errorLine}
        {footer}
      </DialogContent>
    </Dialog>
  );
}

function PrimaryButton({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-[11px] bg-primary p-[15px] text-[16px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-[#4A1523] disabled:opacity-60 md:min-h-0 md:rounded-[9px] md:p-[12px_20px] md:text-[14.5px]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GoldButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-gold p-[15px] text-[16px] font-bold text-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-gold-deep disabled:opacity-60 md:min-h-0 md:w-auto md:rounded-[9px] md:p-[12px_22px] md:text-[14.5px]",
        className,
      )}
    >
      {children}
    </button>
  );
}

// "Save as draft": an outlined button on desktop, a centred text link on phones (6d).
function TextButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 text-[13px] font-semibold text-muted-foreground disabled:opacity-60 md:min-h-0 md:rounded-[9px] md:border md:border-border md:bg-card md:p-[11px_16px] md:text-[13.5px] md:text-foreground md:hover:border-gold md:hover:bg-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

// "← Setup" / "← Wines": a bordeaux text link.
function LinkButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 items-center justify-center p-[11px_8px] text-[13.5px] font-semibold text-primary hover:text-gold-deep md:min-h-0",
        className,
      )}
    >
      {children}
    </button>
  );
}
