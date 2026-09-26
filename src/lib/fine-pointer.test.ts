import { afterEach, describe, expect, it, vi } from "vitest";
import { finePointer } from "./fine-pointer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finePointer", () => {
  it("is false with no window (server render)", () => {
    expect(finePointer()).toBe(false);
  });

  it("is false where matchMedia is missing", () => {
    vi.stubGlobal("window", {});
    expect(finePointer()).toBe(false);
  });

  it("follows (pointer: fine)", () => {
    const queries: string[] = [];
    vi.stubGlobal("window", {
      matchMedia: (q: string) => {
        queries.push(q);
        return { matches: true };
      },
    });
    expect(finePointer()).toBe(true);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(finePointer()).toBe(false);
    expect(queries).toEqual(["(pointer: fine)"]);
  });
});
