import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { getSemiBlindCandidates } from "@/lib/semi-blind-data";
import {
  LIST_BODY,
  LIST_FOOTNOTE,
  beforeStartLine,
  listEyebrow,
  listOpensAtStart,
  listTitle,
  pendingLine,
} from "@/lib/semi-blind-copy";
import type { CandidateCard } from "@/lib/semi-blind-candidates";

// The semi-blind candidate list (SB1; ledger B9 "The list"; spec §10.3 item
// 1; Q7). Mounted for SEMI_BLIND tastings only, in the host's DRAFT lobby
// (lobby-view.tsx) and the JOINED guest's DRAFT lobby (guest-lobby.tsx).
// Never mounted on the running page: from Start the same snapshot moves to
// the matching board (BT-S3), which reads it through `getSemiBlindBoard`,
// not this component.
//
// Every card comes from `getSemiBlindCandidates` — this file has no import
// that could reach the answer-key table or a wine id for an unrevealed
// candidate, so rule 1 holds structurally, not just by care at each call
// site.
// INVITED and DECLINED viewers, and anyone the RPC does not recognise as the
// host or a JOINED participant, get null back and this renders nothing.
export async function SemiBlindList({
  tastingId,
  hostName,
  started,
  viewerIsHost,
}: {
  tastingId: string;
  hostName: string;
  /** The tasting has left DRAFT (`status !== "DRAFT"`). */
  started: boolean;
  viewerIsHost: boolean;
}): Promise<React.JSX.Element | null> {
  const result = await getSemiBlindCandidates(tastingId);
  if (!result) return null;
  const { cards, pending } = result;

  // A guest (never the host) before Start: Q7's snapshot rule means the RPC
  // hands a non-adding guest nothing yet — the common host-provides case, and
  // the reason this leads with `listOpensAtStart` rather than a "Tonight's
  // zero wines" title. A bring-your-own contributor still gets their own
  // bottles, shown under that line — they don't get to see the rest of the
  // table either. The host never takes this branch: whatever the RPC handed
  // them before Start (the host-provides host's whole flight, or their own
  // bottles in a bring-your-own tasting) is plainly the whole picture they
  // are meant to have.
  if (!started && !viewerIsHost) {
    return (
      <section className="flex flex-col gap-4 rounded-[13px] border border-border-strong bg-card p-5 sm:p-6">
        <Eyebrow size="md">{listEyebrow(hostName)}</Eyebrow>
        <p className="text-sm font-medium text-foreground">{listOpensAtStart(hostName)}</p>
        {cards.length > 0 ? <CandidateGrid cards={cards} /> : null}
      </section>
    );
  }

  const pendingText = pendingLine(pending);

  return (
    <section className="flex flex-col gap-4 rounded-[13px] border border-border-strong bg-card p-5 sm:p-6">
      <Eyebrow size="md">{listEyebrow(hostName)}</Eyebrow>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold text-foreground sm:text-2xl">
          {listTitle(cards.length)}
        </h2>
        <p className="text-sm text-muted-foreground">{LIST_BODY}</p>
      </div>
      {cards.length > 0 ? <CandidateGrid cards={cards} /> : null}
      <div className="flex flex-col gap-1">
        {pendingText ? <p className="text-xs font-medium text-gold-dark">{pendingText}</p> : null}
        <p className="text-xs text-muted-foreground">{LIST_FOOTNOTE}</p>
        {!started ? (
          <p className="text-xs text-muted-foreground">{beforeStartLine(hostName)}</p>
        ) : null}
      </div>
    </section>
  );
}

function CandidateGrid({ cards }: { cards: readonly CandidateCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <CandidateRow key={card.key} card={card} />
      ))}
    </div>
  );
}

/** producer / "{wine name} {vintage}" / "{appellation} · {grape}" (spec §10.3
 *  item 1); missing lines drop out rather than printing an empty row. */
function CandidateRow({ card }: { card: CandidateCard }) {
  const nameLine = [card.wineName, card.vintageLabel].filter(Boolean).join(" ");
  const originLine = [card.appellation, card.grape].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-border bg-background p-3">
      <HatchThumb src={null} width={40} height={52} />
      <div className="flex min-w-0 flex-col gap-0.5">
        {card.producer ? (
          <span className="truncate text-sm font-semibold text-foreground">{card.producer}</span>
        ) : null}
        {nameLine ? (
          <span className="truncate text-xs text-muted-foreground">{nameLine}</span>
        ) : null}
        {originLine ? (
          <span className="truncate text-xs text-muted-foreground">{originLine}</span>
        ) : null}
      </div>
    </div>
  );
}
