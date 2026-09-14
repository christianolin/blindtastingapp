"use client";

import { Check, Plus } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LocalDateTime } from "@/components/local-date-time";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { InviteField } from "./invite-field";
import { JoinLinkRow } from "./join-link-row";
import { readySummary, type SetupValues } from "./setup-copy";

export type Friend = { id: string; display_name: string; email: string };

const DATE_SLOT = "__date__";

/**
 * Step 3 · invite & start (handoff 6c). Friends render as chips from `md`
 * and as full rows below it (32px avatar, name, a context line from
 * `getFriendContextLines`, a 22px check disc — spec §2.3 item 9); either one
 * toggles the same `selectedEmails`. The "+ email or name" chip (laptop) or
 * the always-visible "Name, or an email address" field (phone) is
 * InviteField, whose typed addresses the sheet holds
 * (`onTypedEmailsChange`), so they count in "N invited" (create-7) and come
 * back when this step remounts (`defaultEmails`). Start sends both lists
 * through inviteToTasting; "Invite later" sends nothing. The share link is
 * the shared JoinLinkRow; the gold "Ready to go" block restates the setup in
 * words.
 */
export function InviteStep({
  tastingId,
  friends,
  friendContextLines,
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
  isDesktop,
}: {
  tastingId: string;
  friends: Friend[] | "loading";
  /** friend id → "{n} tastings · {avg} avg" / "new to Blindr" (CREATE-48),
      fetched once via `getFriendContextLines` — empty until it resolves, so
      a row's context line is blank for a beat rather than wrong. */
  friendContextLines: Record<string, string>;
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
  /** Drives the summary's phone ending ("{n} invited" with no "add more as
      you pour" tail, S3b) — the sheet's own `useMediaQuery` result. */
  isDesktop: boolean;
}) {
  const parts = readySummary({
    setup,
    wineCount,
    invitedCount,
    dateText: scheduledIso ? DATE_SLOT : null,
    place: setup.place,
    phone: !isDesktop,
  });

  const noFriends = friends !== "loading" && friends.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Your people */}
      <div className="flex flex-col gap-[9px]">
        <span className="text-[12.5px] font-semibold">Your people</span>

        {/* Chips — laptop and up */}
        <div className="hidden flex-wrap gap-2 md:flex">
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
                    "flex min-h-11 items-center gap-2 rounded-full p-[7px_13px_7px_8px] text-[13px] transition-colors md:pointer-fine:min-h-0",
                    on
                      ? "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover"
                      : "border border-border bg-card text-foreground hover:border-gold",
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
              className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-gold px-[14px] py-[7px] text-[13px] font-semibold text-primary transition-colors hover:bg-card md:pointer-fine:min-h-0"
            >
              <Plus className="size-3.5" aria-hidden /> email or name
            </button>
          ) : null}
        </div>

        {/* Full rows — below laptop (spec §2.3 item 9) */}
        <div className="flex flex-col gap-2 md:hidden">
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
                    "flex min-h-11 items-center gap-3 rounded-[11px] border p-[9px_12px] text-left transition-colors",
                    on ? "border-gold bg-background" : "border-border bg-card",
                  )}
                >
                  <Avatar name={f.display_name || f.email} size="md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-semibold">
                      {f.display_name || f.email}
                    </span>
                    <span className="truncate text-[11.5px] text-muted-foreground">
                      {friendContextLines[f.id] ?? ""}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[22px] shrink-0 items-center justify-center rounded-full border",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card",
                    )}
                  >
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {noFriends ? (
          <p className="text-[12.5px] text-muted-foreground">
            You haven&apos;t added any friends yet —{" "}
            <a
              href="/community"
              className="font-medium text-primary transition-colors hover:text-primary/80"
            >
              browse People
            </a>{" "}
            to add some, then they&apos;ll show up here.
          </p>
        ) : null}

        <span className="text-[11.5px] text-muted-foreground">
          Tap a face to invite. People who are not on Blindr get an email invitation
          to this tasting.
        </span>
        {/* The typed addresses live in the sheet: InviteField reports every
            add and remove, and starts from the sheet's list when it
            remounts. Always visible on phones; on laptops only once the
            "+ email or name" chip reveals it (spec §2.3 item 10). */}
        <div
          className={cn(
            "flex rounded-[11px] border border-input bg-card p-[13px_15px]",
            !showEmailField && "md:hidden",
          )}
        >
          <InviteField
            defaultEmails={typedEmails}
            onChange={onTypedEmailsChange}
            chosenEmails={[...selectedEmails, ...typedEmails]}
          />
        </div>
        {feedback ? (
          <p role="status" className="text-[12.5px] text-chart-3">
            {feedback}
          </p>
        ) : null}
      </div>

      {/* Or share a link — B4/Q6: it works until the tasting ends, whatever
          the mode. */}
      <JoinLinkRow tastingId={tastingId} />

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
