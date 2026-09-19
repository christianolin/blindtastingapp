// Scan photos (spec §7): the shapes shared by the "use server" photo actions
// (src/app/catalog/photo-actions.ts), the add-wine sheet and the wine page. A
// "use server" module exports only async functions (CLAUDE.md), so the types
// live here and both sides import them with `import type`.

/** Where a photo came from (catalog_wine_photos.via): a wine-page upload, or
    where its scan's add landed. A "cellar" scan is read only by its
    photographer and whoever can see their cellar (can_view_cellar), so it
    never tells anyone more than the cellar lot does (spec §3.1). */
export type PhotoVia = "upload" | "catalog" | "cellar" | "note";

/** A scan's via: where its add landed. Never "flight" (the owner's rule). */
export type ScanVia = Exclude<PhotoVia, "upload">;

/** attach_catalog_wine_photo's status words, plus "error" for a failed call. */
export type AttachPhotoStatus =
  | "attached"
  | "already-attached"
  | "signed-out"
  | "deleted-account"
  | "bad-path"
  | "no-object"
  | "not-an-image"
  | "too-large"
  | "no-wine"
  | "flight-photo"
  | "unrevealed-glass"
  | "limit"
  | "error";

export type AttachPhotoResult =
  | { ok: true; status: "attached" | "already-attached" }
  | { ok: false; status: Exclude<AttachPhotoStatus, "attached" | "already-attached"> };

export type RemovePhotoResult = { ok: true } | { ok: false; reason: "not-yours" | "error" };

/** One photo of the wine page's strip. `url` is the public URL; `imagePath` the object name in wine-images. */
export type StripPhoto = {
  id: string;
  url: string;
  imagePath: string;
  addedBy: string;
  addedByName: string;
  createdAt: string;
  isScan: boolean;
};
