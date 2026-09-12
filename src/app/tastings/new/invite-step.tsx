"use client";

import { useEffect, useState, type RefObject } from "react";
import { Check, Plus } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LocalDateTime } from "@/components/local-date-time";
import { cn } from "@/lib/utils";
import { InviteField } from "./invite-field";
import { getJoinLink } from "./actions";
import { readySummary, type SetupValues } from "./setup-copy";

export type Friend = { id: string; display_name: string; email: string };

const DATE_SLOT = "__date__";

/**
 * Step 3 · invite & start (handoff 6c). Friend chips toggle an email list
 * the sheet batches through inviteToTasting on Start / Save as draft; the
 * "+ email or name" chip reveals the existing InviteField (its hidden
 * `emails` input is read from `emailFormRef` at that moment); the share link
 * comes from getJoinLink (ensure_join_code) with a clipboard Copy; the gold
 * "Ready to go" block restates the setup in words.
 */
export function InviteStep({
  tastingId,
  friends,
  selectedEmails,
  onToggleFriend,
  showEmailField,
  onShowEmailField,
  emailFormRef,
  setup,
  scheduledIso,
  wineCount,
  feedback,
}: {
  tastingId: string;
  friends: Friend[] | "loading";
  selectedEmails: string[];
  onToggleFriend: (email: string) => void;
  showEmailField: boolean;
  onShowEmailField: () => void;
  emailFormRef: RefObject<HTMLFormElement | null>;
  setup: SetupValues;
  scheduledIso: string | null;
  wineCount: number;
  feedback: string | null;
}) {
  const [link, setLink] = useState<{ url: string; code: string } | "loading" | { error: string }>(
    "loading",
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJoinLink(tastingId)
      .then((r) => {
        if (!cancelled) setLink(r);
      })
      .catch(() => {
        if (!cancelled) setLink({ error: "Couldn't create a join link." });
      });
    return () => {
      cancelled = true;
    };
  }, [tastingId]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (typeof link !== "object" || !("url" in link)) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure context, permissions) —
      // the link is still on screen to copy by hand.
    }
  }

  const parts = readySummary({
    setup,
    wineCount,
    invitedCount: selectedEmails.length,
    dateText: scheduledIso ? DATE_SLOT : null,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Your people */}
      <div className="flex flex-col gap-[9px]">
        <span className="text-[12.5px] font-semibold">Your people</span>
        <div className="flex flex-wrap gap-2">
          {friends === "loading" ? (
            <span className="text-[12.5px] text-muted-foreground">Loading your friends…</span>
          ) : (
            friends.map((f) => {
              const on = selectedEmails.includes(f.email.toLowerCase());
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleFriend(f.email)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full p-[7px_13px_7px_8px] text-[13px] transition-colors md:min-h-0",
                    on
                      ? "bg-primary font-semibold text-primary-foreground hover:bg-[#4A1523]"
                      : "border border-border bg-white text-foreground hover:border-gold",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[22px] items-center justify-center rounded-full text-[11px]",
                      on ? "bg-primary-foreground/20" : "bg-muted",
                    )}
                  >
                    {(f.display_name || f.email).slice(0, 1).toUpperCase()}
                  </span>
                  {f.display_name || f.email}
                  {on ? <Check className="size-3.5" aria-hidden /> : null}
                </button>
              );
            })
          )}
          {!showEmailField ? (
            <button
              type="button"
              onClick={onShowEmailField}
              className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-gold px-[14px] py-[7px] text-[13px] font-semibold text-primary transition-colors hover:bg-white md:min-h-0"
            >
              <Plus className="size-3.5" aria-hidden /> email or name
            </button>
          ) : null}
        </div>
        <span className="text-[11.5px] text-muted-foreground">
          Tap a face to invite. People who are not on Blindr get an email invitation
          to this tasting.
        </span>
        {/* The existing invite input; its hidden `emails` field is read by the
            sheet when Start / Save as draft is pressed. Kept mounted once
            revealed so typed addresses survive a trip back to step 2. */}
        <form
          ref={emailFormRef}
          onSubmit={(e) => e.preventDefault()}
          hidden={!showEmailField}
          className="rounded-[11px] border border-border bg-white p-[13px_15px]"
        >
          <InviteField friends={friends === "loading" ? [] : friends} />
        </form>
        {feedback ? (
          <p role="status" className="text-[12.5px] text-chart-3">
            {feedback}
          </p>
        ) : null}
      </div>

      {/* Or share a link */}
      <div className="flex items-center gap-3 rounded-[11px] border border-border bg-white p-[13px_15px]">
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="text-[13.5px] font-semibold">Or share a link</span>
          <span className="truncate font-mono text-[12px] text-muted-foreground">
            {link === "loading"
              ? "Making a link…"
              : "error" in link
                ? link.error
                : link.url.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={link === "loading" || "error" in link}
          className="ml-auto min-h-11 shrink-0 rounded-[8px] border border-border bg-background px-[14px] py-[9px] text-[12.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white disabled:opacity-60 md:min-h-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Ready to go */}
      <div className="flex flex-col gap-[7px] rounded-[11px] border border-gold bg-background p-[14px_16px]">
        <Eyebrow size="sm">Ready to go</Eyebrow>
        <span className="text-[13.5px] leading-[1.55]">
          {parts.map((p, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              {p === DATE_SLOT && scheduledIso ? <LocalDateTime iso={scheduledIso} /> : p}
            </span>
          ))}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          Starting opens the table for everyone. Until then it sits in your drafts.
        </span>
      </div>
    </div>
  );
}
