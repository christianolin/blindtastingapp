import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getParticipantRows,
  getTastingRow,
  getViewerParticipant,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { semiBlindAddRefusal, glassEditRefusal } from "@/lib/flight-glass-rules";
import { makeWineLabeler } from "@/lib/wine-label";
import { winesCaption } from "@/lib/lobby-copy";
import { parseStoredDraft } from "@/lib/wine-identity/from-sources";
import { flightRowNeeds, toIncompleteGlasses } from "@/lib/wine-identity/incomplete";
import { describeMissing } from "@/lib/wine-identity/describe";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";
import type { AddedVia } from "@/components/add-wine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToFlightButton, type FlightDestination } from "./tasting-add-wine-button";
import {
  WineFlightList,
  type FlightWine,
  type FlightWineLines,
  type WaitingContributor,
} from "./wine-flight-list";

// How the adder's identity line ends: where the glass came from (spec §C.5
// A1, wines.added_via). A legacy glass with no added_via leaves it out.
const ADDED_VIA_COPY: Record<AddedVia, string> = {
  SCAN: "scanned",
  CATALOG: "from the catalog",
  CELLAR: "from my cellar",
  BY_HAND: "by hand",
};

// An incomplete glass's title: "{producer name}, {wine name}", leaving out
// empty parts (spec §C.5 A1). Null when the draft has neither.
function draftTitle(draft: WineIdentityDraft | null): string | null {
  if (!draft) return null;
  return (
    [draft.producer?.name.trim(), draft.wineName?.trim()]
      .filter(Boolean)
      .join(", ") || null
  );
}

type WineRow = {
  id: string;
  position: number;
  is_revealed: boolean;
  reveal_step: number;
  contributor_participant_id: string | null;
  tasting_id: string;
};

type ViewerContext = {
  tasting: NonNullable<Awaited<ReturnType<typeof getTastingRow>>>;
  isHost: boolean;
  viewerParticipantId: string | null;
  wines: WineRow[];
};

async function loadViewerContext(tastingId: string): Promise<ViewerContext | null> {
  const [user, tasting, wines, viewer] = await Promise.all([
    getCurrentUser(),
    getTastingRow(tastingId),
    getWineRows(tastingId),
    getViewerParticipant(tastingId),
  ]);
  if (!user || !tasting) return null;
  return {
    tasting,
    isHost: tasting.host_id === user.id,
    viewerParticipantId: viewer?.id ?? null,
    wines,
  };
}

// is_wine_adder's rule: the host for a glass with no contributor, otherwise
// the contributor's own bottle.
function isAdder(
  ctx: Pick<ViewerContext, "isHost" | "viewerParticipantId">,
  w: { contributor_participant_id: string | null },
): boolean {
  return w.contributor_participant_id
    ? w.contributor_participant_id === ctx.viewerParticipantId
    : ctx.isHost;
}

/**
 * The glasses the viewer added, for which glassEditRefusal (BT-P1) returns
 * null — the server's edit guard, so Edit stays reachable after Start (spec
 * §3.3 item 4). Cheap: no answer-key data, just the wine rows and the
 * tasting's own status/reveal_mode. Used both by WinesCard's own Edit
 * buttons and by each view's SheetFromQuery, which needs the id list
 * without WinesCard's heavier per-glass answer-key reads.
 */
export async function getEditableWineIds(tastingId: string): Promise<string[]> {
  const ctx = await loadViewerContext(tastingId);
  if (!ctx) return [];
  return ctx.wines
    .filter(
      (w) =>
        glassEditRefusal({
          tastingStatus: ctx.tasting.status,
          revealMode: ctx.tasting.reveal_mode,
          isRevealed: w.is_revealed,
          revealStep: w.reveal_step,
          viewerIsAdder: isAdder(ctx, w),
          viewerIsHost: ctx.isHost,
          laterGlassSeen: false,
        }) === null,
    )
    .map((w) => w.id);
}

