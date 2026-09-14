/**
 * Start's result, carried across the lobby → running view swap (BT-V3 A-08).
 * A Start from the lobby flips the tasting out of DRAFT in the same round trip
 * that would deliver its result, so `LobbyView` (and the Start form with its
 * action state) unmounts and `RunningView` renders instead. `startTasting`
 * therefore leaves the result in a short-lived cookie scoped to the tasting's
 * path; `RunningView` reads it for the host (`getStartResult` in
 * tasting-request-cache.ts), and `StartResultNotice` clears it on mount.
 *
 * The value is base64url JSON, so no cookie delimiter can appear in it; anything
 * malformed reads as no result. Pure (no Next or Supabase import), so vitest
 * covers the codec.
 */
export type StartResult = { success: string; warning: string | null; toConsole: boolean };

const MAX_SUCCESS_LENGTH = 200;
const MAX_WARNING_LENGTH = 2000;

export function startResultCookieName(tastingId: string): string {
  return `bt_start_result_${tastingId}`;
}

export function startResultCookiePath(tastingId: string): string {
  return `/tastings/${tastingId}`;
}

export function encodeStartResult(result: StartResult): string {
  return Buffer.from(JSON.stringify(result), "utf8").toString("base64url");
}

export function decodeStartResult(raw: string | null | undefined): StartResult | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const { success, warning, toConsole } = value as Record<string, unknown>;
    if (typeof success !== "string" || success.length === 0 || success.length > MAX_SUCCESS_LENGTH) {
      return null;
    }
    if (typeof toConsole !== "boolean") return null;
    let note: string | null = null;
    if (typeof warning === "string" && warning.length <= MAX_WARNING_LENGTH) note = warning;
    else if (warning !== null) return null;
    return { success, warning: note, toConsole };
  } catch {
    return null;
  }
}
