// Small runtime helpers shared by the add-wine views. Type-only imports keep
// this file safe on both sides (extract.ts is server-only, but a type import
// is erased at compile time).
import type { ExtractedLabel } from "@/lib/label-scan/extract";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import type { ByHandIdentity } from "./types";

type VintageKind = "YEAR" | "NV" | "TAWNY";

/** "2018" · "NV" · "20yo" / "Tawny"; null for a YEAR with no year. */
export function vintageLabel(
  kind: VintageKind,
  year: number | null,
  tawnyYears: number | null,
): string | null {
  if (kind === "YEAR") return year ? String(year) : null;
  if (kind === "TAWNY") return tawnyYears ? `${tawnyYears}yo` : "Tawny";
  return "NV";
}

/** "glass 4" — the handoff's lowercase glass reference. */
export function glassLabel(position: number): string {
  return `glass ${position}`;
}

type TitleSource = Pick<
  ExtractedLabel,
  "producer" | "wineName" | "vintageKind" | "vintageRead" | "vintageYear"
>;

/** 7c title: `[producer, wineName, vintage].join(", ")` — the vintage only
    when the read actually found one ("NV is a claim, not a fallback"). */
export function wineTitleFromExtracted(e: TitleSource): string {
  const vintage = e.vintageRead
    ? vintageLabel(e.vintageKind, e.vintageYear, null)
    : null;
  const head = [e.producer, e.wineName]
    .map((s) => s?.trim() || null)
    .filter(Boolean)
    .join(", ");
  const title = [head || null, vintage].filter(Boolean).join(" ");
  return title || "Unnamed wine";
}

type MetaSource = Pick<ExtractedLabel, "appellation" | "region" | "country" | "grapes">;

/** 7c meta line: appellation · region · country · grapes. */
export function wineMetaFromExtracted(e: MetaSource): string {
  const grapes = e.grapes.map((g) => g.name.trim()).filter(Boolean).join(", ");
  return [e.appellation, e.region, e.country, grapes || null]
    .map((s) => s?.trim() || null)
    .filter(Boolean)
    .join(" · ");
}

/** The same title rule applied to a resolved prefill (pending rows, by-hand). */
export function scanTitle(p: WineFormInitial): string {
  const year = p.vintageYear ? Number.parseInt(p.vintageYear, 10) : null;
  const tawny = p.tawnyYears ? Number.parseInt(p.tawnyYears, 10) : null;
  const vintage = p.vintagePrompt
    ? null
    : vintageLabel(p.vintageKind, Number.isFinite(year) ? year : null, Number.isFinite(tawny) ? tawny : null);
  const head = [p.producerLabel, p.wineName]
    .map((s) => s?.trim() || null)
    .filter(Boolean)
    .join(", ");
  return [head || null, vintage].filter(Boolean).join(" ") || "Unnamed wine";
}

/**
 * Map a catalog-form prefill (the scan resolver's output) to the by-hand
 * identity contract. Returns null when the write floor is not met — country,
 * region, appellation, a real primary grape id, a producer (id or pending
 * name), colour, style and a readable vintage — so the caller can route to
 * the by-hand form (or a 7d "Fix" row) instead of a failing write.
 */
export function identityFromPrefill(p: WineFormInitial): ByHandIdentity | null {
  const primary = p.blend[0];
  const producerName = (p.producerLabel ?? "").trim();
  if (
    !p.countryId || !p.regionId || !p.appellationId || !primary?.grapeId ||
    (!p.producerId && !producerName) || !p.colour || !p.style
  ) {
    return null;
  }
  if (p.vintagePrompt) return null;
  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (p.vintageKind === "YEAR") {
    vintageYear = Number.parseInt(p.vintageYear, 10);
    if (!Number.isFinite(vintageYear)) return null;
  } else if (p.vintageKind === "TAWNY") {
    vintageTawnyYears = Number.parseInt(p.tawnyYears, 10);
    if (!Number.isFinite(vintageTawnyYears)) return null;
  }
  const secondary = p.blend[1]?.grapeId || null;
  return {
    producerId: p.producerId || null,
    producerName,
    wineName: p.wineName.trim() || null,
    vintageKind: p.vintageKind,
    vintageYear,
    vintageTawnyYears,
    colour: p.colour,
    style: p.style,
    countryId: p.countryId,
    regionId: p.regionId,
    appellationId: p.appellationId,
    primaryGrapeId: primary.grapeId,
    secondaryGrapeId: secondary,
    typeDesignationId: p.typeDesignationId || null,
    imageUrl: p.imageUrl,
    description: p.description,
    alcoholPercent: p.profile?.alcoholPercent ?? null,
  };
}

/** "★ 91" for a rating average, null when there is none. */
export function starLabel(avg: number | null): string | null {
  return avg == null ? null : `★ ${Math.round(avg)}`;
}
