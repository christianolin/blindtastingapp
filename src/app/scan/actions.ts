"use server";

// The label scan's one server action (spec §A.5, D1). One round trip checks the
// caller and the photo's path, reads the label, keeps every billed read in
// `label_reads`, then resolves the read into a draft, names what is missing, finds
// a confident catalog match and builds the confirm screen's title and meta. The
// client never sends a URL, and nothing here writes a wine: the confirm screen's
// explicit add does that (D6).
import { readLabel, type ExtractedLabel, type LabelReadOutcome } from "@/lib/label-scan/extract";
import { isOwnStagingPath, labelReadRow } from "@/lib/label-scan/guards";
import { createClient } from "@/lib/supabase/server";
import { missingWineFields } from "@/lib/wine-identity/complete";
import { readDisplay, type DisplayNames } from "@/lib/wine-identity/describe";
import type { CatalogMatch } from "@/lib/wine-identity/match";
import { resolveLabelRead, type RefLookup } from "@/lib/wine-identity/resolve";
import { serverLookup } from "@/lib/wine-identity/server/lookup";
import { findConfidentMatch } from "@/lib/wine-identity/server/match";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";

export type LabelPhotoFailure =
  | "signed-out" | "image" | "not-a-label" | "not-read" | "busy" | "network" | "rejected" | "service";

export type LabelPhotoRead = {
  ok: true;
  readId: string | null;            // label_reads.id
  draft: WineIdentityDraft;         // resolveLabelRead (B.5)
  missing: WineFieldKey[];          // missingWineFields(draft) (B.3)
  match: CatalogMatch | null;       // findConfidentMatch (B.6)
  display: { title: string; meta: string; newProducer: boolean };
  confidence: "high" | "medium" | "low";
};

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Name and message only: never the API key, never the read JSON. */
function logFailure(what: string, error: unknown): void {
  console.error(
    what,
    error instanceof Error ? { name: error.name, message: error.message } : { thrown: typeof error },
  );
}

/** Stores a billed read (spec §A.5 step 5; `labelReadRow` decides which outcomes
    were billed) and returns its id. A failed insert is logged and the scan
    carries on with `readId: null`. No image bytes are stored (D1). */
async function keepRead(
  supabase: ServerSupabase,
  userId: string,
  imagePath: string,
  outcome: LabelReadOutcome,
): Promise<string | null> {
  const row = labelReadRow(outcome);
  if (row === null) return null;
  const { data, error } = await supabase
    .from("label_reads")
    .insert({ user_id: userId, image_path: imagePath, ...row })
    .select("id")
    .single();
  if (error) {
    console.error("label read not kept", { code: error.code, message: error.message });
    return null;
  }
  return data.id;
}

/** The resolved names for the confirm screen, from the same lookup the resolver
    used, so no raw read text stands in for a field that did not resolve (scan-3).
    The producer is the one exception, and the screen marks it: a pending producer
    shows its read name with "new producer". A pending grape matched no grape row
    and carries no such mark, so it stays out of the meta; the explicit add
    creates it. */
async function displayNames(draft: WineIdentityDraft, lookup: RefLookup): Promise<DisplayNames> {
  const [appellation] = draft.appellationId ? await lookup.appellationsByIds([draft.appellationId]) : [];
  const region = draft.regionId ? await lookup.regionById(draft.regionId) : null;
  const country = draft.countryId
    ? (await lookup.countries()).find((row) => row.id === draft.countryId) ?? null
    : null;
  // The draft comes back normalised, so its first blend row is the primary grape.
  const primaryGrape = draft.blend[0]?.grape;
  return {
    producer: draft.producer?.name ?? null,
    appellation: appellation?.name ?? null,
    region: region?.name ?? null,
    country: country?.name ?? null,
    primaryGrape: primaryGrape?.kind === "existing" ? primaryGrape.name : null,
  };
}

export async function readLabelPhoto(input: {
  imagePath: string;
}): Promise<LabelPhotoRead | { ok: false; reason: LabelPhotoFailure }> {
  const supabase = await createClient();

  // 1. Signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  // 2. Only the caller's own staging upload; never a URL.
  const imagePath = typeof input?.imagePath === "string" ? input.imagePath : "";
  if (!isOwnStagingPath(imagePath, user.id)) return { ok: false, reason: "image" };

  // 3. The staging object's public URL.
  const imageUrl = supabase.storage.from("wine-images").getPublicUrl(imagePath).data.publicUrl;

  // 4. The read.
  let outcome: LabelReadOutcome;
  try {
    outcome = await readLabel(imageUrl);
  } catch (error) {
    logFailure("label read threw", error);
    return { ok: false, reason: "service" };
  }

  // 5. Every billed read is kept, the expensive failures included.
  const readId = await keepRead(supabase, user.id, imagePath, outcome);

  // 6. A failed read.
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  // 7. Resolve, name what is missing, match, describe.
  try {
    const lookup = serverLookup(supabase);
    const draft = await resolveLabelRead(outcome.read, lookup, { imageUrl });
    const missing = missingWineFields(draft);
    const match = await findConfidentMatch(supabase, draft);
    const display = readDisplay(draft, await displayNames(draft, lookup));
    return { ok: true, readId, draft, missing, match, display, confidence: outcome.read.confidence };
  } catch (error) {
    logFailure("label read resolve failed", error);
    return { ok: false, reason: "service" };
  }
}

/** @deprecated removed in S5c */
export type ScanMatch = { id: string; name: string };
/** @deprecated removed in S5c */
export type ScanResult = { extracted: ExtractedLabel; matches: ScanMatch[] };
