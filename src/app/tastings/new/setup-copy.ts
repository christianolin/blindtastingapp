import type {
  AsyncRevealPolicy,
  RevealMode,
  TastingStatus,
  TimingMode,
  WineLeaderboardReveal,
  WineSourceMode,
} from "@/lib/supabase/database.types";

// Pure helpers for the create-tasting sheet: the step-1 values, the FormData
// the (unchanged) action reads, and the summary copy the rules card and the
// step-3 "Ready to go" block state in words. Kept free of React so vitest can
// cover the wording rules without rendering anything.

export type FlowChoice = "GUIDED" | "FREE";

export type SetupValues = {
  name: string;
  revealMode: RevealMode;
  timingMode: TimingMode;
  wineSource: WineSourceMode;
  /** datetime-local value ("YYYY-MM-DDTHH:mm") or "". */
  scheduledLocal: string;
  flow: FlowChoice;
  leaderboardReveal: WineLeaderboardReveal;
  asyncRevealPolicy: AsyncRevealPolicy;
  /** Public URL of the optional cover photo (Storage `tasting-images`), or null. */
  imageUrl: string | null;
  /** The tasting's private place (B12) — host, JOINED and INVITED only. */
  place: string;
  description: string;
};

export function defaultSetup(revealMode: RevealMode): SetupValues {
  return {
    name: "",
    revealMode,
    timingMode: "LIVE",
    wineSource: "HOST_PROVIDES",
    scheduledLocal: "",
    flow: "GUIDED",
    leaderboardReveal: "PER_ATTRIBUTE",
    asyncRevealPolicy: "AFTER_ALL",
    imageUrl: null,
    place: "",
    description: "",
  };
}

