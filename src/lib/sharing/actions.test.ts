// The sharing notice's dismissal (spec S15), with the Supabase server client
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
          return { error: fake.refuse ? { message: "permission denied for table sharing_notices" } : null };
        },
      }),
    }),
  }),
}));

import { dismissSharingNotice } from "./actions";

beforeEach(() => {
  fake.userId = "user-1";
  fake.refuse = false;
  fake.writes.length = 0;
});

describe("dismissSharingNotice", () => {
  it("stamps dismissed_at on the signed-in person's own notice, and nothing else", async () => {
    const before = Date.now();
    await expect(dismissSharingNotice()).resolves.toBe(true);
    expect(fake.writes).toHaveLength(1);
    const [write] = fake.writes;
    expect(write.table).toBe("sharing_notices");
    expect([write.column, write.value]).toEqual(["user_id", "user-1"]);
    expect(Object.keys(write.values)).toEqual(["dismissed_at"]);
    const at = Date.parse(String(write.values.dismissed_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(dismissSharingNotice()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(dismissSharingNotice()).resolves.toBe(false);
  });
});
