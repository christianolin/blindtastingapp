"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-date-time";
import {
  BRING_A_GLASS,
  CANT_MAKE_IT,
  HOW_IT_IS_SCORED,
  I_AM_IN,
  SCORING_ROWS,
  SIGN_IN_TO_SAY_YES,
  hostRecordLine,
  invitedYouLine,
  joinedNamesLine,
  modeChip,
  scoringSentence,
} from "@/lib/invitation-copy";
import { flowWord, glassesSoFarPhrase } from "@/lib/tasting-eyebrow";
import type { Database } from "@/lib/supabase/database.types";
import { joinByCode } from "./actions";

export type JoinPreviewRow = Database["public"]["Functions"]["get_join_preview"]["Returns"][number];

// `/j/[code]` (BT-G3, spec §4.3 item 4; ledger B3, B4; Q3): the reduced
// preview signed out, the full invitation signed in and not a member (a
// DECLINED guest coming back included — the RPC and `join_tasting_by_code`
// both treat that the same as any other non-member). A member never reaches
// this component; `page.tsx` redirects them to the tasting straight from
// `viewer_tasting_id`. Never where it's held, the description or the cover
// photo — `get_join_preview` doesn't return them (Q2).
export function JoinPreview({
  code,
  preview,
  signedIn,
  hostRecord,
}: {
  code: string;
  preview: JoinPreviewRow;
  signedIn: boolean;
  hostRecord: { hostedCount: number; averagePoints: number | null } | null;
}) {
  const hostName = preview.host_name ?? "Unknown";
  const joinedLine = signedIn ? joinedNamesLine(preview.joined_names ?? []) : null;
  const scoring = scoringSentence(preview.reveal_mode, hostName);

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar src={preview.host_avatar_url} name={preview.host_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {signedIn ? invitedYouLine(hostName) : hostName}
            </p>
            {signedIn && hostRecord ? (
              <p className="text-xs text-muted-foreground">
                {hostRecordLine(hostRecord.hostedCount, hostRecord.averagePoints)}
              </p>
            ) : null}
          </div>
        </div>

        <h1 className="font-heading text-2xl leading-snug font-medium text-foreground">
          {preview.name}
        </h1>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{modeChip(preview.reveal_mode)}</Badge>
          <Badge variant="outline">
            {flowWord({
              revealMode: preview.reveal_mode,
              timingMode: preview.timing_mode,
              sequentialGuessing: preview.sequential_guessing,
            })}
          </Badge>
          <Badge variant="outline">{glassesSoFarPhrase(preview.glass_count)}</Badge>
        </div>

        {preview.scheduled_at ? (
          <p className="text-sm text-muted-foreground">
            <LocalDateTime iso={preview.scheduled_at} format="card" />
          </p>
        ) : null}

        {joinedLine ? <p className="text-sm text-muted-foreground">{joinedLine}</p> : null}

        <div className="flex flex-col gap-2 rounded-[12px] bg-muted/40 p-4">
          <h2 className="text-sm font-medium text-foreground">{HOW_IT_IS_SCORED}</h2>
          {preview.reveal_mode === "BLIND" ? (
            <ul className="flex flex-col gap-1 text-sm text-foreground">
              {SCORING_ROWS.map((row) => (
                <li key={row.label} className="flex items-center justify-between">
                  <span>{row.label}</span>
                  <span className="text-muted-foreground">{row.points}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {scoring ? <p className="text-sm text-muted-foreground">{scoring}</p> : null}
        </div>

        {signedIn ? <p className="text-sm text-muted-foreground">{BRING_A_GLASS}</p> : null}

        {signedIn ? (
          <JoinActions code={code} />
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/j/${code}`)}`}
            className="flex h-11 items-center justify-center rounded-[11px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {SIGN_IN_TO_SAY_YES}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// "I am in" calls the server action directly (BT-G3's produces signature is
// a plain `joinByCode(code)`, not a `(state, formData)` action pair) and
// shows its `{ error }` inline; a success redirects from inside the action
// and this component never re-renders. "Can't make it" writes nothing (B3).
function JoinActions({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await joinByCode(code);
            if (result?.error) setError(result.error);
          })
        }
        className="flex h-11 items-center justify-center rounded-[11px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
      >
        {pending ? "Joining…" : I_AM_IN}
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Link
        href="/overview"
        className="flex h-11 items-center justify-center rounded-[11px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        {CANT_MAKE_IT}
      </Link>
    </div>
  );
}
