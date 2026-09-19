import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETED_LOGIN_PATH,
  DELETE_CONFIRM_WORD,
  DELETED_DISPLAY_NAME,
  accountDeletedNotice,
  avatarPathsToRemove,
  deletedEmailFor,
  isDeleteConfirmed,
  isDeletedProfile,
  lastAdminRefusal,
  profilePageView,
} from "./delete-account";
import { ACCOUNT_DELETED_NOTICE, LAST_ADMIN_REFUSAL } from "./delete-copy";

describe("isDeleteConfirmed (D3: the exact word, no trim, no case folding)", () => {
  it("accepts DELETE", () => {
    expect(DELETE_CONFIRM_WORD).toBe("DELETE");
    expect(isDeleteConfirmed("DELETE")).toBe(true);
  });

  it.each([
    ["delete"],
    ["Delete"],
    [" DELETE"],
    ["DELETE "],
    ["DELETE\n"],
    ["DELETED"],
    [""],
    ["ＤＥＬＥＴＥ"],
  ])("refuses %j", (typed) => {
    expect(isDeleteConfirmed(typed)).toBe(false);
  });
});

describe("deletedEmailFor / DELETED_DISPLAY_NAME (D5)", () => {
  it("builds the undeliverable placeholder address", () => {
    expect(deletedEmailFor("abc")).toBe("deleted+abc@blindr.invalid");
  });

  it("names a deleted profile Deleted user", () => {
    expect(DELETED_DISPLAY_NAME).toBe("Deleted user");
  });
});

describe("isDeletedProfile", () => {
  it("is false for a missing profile", () => {
    expect(isDeletedProfile(null)).toBe(false);
    expect(isDeletedProfile(undefined)).toBe(false);
  });

  it("is false while deleted_at is null", () => {
    expect(isDeletedProfile({ deleted_at: null })).toBe(false);
  });

  it("is true once deleted_at is stamped", () => {
    expect(isDeletedProfile({ deleted_at: "2026-09-19T10:00:00+00:00" })).toBe(true);
  });
});

describe("profilePageView (D16)", () => {
  it("is deleted for a deleted profile, even the viewer's own", () => {
    expect(
      profilePageView({ viewerId: "a", profileId: "b", deletedAt: "2026-09-19T10:00:00Z" }),
    ).toBe("deleted");
    expect(
      profilePageView({ viewerId: "a", profileId: "a", deletedAt: "2026-09-19T10:00:00Z" }),
    ).toBe("deleted");
  });

  it("is own for the viewer's own live profile", () => {
    expect(profilePageView({ viewerId: "a", profileId: "a", deletedAt: null })).toBe("own");
  });

  it("is other otherwise", () => {
    expect(profilePageView({ viewerId: "a", profileId: "b", deletedAt: null })).toBe("other");
  });
});

describe("accountDeletedNotice (§5.3)", () => {
  it("returns the notice for deleted=1", () => {
    expect(accountDeletedNotice("1")).toBe(ACCOUNT_DELETED_NOTICE);
    expect(accountDeletedNotice("1")).toBe("Your account has been deleted.");
  });

  it.each([["0"], [""], ["true"], [undefined], [["1"]]] as const)(
    "returns null for %j",
    (param) => {
      expect(accountDeletedNotice(param as string | string[] | undefined)).toBeNull();
    },
  );
});

describe("avatarPathsToRemove (D15)", () => {
  it("prefixes each file with the user's folder and skips folder entries", () => {
    expect(
      avatarPathsToRemove("u", [
        { name: "avatar.png", id: "a" },
        { name: "avatar.jpg", id: "b" },
        { name: "x", id: null },
      ]),
    ).toEqual(["u/avatar.png", "u/avatar.jpg"]);
  });

  it("returns nothing for an empty folder", () => {
    expect(avatarPathsToRemove("u", [])).toEqual([]);
  });

  it("skips a name that could reach outside the folder", () => {
    expect(
      avatarPathsToRemove("u", [
        { name: "../other/avatar.png", id: "a" },
        { name: "nested/avatar.png", id: "b" },
        { name: "..", id: "c" },
        { name: "avatar.webp", id: "d" },
      ]),
    ).toEqual(["u/avatar.webp"]);
  });
});

describe("lastAdminRefusal (D14)", () => {
  it("refuses the only active admin", () => {
    expect(lastAdminRefusal("ADMIN", 1)).toBe(LAST_ADMIN_REFUSAL);
    expect(lastAdminRefusal("ADMIN", 1)).toBe(
      "You are the only admin. Make someone else an admin before you delete your account.",
    );
  });

  it.each([
    ["ADMIN", 2],
    ["MEMBER", 0],
    ["MEMBER", 1],
    ["CONTRIBUTOR", 1],
  ] as const)("allows %s with %i active admins", (role, count) => {
    expect(lastAdminRefusal(role, count)).toBeNull();
  });
});

describe("ACCOUNT_DELETED_LOGIN_PATH", () => {
  it("lands on the login page with the deleted flag", () => {
    expect(ACCOUNT_DELETED_LOGIN_PATH).toBe("/login?deleted=1");
  });
});
