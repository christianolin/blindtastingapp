import { describe, expect, it } from "vitest";
import {
  STRIP_SHOWN,
  attachNotice,
  isScanPath,
  mayBecomeMainPhoto,
  pathFromPublicUrl,
  photoCaption,
  stripHeading,
  stripPhotos,
} from "./strip";

// Scan photos spec §8.1: the wine page's "More photos" strip, pure.

const BASE = "https://abc.supabase.co/storage/v1/object/public";

describe("pathFromPublicUrl", () => {
  it("reads the object name out of a wine-images public URL", () => {
    expect(pathFromPublicUrl(`${BASE}/wine-images/catalog/w1/123-abc.jpg`)).toBe("catalog/w1/123-abc.jpg");
  });

  it("drops a query string", () => {
    expect(pathFromPublicUrl(`${BASE}/wine-images/catalog/staging/u/scan-1.jpg?t=123`)).toBe(
      "catalog/staging/u/scan-1.jpg",
    );
  });

  it("decodes the path", () => {
    expect(pathFromPublicUrl(`${BASE}/wine-images/catalog/w1/a%20b.jpg`)).toBe("catalog/w1/a b.jpg");
  });

  it("honours another bucket", () => {
    expect(pathFromPublicUrl(`${BASE}/tasting-images/u/x.jpg`, "tasting-images")).toBe("u/x.jpg");
  });

  it("is null for null, another bucket, or not a storage URL", () => {
    expect(pathFromPublicUrl(null)).toBeNull();
    expect(pathFromPublicUrl(undefined)).toBeNull();
    expect(pathFromPublicUrl("")).toBeNull();
    expect(pathFromPublicUrl(`${BASE}/tasting-images/u/x.jpg`)).toBeNull();
    expect(pathFromPublicUrl("https://example.com/wine.jpg")).toBeNull();
    expect(pathFromPublicUrl(`${BASE}/wine-images/`)).toBeNull();
  });

  it("is null for a malformed escape", () => {
    expect(pathFromPublicUrl(`${BASE}/wine-images/catalog/w1/%E0%A4%A.jpg`)).toBeNull();
  });
});

describe("isScanPath", () => {
  it("accepts a staging label scan", () => {
    expect(isScanPath("catalog/staging/9a8b7c6d-1111-4222-8333-444455556666/scan-1726750000000-k3j2h1.jpg")).toBe(true);
  });

  it.each([
    "catalog/staging/u/123-abc.png",
    "catalog/staging/u/1726750000000-abc.jpg",
    "catalog/w1/scan-1.jpg",
    "catalog/staging/u/v/scan-1.jpg",
    "catalog/staging//scan-1.jpg",
    "catalog/staging/u/scan-.jpg",
    "catalog/staging/u/scan-1.jpg?x",
    "u/scan-1.jpg",
  ])("refuses %s", (path) => {
    expect(isScanPath(path)).toBe(false);
  });
});

type Row = { id: string; imagePath: string; createdAt: string };

function row(id: string, createdAt: string, imagePath = `catalog/w1/${id}.jpg`): Row {
  return { id, imagePath, createdAt };
}

