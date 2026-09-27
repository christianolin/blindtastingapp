// The tab's own last cellar Sort pick (cellar-sort spec C5, review round 1):
// a client-side remount (browser Back/Forward to a cached payload, a Link
// while the save is in flight) opens on it instead of the prop's stale value.
// Each test loads a fresh module, as a full page load does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshModule(): Promise<typeof import("./tab-sort")> {
  vi.resetModules();
  return import("./tab-sort");
}

describe("in the browser", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a fresh tab (a full page load) opens on the server's saved value, exactly as the server rendered it", async () => {
    const { openingCellarSort } = await freshModule();
    expect(openingCellarSort(null, false, "me")).toBe("added");
    expect(openingCellarSort("name", false, "me")).toBe("name");
    expect(openingCellarSort("yours", true, "me")).toBe("added");
    expect(openingCellarSort("junk", false, "me")).toBe("added");
  });

  it("list → pick Name → a wine → Back: the remount from the stale payload opens on Name", async () => {
    const { openingCellarSort, rememberTabSort } = await freshModule();
    // The cached payload still carries what the page was first fetched with.
    const stalePayload = null;
    expect(openingCellarSort(stalePayload, false, "me")).toBe("added");
    rememberTabSort("me", "name");
    expect(openingCellarSort(stalePayload, false, "me")).toBe("name");
    // The same on someone else's cellar (cellar → profile → Back), and on a
    // payload that carried an older saved value.
    expect(openingCellarSort(stalePayload, true, "me")).toBe("name");
    expect(openingCellarSort("bottles", false, "me")).toBe("name");
  });

  it("the latest pick wins", async () => {
    const { openingCellarSort, rememberTabSort } = await freshModule();
    rememberTabSort("me", "name");
    rememberTabSort("me", "community");
    expect(openingCellarSort("name", false, "me")).toBe("community");
  });

  it("Your score picked on your own cellar is newest added on someone else's, and kept on your own", async () => {
    const { openingCellarSort, rememberTabSort } = await freshModule();
    rememberTabSort("me", "yours");
    expect(openingCellarSort("yours", true, "me")).toBe("added");
    expect(openingCellarSort(null, true, "me")).toBe("added");
    expect(openingCellarSort(null, false, "me")).toBe("yours");
  });

  it("someone else signing in in the same tab never inherits the previous person's pick", async () => {
    const { openingCellarSort, rememberTabSort } = await freshModule();
    rememberTabSort("me", "name");
    expect(openingCellarSort(null, false, "someone-else")).toBe("added");
    expect(openingCellarSort("bottles", false, "someone-else")).toBe("bottles");
    rememberTabSort("someone-else", "community");
    expect(openingCellarSort(null, false, "me")).toBe("added");
    expect(openingCellarSort(null, false, "someone-else")).toBe("community");
  });
});

describe("on the server", () => {
  it("nothing is remembered: module state there is shared by every request", async () => {
    expect(typeof window).toBe("undefined");
    const { openingCellarSort, rememberTabSort } = await freshModule();
    rememberTabSort("me", "name");
    expect(openingCellarSort(null, false, "me")).toBe("added");
    expect(openingCellarSort("bottles", false, "me")).toBe("bottles");
  });
});
