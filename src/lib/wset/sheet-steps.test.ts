import { describe, expect, it } from "vitest";
import { footerStep } from "./sheet-steps";

const NOTE = ["appearance", "nose", "palate", "conclusions"] as const;
const EDITOR = ["wine", "appearance", "nose", "palate", "conclusions"] as const;

describe("footerStep", () => {
  it("steps forward while a section lies ahead", () => {
    expect(footerStep(NOTE, "appearance")).toEqual({ id: "nose", forward: true });
    expect(footerStep(NOTE, "palate")).toEqual({ id: "conclusions", forward: true });
    expect(footerStep(EDITOR, "wine")).toEqual({ id: "appearance", forward: true });
  });

  it("steps back from the last section", () => {
    expect(footerStep(NOTE, "conclusions")).toEqual({ id: "palate", forward: false });
    expect(footerStep(EDITOR, "conclusions")).toEqual({ id: "palate", forward: false });
  });

  it("has no step with a single section", () => {
    expect(footerStep(["only"] as const, "only")).toBeNull();
  });

  it("an id outside the order steps to the first section, as the note sheet always did", () => {
    expect(footerStep(NOTE as readonly string[], "elsewhere")).toEqual({ id: "appearance", forward: true });
  });
});
