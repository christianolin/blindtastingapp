import { describe, expect, it } from "vitest";
import {
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_EDGE,
  fitWithin,
  keepOriginal,
  uploadExtension,
} from "./downscale-math";

// Scan photos spec §4 (D1): one size rule for every new upload — the long edge
// at most 1,568 px, JPEG 0.82, never upscaled.

describe("constants", () => {
  it("are the spec's numbers", () => {
    expect(PHOTO_MAX_EDGE).toBe(1568);
    expect(PHOTO_JPEG_QUALITY).toBe(0.82);
    expect(PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("fitWithin", () => {
  it("scales a landscape phone photo to 1568 on the long edge", () => {
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 1568, height: 1176, scaled: true });
  });

  it("scales a portrait phone photo the same way", () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1176, height: 1568, scaled: true });
  });

  it("rounds the short edge", () => {
    expect(fitWithin({ width: 3000, height: 2001 })).toEqual({ width: 1568, height: 1046, scaled: true });
  });

  it("leaves a photo already at the limit alone", () => {
    expect(fitWithin({ width: 1568, height: 1000 })).toEqual({ width: 1568, height: 1000, scaled: false });
  });

  it("never upscales", () => {
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600, scaled: false });
  });

  it("keeps each side at least 1", () => {
    expect(fitWithin({ width: 1569, height: 1 })).toEqual({ width: 1568, height: 1, scaled: true });
    expect(fitWithin({ width: 10000, height: 10 })).toEqual({ width: 1568, height: 2, scaled: true });
  });

  it("honours another maxEdge", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200, scaled: true });
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900, scaled: false });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("throws RangeError for a side of %s", (bad) => {
    expect(() => fitWithin({ width: bad, height: 100 })).toThrow(RangeError);
    expect(() => fitWithin({ width: 100, height: bad })).toThrow(RangeError);
  });
});

describe("keepOriginal", () => {
  it("keeps the original when the photo could not be decoded", () => {
    expect(keepOriginal({ type: "image/heic", size: 3_000_000, scaled: false, encodedSize: null })).toBe(true);
  });

  it("uploads the re-encode whenever the photo was scaled", () => {
    expect(keepOriginal({ type: "image/jpeg", size: 100, scaled: true, encodedSize: 200 })).toBe(false);
  });

  it("keeps an unscaled JPEG the re-encode would not shrink", () => {
    expect(keepOriginal({ type: "image/jpeg", size: 80_000, scaled: false, encodedSize: 80_000 })).toBe(true);
    expect(keepOriginal({ type: "image/jpeg", size: 70_000, scaled: false, encodedSize: 80_000 })).toBe(true);
  });

  it("uploads the re-encode of an unscaled JPEG when it is smaller", () => {
    expect(keepOriginal({ type: "image/jpeg", size: 900_000, scaled: false, encodedSize: 300_000 })).toBe(false);
  });

  it("re-encodes an unscaled PNG", () => {
    expect(keepOriginal({ type: "image/png", size: 10, scaled: false, encodedSize: 5_000 })).toBe(false);
  });
});

describe("uploadExtension", () => {
  it("is jpg for a re-encoded blob", () => {
    expect(uploadExtension(true, "IMG_1.HEIC")).toBe("jpg");
  });

  it("keeps the original's extension, lower-cased", () => {
    expect(uploadExtension(false, "IMG_1.HEIC")).toBe("heic");
    expect(uploadExtension(false, "label.final.PNG")).toBe("png");
  });

  it("falls back to jpg for a missing or odd extension", () => {
    expect(uploadExtension(false, "noext")).toBe("jpg");
    expect(uploadExtension(false, "a.toolongext")).toBe("jpg");
    expect(uploadExtension(false, "a.")).toBe("jpg");
    expect(uploadExtension(false, "a.j-g")).toBe("jpg");
  });
});
