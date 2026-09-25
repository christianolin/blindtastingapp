import { describe, expect, it } from "vitest";
import {
  SETTLED_HIDE_MS,
  friendRequestLine,
  mergeNotifications,
  notificationKey,
  visibleNotifications,
  withoutFriendRequest,
  type FriendRequestNotification,
  type TastingInviteNotification,
} from "./notification-items";

const tasting = (id: string): TastingInviteNotification => ({
  kind: "tasting",
  tastingId: id,
  tastingName: `Tasting ${id}`,
  hostName: "Anna",
});
const friend = (id: string, createdAt: string): FriendRequestNotification => ({
  kind: "friend",
  requesterId: id,
  requesterName: `Person ${id}`,
  avatarUrl: null,
  createdAt,
});

describe("mergeNotifications", () => {
  it("lists tasting invitations first, in their order, then friend requests newest first", () => {
    const merged = mergeNotifications(
      [tasting("t2"), tasting("t1")],
      [friend("a", "2026-09-20T10:00:00+00:00"), friend("b", "2026-09-24T10:00:00.123456+00:00")],
    );
    expect(merged.map(notificationKey)).toEqual(["tasting-t2", "tasting-t1", "friend-b", "friend-a"]);
  });

  it("breaks a created_at tie by requester id", () => {
    const at = "2026-09-24T10:00:00+00:00";
    expect(mergeNotifications([], [friend("z", at), friend("m", at)]).map(notificationKey)).toEqual([
      "friend-m",
      "friend-z",
    ]);
  });

  it("is empty when nothing is pending", () => {
    expect(mergeNotifications([], [])).toEqual([]);
  });
});

describe("friendRequestLine", () => {
  it("reads '{Name} wants to be friends'", () => {
    expect(friendRequestLine("Anna")).toBe("Anna wants to be friends");
  });
});

describe("withoutFriendRequest", () => {
  it("drops that requester's row and nothing else", () => {
    const list = [tasting("a"), friend("a", "2026-09-24T10:00:00+00:00"), friend("b", "2026-09-24T10:00:00+00:00")];
    expect(withoutFriendRequest(list, "a").map(notificationKey)).toEqual(["tasting-a", "friend-b"]);
  });
});

describe("visibleNotifications", () => {
  const list = [tasting("t"), friend("a", "2026-09-24T10:00:00+00:00"), friend("b", "2026-09-24T09:00:00+00:00")];
  const now = 1_000_000;

  it("hides a request answered here until SETTLED_HIDE_MS have passed", () => {
    const settled = new Map([["a", now - 1_000]]);
    expect(visibleNotifications(list, settled, now).map(notificationKey)).toEqual(["tasting-t", "friend-b"]);
    expect(
      visibleNotifications(list, settled, now - 1_000 + SETTLED_HIDE_MS).map(notificationKey),
    ).toEqual(["tasting-t", "friend-a", "friend-b"]);
  });

  it("never hides a tasting invitation, and hides nothing with nothing settled", () => {
    expect(visibleNotifications(list, new Map([["t", now]]), now).map(notificationKey)).toEqual([
      "tasting-t",
      "friend-a",
      "friend-b",
    ]);
    expect(visibleNotifications(list, new Map(), now)).toEqual(list);
  });

  it("is 60 seconds", () => {
    expect(SETTLED_HIDE_MS).toBe(60_000);
  });
});