describe("stripPhotos", () => {
  it("leaves out the main photo", () => {
    const rows = [row("a", "2026-09-19T10:00:00+00:00"), row("b", "2026-09-19T11:00:00+00:00")];
    const { photos } = stripPhotos(rows, `${BASE}/wine-images/catalog/w1/a.jpg`);
    expect(photos.map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps every row when there is no main photo", () => {
    const rows = [row("a", "2026-09-19T10:00:00+00:00"), row("b", "2026-09-19T11:00:00+00:00")];
    expect(stripPhotos(rows, null).photos.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("keeps every row when the main photo is not a wine-images URL", () => {
    const rows = [row("a", "2026-09-19T10:00:00+00:00")];
    expect(stripPhotos(rows, "https://example.com/a.jpg").photos).toHaveLength(1);
  });

  it("orders newest first, then by id descending on a tie", () => {
    const rows = [
      row("b", "2026-09-19T10:00:00+00:00"),
      row("c", "2026-09-19T10:00:00+00:00"),
      row("a", "2026-09-19T12:00:00+00:00"),
      row("d", "2026-09-18T09:00:00+00:00"),
    ];
    expect(stripPhotos(rows, null).photos.map((p) => p.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("orders by the instant, not the text", () => {
    const rows = [row("x", "2026-09-19T12:00:00+02:00"), row("y", "2026-09-19T11:00:00+00:00")];
    expect(stripPhotos(rows, null).photos.map((p) => p.id)).toEqual(["y", "x"]);
  });

  it("does not change its input", () => {
    const rows = [row("a", "2026-09-19T10:00:00+00:00"), row("b", "2026-09-19T11:00:00+00:00")];
    stripPhotos(rows, null);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("shows 8 and counts nothing more at 8", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`p${i}`, `2026-09-19T10:0${i}:00+00:00`));
    const out = stripPhotos(rows, null);
    expect(STRIP_SHOWN).toBe(8);
    expect(out.shown).toHaveLength(8);
    expect(out.more).toBe(0);
  });

  it("shows 8 and counts the rest at 12", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`p${String(i).padStart(2, "0")}`, `2026-09-19T10:${String(i).padStart(2, "0")}:00+00:00`));
    const out = stripPhotos(rows, null);
    expect(out.photos).toHaveLength(12);
    expect(out.shown).toHaveLength(8);
    expect(out.shown[0].id).toBe("p11");
    expect(out.more).toBe(4);
  });

  it("is empty for no rows", () => {
    expect(stripPhotos([], null)).toEqual({ photos: [], shown: [], more: 0 });
  });
});

describe("stripHeading", () => {
  it("reads More photos under a main photo, Photos without one", () => {
    expect(stripHeading(true)).toBe("More photos");
    expect(stripHeading(false)).toBe("Photos");
  });
});

describe("photoCaption", () => {
  it("names you or the photographer, and says whether it was a scan", () => {
    expect(photoCaption({ isOwn: true, name: "Priya", isScan: true })).toBe("Scanned by you");
    expect(photoCaption({ isOwn: true, name: "Priya", isScan: false })).toBe("Added by you");
    expect(photoCaption({ isOwn: false, name: "Marcus", isScan: true })).toBe("Scanned by Marcus");
    expect(photoCaption({ isOwn: false, name: "Marcus", isScan: false })).toBe("Added by Marcus");
  });
});

describe("attachNotice", () => {
  it("has the spec's line for each status", () => {
    expect(attachNotice("attached")).toBe("Added to More photos.");
    expect(attachNotice("already-attached")).toBe("That photo is already on this wine.");
    expect(attachNotice("limit")).toBe("You have added 12 photos to this wine. Remove one to add another.");
    expect(attachNotice("unrevealed-glass")).toBe(
      "This wine is in one of your flights that hasn't been revealed yet. Add photos after the reveal.",
    );
    expect(attachNotice("too-large")).toBe("That photo is too large. Try a smaller one.");
  });

  it.each([
    "signed-out", "deleted-account", "bad-path", "no-object", "not-an-image", "no-wine", "flight-photo", "error",
  ] as const)("falls back to the generic line for %s", (status) => {
    expect(attachNotice(status)).toBe("Couldn't add the photo. Please try again.");
  });

  it("is null for no status", () => {
    expect(attachNotice(null)).toBeNull();
  });
});

describe("mayBecomeMainPhoto", () => {
  // Only statuses returned after the RPC's step-7 unrevealed-glass check.
  it.each(["attached", "already-attached", "limit"] as const)("allows %s", (status) => {
    expect(mayBecomeMainPhoto(status)).toBe(true);
  });

  // Every refusal before step 7 (and a failed call) never ran that check.
  it.each([
    "unrevealed-glass", "flight-photo", "signed-out", "deleted-account", "bad-path", "no-object",
    "not-an-image", "too-large", "no-wine", "error",
  ] as const)("fails closed on %s", (status) => {
    expect(mayBecomeMainPhoto(status)).toBe(false);
  });
});
