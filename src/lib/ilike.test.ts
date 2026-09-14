import { describe, expect, it } from "vitest";
import { escapeIlike } from "./ilike";

describe("escapeIlike (people search)", () => {
  it("escapes the ilike wildcards and the escape character, and nothing else", () => {
    expect(escapeIlike("Maja")).toBe("Maja");
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("back\\slash")).toBe("back\\\\slash");
    expect(escapeIlike("Søren O'Neil")).toBe("Søren O'Neil");
  });
});
