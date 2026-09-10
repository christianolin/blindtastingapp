import { describe, expect, it } from "vitest";
import { deaccent } from "./deaccent";

describe("deaccent", () => {
  it("leaves plain ASCII untouched", () => {
    expect(deaccent("Bordeaux")).toBe("Bordeaux");
    expect(deaccent("Pinot Noir")).toBe("Pinot Noir");
  });

  // The cases that actually sent someone to this file.
  it("strips the accents blind tasters do not type", () => {
    expect(deaccent("Rhône")).toBe("Rhone");
    expect(deaccent("Gewürztraminer")).toBe("Gewurztraminer");
    expect(deaccent("Grüner Veltliner")).toBe("Gruner Veltliner");
    expect(deaccent("Albariño")).toBe("Albarino");
    expect(deaccent("Carmenère")).toBe("Carmenere");
    expect(deaccent("Dão")).toBe("Dao");
    expect(deaccent("Rías Baixas")).toBe("Rias Baixas");
    expect(deaccent("Tinto Cão")).toBe("Tinto Cao");
  });

  it("preserves case and spacing so the value stays human-readable", () => {
    expect(deaccent("Côtes du Rhône")).toBe("Cotes du Rhone");
  });

  // These are separate letters, not accented bases, so NFD alone leaves them
  // untouched — they need the explicit map.
  it("expands ligatures and stroked letters that NFD does not decompose", () => {
    expect(deaccent("Ø")).toBe("O");
    expect(deaccent("Hornbæk")).toBe("Hornbaek");
    expect(deaccent("Weißburgunder")).toBe("Weissburgunder");
  });

  it("is idempotent", () => {
    const once = deaccent("Gewürztraminer");
    expect(deaccent(once)).toBe(once);
  });
});
