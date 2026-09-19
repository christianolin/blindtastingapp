"use server";

// Scan photos (spec §7): a wine's "More photos" rows. Attaching goes only
// through the SECURITY DEFINER `attach_catalog_wine_photo`, which checks the
// caller, the path, the object, the wine and rule 1 and answers with one status
// word; removing is a plain DELETE that RLS limits to the photographer's own
// rows. Neither touches the storage object.
//
// No revalidatePath here: the wine page is dynamic (cookies) and calls
// router.refresh() itself, and the add-wine sheet must not re-render the page
// under it mid-flow. Exports async functions only (CLAUDE.md "use server"
// gotcha); the shapes live in src/lib/catalog-photos/types.ts.
import type {
  AttachPhotoResult,
  AttachPhotoStatus,
  PhotoVia,
  RemovePhotoResult,
} from "@/lib/catalog-photos/types";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PATH = 300;
const VIAS: ReadonlySet<string> = new Set<PhotoVia>(["upload", "catalog", "cellar", "note"]);

const REFUSALS: ReadonlySet<string> = new Set<Exclude<AttachPhotoStatus, "attached" | "already-attached" | "error">>([
  "signed-out",
  "deleted-account",
  "bad-path",
  "no-object",
  "not-an-image",
  "too-large",
  "no-wine",
  "flight-photo",
  "unrevealed-glass",
  "limit",
]);

type Refusal = Extract<AttachPhotoResult, { ok: false }>["status"];

/** Name and message only. */
function logFailure(what: string, error: unknown): void {
  console.error(
    what,
    error instanceof Error
      ? { name: error.name, message: error.message }
      : typeof error === "object" && error !== null && "message" in error
        ? { message: String((error as { message: unknown }).message) }
        : { thrown: typeof error },
  );
}

/** `via` is where the photo came from: "upload" on the wine page, else where
    the scan's add landed. The RPC stores "upload" for any catalog/<wineId>/
    upload whatever `via` says, and refuses a scan whose via is not catalog,
    cellar or note; a "cellar" scan is then read only by whoever can see the
    photographer's cellar (spec §3.1). */
export async function attachCatalogWinePhoto(input: {
  catalogWineId: string;
  imagePath: string;
  via: PhotoVia;
}): Promise<AttachPhotoResult> {
  const catalogWineId = input?.catalogWineId;
  const imagePath = input?.imagePath;
  const via = input?.via;
  if (
    typeof catalogWineId !== "string" ||
    !UUID_RE.test(catalogWineId) ||
    typeof imagePath !== "string" ||
    imagePath.length === 0 ||
    imagePath.length > MAX_PATH ||
    typeof via !== "string" ||
    !VIAS.has(via)
  ) {
    return { ok: false, status: "bad-path" };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attach_catalog_wine_photo", {
      p_catalog_wine_id: catalogWineId,
      p_image_path: imagePath,
      p_via: via,
    });
    if (error) {
      logFailure("attach_catalog_wine_photo failed", error);
      return { ok: false, status: "error" };
    }
    if (data === "attached" || data === "already-attached") return { ok: true, status: data };
    if (typeof data === "string" && REFUSALS.has(data)) return { ok: false, status: data as Refusal };
    logFailure("attach_catalog_wine_photo answered an unknown status", { message: String(data) });
    return { ok: false, status: "error" };
  } catch (error) {
    logFailure("attach_catalog_wine_photo threw", error);
    return { ok: false, status: "error" };
  }
}

export async function removeCatalogWinePhoto(photoId: string): Promise<RemovePhotoResult> {
  if (typeof photoId !== "string" || !UUID_RE.test(photoId)) return { ok: false, reason: "not-yours" };
  try {
    const supabase = await createClient();
    // RLS ("catalog_wine_photos delete own") admits only the photographer's own
    // row, so someone else's id deletes nothing. The file stays in storage.
    const { data, error } = await supabase
      .from("catalog_wine_photos")
      .delete()
      .eq("id", photoId)
      .select("id");
    if (error) {
      logFailure("catalog_wine_photos delete failed", error);
      return { ok: false, reason: "error" };
    }
    if (!data || data.length === 0) return { ok: false, reason: "not-yours" };
    return { ok: true };
  } catch (error) {
    logFailure("catalog_wine_photos delete threw", error);
    return { ok: false, reason: "error" };
  }
}