// The datetime-local value is wall-clock time in the viewer's own zone; convert
// it here (client) so the server never has to guess the host's timezone.
export function localToIso(local: string): string | null {
  const v = local.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ISO → the datetime-local input's "YYYY-MM-DDTHH:mm" in the viewer's zone.
export function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The same field names createTasting has always read (see actions.ts), plus
// `scheduled_at_iso`, which the action prefers over the raw local value.
export function buildSetupFormData(v: SetupValues): FormData {
  const fd = new FormData();
  fd.set("name", v.name.trim());
  fd.set("reveal_mode", v.revealMode);
  fd.set("timing_mode", v.timingMode);
  fd.set("wine_source", v.wineSource);
  fd.set("flow", v.flow);
  fd.set("leaderboard_reveal", v.leaderboardReveal);
  fd.set("async_reveal_policy", v.asyncRevealPolicy);
  fd.set("scheduled_at", v.scheduledLocal);
  fd.set("scheduled_at_iso", localToIso(v.scheduledLocal) ?? "");
  // Blank when there is no photo; the action reads "" as null.
  fd.set("image_url", v.imageUrl ?? "");
  fd.set("place", v.place);
  fd.set("description", v.description);
  fd.set("emails", "");
  return fd;
}

// Guided pacing is a LIVE-only setting (spec §D.1 #1, refinement/B6: it now
// applies to any non-OPEN LIVE tasting, not just blind — semi-blind's pour
// pointer needs a Guided/Free choice too). actions.ts stores
// `sequential_guessing` under the same condition.
export function flowApplies(v: SetupValues): boolean {
  return v.revealMode !== "OPEN" && v.timingMode === "LIVE";
}

// The Leaderboard setting only matters while one glass is revealed step by
// step for everyone at once: blind, LIVE and Guided (spec §D.1 #5) — this
// stays blind-only even though `flowApplies` now also covers semi-blind. The
// stored value is written regardless; it just isn't offered or described
// otherwise.
export function leaderboardApplies(v: SetupValues): boolean {
  return v.revealMode === "BLIND" && v.timingMode === "LIVE" && v.flow === "GUIDED";
}

// Who brings the wines can't switch once the flight has bottles (spec §D.1 #3).
// updateTastingSetup refuses with it; the form shows it as the locked pair's hint.
export const WINE_SOURCE_LOCKED =
  "Remove the wines first — who brings the wines can't change once the flight has bottles.";

// The collapsed rules card's desktop hint (handoff 6a), shown only where the
// Flow choice exists for a BLIND tasting — this talks about tasting "the same
// glass" and a quieter leaderboard, neither of which is semi-blind's picture,
// so it stays gated on BLIND specifically rather than the wider `flowApplies`.
export function rulesHint(v: SetupValues): string | null {
  if (v.revealMode !== "BLIND" || v.timingMode !== "LIVE") return null;
  return `Guided means everyone tastes the same glass at once and you drive the reveal. Fine for almost every tasting — open this only if you want free order${
    leaderboardApplies(v) ? " or a quieter leaderboard" : ""
  }.`;
}

// The collapsed rules card, in words (spec Part 2, Step 1 · 4; §2.3 item 4 for
// semi-blind). Semi-blind's line is the flow word (when it applies) followed
// by "one point for each glass you match", sentence-cased when no flow word
// leads it (plan copy: self-paced semi-blind has no flow word).
export function rulesSummary(v: SetupValues): string {
  const parts: string[] = [];
  if (v.revealMode === "SEMI_BLIND") {
    const flow = flowApplies(v) ? (v.flow === "GUIDED" ? "Guided" : "Free") : null;
    const matchLine = "one point for each glass you match";
    if (flow) {
      parts.push(flow, matchLine);
    } else {
      parts.push(matchLine.charAt(0).toUpperCase() + matchLine.slice(1));
    }
  } else {
    if (flowApplies(v)) parts.push(v.flow === "GUIDED" ? "Guided" : "Free");
    if (leaderboardApplies(v)) {
      parts.push(
        `standings after ${v.leaderboardReveal === "PER_WINE" ? "the full wine" : "each attribute"}`,
      );
    }
    parts.push("Danish Championship scoring");
  }
  if (v.timingMode === "ASYNC") {
    parts.push(
      v.asyncRevealPolicy === "IMMEDIATE"
        ? "results as soon as you submit"
        : "results after everyone has guessed",
    );
  }
  return parts.join(" · ");
}

// The same card on phones (handoff 6d, 11px in a 390px frame): one line.
// The default state must read exactly "Guided · per attribute".
export function rulesSummaryShort(v: SetupValues): string {
  const parts: string[] = [];
  if (v.revealMode === "SEMI_BLIND") {
    if (flowApplies(v)) parts.push(v.flow === "GUIDED" ? "Guided" : "Free");
    parts.push("1 pt a match"); // (plan copy)
  } else {
    if (flowApplies(v)) parts.push(v.flow === "GUIDED" ? "Guided" : "Free");
    if (leaderboardApplies(v)) {
      parts.push(v.leaderboardReveal === "PER_WINE" ? "per wine" : "per attribute");
    }
  }
  if (v.timingMode === "ASYNC") {
    parts.push(v.asyncRevealPolicy === "IMMEDIATE" ? "results at once" : "results after all");
  }
  return parts.join(" · ");
}

// Step 3's gold "Ready to go" line, as separate segments (the caller joins
// them with " · " so the date can be a <LocalDateTime/> element). `place` and
// `phone` are optional so every earlier caller (no place row, no phone
// variant) keeps its old output.
export function readySummary({
  setup,
  wineCount,
  invitedCount,
  dateText,
  place,
  phone,
}: {
  setup: SetupValues;
  wineCount: number;
  invitedCount: number;
  dateText: string | null;
  place?: string | null;
  phone?: boolean;
}): string[] {
  const parts = [
    setup.revealMode === "SEMI_BLIND" ? "Semi-blind" : "Blind",
    setup.timingMode === "LIVE" ? "live" : "self-paced",
  ];
  if (flowApplies(setup)) {
    parts.push(setup.flow === "GUIDED" ? "guided" : "free");
  }
  if (setup.wineSource === "PARTICIPANT_CONTRIBUTED") {
    parts.push("everyone brings");
  }
  parts.push(`${wineCount} ${wineCount === 1 ? "wine" : "wines"} so far`, dateText ?? "no date");
  if (place) parts.push(place);
  parts.push(`${invitedCount} invited`);
  if (!phone) parts.push("add more as you pour");
  return parts;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Step 1's three name chips (spec §2.3 item 1, B1). Chip 1 is the scheduled
// date's weekday when it parses, else today's, plus the mode word; chip 2 is
// "{region} #{n}" only when a poured region is known (the earlier fixed
// region fallback named a region the host never poured, so it is gone); chip
// 3 is fixed.
export function nameSuggestions(input: {
  today: Date;
  scheduledLocal: string;
  revealMode: RevealMode;
  pouredRegion: { region: string; n: number } | null;
}): string[] {
  const scheduled = input.scheduledLocal.trim() ? new Date(input.scheduledLocal) : null;
  const date = scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled : input.today;
  const modeWord = input.revealMode === "SEMI_BLIND" ? "semi-blind" : "blind";
  const chips = [`${WEEKDAYS[date.getDay()]} ${modeWord}`];
  if (input.pouredRegion) chips.push(`${input.pouredRegion.region} #${input.pouredRegion.n}`);
  chips.push("Six glasses, no mercy");
  return chips;
}

// The name chip's region: the region poured most often among the caller's own
// tastings (`getPouredRegionSuggestion` builds the rows; this is the pure
// pick), numbered by how many of the caller's tastings poured it, plus one
// for the tasting about to be created. Ties go to the name that sorts first —
// deterministic and never RLS-order-dependent.
export function pickPouredRegion(
  rows: readonly { tastingId: string; regionId: string }[],
  names: ReadonlyMap<string, string>,
): { region: string; n: number } | null {
  const byRegion = new Map<string, { rowCount: number; tastingIds: Set<string> }>();
  for (const row of rows) {
    if (!names.has(row.regionId)) continue;
    const entry = byRegion.get(row.regionId) ?? { rowCount: 0, tastingIds: new Set<string>() };
    entry.rowCount += 1;
    entry.tastingIds.add(row.tastingId);
    byRegion.set(row.regionId, entry);
  }

  let best: { regionId: string; rowCount: number; tastingIds: Set<string> } | null = null;
  for (const [regionId, entry] of byRegion) {
    const name = names.get(regionId)!;
    const bestName = best ? names.get(best.regionId)! : null;
    if (!best || entry.rowCount > best.rowCount || (entry.rowCount === best.rowCount && name < bestName!)) {
      best = { regionId, rowCount: entry.rowCount, tastingIds: entry.tastingIds };
    }
  }
  if (!best) return null;
  return { region: names.get(best.regionId)!, n: best.tastingIds.size + 1 };
}

// Step 3's per-friend context line (spec §2.3 item 9, CREATE-48): one
// `getBulkProfileSummaries` call feeds every chip, never a per-friend fetch.
export function friendContextLine(
  summary: { tastingsAttended: number; winesGuessed: number; averagePoints: number } | undefined,
): string {
  if (!summary || summary.tastingsAttended === 0) return "new to Blindr";
  const noun = summary.tastingsAttended === 1 ? "tasting" : "tastings";
  return `${summary.tastingsAttended} ${noun} · ${summary.averagePoints.toFixed(1)} avg`;
}

// Step 1's footer note (CREATE-17, plan refinement — shown wherever step 1
// otherwise lacked one, i.e. on phones too).
export const STEP1_FOOTER_NOTE =
  "A name is all it takes. Wines and people can wait — the tasting exists from here and you can leave it empty.";

// The locked-once-started subset of SetupValues (spec §3.3 item 14, S4d).
export type LockedSetup = Pick<
  SetupValues,
  "revealMode" | "timingMode" | "wineSource" | "flow" | "leaderboardReveal" | "asyncRevealPolicy"
>;

export const SETTINGS_LOCKED_AFTER_START =
  "Mode, timing, rules and who brings the wines lock once the tasting has started.";

// `updateTastingSetup`'s status-aware gate: DRAFT allows everything except a
// wine-source switch once the flight has bottles (unchanged rule, spec §D.1
// #3); IN_PROGRESS, CLOSED and legacy OPEN allow only name, description,
// image, schedule and place to change — anything else in `LockedSetup` is
// refused before any write.
export function settingsChangeRefusal(input: {
  status: TastingStatus;
  wineCount: number;
  before: LockedSetup;
  after: LockedSetup;
}): string | null {
  const { status, wineCount, before, after } = input;
  if (status === "DRAFT") {
    if (before.wineSource !== after.wineSource && wineCount > 0) return WINE_SOURCE_LOCKED;
    return null;
  }
  const keys: (keyof LockedSetup)[] = [
    "revealMode",
    "timingMode",
    "wineSource",
    "flow",
    "leaderboardReveal",
    "asyncRevealPolicy",
  ];
  for (const key of keys) {
    if (before[key] !== after[key]) return SETTINGS_LOCKED_AFTER_START;
  }
  return null;
}
