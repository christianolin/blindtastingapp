import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LocalDateTime } from "@/components/local-date-time";
import { AutoRefresh } from "@/components/auto-refresh";
import { TastingScanRegistrar } from "@/components/tasting-scan-registrar";
import { semiBlindAddRefusal } from "@/lib/flight-glass-rules";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTastingRow, getWineRows } from "@/lib/tasting-request-cache";
import { getTastingPlace } from "@/app/tastings/new/place";
import { flowWord } from "@/lib/tasting-eyebrow";
import {
  ADD_TO_CALENDAR,
  LEARN_LINKS,
  WHILE_YOU_WAIT,
  WHILE_YOU_WAIT_LAPTOP,
  YOU_ARE_IN,
  atTheTableLabel,
  guestEyebrow,
  tonightLines,
  waitingLines,
} from "@/lib/invitation-copy";
import { WinesCard, getEditableWineIds } from "./wines-card";
import { LeaveTastingButton } from "./leave-tasting-button";
import { SemiBlindList } from "./semi-blind-list";
import { SheetFromQuery } from "./sheet-from-query";
import type { FlightDestination } from "./tasting-add-wine-button";

// The JOINED guest's DRAFT layout — S6 on phones, S6b on laptops (BT-G2;
// ledger B3; spec §4.3 item 5). Replaces the BT-D2 stub that reused
// TastingPageHeader + ParticipantsCard: S6 draws its own header (eyebrow,
// name, "You are in" pill, a back arrow on phones) and its own "At the
// table" roster of plain chips, neither of which is TastingPageHeader's
// richer host-facing header or ParticipantsCard's per-person stats rows —
// both stay for the host's own lobby-view.tsx. `AutoRefresh` mounts so
// Start moves the guest straight to glass 1 without a manual reload, and so
// a new arrival's chip shows up without one either.
//
// `routeTastingView` only ever renders this for a JOINED, non-host viewer of
// a DRAFT tasting, so this component does not re-derive that itself.

type ParticipantRow = {
  id: string;
  user_id: string;
  status: "JOINED" | "INVITED" | "DECLINED";
  joined_at: string | null;
  created_at: string;
};

/** Earliest joined first (nulls — never joined — sort last), then earliest
 *  created first. The same ordering BT-P2's `joinedNamesLine` caller uses. */
