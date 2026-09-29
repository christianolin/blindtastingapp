// The unfinished training session, kept on the device only (spec
// 2026-09-25-training-room-design.md D13, §7.2): nothing is on the server
// before the reveal. One JSON value per user under
// `blindr-training-draft:<userId>`, read and written through safe-storage's
// try/catch, so a blocked or full store means "no draft" / "not saved", never
// a crash. Every function takes an optional storage getter (default: the
// browser's localStorage) so vitest can pass a fake; no browser global is
// touched at module level.
import { clearValue, readValue, writeValue, type StorageLike } from "../safe-storage";
import { emptyNoteState } from "../wset/note-state";
import type { MatchExtras, TrainingDraft, VintageGuess } from "./types";

export const DRAFT_KEY_PREFIX = "blindr-training-draft:";

export function draftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fresh session key (training_attempts.session_key, a uuid): v4 from
    crypto.getRandomValues, which — unlike randomUUID — needs no secure context. */
export function newSessionKey(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isTriState(v: unknown): v is boolean | null {
  return v === null || v === true || v === false;
}

function isExtras(v: unknown): v is MatchExtras {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return isTriState(e.bubbles) && isTriState(e.fortified);
}

function isVintage(v: unknown): v is VintageGuess {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  if (g.kind === "NV") return true;
  if (g.kind === "YEAR") return Number.isInteger(g.year);
  if (g.kind === "TAWNY") return Number.isInteger(g.years);
  return false;
}

// A pick id: a string, or none. A draft saved before the region step
// (region-guess addendum R5) has no region or grape key at all.
function isOptionalId(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === "string";
}

const NOTE_ARRAYS = ["observations", "faults", "tanninNature", "noseTermIds", "palateTermIds"] as const;

/**
 * This user's draft, or null when there is none, it cannot be read, it is not
 * valid JSON, or its shape is wrong (a draft from another user, a bad session
 * key or timestamp, a malformed pick, extras or vintage). A note saved by an
 * older build is filled up from `emptyNoteState()`, so a field added later
 * starts unrated rather than undefined; a draft from before the region step
 * reads with no region and no grape (the room then gives a picked typical wine
 * its region: call.ts's normalizeCall).
 */
export function readDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): TrainingDraft | null {
  const raw = readValue(getStorage, draftKey(userId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  if (d.userId !== userId) return null;
  if (typeof d.sessionKey !== "string" || !UUID_RE.test(d.sessionKey)) return null;
  if (typeof d.startedAt !== "string" || Number.isNaN(Date.parse(d.startedAt))) return null;
  if (typeof d.note !== "object" || d.note === null) return null;
  const note = { ...emptyNoteState(), ...(d.note as object) };
  for (const k of NOTE_ARRAYS) if (!Array.isArray(note[k])) return null;
  if (!isExtras(d.extras)) return null;
  if (d.pickedArchetypeId !== null && typeof d.pickedArchetypeId !== "string") return null;
  if (!isOptionalId(d.pickedRegionId) || !isOptionalId(d.pickedGrapeId)) return null;
  if (!isVintage(d.vintage)) return null;
  return {
    userId,
    sessionKey: d.sessionKey,
    startedAt: d.startedAt,
    note,
    extras: { bubbles: d.extras.bubbles, fortified: d.extras.fortified },
    pickedArchetypeId: d.pickedArchetypeId,
    pickedRegionId: d.pickedRegionId ?? null,
    pickedGrapeId: d.pickedGrapeId ?? null,
    vintage: d.vintage,
  };
}

/**
 * The draft's note without any nose or palate term the lexicon no longer has.
 * A draft saved before a term was removed (aroma lexicon v2 deleted five)
 * would otherwise keep an id the picker cannot show or clear, that still
 * counts towards "Selected · N" and the section's progress, and that the
 * finish sends into wset_note_aromas, where its foreign key refuses the whole
 * session. Returns the same draft when nothing was dropped.
 */
export function withKnownTerms(d: TrainingDraft, knownTermIds: ReadonlySet<string>): TrainingDraft {
  const nose = d.note.noseTermIds.filter((id) => knownTermIds.has(id));
  const palate = d.note.palateTermIds.filter((id) => knownTermIds.has(id));
  if (nose.length === d.note.noseTermIds.length && palate.length === d.note.palateTermIds.length) return d;
  return { ...d, note: { ...d.note, noseTermIds: nose, palateTermIds: palate } };
}

/** Stores the draft under its user's key. False when it could not be saved. */
export function writeDraft(
  d: TrainingDraft,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return writeValue(getStorage, draftKey(d.userId), JSON.stringify(d));
}

/** Removes this user's draft (Discard, a finished session). */
export function clearDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return clearValue(getStorage, draftKey(userId));
}

/**
 * Did this `storage` event clear the user's draft in another tab? True for
 * that key removed (or emptied) and for `localStorage.clear()` (key null);
 * the room then returns to the landing (spec §7.2).
 */
export function draftClearedBy(
  event: { key: string | null; newValue: string | null },
  userId: string,
): boolean {
  if (event.key === null) return true;
  return event.key === draftKey(userId) && !event.newValue;
}
