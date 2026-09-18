"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Copy, Mail, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { LocalDateTime } from "@/components/local-date-time";
import { COPY_LINK, footerLine, OPEN_IN_MAIL_APP, SEND_BY_EMAIL, SHARE } from "@/lib/invites/copy";
import { mailtoHref, platformInviteEmail, type PlatformInviteMessage } from "@/lib/email/platform-invite";
import {
  createPlatformInvite,
  sendPlatformInvite,
  type CreatedInvite,
  type SendResult,
} from "@/app/invite/actions";

// The inviter's screen (spec §6; D2, D8, D14, D15, D20; plan refinements 8,
// 13). Step 1 makes the link (`createPlatformInvite`); step 2 shows it and
// offers Copy / Share / Send by email / a mailto fallback, plus the D8
// defaults as a read-only footer line. The dialog never auto-closes itself —
// only Escape or the close button do — and resets to step 1 on every reopen.

const DIALOG_TITLE = "Invite a friend to Blindr"; // (plan copy)
const NAME_LABEL = "Their name (optional)"; // (plan copy)
const EMAIL_LABEL = "Their email (optional)"; // (plan copy)
const MAKE_LINK = "Make a link"; // (plan copy)
const MAKING_LINK = "Making a link…"; // (plan copy)
const SENDING = "Sending…"; // (plan copy)
const COPIED = "Copied"; // reused (join-link-row.tsx)

function sentToLine(email: string): string {
  return `Sent to ${email}`; // (plan copy)
}

// Neither §6 nor the plan's copy table names the label for the address field
// that "Send by email" reveals when step 1 carried none — visually hidden
// (the placeholder alone carries it) so nothing here reads as new prose.
// Flagged for the orchestrator per Working Rule 1.
const SEND_EMAIL_LABEL = "Email address";

// footerLine's own text sits between two fixed halves — split on a token that
// can never appear in the real string so the expiry renders as a live
// `LocalDateTime` (viewer's own zone) instead of a plain string, while the
// wording itself still comes from the one pure function copy.test.ts pins.
// A Unicode Private Use Area codepoint, not a control character — a literal
// NUL byte here makes the file read as binary to `file`/`git diff`.
const FOOTER_TOKEN = "";

// `navigator.share` only exists client-side: a plain `"share" in navigator`
// check inside render would disagree between the server render and the first
// client render (a hydration mismatch), and setting it from a plain
// `useEffect` trips `react-hooks/set-state-in-effect` (a synchronous setState
// in the effect body). `useSyncExternalStore` with a server snapshot of
// `false` gets the same "only after mount" behaviour (refinement 8) with
// neither problem — the same idiom `LocalDateTime` uses for its own
// client-only read.
const noopSubscribe = () => () => {};
function canShareSnapshot(): boolean {
  return typeof navigator !== "undefined" && "share" in navigator;
}

type Step = { kind: "create" } | { kind: "created"; invite: CreatedInvite };

