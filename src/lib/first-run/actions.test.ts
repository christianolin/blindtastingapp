// The two first-run tour writes (spec D2), with the Supabase server client
// replaced by a recording fake: no network, no cookies, no database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  refuse: false,
  writes: [] as { table: string; values: Record<string, unknown>; column: string; value: unknown }[],
}));

vi.mock("../supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: fake.userId ? { id: fake.userId } : null }, error: null }),
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          fake.writes.push({ table, values, column, value });
          return { error: fake.refuse ? { message: "permission denied for table profiles" } : null };
        },
      }),
    }),
  }),
}));

import { markTourSeen, resetTour } from "./actions";

beforeEach(() => {
  fake.userId = "user-1";
  fake.refuse = false;
  fake.writes.length = 0;
});

describe("markTourSeen (D2)", () => {
  it("stamps the signed-in person's own profile with the current time, and nothing else", async () => {
    const before = Date.now();
    await expect(markTourSeen()).resolves.toBe(true);
    expect(fake.writes).toHaveLength(1);
    const [write] = fake.writes;
    expect(write.table).toBe("profiles");
    expect([write.column, write.value]).toEqual(["id", "user-1"]);
    expect(Object.keys(write.values)).toEqual(["tour_seen_at"]);
    const at = Date.parse(String(write.values.tour_seen_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(markTourSeen()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(markTourSeen()).resolves.toBe(false);
  });
});

describe("resetTour (D2)", () => {
  it("clears the signed-in person's stamp to null", async () => {
    await expect(resetTour()).resolves.toBe(true);
    expect(fake.writes).toEqual([
      { table: "profiles", values: { tour_seen_at: null }, column: "id", value: "user-1" },
    ]);
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(resetTour()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(resetTour()).resolves.toBe(false);
  });
});
