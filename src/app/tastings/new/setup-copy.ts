import type {
  AsyncRevealPolicy,
  RevealMode,
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
  fd.set("emails", "");
  return fd;
}

// The collapsed rules card, in words (spec Part 2, Step 1 · 4).
export function rulesSummary(v: SetupValues): string {
  const parts: string[] = [];
  if (v.revealMode === "SEMI_BLIND") {
    parts.push("Semi-blind", "one point per glass");
  } else {
    parts.push(
      v.flow === "GUIDED" ? "Guided" : "Free",
      `standings after ${v.leaderboardReveal === "PER_WINE" ? "the full wine" : "each attribute"}`,
      "Danish Championship scoring",
    );
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
    parts.push("Semi-blind", "1 pt per glass");
  } else {
    parts.push(
      v.flow === "GUIDED" ? "Guided" : "Free",
      v.leaderboardReveal === "PER_WINE" ? "per wine" : "per attribute",
    );
  }
  if (v.timingMode === "ASYNC") {
    parts.push(v.asyncRevealPolicy === "IMMEDIATE" ? "results at once" : "results after all");
  }
  return parts.join(" · ");
}

// Step 3's gold "Ready to go" line, as separate segments (the caller joins
// them with " · " so the date can be a <LocalDateTime/> element).
export function readySummary({
  setup,
  wineCount,
  invitedCount,
  dateText,
}: {
  setup: SetupValues;
  wineCount: number;
  invitedCount: number;
  dateText: string | null;
}): string[] {
  const parts = [
    setup.revealMode === "SEMI_BLIND" ? "Semi-blind" : "Blind",
    setup.timingMode === "LIVE" ? "live" : "self-paced",
  ];
  if (setup.revealMode === "BLIND") {
    parts.push(setup.flow === "GUIDED" ? "guided" : "free");
  }
  parts.push(
    `${wineCount} ${wineCount === 1 ? "wine" : "wines"} so far`,
    dateText ?? "no date",
    `${invitedCount} invited`,
    "add more as you pour",
  );
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

// Three name chips: today's weekday, the host's most-tasted region numbered
// by how many they have hosted, and the handoff's fixed third.
export function nameSuggestions(
  today: Date,
  region: { region: string; n: number } | null,
): [string, string, string] {
  return [
    `${WEEKDAYS[today.getDay()]} blind`,
    region ? `${region.region} #${region.n}` : "Burgundy #1",
    "Six glasses, no mercy",
  ];
}