export function InvitePeopleDialog({
  open,
  onOpenChange,
  inviterName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviterName: string;
}) {
  const nameId = useId();
  const emailId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const [step, setStep] = useState<Step>({ kind: "create" });

  // Refinement: the dialog resets to step 1 on reopen (spec §6), not on close
  // — a close mid-transition should not wipe what is on screen behind it.
  // Adjusted during render (React's "adjusting state when a prop changes"
  // pattern, `drink-sheet.tsx`'s own `resetFor` idiom) rather than as a
  // synchronous setState inside an effect body, which
  // react-hooks/set-state-in-effect flags as a cascading-render risk.
  const [resetFor, setResetFor] = useState(open);
  if (open !== resetFor) {
    setResetFor(open);
    if (open) {
      setName("");
      setEmail("");
      setCreateError(null);
      setStep({ kind: "create" });
    }
  }

  function submitCreate() {
    setCreateError(null);
    startCreating(async () => {
      const result = await createPlatformInvite({ inviteeName: name, inviteeEmail: email });
      if ("error" in result) {
        setCreateError(result.error);
        return;
      }
      setStep({ kind: "created", invite: result });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{DIALOG_TITLE}</DialogTitle>
        {step.kind === "create" ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>{NAME_LABEL}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="min-h-11 md:pointer-fine:min-h-8"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={emailId}>{EMAIL_LABEL}</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="min-h-11 md:pointer-fine:min-h-8"
              />
            </div>
            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
            <Button type="submit" disabled={creating} className="min-h-11 md:pointer-fine:min-h-9">
              {creating ? (
                <>
                  <WineGlassLoader /> {MAKING_LINK}
                </>
              ) : (
                MAKE_LINK
              )}
            </Button>
          </form>
        ) : (
          <InviteCreatedPanel
            invite={step.invite}
            inviterName={inviterName}
            inviteeName={name.trim() || null}
            initialEmail={email.trim()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Step 2 (spec §6): the link plus Copy / Share / Send by email / a mailto
// fallback, and the D8 defaults as a read-only footer line. A separate
// component so every value here can be typed as definitely present — no
// `invite`/`message` null-checks re-litigated on every line.
function InviteCreatedPanel({
  invite,
  inviterName,
  inviteeName,
  initialEmail,
}: {
  invite: CreatedInvite;
  inviterName: string;
  inviteeName: string | null;
  /** The address typed in step 1, if any — carried over so "Send by email"
      sends at once instead of asking again (spec §6, refinement). */
  initialEmail: string;
}) {
  const sendEmailId = useId();
  const [copied, setCopied] = useState(false);
  // Refinement 8: "Share" appears only once mount has actually seen
  // `navigator.share`, so the server render and the first client render
  // agree (no hydration mismatch) and a browser with no Web Share API never
  // shows it — see `canShareSnapshot` above.
  const canShare = useSyncExternalStore(noopSubscribe, canShareSnapshot, () => false);
  const [emailFieldOpen, setEmailFieldOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(initialEmail);
  const [sending, startSending] = useTransition();
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const message: PlatformInviteMessage = useMemo(
    () => platformInviteEmail({ inviterName, inviteeName, url: invite.url }),
    [inviterName, inviteeName, invite.url],
  );

  const [footerBefore, footerAfter] = footerLine(FOOTER_TOKEN, invite.maxUses).split(FOOTER_TOKEN);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      // No clipboard access (insecure context, denied permission) — the link
      // is still on screen, mono and selectable, to copy by hand.
    }
  }

  function share() {
    navigator.share({ url: invite.url, text: message.subject }).catch((err: unknown) => {
      // A person closing the native share sheet is not a failure to show.
      if (err instanceof DOMException && err.name === "AbortError") return;
    });
  }

  function submitSend() {
    const address = sendEmail.trim();
    if (!address) {
      // Refinement: without an email from step 1, the first tap only reveals
      // the field — it sends on the next submit once something is typed.
      setEmailFieldOpen(true);
      return;
    }
    setSendResult(null);
    startSending(async () => {
      setSendResult(await sendPlatformInvite(invite.code, address));
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submitSend();
      }}
    >
      <p className="rounded-lg border border-input bg-muted/40 p-3 font-mono text-sm break-all select-all">
        {invite.url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:pointer-fine:min-h-9"
          onClick={() => void copyLink()}
        >
          <Copy /> {copied ? COPIED : COPY_LINK}
        </Button>
        {canShare ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:pointer-fine:min-h-9"
            onClick={share}
          >
            <Share2 /> {SHARE}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          disabled={sending}
          className="min-h-11 md:pointer-fine:min-h-9"
        >
          {sending ? (
            <>
              <WineGlassLoader /> {SENDING}
            </>
          ) : (
            <>
              <Mail /> {SEND_BY_EMAIL}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          className="min-h-11 md:pointer-fine:min-h-9"
          render={<a href={mailtoHref(sendEmail.trim() || null, message)} />}
        >
          {OPEN_IN_MAIL_APP}
        </Button>
      </div>
      {emailFieldOpen ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={sendEmailId} className="sr-only">
            {SEND_EMAIL_LABEL}
          </Label>
          <Input
            id={sendEmailId}
            type="email"
            placeholder="name@example.com"
            value={sendEmail}
            onChange={(e) => setSendEmail(e.target.value)}
            autoComplete="email"
            className="min-h-11 md:pointer-fine:min-h-8"
          />
        </div>
      ) : null}
      {sendResult ? (
        <p className={sendResult.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {sendResult.ok ? sentToLine(sendEmail.trim()) : sendResult.message}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {footerBefore}
        <LocalDateTime iso={invite.expiresAt} format="card" />
        {footerAfter}
      </p>
    </form>
  );
}
