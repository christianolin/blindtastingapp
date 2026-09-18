"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import {
  ABOUT_LINES,
  EYEBROW,
  JOIN_BLINDR,
  OWN_LINK_LINES,
  addFriendLabel,
  invitedTitle,
  stateCopy,
} from "@/lib/invites/copy";
import { acceptInvite, beginJoin } from "@/app/invite/actions";
import type { InviteView } from "./invite-route";

// The landing page's Card content, one branch per `InviteView` (spec §5,
// D19). `join`/`add-friend`/`own-link` share the same eyebrow+avatar+h1
// header; `expired`/`exhausted`/`unknown` render the `/j/[code]` MessageCard
// shape instead. No invitee name or email, no use counts — `page.tsx` never
// fetches them (D9) and nothing here would have anywhere to put them.

// (plan copy)
const NOT_NOW = "Not now";
// Reused verbatim from /j/[code]'s MessageCard.
const BACK_TO_OVERVIEW = "Back to the overview";
// Reused verbatim from signup-form.tsx.
const ALREADY_HAVE_ACCOUNT = "Already have an account?";
const SIGN_IN = "Sign in";
// Reused verbatim from friend-button.tsx.
const ADDING = "Adding…";

export function InviteLanding({
  code,
  view,
  inviterName,
  inviterAvatarUrl,
}: {
  code: string;
  view: InviteView;
  inviterName: string | null;
  inviterAvatarUrl: string | null;
}) {
  if (view === "unknown" || view === "expired" || view === "exhausted") {
    const { title, lines } = stateCopy(view, inviterName);
    return <MessageCard title={title} lines={lines} />;
  }

  // join / add-friend / own-link: state is "ok", so the preview found a row
  // and `inviterName` is set — page.tsx only reaches these views then.
  const name = inviterName ?? "";

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-5">
        <Eyebrow>{EYEBROW}</Eyebrow>
        <div className="flex items-center gap-3">
          <Avatar src={inviterAvatarUrl} name={name} size="lg" />
          <h1 className="font-heading text-2xl leading-snug font-medium text-foreground">
            {invitedTitle(name)}
          </h1>
        </div>

        {view === "own-link" ? (
          <>
            {OWN_LINK_LINES.map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
            <Link
              href="/overview"
              className="flex min-h-11 items-center justify-center rounded-[11px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted md:pointer-fine:min-h-0"
            >
              {BACK_TO_OVERVIEW}
            </Link>
          </>
        ) : (
          <>
            {ABOUT_LINES.map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
            {view === "join" ? (
              <JoinActions code={code} />
            ) : (
              <AddFriendAction code={code} inviterName={name} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// D11(a) path 2 / D12: "Join Blindr" and "Sign in" both post to `beginJoin`
// so the intent cookie is set on either path (refinement 11) — a plain
// `/login?next=` link would skip it.
function JoinActions({ code }: { code: string }) {
  const joinAction = beginJoin.bind(null, code, "signup");
  const signInAction = beginJoin.bind(null, code, "login");

  return (
    <div className="flex flex-col gap-3">
      <form action={joinAction}>
        <Button
          type="submit"
          className="min-h-11 w-full md:pointer-fine:min-h-0"
        >
          {JOIN_BLINDR}
        </Button>
      </form>
      <form action={signInAction}>
        <p className="text-center text-sm text-muted-foreground">
          {ALREADY_HAVE_ACCOUNT}{" "}
          <button
            type="submit"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            {SIGN_IN}
          </button>
        </p>
      </form>
    </div>
  );
}

// D11(b): the signed-in visitor's own tap. `acceptInvite` redirects from
// inside the action on success (the `/j/[code]` `JoinActions` pattern) and
// returns `{ error }` on a refusal for this to show inline.
function AddFriendAction({
  code,
  inviterName,
}: {
  code: string;
  inviterName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        className="min-h-11 w-full md:pointer-fine:min-h-0"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await acceptInvite(code);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? (
          <>
            <WineGlassLoader /> {ADDING}
          </>
        ) : (
          addFriendLabel(inviterName)
        )}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Link
        href="/overview"
        className="flex min-h-11 items-center justify-center rounded-[11px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted md:pointer-fine:min-h-0"
      >
        {NOT_NOW}
      </Link>
    </div>
  );
}

// The `/j/[code]` MessageCard shape, reused for expired / exhausted /
// unknown: title "Couldn't open that invite", the state's own line(s), and
// "Back to the overview" (`/overview`; signed out that redirects to
// `/login`, existing app behaviour — this link never builds a `next`).
function MessageCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lines.map((line) => (
          <p key={line} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}
        <Link
          href="/overview"
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          {BACK_TO_OVERVIEW}
        </Link>
      </CardContent>
    </Card>
  );
}
