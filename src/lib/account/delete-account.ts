// Pure rules for account deletion (spec 2026-09-19-account-deletion-design.md
// §5.8). No `@/` imports: vitest has no alias, and this module is shared by
// the server action, the dialog, the login page and the profile pages.

import {
  ACCOUNT_DELETED_NOTICE,
  DELETED_DISPLAY_NAME,
  LAST_ADMIN_REFUSAL,
} from "./delete-copy";

export { DELETED_DISPLAY_NAME };

/** What a person types to confirm (D3). */
export const DELETE_CONFIRM_WORD = "DELETE";

/** The exact word: no trim, no case folding, no Unicode normalisation (D3). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed === DELETE_CONFIRM_WORD;
}

/**
 * The scrubbed profile's address (D5): `.invalid` never delivers mail and can
 * never equal a real address, so the old one is free for a new signup. The
 * migration builds the same value; account-deletion-migration.test.ts pins it.
 */
export function deletedEmailFor(userId: string): string {
  return `deleted+${userId}@blindr.invalid`;
}

/** A profile is deleted once `profiles.deleted_at` is stamped (D10). */
export function isDeletedProfile(
  p: { deleted_at: string | null } | null | undefined,
): boolean {
  return p != null && p.deleted_at != null;
}

/**
 * Which `/u/<id>` a viewer gets (D16). A deleted profile is always the
 * minimal page, even for a leftover session of the deleted account itself.
 */
export function profilePageView({
  viewerId,
  profileId,
  deletedAt,
}: {
  viewerId: string;
  profileId: string;
  deletedAt: string | null;
}): "deleted" | "own" | "other" {
  if (deletedAt != null) return "deleted";
  return viewerId === profileId ? "own" : "other";
}

/** Where the action lands once the account is gone (D13 step 5). */
export const ACCOUNT_DELETED_LOGIN_PATH = "/login?deleted=1";

/** The login page's notice, only for exactly `?deleted=1` (§5.3). */
export function accountDeletedNotice(
  param: string | string[] | undefined,
): string | null {
  return param === "1" ? ACCOUNT_DELETED_NOTICE : null;
}

/**
 * The avatar objects to remove (D15), from a Storage `list(userId)` of the
 * `avatars` bucket. A folder entry (`id` null) is skipped, and so is any name
 * that could address something outside the user's own folder.
 */
export function avatarPathsToRemove(
  userId: string,
  listed: { name: string; id: string | null }[],
): string[] {
  return listed
    .filter(
      (o) =>
        o.id !== null &&
        o.name.length > 0 &&
        !o.name.includes("/") &&
        !o.name.includes(".."),
    )
    .map((o) => `${userId}/${o.name}`);
}

/**
 * D14: the only active admin cannot delete themselves in the app — nobody
 * would be left to manage roles. `activeAdmins` counts profiles with
 * `role = 'ADMIN' and deleted_at is null`, the caller included.
 */
export function lastAdminRefusal(role: string, activeAdmins: number): string | null {
  return role === "ADMIN" && activeAdmins <= 1 ? LAST_ADMIN_REFUSAL : null;
}

/** `deleteAccount`'s `useActionState` state: null, or an error shown verbatim. */
export type DeleteAccountState = { error: string } | null;