// The wine list (serving order + reveal state), moved without change from
// page.tsx (BT-D2). Shown to everyone while setting up: the host gets the
// reveal / reorder / add affordances, each adder their own glasses' lines
// and Edit, and guessers a read-only flight overview. Renders null once the
// tasting has started unless the viewer is the host or added a glass of
// their own — the running page's callers (lobby-view.tsx, guest-lobby.tsx,
// running-view.tsx, finished-view.tsx) can all just render it unconditionally.
export async function WinesCard({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element | null> {
  const supabase = await createClient();
  const ctx = await loadViewerContext(tastingId);
  if (!ctx) return null;
  const { tasting, isHost, viewerParticipantId, wines } = ctx;

  const hasStarted = tasting.status !== "DRAFT";
  const isByo = tasting.wine_source === "PARTICIPANT_CONTRIBUTED";
  const wineCount = wines.length;
  const myWineIds = wines.filter((w) => isAdder(ctx, w)).map((w) => w.id);
  const showWinesWhileRunning = isHost || myWineIds.length > 0;
  if (hasStarted && !showWinesWhileRunning) return null;

  const participantRows = await getParticipantRows(tastingId);
  const userIds = participantRows.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameByParticipantId = new Map(
    participantRows.map((p) => [
      p.id,
      profileById.get(p.user_id)?.display_name ??
        profileById.get(p.user_id)?.email ??
        "Someone",
    ]),
  );
  const joinedParticipants = participantRows.filter((p) => p.status === "JOINED");
  const wineLabel = makeWineLabeler(wines, tasting.wine_source, nameByParticipantId);
  const participantsWithoutWine = isByo
    ? joinedParticipants.filter(
        (p) => !wines.some((w) => w.contributor_participant_id === p.id),
      )
    : [];

  // Who may add (spec §C.5 A1; scan-7, sources-5, entry-2): nobody once the
  // tasting is CLOSED; otherwise the host of a host-provides tasting, or a
  // JOINED participant in bring-your-own; and never once a semi-blind flight
  // is fixed at Start (Q7).
  const myStatus =
    participantRows.find((p) => p.id === viewerParticipantId)?.status ?? null;
  const canAddWine =
    tasting.status !== "CLOSED" &&
    (tasting.wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED") &&
    !semiBlindAddRefusal({
      revealMode: tasting.reveal_mode,
      tastingStatus: tasting.status,
    });

  // The adder's two lines on their own glasses (spec §C.5 A1; D10, §C.9).
  // Only the viewer's own ids are read: wine_answers RLS hands a
  // bring-your-own host every answer, and they guess the others' bottles
  // too.
  const linesByWineId = new Map<string, FlightWineLines>();
  if (myWineIds.length > 0) {
    const [{ data: answers, error: answersError }, { data: sources }] =
      await Promise.all([
        supabase
          .from("wine_answers")
          .select(
            "wine_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id",
          )
          .in("wine_id", myWineIds),
        supabase.from("wines").select("id, added_via").in("id", myWineIds),
      ]);
    // A failed read must never show a finished glass as unfinished, so it
    // leaves every row without its lines.
    if (!answersError) {
      const list = answers ?? [];
      const answered = new Set(list.map((a) => a.wine_id));
      // A glass with no answer key is incomplete (D7).
      const unfinishedIds = myWineIds.filter((wineId) => !answered.has(wineId));
      const catalogIds = [
        ...new Set(
          list
            .map((a) => a.catalog_wine_id)
            .filter((wineId): wineId is string => Boolean(wineId)),
        ),
      ];
      const regionIds = [...new Set(list.map((a) => a.region_id))];
      const grapeIds = [...new Set(list.map((a) => a.primary_grape_id))];
      const [names, { data: catalog }, { data: regions }, { data: grapes }, { data: drafts }] =
        await Promise.all([
          lookupAppellationAndProducerNames({
            appellationIds: list.map((a) => a.appellation_id),
            producerIds: list.map((a) => a.producer_id),
          }),
          catalogIds.length > 0
            ? supabase.from("catalog_wines").select("id, wine_name").in("id", catalogIds)
            : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
          regionIds.length > 0
            ? supabase.from("regions").select("id, name").in("id", regionIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          grapeIds.length > 0
            ? supabase.from("grapes").select("id, name").in("id", grapeIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          // Drafts are owner-only (wine_identity_drafts RLS).
          unfinishedIds.length > 0
            ? supabase
                .from("wine_identity_drafts")
                .select("wine_id, draft, missing")
                .in("wine_id", unfinishedIds)
            : Promise.resolve({
                data: [] as { wine_id: string; draft: unknown; missing: string[] }[],
              }),
        ]);
      const wineName = new Map((catalog ?? []).map((c) => [c.id, c.wine_name]));
      const regionName = new Map((regions ?? []).map((r) => [r.id, r.name]));
      const grapeName = new Map((grapes ?? []).map((g) => [g.id, g.name]));
      const addedVia = new Map((sources ?? []).map((s) => [s.id, s.added_via]));
      for (const a of list) {
        const vintage =
          a.vintage_kind === "YEAR"
            ? String(a.vintage_year ?? "")
            : a.vintage_kind === "NV"
              ? "NV"
              : a.vintage_kind === "TAWNY"
                ? `${a.vintage_tawny_years ?? ""}yr tawny`
                : "";
        const producer = a.producer_id ? (names.get(a.producer_id) ?? null) : null;
        const cuvee = a.catalog_wine_id ? (wineName.get(a.catalog_wine_id) ?? null) : null;
        const via = addedVia.get(a.wine_id);
        const appellationNm = a.appellation_id ? names.get(a.appellation_id) : null;
        const grapeNm = grapeName.get(a.primary_grape_id);
        linesByWineId.set(a.wine_id, {
          // "Vietti, Barolo Castiglione 2017"
          title:
            [[producer, cuvee].filter(Boolean).join(", "), vintage]
              .filter(Boolean)
              .join(" ") || null,
          // Laptop: "{appellation} · {region} · {primary grape} · {source}".
          meta:
            [
              appellationNm,
              regionName.get(a.region_id),
              grapeNm,
              via ? ADDED_VIA_COPY[via] : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          // Phone (LOBBY-24): the same line, without the region or the
          // provenance — "{appellation} · {primary grape}".
          metaPhone: [appellationNm, grapeNm].filter(Boolean).join(" · ") || null,
          incomplete: false,
        });
      }
      // The draft row's keys in contract order, the same mapping as the
      // tasting_incomplete_glasses rows. A glass with no draft row (a
      // failed second write, spec §C.8) needs every field.
      const draftByWineId = new Map((drafts ?? []).map((d) => [d.wine_id, d]));
      const unfinished = new Set(unfinishedIds);
      wines.forEach((w, i) => {
        if (!unfinished.has(w.id)) return;
        const stored = draftByWineId.get(w.id);
        const missing = toIncompleteGlasses([
          { wine_id: w.id, glass: i + 1, missing: stored?.missing ?? [] },
        ]).flatMap((glass) => glass.missing);
        linesByWineId.set(w.id, {
          title: draftTitle(stored ? parseStoredDraft(stored.draft) : null),
          // Laptop: "needs a vintage — tap Edit to finish" (LOBBY-13).
          meta: flightRowNeeds(missing),
          // Phone: the shorter "needs a vintage" alone (LOBBY-13).
          metaPhone: describeMissing(missing),
          incomplete: true,
        });
      });
    }
  }

  // Per-wine display state for the flight list, computed here (server) so
  // the WineFlightList client component only owns the *order* — reordering
  // is optimistic there, moveFlightGlass persists it. `contributorLabel` null
  // => the row is numbered positionally from its live index.
  const flightWines: FlightWine[] = wines.map((w) => {
    const lines = linesByWineId.get(w.id) ?? null;
    return {
      id: w.id,
      contributorLabel: isByo ? wineLabel(w) : null,
      isRevealed: w.is_revealed,
      isByo,
      lines,
      // The server's edit guard (glassEditRefusal, BT-P1), for the adder
      // only: never on a CLOSED tasting or a revealed glass; a complete
      // glass only until its first reveal step, an incomplete one while the
      // tasting runs.
      editable:
        glassEditRefusal({
          tastingStatus: tasting.status,
          revealMode: tasting.reveal_mode,
          isRevealed: w.is_revealed,
          revealStep: w.reveal_step,
          viewerIsAdder: isAdder(ctx, w),
          viewerIsHost: isHost,
          laterGlassSeen: false,
        }) === null,
      canReorder: isHost && !w.is_revealed,
      canReveal: isHost && hasStarted && tasting.status !== "CLOSED" && !w.is_revealed,
      // move_flight_glass's own "already seen" rule (M6): mirrored locally by
      // crossesSeenGlass so a doomed drag or ▲▼ tap never round-trips.
      seen: w.is_revealed || w.reveal_step > 0,
    };
  });
  // No bring-your-own slots: one waiting row per JOINED participant without
  // a bottle, even while the flight is empty.
  const waitingFor: WaitingContributor[] = participantsWithoutWine.map((p) => ({
    participantId: p.id,
    name: nameByParticipantId.get(p.id) ?? "Someone",
  }));

  // The universal add-wine sheet's flight destination: the next glass
  // number is the live count + 1 (the page re-renders after every add).
  const flightDestination: FlightDestination = {
    kind: "flight",
    tastingId,
    tastingName: tasting.name,
    revealMode: tasting.reveal_mode,
    wineSource: tasting.wine_source,
    position: wineCount + 1,
  };
  const addWineButton = canAddWine ? (
    <AddToFlightButton destination={flightDestination} />
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Wines
          {/* Only the host of a host-provides tasting gets a subtitle (spec
              §2.1 row 15; §3.3 item 3): in bring-your-own each contributor
              sees only their own bottles. */}
          {isHost && !isByo ? (
            <span className="text-[12px] font-normal text-muted-foreground">
              <span className="hidden lg:inline">{winesCaption(wineCount, { phone: false })}</span>
              <span className="lg:hidden">{winesCaption(wineCount, { phone: true })}</span>
            </span>
          ) : null}
          {addWineButton ? <span className="ml-auto">{addWineButton}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {wineCount === 0 && waitingFor.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wines added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {isHost && !isByo && wineCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                This is the serving order — drag or use the arrows to reorder.
              </p>
            ) : null}
            <WineFlightList
              tastingId={tastingId}
              wines={flightWines}
              waitingFor={waitingFor}
              destination={flightDestination}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
