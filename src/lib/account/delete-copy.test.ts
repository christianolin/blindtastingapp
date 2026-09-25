import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETED_NOTICE,
  CONFIRM_INPUT_LABEL,
  DB_REFUSALS,
  DELETE_CANCEL_LABEL,
  DELETE_DIALOG_TITLE,
  DELETE_PENDING_LABEL,
  DELETE_SECTION_BUTTON,
  DELETE_SECTION_LINE,
  DELETE_SECTION_TITLE,
  DELETE_SUBMIT_LABEL,
  DELETE_WORD_MISMATCH,
  DELETED_DISPLAY_NAME,
  DELETED_LIST_HEADING,
  DELETED_LIST_ITEMS,
  DELETED_PROFILE_LINE,
  KEPT_LIST_HEADING,
  KEPT_LIST_ITEMS,
  LAST_ADMIN_REFUSAL,
} from "./delete-copy";

// Pins every string of the account-deletion spec §6, character for
// character, and the order of both dialog lists.

describe("owner copy (verbatim)", () => {
  it("section", () => {
    expect(DELETE_SECTION_TITLE).toBe("Delete account");
    expect(DELETE_SECTION_LINE).toBe(
      "Delete your Blindr account and everything that is only yours.",
    );
    expect(DELETE_SECTION_BUTTON).toBe("Delete account");
  });

  it("dialog title and lists, in order", () => {
    expect(DELETE_DIALOG_TITLE).toBe("Delete your account?");
    expect(DELETED_LIST_HEADING).toBe("Deleted for good:");
    expect(DELETED_LIST_ITEMS).toEqual([
      "Your profile, photo and email",
      "Your cellar and its history",
      "Your tasting notes and ratings",
      "Your friends list, friend requests and invite links",
    ]);
    expect(KEPT_LIST_HEADING).toBe("Kept for others:");
    expect(KEPT_LIST_ITEMS).toEqual([
      'Tastings you hosted or joined, shown as "Deleted user"',
      "Wines you added to the shared catalog",
    ]);
  });

  it("input and buttons", () => {
    expect(CONFIRM_INPUT_LABEL).toBe("Type DELETE to confirm");
    expect(DELETE_CANCEL_LABEL).toBe("Cancel");
    expect(DELETE_SUBMIT_LABEL).toBe("Delete my account");
    expect(DELETE_PENDING_LABEL).toBe("Deleting…");
  });

  it("login notice and the deleted name", () => {
    expect(ACCOUNT_DELETED_NOTICE).toBe("Your account has been deleted.");
    expect(DELETED_DISPLAY_NAME).toBe("Deleted user");
  });
});

describe("(spec copy)", () => {
  it("server refusals and the deleted profile page", () => {
    expect(DELETE_WORD_MISMATCH).toBe("Type DELETE exactly to delete your account.");
    expect(LAST_ADMIN_REFUSAL).toBe(
      "You are the only admin. Make someone else an admin before you delete your account.",
    );
    expect(DELETED_PROFILE_LINE).toBe("This account has been deleted.");
  });

  it("database refusals", () => {
    expect(DB_REFUSALS).toEqual([
      "a deleted account stays deleted",
      "this account has been deleted",
      "only account deletion sets deleted_at",
      "that account has been deleted",
    ]);
  });
});
