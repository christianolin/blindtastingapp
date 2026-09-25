// Every string of account deletion (spec 2026-09-19-account-deletion-design.md
// §6), pinned character for character by delete-copy.test.ts. Plain
// constants, so the straight quotes in "Deleted user" never meet JSX entity
// escaping. Owner copy is verbatim; lines marked (spec copy) were added by
// the spec.

// The profile page's section.
export const DELETE_SECTION_TITLE = "Delete account";
export const DELETE_SECTION_LINE =
  "Delete your Blindr account and everything that is only yours.";
export const DELETE_SECTION_BUTTON = "Delete account";

// The dialog.
export const DELETE_DIALOG_TITLE = "Delete your account?";
export const DELETED_LIST_HEADING = "Deleted for good:";
export const DELETED_LIST_ITEMS: readonly string[] = [
  "Your profile, photo and email",
  "Your cellar and its history",
  "Your tasting notes and ratings",
  "Your friends list, friend requests and invite links",
];
export const KEPT_LIST_HEADING = "Kept for others:";
export const KEPT_LIST_ITEMS: readonly string[] = [
  'Tastings you hosted or joined, shown as "Deleted user"',
  "Wines you added to the shared catalog",
];
export const CONFIRM_INPUT_LABEL = "Type DELETE to confirm";
export const DELETE_CANCEL_LABEL = "Cancel";
export const DELETE_SUBMIT_LABEL = "Delete my account";
export const DELETE_PENDING_LABEL = "Deleting…";

// The login page after a deletion.
export const ACCOUNT_DELETED_NOTICE = "Your account has been deleted.";

// A deleted profile's name everywhere (D1). The migration's scrub writes the
// same literal; account-deletion-migration.test.ts pins the two together.
export const DELETED_DISPLAY_NAME = "Deleted user";

// (spec copy) The server action's refusals.
export const DELETE_WORD_MISMATCH = "Type DELETE exactly to delete your account.";
export const LAST_ADMIN_REFUSAL =
  "You are the only admin. Make someone else an admin before you delete your account.";

// (spec copy) /u/<id> of a deleted profile.
export const DELETED_PROFILE_LINE = "This account has been deleted.";

// (spec copy) The database's refusals, lower-case in the repo's SQL style.
// Raised by the migration, never rendered by a component of this feature; a
// write the guard refuses surfaces verbatim through the calling action.
export const DB_REFUSALS: readonly string[] = [
  "a deleted account stays deleted",
  "this account has been deleted",
  "only account deletion sets deleted_at",
  "that account has been deleted",
];
