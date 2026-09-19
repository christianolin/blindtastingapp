import { describe, expect, it } from "vitest";
import { scanPhotoTarget } from "./scan-photo";

// Scan photos spec §5 (D3): a scan joins its wine's photos only once its add
// has landed in the catalog, a cellar or a note — never a flight.

const WINE = "3f2b8c1e-5d4a-4c7b-9e1f-2a3b4c5d6e7f";
const SCAN = "catalog/staging/9a8b7c6d-1111-4222-8333-444455556666/scan-1726750000000-k3j2h1.jpg";

describe("scanPhotoTarget", () => {
  it("never attaches a flight add", () => {
    expect(scanPhotoTarget({ destination: "flight", catalogWineId: WINE }, SCAN)).toBeNull();
  });

  it.each(["catalog", "cellar", "note"])("attaches a %s add, with that add as its via", (destination) => {
    expect(scanPhotoTarget({ destination, catalogWineId: WINE }, SCAN)).toEqual({
      catalogWineId: WINE,
      imagePath: SCAN,
      via: destination,
    });
  });

  it("keeps a cellar scan a cellar scan (the database gates it by the cellar's own visibility)", () => {
    expect(scanPhotoTarget({ destination: "cellar", catalogWineId: WINE }, SCAN)?.via).toBe("cellar");
  });

  it("needs a catalog wine", () => {
    expect(scanPhotoTarget({ destination: "catalog", catalogWineId: null }, SCAN)).toBeNull();
    expect(scanPhotoTarget({ destination: "cellar", catalogWineId: "" }, SCAN)).toBeNull();
  });

  it("needs a scan in hand", () => {
    expect(scanPhotoTarget({ destination: "catalog", catalogWineId: WINE }, null)).toBeNull();
    expect(scanPhotoTarget({ destination: "catalog", catalogWineId: WINE }, "")).toBeNull();
  });

  it.each([
    "catalog/staging/u/123-abc.png",
    "catalog/staging/u/1726750000000-abc.jpg",
    "u/scan-1.jpg",
    "catalog/scan-1.jpg",
    "catalog/staging/u/v/scan-1.jpg",
    "catalog/staging/u/scan-1.jpeg",
    "catalog/staging/u/scan-1.jpg?x=1",
    "https://example.supabase.co/storage/v1/object/public/wine-images/catalog/staging/u/scan-1.jpg",
    `${WINE}/scan-1.jpg`,
  ])("refuses a path that is not a staging scan: %s", (path) => {
    expect(scanPhotoTarget({ destination: "catalog", catalogWineId: WINE }, path)).toBeNull();
  });

  it("refuses an unknown destination", () => {
    expect(scanPhotoTarget({ destination: "tasting", catalogWineId: WINE }, SCAN)).toBeNull();
    expect(scanPhotoTarget({ destination: "", catalogWineId: WINE }, SCAN)).toBeNull();
    // "upload" is the wine page's via, never a scan's.
    expect(scanPhotoTarget({ destination: "upload", catalogWineId: WINE }, SCAN)).toBeNull();
  });
});
