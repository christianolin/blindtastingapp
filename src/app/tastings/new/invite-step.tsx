"use client";

import { Check, Plus } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LocalDateTime } from "@/components/local-date-time";
import { cn } from "@/lib/utils";
import { InviteField } from "./invite-field";
import { JoinLinkRow } from "./join-link-row";
import { readySummary, type SetupValues } from "./setup-copy";

export type Friend = { id: string; display_name: string; email: string };

const DATE_SLOT = "__date__";

/**
 * Step 3 · invite & start (handoff 6c). Friend chips toggle an email list; the
 * "+ email or name" chip reveals InviteField, whose typed addresses the sheet
 * holds (`onTypedEmailsChange`), so they count in "N invited" (create-7) and
 * come back when this step remounts (`defaultEmails`). Start sends both lists
 * through inviteToTasting; "Invite later" sends nothing. The share link is the
 * shared JoinLinkRow; the gold "Ready to go" block restates the setup in words.
 */
export function InviteStep({
  tastingId,
  friends,
  selectedEmails,
  onToggleFriend,
  showEmailField,
  onShowEmailField,
  typedEmails,
  onTypedEmailsChange,
  invitedCount,
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
  typedEmails: string[];
  onTypedEmailsChange: (emails: string[]) => void;
  /** Friend chips plus typed addresses, deduped, without the host's own. */
  invitedCount: number;
  setup: SetupValues;
  scheduledIso: string | null;
  wineCount: number;
  feedback: string | null;
}) {
  const parts = readySummary({
    setup,
    wineCount,
    invitedCount,
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
        {/* The typed addresses live in the sheet: InviteField reports every
            add and remove, and starts from the sheet's list when it remounts. */}
        <div
          hidden={!showEmailField}
          className="rounded-[11px] border border-border bg-white p-[13px_15px]"
        >
          <InviteField
            friends={friends === "loading" ? [] : friends}
            defaultEmails={typedEmails}
            onChange={onTypedEmailsChange}
          />
        </div>
        {feedback ? (
          <p role="status" className="text-[12.5px] text-chart-3">
            {feedback}
          </p>
        ) : null}
      </div>

      {/* Or share a link — the sheet never creates an OPEN tasting, so the
          link always stops at Start here. */}
      <JoinLinkRow tastingId={tastingId} worksUntilStart={setup.revealMode !== "OPEN"} />

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
          Starting opens the table for everyone.
        </span>
      </div>
    </div>
  );
}
