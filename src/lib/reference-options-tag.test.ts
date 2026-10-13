import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));

import { invalidateReferenceOptions, REFERENCE_OPTIONS_TAG } from "./reference-options-tag";

describe("invalidateReferenceOptions", () => {
  beforeEach(() => {
    revalidateTag.mockReset();
  });

  it("expires the shared reference lists at once", () => {
    invalidateReferenceOptions();
    expect(revalidateTag).toHaveBeenCalledWith(REFERENCE_OPTIONS_TAG, { expire: 0 });
  });

  it("never throws — outside an action the list just catches up within the TTL", () => {
    revalidateTag.mockImplementation(() => {
      throw new Error("revalidateTag outside a server action");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => invalidateReferenceOptions()).not.toThrow();
    log.mockRestore();
  });
});