function byArrival(a: ParticipantRow, b: ParticipantRow): number {
  const at = a.joined_at ? Date.parse(a.joined_at) : Number.POSITIVE_INFINITY;
  const bt = b.joined_at ? Date.parse(b.joined_at) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

type TableChip = {
  key: string;
  label: string;
  kind: "you" | "host" | "joined" | "invited";
};

const CHIP_BASE = "rounded-full px-3 py-1 text-xs font-medium leading-normal";

/** The "At the table" card: `label` from `atTheTableLabel`, then the chip
 *  row in spec order (You, host, joined, invited — DECLINED already
 *  filtered out by the caller). Rendered twice by GuestLobby (a `lg:hidden`
 *  copy inline on phones, a `hidden lg:block` copy in the laptop rail) so
 *  each can sit at its own place in the document instead of fighting a CSS
 *  `order`. */
function AtTheTableCard({
  label,
  chips,
  className,
}: {
  label: string;
  chips: readonly TableChip[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-[12px] border border-border bg-card p-4", className)}>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.key}
            className={cn(
              CHIP_BASE,
              chip.kind === "you" && "bg-primary font-semibold text-primary-foreground",
              chip.kind === "host" && "border border-gold-deep/50 bg-gold/10 text-foreground",
              chip.kind === "joined" && "bg-muted text-foreground",
              chip.kind === "invited" &&
                "border border-dashed border-border text-muted-foreground",
            )}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export async function GuestLobby({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const [user, tasting, wines] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getWineRows(tastingId),
  ]);
  if (!user || !tasting) return null;

  // The roster, with the columns TastingPageHeader's cached getParticipantRows
  // doesn't carry (joined_at, created_at) — needed to order the chips and to
  // tell a never-joined INVITED row from one that left and came back. RLS
  // already lets any participant read the full roster (ParticipantsCard
  // relies on the same thing).
  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("id, user_id, status, joined_at, created_at")
    .eq("tasting_id", tastingId);
  const rows = participantRows ?? [];

  const userIds = rows.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name || p.email || "Someone"]),
  );

  const place = await getTastingPlace(supabase, tastingId);

  const hostName = nameById.get(tasting.host_id) ?? "The host";
  const joinedRows = rows.filter((p) => p.status === "JOINED");
  const invitedRows = rows.filter((p) => p.status === "INVITED").sort(byArrival);
  const otherJoined = joinedRows
    .filter((p) => p.user_id !== tasting.host_id && p.user_id !== user.id)
    .sort(byArrival);

  const chips: TableChip[] = [
    { key: "you", label: "You", kind: "you" },
    { key: "host", label: `${hostName} · host`, kind: "host" },
    ...otherJoined.map((p): TableChip => ({
      key: p.id,
      label: nameById.get(p.user_id) ?? "Someone",
      kind: "joined",
    })),
    ...invitedRows.map((p): TableChip => ({
      key: p.id,
      label: `${nameById.get(p.user_id) ?? "Someone"}…`,
      kind: "invited",
    })),
  ];

  const guided =
    flowWord({
      revealMode: tasting.reveal_mode,
      timingMode: tasting.timing_mode,
      sequentialGuessing: tasting.sequential_guessing,
    }) === "Guided";
  const eyebrowInput = { host: hostName, revealMode: tasting.reveal_mode, guided };
  const waiting = waitingLines(tasting.timing_mode, hostName);
  const tonight = tonightLines({
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    sequentialGuessing: tasting.sequential_guessing,
    leaderboardReveal: tasting.leaderboard_reveal,
    asyncRevealPolicy: tasting.async_reveal_policy,
    glassCount: wines.length,
    host: hostName,
  });
  const isByo = tasting.wine_source === "PARTICIPANT_CONTRIBUTED";

  // Same formula as lobby-view.tsx (A-23): who may add. This view only ever
  // renders for a JOINED non-host viewer of a DRAFT tasting (routeTastingView's
  // guarantee, restated at the top of this file), so isHost is always false
  // and myStatus is always "JOINED" — kept as real lookups rather than
  // hardcoded so this stays correct if that guarantee ever changes.
  const isHost = tasting.host_id === user.id;
  const myStatus = rows.find((p) => p.user_id === user.id)?.status ?? null;
  const canAddWine =
    tasting.status !== "CLOSED" &&
    (tasting.wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED") &&
    !semiBlindAddRefusal({
      revealMode: tasting.reveal_mode,
      tastingStatus: tasting.status,
    });
  const flightDestination: FlightDestination = {
    kind: "flight",
    tastingId,
    tastingName: tasting.name,
    revealMode: tasting.reveal_mode,
    wineSource: tasting.wine_source,
    position: wines.length + 1,
  };
  const editableWineIds = await getEditableWineIds(tastingId);

  const atTableRow = (
    <AtTheTableCard
      label={atTheTableLabel(joinedRows.length, invitedRows.length, { phone: true })}
      chips={chips}
      className="lg:hidden"
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <AutoRefresh />

      {/* Registered whenever the guest may add: adding before Start is
          normal, so the header camera keeps targeting this flight (A-23,
          mirrors lobby-view.tsx). */}
      {canAddWine ? (
        <TastingScanRegistrar
          tastingId={tastingId}
          tastingName={tasting.name}
          revealMode={tasting.reveal_mode}
          wineSource={tasting.wine_source}
          position={wines.length + 1}
          timingMode={tasting.timing_mode}
          status={tasting.status}
        />
      ) : null}
      {/* Where the legacy add and edit routes land: ?addWine=byhand and
          ?editWine=<wineId> open the sheet once (A-23, mirrors
          lobby-view.tsx). */}
      <Suspense fallback={null}>
        <SheetFromQuery
          destination={flightDestination}
          canAddWine={canAddWine}
          editableWineIds={editableWineIds}
        />
      </Suspense>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/overview"
            aria-label="Back to Overview"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <Eyebrow size="md">
            <span className="lg:hidden">{guestEyebrow(eyebrowInput, { phone: true })}</span>
            <span className="hidden lg:inline">
              {guestEyebrow(eyebrowInput, { phone: false })}
            </span>
          </Eyebrow>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-semibold leading-tight sm:text-3xl">
            {tasting.name}
          </h1>
          <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {YOU_ARE_IN}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
            <p className="font-heading text-lg font-semibold text-foreground sm:text-xl">
              {waiting[0]}
            </p>
            {waiting[1] ? (
              <p className="mt-1 text-sm text-muted-foreground">{waiting[1]}</p>
            ) : null}
          </div>

          {/* Bring-your-own: the shared Wines card sits above "At the table"
              (spec §4.3 item 5). A host-provides guest never sees it — the
              flight is the host's answer key (GUEST-35). */}
          {isByo ? <WinesCard tastingId={tastingId} /> : null}

          {atTableRow}

          {tonight.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-[12px] border border-border bg-card p-4 sm:p-5 lg:gap-1 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
              {tonight.map((line, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "text-sm font-medium text-foreground"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {/* SB1's list (BT-S1), below the Tonight card. Never the host here
              (this view only ever renders for a JOINED non-host, per this
              file's own routing guarantee — routeTastingView), so
              viewerIsHost is always false; started is always false too
              (guest-lobby only renders while status === "DRAFT"), kept
              computed rather than hardcoded so the component's own "before
              Start" branch stays correct if that ever changes. */}
          {tasting.reveal_mode === "SEMI_BLIND" ? (
            <SemiBlindList
              tastingId={tastingId}
              hostName={hostName}
              started={tasting.status !== "DRAFT"}
              viewerIsHost={false}
            />
          ) : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              <span className="lg:hidden">{WHILE_YOU_WAIT}</span>
              <span className="hidden lg:inline">{WHILE_YOU_WAIT_LAPTOP}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {tasting.scheduled_at ? (
                <a
                  href={`/tastings/${tastingId}/calendar.ics`}
                  className="flex min-h-11 flex-col justify-center rounded-[11px] border border-border bg-card p-3 text-sm transition-colors hover:border-gold-deep/60"
                >
                  <span className="font-medium text-foreground">{ADD_TO_CALENDAR}</span>
                  <span className="text-xs text-muted-foreground">
                    <LocalDateTime iso={tasting.scheduled_at} format="card" />
                    {place ? ` · ${place}` : ""}
                  </span>
                </a>
              ) : null}
              <div className="flex flex-col gap-2 lg:flex-row">
                {LEARN_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex min-h-11 flex-1 flex-col justify-center rounded-[11px] border border-border bg-card p-3 text-sm transition-colors hover:border-gold-deep/60"
                  >
                    <span className="font-medium text-foreground">{link.title}</span>
                    <span className="text-xs text-muted-foreground lg:hidden">{link.sub}</span>
                    <span className="hidden text-xs text-muted-foreground lg:inline">
                      {link.subLaptop}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <LeaveTastingButton tastingId={tastingId} />
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-8 lg:w-[250px] lg:self-start">
          <AtTheTableCard
            label={atTheTableLabel(joinedRows.length, invitedRows.length, { phone: false })}
            chips={chips}
          />
        </aside>
      </div>
    </div>
  );
}
